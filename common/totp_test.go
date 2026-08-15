package common

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// deterministicBackupCodeSeq returns a generator that yields codes from seq in
// order, wrapping around when exhausted. Tests use this to force exact
// collision patterns without randomness.
func deterministicBackupCodeSeq(seq ...string) backupCodeGenerator {
	i := 0
	return func() (string, error) {
		code := seq[i%len(seq)]
		i++
		return code, nil
	}
}

// assertUniqueCodeSet verifies the explicit business invariant: the batch
// contains exactly BackupCodeCount entries with no duplicates.
func assertUniqueCodeSet(t *testing.T, codes []string) {
	t.Helper()
	require.Len(t, codes, BackupCodeCount, "batch must contain exactly BackupCodeCount codes")
	seen := make(map[string]bool, len(codes))
	for _, code := range codes {
		assert.False(t, seen[code], "duplicate code in batch: %s", code)
		seen[code] = true
	}
}

func TestGenerateUniqueBackupCodes_NormalSet(t *testing.T) {
	codes, err := generateUniqueBackupCodes(deterministicBackupCodeSeq(
		"AAAA-0001", "BBBB-0002", "CCCC-0003", "DDDD-0004",
	))
	require.NoError(t, err, "no-collision generation must succeed")
	assertUniqueCodeSet(t, codes)
}

func TestGenerateUniqueBackupCodes_FirstCollisionThenComplete(t *testing.T) {
	// The second draw collides with the first; the generator then produces
	// fresh distinct codes. The unique set must be completed and collision
	// retried without error.
	codes, err := generateUniqueBackupCodes(deterministicBackupCodeSeq(
		"AAAA-0001", "AAAA-0001", // collision
		"BBBB-0002", "CCCC-0003", "DDDD-0004",
	))
	require.NoError(t, err, "collision retry must succeed")
	assertUniqueCodeSet(t, codes)
}

func TestGenerateUniqueBackupCodes_PersistentCollisionFailsClosed(t *testing.T) {
	// A generator that only ever yields one code must hit the finite attempt
	// bound and return an error — never loop forever and never return a set
	// with fewer than BackupCodeCount entries.
	_, err := generateUniqueBackupCodes(deterministicBackupCodeSeq("AAAA-0001"))
	require.Error(t, err, "persistent collision must fail closed")
}

func TestGenerateUniqueBackupCodes_GeneratorErrorPropagates(t *testing.T) {
	sentinel := errors.New("sentinel generator failure")
	gen := func() (string, error) { return "", sentinel }
	_, err := generateUniqueBackupCodes(gen)
	require.Error(t, err)
	assert.ErrorIs(t, err, sentinel, "generator error must be identifiable via errors.Is")
}
