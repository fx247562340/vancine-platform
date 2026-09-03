package model

import (
	"errors"
	"fmt"
)

// UserHasCompletedFirstTopUp reports whether the user has already completed a
// real top-up. The rule itself lives in the shared domain query
// hasCompletedRealTopUp (see topup_settlement.go): the provider whitelist, the
// success/refunded status filter and the legacy unassigned rule are defined
// exactly once, so this read-only check cannot drift from the authoritative
// settlement transaction.
//
// This is the read-only predicate the public /api/user/topup/info endpoint
// uses to advertise the "first top-up bonus" to the user. It runs OUTSIDE the
// settlement transaction and does NOT take a user row lock, and it does not
// exclude any order (unlike the settlement, which excludes the order being
// settled). The settlement still re-checks while holding the user lock, so a
// race against a concurrent first top-up cannot credit the bonus twice.
//
// Failures return an error and the caller must log and treat the user as
// ineligible, never the other way around.
func UserHasCompletedFirstTopUp(userID int) (bool, error) {
	if userID <= 0 {
		return false, errors.New("user id must be positive")
	}

	completed, err := hasCompletedRealTopUp(DB, userID, 0)
	if err != nil {
		return false, fmt.Errorf("query first top-up history: %w", err)
	}
	return completed, nil
}
