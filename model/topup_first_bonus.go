package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// First top-up bonus — minimal settlement hooks.
//
// Each payment channel keeps the upstream settlement structure (its own
// transaction, order lock, quota computation and credit). The bonus is added
// as ONE shared transactional hook called inside each channel's settlement
// transaction after the paid quota is known and before the order row is
// saved. There is no unified settlement layer.

// realTopUpProviders are the payment providers whose orders are real, paid
// online top-ups. The list is explicit on purpose: "not balance" is not a
// safe proxy, because subscription settlement and admin/balance sources also
// write top_up rows and must neither grant nor consume the first top-up
// bonus. Redemption codes, admin quota grants and invitation rewards never
// create top_up rows with these providers.
var realTopUpProviders = []string{
	PaymentProviderEpay,
	PaymentProviderStripe,
	PaymentProviderCreem,
	PaymentProviderPayPal,
	PaymentProviderWaffo,
	PaymentProviderWaffoPancake,
}

// firstTopUpHistoryStatuses are the order states that prove the user already
// completed a real top-up. A refunded order still proves the payment
// happened, so a refund never restores first top-up qualification.
var firstTopUpHistoryStatuses = []string{common.TopUpStatusSuccess, common.TopUpStatusRefunded}

// legacyUnassignedRealTopUpFilter recognises rows settled before the
// payment_provider audit field existed (added 2026-04): payment_provider was
// left at its default '' and Amount carried the order's dollar value. Rows
// with Amount=0 (subscriptions, balance adjustments) and rows whose provider
// is already set to a non-real value still fall through to the whitelist, so
// this predicate can be ORed into the history query without weakening any
// other rule.
const legacyUnassignedRealTopUpFilter = "(payment_provider = '' AND amount > 0)"

// hasCompletedRealTopUp answers "does this user already have a settled
// (success or refunded) real top-up?". The settlement hook calls it with
// excludedTopUpID set to the order being settled (so the order itself never
// counts against its own bonus); the read-only topup-info eligibility check
// calls it with 0.
func hasCompletedRealTopUp(tx *gorm.DB, userID int, excludedTopUpID int) (bool, error) {
	query := tx.Model(&TopUp{}).
		Where(
			"user_id = ? AND status IN ? AND (payment_provider IN ? OR "+legacyUnassignedRealTopUpFilter+")",
			userID, firstTopUpHistoryStatuses, realTopUpProviders,
		)
	if excludedTopUpID > 0 {
		query = query.Where("id <> ?", excludedTopUpID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// ValidFirstTopUpBonusQuota returns the configured bonus quota and whether
// the bonus is active. The bonus is active only when the configured value is
// strictly positive and inside the wallet domain; the raw value is always
// returned so misconfiguration stays observable on the status endpoint.
func ValidFirstTopUpBonusQuota() (int, bool) {
	quota := common.QuotaForFirstTopUp
	return quota, quota > 0 && quota <= common.MaxWalletQuota
}

// grantFirstTopUpBonusTx runs inside a channel settlement transaction, after
// the paid quota was computed and BEFORE the order row is saved. topUp must
// be the locked order being settled (Id, UserId, PaymentProvider set).
//
// Concurrency contract: the user row is locked first, so two concurrent
// settlements of different orders for the same user serialize on it; the
// eligibility read happens under that lock and the bonus credit is part of
// the same transaction as the order row and the paid credit, so a duplicate
// webhook, a sync-return/webhook race or any rolled-back settlement can
// never grant the bonus twice or leave it granted without the order.
//
// Returns 0 when the bonus is inactive or the user already completed a real
// top-up (the qualification is lifetime: refunded history still counts).
func grantFirstTopUpBonusTx(tx *gorm.DB, topUp *TopUp) (int, error) {
	bonusQuota, active := ValidFirstTopUpBonusQuota()
	if !active {
		return 0, nil
	}
	if topUp == nil || topUp.Id == 0 || topUp.UserId <= 0 {
		return 0, errors.New("first top-up bonus requires a persisted order with a user")
	}

	// Lock the user row so concurrent settlements of this user's orders
	// serialize before the eligibility read.
	var user User
	if err := lockForUpdate(tx).Where("id = ?", topUp.UserId).First(&user).Error; err != nil {
		return 0, ErrTopUpUserMissing
	}

	completed, err := hasCompletedRealTopUp(tx, topUp.UserId, topUp.Id)
	if err != nil {
		return 0, err
	}
	if completed {
		return 0, nil
	}

	// Credit the bonus with the same wallet-ceiling predicate the paid
	// credit uses, so the bonus alone can never push the wallet past the
	// domain; the update also carries no other fields.
	if err := creditTopUpQuota(tx, topUp.UserId, bonusQuota, nil); err != nil {
		return 0, fmt.Errorf("first top-up bonus credit failed: %w", err)
	}
	return bonusQuota, nil
}
