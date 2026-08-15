package controller

// CP2 P1-A12 Cross-user release and rebind.
//
// The slice proves the durable Google claim semantics across an explicit
// ownership transfer:
//
//   1. UserA binds Google subject X via the real callback (claim + mirror)
//   2. UserA self-unbinds Google (or admin clears) — the claim and mirror
//      are released together
//   3. UserB binds the same subject X via a second real callback
//   4. Final state: exactly one durable claim, owner=UserB; UserB's mirror
//      is X; UserA's mirror is empty; no orphan claim, no multi-owner
//
// The same-user rebind path (UserA → UserA after unbind) is covered by
// the existing TestGoogleRebindAfterSelfUnbind; that test is not a
// substitute for this cross-user test.

import (
	"fmt"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGoogleCrossUserReleaseAndRebind drives the full A12 contract on the
// SQLite fixture always, and on the configured PostgreSQL fixture when
// TEST_POSTGRES_DSN is set (never skipped).
func TestGoogleCrossUserReleaseAndRebind(t *testing.T) {
	t.Run("sqlite", func(t *testing.T) {
		env := setupGoogleOAuthTest(t, concurrentGoogleDSN(t))
		a12CrossUserBody(t, env)
	})
	if dsn := os.Getenv("TEST_POSTGRES_DSN"); dsn != "" {
		t.Run("postgres", func(t *testing.T) {
			env := setupGoogleOAuthTestOn(t, dsn, common.DatabaseTypePostgreSQL)
			a12CrossUserBody(t, env)
		})
	}
}

func a12CrossUserBody(t *testing.T, env *googleOAuthTestEnv) {
	db := env.db
	common.PasswordLoginEnabled = true

	// The loopback mock returns its own configured subject; record it so
	// the rebind invariants can be asserted against the actual sub the
	// production callback will receive.
	const googleSub = "cross-user-google-sub-001"
	env.userInfoSub = googleSub

	// 1. Seed two real users.
	userA := createGoogleOAuthTestUser(t, db, "cross-user-a")
	userB := createGoogleOAuthTestUser(t, db, "cross-user-b")
	accessTokenA := common.GetRandomString(32)
	require.NoError(t, db.Model(&model.User{}).
		Where("id = ?", userA.Id).
		Update("access_token", accessTokenA).Error)
	accessTokenB := common.GetRandomString(32)
	require.NoError(t, db.Model(&model.User{}).
		Where("id = ?", userB.Id).
		Update("access_token", accessTokenB).Error)

	// UserA keeps a non-Google session credential so the bind flow is
	// eligible before UserB claims the released subject.
	require.NoError(t, db.Model(&model.User{}).
		Where("id = ?", userA.Id).
		Update("password", "a12-userA-hash-not-real-bcrypt").Error)

	// 2. UserA binds Google subject X through the real callback.
	state := startGoogleBindFlow(t, userA, "session-userA")
	bindRec := serveOAuthCallback("google",
		"state="+state+"&code=mock-code", userA.Id, "session-userA")
	require.True(t, decodeOAuthResponse(t, bindRec).Success, bindRec.Body.String())

	// Sanity: exactly one Google claim, owner=UserA, mirror=UserA=X.
	claimsA := findGoogleClaims(t, db)
	require.Len(t, claimsA, 1, "after UserA bind exactly one Google claim row must exist")
	assert.Equal(t, googleSub, claimsA[0].Subject, "claim subject must equal the userinfo sub")
	assert.Equal(t, userA.Id, claimsA[0].UserId, "claim owner must be UserA")
	assert.Equal(t, googleSub, reloadUnbindUser(t, db, userA.Id).GoogleSub,
		"UserA mirror must equal the bound subject")

	// 3. UserA self-unbinds Google with a usable password alternative.
	passwordHash, err := common.Password2Hash("cross-user-a-strong-password")
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.User{}).
		Where("id = ?", userA.Id).
		Update("password", passwordHash).Error)
	unbindRec := doGoogleSelfUnbind(googleSelfUnbindRouter(), accessTokenA)
	unbindResp := decodeEnvelope(t, unbindRec)
	require.True(t, unbindResp["success"].(bool), unbindRec.Body.String())

	// After unbind: zero claims, UserA mirror empty.
	assert.Empty(t, findGoogleClaims(t, db),
		"after UserA self-unbind the durable claim must be deleted")
	assert.Empty(t, reloadUnbindUser(t, db, userA.Id).GoogleSub,
		"after UserA self-unbind the mirror must be cleared")

	// 4. UserB binds the same subject X through the real callback.
	stateB := startGoogleBindFlow(t, userB, "session-userB")
	rebindRec := serveOAuthCallback("google",
		"state="+stateB+"&code=mock-code", userB.Id, "session-userB")
	require.True(t, decodeOAuthResponse(t, rebindRec).Success,
		"UserB rebind must succeed: %s", rebindRec.Body.String())

	// 5. Final invariants:
	//    - exactly one Google claim row exists, owner=UserB, subject=X
	//    - UserB mirror == X
	//    - UserA mirror empty
	//    - no orphan rows, no multi-owner
	finalClaims := findGoogleClaims(t, db)
	require.Len(t, finalClaims, 1, "exactly one durable claim must survive the cross-user rebind")
	assert.Equal(t, googleSub, finalClaims[0].Subject, "the surviving claim must carry the original subject")
	assert.Equal(t, userB.Id, finalClaims[0].UserId, "the surviving claim owner must be UserB")

	userAAfter := reloadUnbindUser(t, db, userA.Id)
	assert.Empty(t, userAAfter.GoogleSub, "UserA mirror must remain empty after the transfer")
	userBAfter := reloadUnbindUser(t, db, userB.Id)
	assert.Equal(t, googleSub, userBAfter.GoogleSub,
		"UserB mirror must equal the bound subject")

	// 6. UserA logging back in with the same Google subject via the
	//    callback must NOT be recognized as the original owner.
	stateAgain := startGoogleLoginFlow(t)
	loginAgain := serveOAuthCallback("google",
		fmt.Sprintf("state=%s&code=mock-code", stateAgain), 0, "")
	respBody := loginAgain.Body.String()
	require.True(t, decodeOAuthResponse(t, loginAgain).Success,
		"UserA login callback must complete, body=%s", respBody)
	loggedInUserID := decodeLoginUserId(t, loginAgain)
	assert.NotEqual(t, userA.Id, loggedInUserID,
		"UserA must not be re-recognized as the original owner after the subject was transferred to UserB")
	assert.Equal(t, userB.Id, loggedInUserID,
		"the same Google subject now resolves to UserB, the legitimate new owner")
}
