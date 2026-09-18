package common

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const accountPasswordAlgorithmEnv = "ACCOUNT_PASSWORD_HASH_ALGORITHM"

// TestHashAccountPasswordDefaultAlgorithm pins the account-password storage
// contract that the rest of the system depends on: the default write is bcrypt
// and Argon2id is an explicit opt-in, while reads stay dual-format. Every
// password write in the product funnels through HashAccountPassword
// (model/user.go, model/account_security.go, controller/setup.go), so a silent
// default change would switch the whole deployment's storage format without any
// operator action.
func TestHashAccountPasswordDefaultAlgorithm(t *testing.T) {
	const password = "correct-horse-battery"

	for _, tc := range []struct {
		name          string
		algorithm     string
		setEnv        bool
		wantPrefix    string
		wantErrSubstr string
	}{
		{name: "unset defaults to bcrypt", setEnv: false, wantPrefix: "$2a$"},
		{name: "explicit bcrypt", algorithm: "bcrypt", setEnv: true, wantPrefix: "$2a$"},
		{name: "explicit argon2id opt-in", algorithm: "argon2id", setEnv: true, wantPrefix: "$argon2id$v=19$m=19456,t=2,p=1$"},
		{name: "unsupported algorithm is rejected", algorithm: "scrypt", setEnv: true, wantErrSubstr: "Unsupported account password hashing configuration."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.setEnv {
				t.Setenv(accountPasswordAlgorithmEnv, tc.algorithm)
			} else {
				// The default is the behaviour under test, so the variable must be
				// genuinely absent. t.Setenv can only set, hence the explicit
				// unset plus a cleanup that restores the prior state.
				previous, had := os.LookupEnv(accountPasswordAlgorithmEnv)
				require.NoError(t, os.Unsetenv(accountPasswordAlgorithmEnv))
				t.Cleanup(func() {
					if had {
						require.NoError(t, os.Setenv(accountPasswordAlgorithmEnv, previous))
						return
					}
					require.NoError(t, os.Unsetenv(accountPasswordAlgorithmEnv))
				})
			}

			hash, err := HashAccountPassword(password)
			if tc.wantErrSubstr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErrSubstr)
				assert.Empty(t, hash)
				return
			}
			require.NoError(t, err)
			assert.True(t, strings.HasPrefix(hash, tc.wantPrefix),
				"hash %q must use the %q format", hash, tc.wantPrefix)
			// Whatever format was written must verify through the dual-format reader.
			assert.True(t, ValidatePasswordAndHash(password, hash), "stored hash must verify")
			assert.False(t, ValidatePasswordAndHash("wrong-password", hash))
		})
	}
}

// TestHashAccountPasswordBcryptModeRejectsOverlongPassword protects the bcrypt
// 72-byte truncation boundary: in the default bcrypt mode a password longer than
// 72 bytes must be refused outright rather than silently truncated, which is why
// the long-password ceiling is only lifted by the explicit Argon2id opt-in.
func TestHashAccountPasswordBcryptModeRejectsOverlongPassword(t *testing.T) {
	t.Setenv(accountPasswordAlgorithmEnv, "bcrypt")

	atLimit := strings.Repeat("a", 72)
	hash, err := HashAccountPassword(atLimit)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(hash, "$2a$"))
	assert.True(t, ValidatePasswordAndHash(atLimit, hash))

	overLimit := strings.Repeat("a", 73)
	_, err = HashAccountPassword(overLimit)
	require.ErrorIs(t, err, ErrPasswordLegacyLimit)

	// Argon2id has no 72-byte limit, so the same password is accepted there.
	t.Setenv(accountPasswordAlgorithmEnv, "argon2id")
	hash, err = HashAccountPassword(overLimit)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(hash, "$argon2id$"))
	assert.True(t, ValidatePasswordAndHash(overLimit, hash))
}

// TestValidatePasswordAndHashReadsBothFormats is the dual-format read guarantee
// that makes the bcrypt default reversible: hashes written by either algorithm
// must keep verifying, so no existing hash is ever rewritten in bulk and a
// deployment can move to Argon2id (or roll back) without a data migration.
func TestValidatePasswordAndHashReadsBothFormats(t *testing.T) {
	const password = "correct-horse-battery"

	t.Setenv(accountPasswordAlgorithmEnv, "bcrypt")
	bcryptHash, err := HashAccountPassword(password)
	require.NoError(t, err)

	t.Setenv(accountPasswordAlgorithmEnv, "argon2id")
	argon2Hash, err := HashAccountPassword(password)
	require.NoError(t, err)
	require.NotEqual(t, bcryptHash, argon2Hash)

	// The reader is format-agnostic and independent of the write algorithm.
	t.Setenv(accountPasswordAlgorithmEnv, "bcrypt")
	assert.True(t, ValidatePasswordAndHash(password, argon2Hash), "argon2id hash must verify while bcrypt is the write default")
	assert.True(t, ValidatePasswordAndHash(password, bcryptHash))

	t.Setenv(accountPasswordAlgorithmEnv, "argon2id")
	assert.True(t, ValidatePasswordAndHash(password, bcryptHash), "bcrypt hash must verify after an opt-in to argon2id")
	assert.True(t, ValidatePasswordAndHash(password, argon2Hash))

	assert.False(t, ValidatePasswordAndHash(password, "not-a-hash"))
	assert.False(t, ValidatePasswordAndHash(password, ""))
}
