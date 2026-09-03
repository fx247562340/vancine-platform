package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type TopUp struct {
	Id            int     `json:"id"`
	UserId        int     `json:"user_id" gorm:"index"`
	Amount        int64   `json:"amount"`
	Money         float64 `json:"money"`
	TradeNo       string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string  `json:"payment_method" gorm:"type:varchar(50)"`
	// PaymentProvider was added to top_ups after 2026-04; rows settled before
	// that audit field was introduced leave the column as the default empty
	// string. The settlement code treats ""+Amount>0 as a legacy real top-up
	// (see model/topup_settlement.go), Amount=0 as a subscription/balance row.
	PaymentProvider string `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	PaymentId       string `json:"payment_id" gorm:"type:varchar(255);default:'';index"`
	TransactionId   string `json:"transaction_id" gorm:"type:varchar(255);default:'';uniqueIndex"`
	CreateTime      int64  `json:"create_time"`
	CompleteTime    int64  `json:"complete_time"`
	Status          string `json:"status"`
	// BaseQuota 记录结算时实际入账的本金（不含首次充值赠送）。退款/冲正
	// 必须用这个持久化值与 BonusQuota 之和扣除，不允许按退款时的
	// QuotaPerUnit 重新计算，避免管理员调整 QuotaPerUnit 之后历史订单
	// 出现"本金对不上"的回滚。0 表示该字段从未被结算写入。
	BaseQuota int `json:"base_quota" gorm:"type:int;default:0"`
	// BonusQuota 记录该订单结算时实际发放的首次充值赠送额度，0 表示未发放。
	// 退款/冲正要连同这部分一起收回，所以订单状态不能代替发放事实。
	BonusQuota int `json:"bonus_quota" gorm:"type:int;default:0"`
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodPayPal       = "paypal"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
	PaymentMethodBalance      = "balance"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderPayPal       = "paypal"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
	PaymentProviderBalance      = "balance"
)

var (
	ErrPaymentMethodMismatch = errors.New("payment method mismatch")
	ErrTopUpNotFound         = errors.New("topup not found")
	ErrTopUpStatusInvalid    = errors.New("topup status invalid")
)

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTransactionId(transactionId string) *TopUp {
	var topUp *TopUp
	err := DB.Where("transaction_id = ?", transactionId).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

// FindTopUpByPaymentID looks up a top-up by its stored PayPal Order ID. When
// expectedProvider is non-empty the lookup is provider-scoped so a stray Order
// ID from another payment method can never settle a PayPal obligation.
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

// RefundPayPalTopUp deducts quota and marks the order as refunded in a single transaction.
// The caller passes the quota the payment itself bought; the first top-up bonus that
// order granted is added to the deduction here, so a refund claws back everything the
// settlement credited and never claws it back twice.
//
// The deduction uses the order's persisted BaseQuota and BonusQuota when BaseQuota is
// non-zero (the normal case for any order settled after this fix shipped). For orders
// settled before BaseQuota was persisted, the quota the caller passes stands in for
// the unknown base: a user-visible note in the changelog reminds operators that the
// historical amount cannot be reconstructed from the current QuotaPerUnit.
//
// Refunds that drop the user below zero are allowed: a user who already consumed the
// purchased quota and is asking for a refund is precisely the case where the balance
// has to go negative. The only failure mode is a true int32 underflow, i.e. the final
// balance would land below common.MinQuota. The underflow check is done in int64 so
// the comparison cannot itself overflow.
//
// A duplicate full refund on an already-refunded order is a successful no-op: it returns
// (0, nil) without deducting quota or logging again. The order stays in the refunded
// history, so a refund never restores the user's first top-up qualification. Any
// non-zero first return value is the actual quota the transaction deducted, which
// the caller mirrors to the user quota cache only after a successful commit.
func RefundPayPalTopUp(tradeNo string, quota int) (int, error) {
	var deducted int
	var deductedUserID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var topUp TopUp
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.Status == common.TopUpStatusRefunded {
			// A duplicate or sibling event; nothing to deduct and nothing to
			// touch in the cache (see the post-commit comment for the
			// contract on the replay branch).
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
		// Allow the balance to go negative; only fail when the post-refund value
		// would underflow the int32 quota column. Computed in int64 so the
		// subtraction itself cannot wrap.
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
		// Fast path: mirror the actual deduction to the user quota hash
		// via applyUserQuotaHashDelta. The shared helper owns the
		// safe-failure policy: in batch-update mode a HINCRBY failure
		// pins the cache Quota to MinQuota (a "do-not-consume"
		// sentinel) instead of deleting the row, so a pending batch
		// delta is never clobbered by a rebuild; in the non-batch path
		// a HINCRBY failure invalidates the cache so the next
		// GetUserCache rebuilds from the database row.
		applyUserQuotaHashDelta(deductedUserID, -int64(deducted))
	}
	// A replay (deducted == 0) is a true no-op for the cache: the order was
	// already refunded, no quota was deducted this call, and the cache hash
	// may already carry values that are NOT in the database yet (pending
	// batch consumption, manual operator edits, etc.). Deleting the cache
	// on replay would clobber those pending values and force a DB rebuild
	// that loses the pending deltas. So the replay branch is intentionally
	// empty.
	return deducted, nil
}

// safeRefundPostBalance computes the post-refund balance in int64 and rejects
// only a true int32 underflow. Negative balances that still fit the int32
// quota column are returned as-is, so a user whose consumption has already
// eaten the purchased quota can still be refunded.
func safeRefundPostBalance(currentQuota int, deduct int) (int, error) {
	post := int64(currentQuota) - int64(deduct)
	if post < int64(common.MinQuota) {
		return 0, fmt.Errorf("用户退款后余额 %d 超出 int32 额度下限 %d", post, common.MinQuota)
	}
	return int(post), nil
}

// refundQuotaWithBonus returns the total quota the refund must claw back. It
// prefers the order's persisted BaseQuota (so a refund always matches what the
// settlement actually credited, even after QuotaPerUnit is changed), and falls
// back to the caller-supplied quota only for historical orders settled before
// BaseQuota was persisted. A negative or oversized total is rejected closed.
func refundQuotaWithBonus(topUp *TopUp, quota int) (int, error) {
	if topUp.BonusQuota < 0 {
		return 0, fmt.Errorf("订单 %s 记录了非法的首次充值赠送额度 %d", topUp.TradeNo, topUp.BonusQuota)
	}
	base := topUp.BaseQuota
	if base == 0 {
		base = quota
	}
	if base < 0 {
		return 0, fmt.Errorf("订单 %s 持久化本金 %d 不可用，回退值 %d 为负", topUp.TradeNo, topUp.BaseQuota, quota)
	}
	total, err := sumTopUpQuota(base, topUp.BonusQuota)
	if err != nil {
		return 0, fmt.Errorf("订单 %s 退款额度无效: %w", topUp.TradeNo, err)
	}
	return total, nil
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := lockForUpdate(tx).Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if expectedPaymentProvider != "" && topUp.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		topUp.Status = targetStatus
		return tx.Save(topUp).Error
	})
}

// Recharge settles a Stripe checkout through the shared real top-up settlement.
// Stripe credits Money x QuotaPerUnit (float64 truncation) and binds the gateway
// customer to the user when the gateway reports one; both land in the same
// transaction as the first top-up bonus.
func Recharge(referenceId string, customerId string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	spec := topUpSettleSpec{
		tradeNo:  referenceId,
		provider: PaymentProviderStripe,
		replay:   replayIsStatusError,
	}
	// Stripe checkout sometimes delivers a callback with no customer id
	// (e.g. a guest payment intent). An empty string must not overwrite a
	// previously bound stripe_customer — only an actually present id does.
	if strings.TrimSpace(customerId) != "" {
		spec.userFields = map[string]interface{}{"stripe_customer": customerId}
	}
	settlement, err := settleRealTopUp(spec)
	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !settlement.Credited {
		// A duplicate callback is the channel's contract: no second credit, no
		// second bonus, no second log, and the duplicate is reported through the
		// status error the Stripe webhook layer turns into a non-2xx response.
		return nil
	}

	RecordTopupLog(settlement.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", settlement.QuotaLogText(), settlement.Amount), callerIp, settlement.PaymentMethod, PaymentMethodStripe)

	return nil
}

// topUpQueryWindowSeconds 限制充值记录查询的时间窗口（秒）。
const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

// topUpQueryCutoff 返回允许查询的最早 create_time（秒级 Unix 时间戳）。
func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	cutoff := topUpQueryCutoff()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, cutoff).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ? AND create_time >= ?", userId, cutoff).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用，不限制时间窗口）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// searchTopUpCountHardLimit 搜索充值记录时 COUNT 的安全上限，
// 防止对超大表执行无界 COUNT 触发 DoS。
const searchTopUpCountHardLimit = 10000

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用，不限制时间窗口）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值。
//
// 补单走与其他真实充值渠道相同的事务结算：订单状态、首次充值赠送和用户额度
// 在同一个事务内生效；重复补单是幂等空操作，不重复充值也不重复记日志。
// 管理员可以补任意渠道的订单，所以不绑定单一 payment_provider；但首次充值
// 赠送只认真实支付渠道白名单。
func ManualCompleteTopUp(tradeNo string, callerIp string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo: tradeNo,
		replay:  replayIsNoOp,
	})
	if err != nil {
		if errors.Is(err, ErrTopUpStatusInvalid) {
			return errors.New("订单状态不是待支付，无法补单")
		}
		return err
	}
	if !settlement.Credited {
		return nil
	}

	// 事务外记录日志，避免阻塞
	RecordTopupLog(settlement.UserId, fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", settlement.QuotaLogText(), settlement.Money), callerIp, settlement.PaymentMethod, "admin")
	return nil
}

// RechargePayPal settles a captured PayPal payment through the shared real
// top-up settlement. The capture id is required, must not belong to another
// order, and is recorded on the order; replaying the same capture is an
// idempotent no-op.
func RechargePayPal(referenceId string, customerEmail string, customerName string, callerIp string, transactionId string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:            referenceId,
		provider:           PaymentProviderPayPal,
		replay:             replayNeedsSameTransaction,
		transaction:        transactionId,
		requireTransaction: true,
		payerEmail:         customerEmail,
	})
	if err != nil {
		common.SysError("paypal topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !settlement.Credited {
		return nil
	}

	RecordTopupLog(settlement.UserId, fmt.Sprintf("使用PayPal充值成功，充值额度: %v，支付金额：%.2f", settlement.QuotaLogText(), settlement.Money), callerIp, settlement.PaymentMethod, PaymentMethodPayPal)

	return nil
}

// RechargeCreem settles a paid Creem order through the shared real top-up
// settlement. Creem stores the purchased quota in Amount, so that value is
// credited verbatim.
func RechargeCreem(referenceId string, customerEmail string, customerName string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:    referenceId,
		provider:   PaymentProviderCreem,
		replay:     replayIsStatusError,
		payerEmail: customerEmail,
	})
	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !settlement.Credited {
		return nil
	}

	RecordTopupLog(settlement.UserId, fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", settlement.QuotaLogText(), settlement.Money), callerIp, settlement.PaymentMethod, PaymentMethodCreem)

	return nil
}

// RechargeWaffo settles a paid Waffo order through the shared real top-up
// settlement. A duplicate notification is an idempotent no-op.
func RechargeWaffo(tradeNo string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:  tradeNo,
		provider: PaymentProviderWaffo,
		replay:   replayIsNoOp,
	})
	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !settlement.Credited {
		return nil
	}

	RecordTopupLog(settlement.UserId, fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", settlement.QuotaLogText(), settlement.Money), callerIp, settlement.PaymentMethod, PaymentMethodWaffo)

	return nil
}

// RechargeWaffoPancake settles a paid Waffo Pancake order through the shared
// real top-up settlement. A duplicate event is an idempotent no-op.
func RechargeWaffoPancake(tradeNo string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:  tradeNo,
		provider: PaymentProviderWaffoPancake,
		replay:   replayIsNoOp,
	})
	if err != nil {
		common.SysError("waffo pancake topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}
	if !settlement.Credited {
		return nil
	}

	RecordLog(settlement.UserId, LogTypeTopup, fmt.Sprintf("Waffo Pancake充值成功，充值额度: %v，支付金额: %.2f", settlement.QuotaLogText(), settlement.Money))

	return nil
}

// RechargeEpay settles an epay (易支付) notification through the shared real
// top-up settlement, so the order status and the quota credit commit together
// instead of being two separate writes. actualPaymentMethod is the method the
// gateway reports it actually charged, which can differ from the one the user
// asked for. A duplicate notification is reported as an idempotent success so
// the gateway can stop retrying.
func RechargeEpay(tradeNo string, actualPaymentMethod string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	settlement, err := settleRealTopUp(topUpSettleSpec{
		tradeNo:       tradeNo,
		provider:      PaymentProviderEpay,
		replay:        replayIsNoOp,
		paymentMethod: actualPaymentMethod,
	})
	if err != nil {
		common.SysError("epay topup failed: " + err.Error())
		return err
	}
	if !settlement.Credited {
		return nil
	}

	RecordTopupLog(settlement.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", settlement.QuotaLogText(), settlement.Money), callerIp, settlement.PaymentMethod, PaymentProviderEpay)

	return nil
}

// CleanExpiredPendingTopUps marks pending orders older than the given duration as expired.
// Returns the number of orders expired.
func CleanExpiredPendingTopUps(maxAge time.Duration) int64 {
	cutoff := time.Now().Add(-maxAge).Unix()
	result := DB.Model(&TopUp{}).
		Where("status = ? AND create_time < ?", common.TopUpStatusPending, cutoff).
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
