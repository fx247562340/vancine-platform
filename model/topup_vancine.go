package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Vancine-specific top-up extensions on top of the upstream settlement
// structure: PayPal order identifiers, the PayPal refund path, and the
// pending-order cleaner.

// GetTopUpByTransactionId returns the order holding the given settled
// provider transaction identifier, or nil.
func GetTopUpByTransactionId(transactionId string) *TopUp {
	var topUp *TopUp
	err := DB.Where("transaction_id = ?", transactionId).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

// GetTransactionId returns the settled provider transaction id; pending
// orders (SQL NULL) return the empty string.
func (topUp *TopUp) GetTransactionId() string {
	if topUp == nil || topUp.TransactionId == nil {
		return ""
	}
	return *topUp.TransactionId
}

// FindTopUpByPaymentID looks up a top-up by its stored PayPal Order ID. When
// expectedProvider is non-empty the lookup is provider-scoped so a stray
// Order ID from another payment method can never settle a PayPal obligation.
func FindTopUpByPaymentID(paymentID, expectedProvider string) (*TopUp, error) {
	if strings.TrimSpace(paymentID) == "" {
		return nil, ErrTopUpNotFound
	}
	var topUp TopUp
	query := DB.Where("payment_id = ?", paymentID)
	if expectedProvider != "" {
		query = query.Where("payment_provider = ?", expectedProvider)
	}
	if err := query.First(&topUp).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTopUpNotFound
		}
		return nil, err
	}
	return &topUp, nil
}

// RefundPayPalTopUp deducts the settled quota of a PayPal order and marks it
// refunded in a single transaction. The deduction claws back BOTH the paid
// quota and the first-top-up bonus the order granted, using the persisted
// BaseQuota/BonusQuota so a refund always matches the credit the settlement
// granted, even after QuotaPerUnit changes. The caller passes the quota the
// payment itself bought; it only stands in for BaseQuota on historical
// orders settled before BaseQuota was persisted.
//
// Refunds that drop the user below zero are allowed: a user who already
// consumed the purchased quota and is asking for a refund is precisely the
// case where the balance has to go negative. The only failure mode is
// leaving the wallet domain. A duplicate refund on an already-refunded order
// is a successful no-op returning (0, nil). The refunded order stays in the
// first-top-up history, so a refund never restores the qualification.
func RefundPayPalTopUp(tradeNo string, quota int) (int, error) {
	var deducted int
	var deductedUserID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var topUp TopUp
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.Status == common.TopUpStatusRefunded {
			return nil
		}

		if topUp.Status != common.TopUpStatusSuccess {
			return errors.New("订单状态不是 success，无法退款")
		}

		deduct, err := refundQuotaWithBonus(&topUp, quota)
		if err != nil {
			return err
		}

		var user User
		if err := lockForUpdate(tx).Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
			return ErrTopUpUserMissing
		}
		if _, err := safeRefundPostBalance(user.Quota, deduct); err != nil {
			return err
		}

		res := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota - ?", deduct))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return fmt.Errorf("用户额度更新未命中任何行: user_id=%d", topUp.UserId)
		}

		orderRes := tx.Model(&TopUp{}).Where("id = ? AND status = ?", topUp.Id, common.TopUpStatusSuccess).
			Update("status", common.TopUpStatusRefunded)
		if orderRes.Error != nil {
			return orderRes.Error
		}
		if orderRes.RowsAffected != 1 {
			return fmt.Errorf("订单状态更新未命中任何行: order_id=%d", topUp.Id)
		}

		deducted = deduct
		deductedUserID = topUp.UserId
		return nil
	})
	if err != nil {
		return 0, err
	}
	if deducted > 0 {
		if err := cacheDecrUserQuota(deductedUserID, int64(deducted)); err != nil {
			common.SysLog(fmt.Sprintf("failed to sync paypal refund deduction to user quota cache: %s", err.Error()))
		}
	}
	return deducted, nil
}

// safeRefundPostBalance computes the post-refund balance in int64 and
// rejects only a true wallet-domain underflow. Negative balances that still
// fit the 64-bit wallet column are returned as-is.
func safeRefundPostBalance(currentQuota int, deduct int) (int, error) {
	post := int64(currentQuota) - int64(deduct)
	if post < -int64(common.MaxWalletQuota) {
		return 0, fmt.Errorf("用户退款后余额 %d 超出钱包域下限 %d", post, -common.MaxWalletQuota)
	}
	return int(post), nil
}

// refundQuotaWithBonus returns the total quota the refund must claw back. It
// prefers the order's persisted BaseQuota and falls back to the
// caller-supplied quota only for historical orders settled before BaseQuota
// was persisted. A negative or oversized total is rejected closed.
func refundQuotaWithBonus(topUp *TopUp, quota int) (int, error) {
	if topUp.BonusQuota < 0 {
		return 0, fmt.Errorf("订单 %s 记录了非法的首次充值赠送额度 %d", topUp.TradeNo, topUp.BonusQuota)
	}
	base := topUp.BaseQuota
	if base == 0 {
		if quota <= 0 {
			return 0, fmt.Errorf("订单 %s 缺少可退款的本金记录", topUp.TradeNo)
		}
		base = quota
	}
	if base < 0 {
		return 0, fmt.Errorf("订单 %s 记录了非法的充值本金 %d", topUp.TradeNo, base)
	}
	total := int64(base) + int64(topUp.BonusQuota)
	if total > int64(common.MaxWalletQuota) {
		return 0, fmt.Errorf("订单 %s 的退款总额 %d 超出钱包域上限", topUp.TradeNo, total)
	}
	return int(total), nil
}

// RechargePayPal atomically settles a PayPal capture against a pending
// top-up order, following the upstream per-channel settlement structure:
// order row lock, provider/status validation, quota computation, first
// top-up bonus hook, order save and wallet credit inside one transaction.
//
// Idempotency: replaying the SAME capture id against an already successful
// order returns nil without crediting again; a DIFFERENT capture id against
// the same order is rejected, so one order can never be settled twice.
func RechargePayPal(tradeNo string, customerEmail string, customerName string, callerIp string, transactionId string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}
	if strings.TrimSpace(transactionId) == "" {
		return errors.New("未提供支付事务号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var quotaToAdd int
	var bonus int
	var credited bool
	topUp := &TopUp{}

	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}

		if topUp.PaymentProvider != PaymentProviderPayPal {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			// Idempotent replay: only the capture that was actually credited
			// may replay; any other capture is a hard mismatch.
			if topUp.GetTransactionId() == transactionId {
				return nil
			}
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		var quotaErr error
		quotaToAdd, quotaErr = common.WalletQuotaFromDecimalStrict(
			decimal.NewFromFloat(topUp.Money).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
		)
		if quotaErr != nil || quotaToAdd <= 0 {
			return ErrInvalidTopUpQuota
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		settledTransactionId := transactionId
		topUp.TransactionId = &settledTransactionId
		topUp.BaseQuota = quotaToAdd
		bonusQuota, bonusErr := grantFirstTopUpBonusTx(tx, topUp)
		if bonusErr != nil {
			return bonusErr
		}
		topUp.BonusQuota = bonusQuota
		bonus = bonusQuota
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		credited = true
		return creditTopUpQuota(tx, topUp.UserId, quotaToAdd, nil)
	})

	if err != nil {
		common.SysError("paypal topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !credited {
		return nil
	}
	syncCreditUserQuotaCache(topUp.UserId, quotaToAdd, "paypal topup")
	syncCreditUserQuotaCache(topUp.UserId, bonus, "paypal first top-up bonus")

	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用PayPal充值成功，充值额度: %v，支付金额：%.2f", logger.FormatQuota(quotaToAdd), topUp.Money), callerIp, topUp.PaymentMethod, PaymentMethodPayPal)
	return nil
}

// CleanExpiredPendingTopUps marks pending PAYPAL orders older than maxAge as
// expired and returns how many rows were updated. Only PayPal orders are
// cleaned: Stripe, Creem, EPay, Waffo, Waffo Pancake, and subscription
// settlement state machines are owned by their upstream provider flows and
// must not be touched by the Vancine cleaner.
func CleanExpiredPendingTopUps(maxAge time.Duration) int64 {
	cutoff := common.GetTimestamp() - int64(maxAge.Seconds())
	result := DB.Model(&TopUp{}).
		Where("status = ? AND payment_provider = ? AND create_time < ?",
			common.TopUpStatusPending, PaymentProviderPayPal, cutoff).
		Update("status", common.TopUpStatusExpired)
	if result.Error != nil {
		common.SysLog("failed to expire pending topups: " + result.Error.Error())
		return 0
	}
	return result.RowsAffected
}

// StartPendingTopUpCleaner runs periodically to expire stale pending orders.
// Orders older than maxAge are marked as "expired".
func StartPendingTopUpCleaner(interval, maxAge time.Duration) {
	for {
		time.Sleep(interval)
		count := CleanExpiredPendingTopUps(maxAge)
		if count > 0 {
			common.SysLog(fmt.Sprintf("expired %d pending topups older than %v", count, maxAge))
		}
	}
}
