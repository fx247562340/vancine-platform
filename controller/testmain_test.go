package controller

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common/limiter"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
)

// p10SharedRedisServer is a long-lived miniredis server that survives the
// entire controller test process. The common/limiter singleton (sync.Once)
// permanently saves the first *redis.Client it receives. By pre-initializing
// the singleton with this shared client in TestMain, the singleton always
// holds a live client — even across -count=N iterations and sqlite→PG
// subtest transitions.
//
// This is NOT a production test hook. It is a test-infrastructure fixture
// that provides a stable in-process Redis server for the rate limiter
// singleton. No production code is modified.
var (
	p10SharedRedisServer *miniredis.Miniredis
	p10SharedRedisClient *redis.Client
	p10SharedTracker     *p10RedisTracker
)

func TestMain(m *testing.M) {
	var err error
	p10SharedRedisServer, err = miniredis.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "p10 shared miniredis start failed: %v\n", err)
		os.Exit(1)
	}

	p10SharedRedisClient = redis.NewClient(&redis.Options{
		Addr: p10SharedRedisServer.Addr(),
	})
	if err := p10SharedRedisClient.Ping(context.Background()).Err(); err != nil {
		fmt.Fprintf(os.Stderr, "p10 shared redis ping failed\n")
		if closeErr := p10SharedRedisClient.Close(); closeErr != nil {
			fmt.Fprintf(os.Stderr, "p10 shared redis client close failed\n")
		}
		p10SharedRedisServer.Close()
		os.Exit(1)
	}

	// Pre-initialize the limiter singleton with the shared client. The
	// sync.Once in limiter.New permanently saves this client.
	limiter.New(context.Background(), p10SharedRedisClient)

	// Attach a permanent tracker to the shared client. This is the ONLY
	// hook on the shared client — no per-test hook accumulation. E07 uses
	// this tracker to observe rate-limit and performance events. The
	// tracker's ledger accumulates across all E07 iterations; each
	// iteration uses checkpoint/waitAfter to track its own events.
	p10SharedTracker = newP10RedisTracker()
	p10SharedRedisClient.AddHook(p10SharedTracker)

	exitCode := m.Run()

	// Close shared client and server AFTER m.Run. If cleanup fails and
	// m.Run returned 0, force a non-zero exit. Error messages are
	// sanitized — no address, DSN, token, or password.
	var closeErr error
	if err := p10SharedRedisClient.Close(); err != nil {
		closeErr = fmt.Errorf("shared redis client close failed: %w", err)
	}
	p10SharedRedisServer.Close()
	if exitCode == 0 && closeErr != nil {
		fmt.Fprintf(os.Stderr, "%v\n", closeErr)
		os.Exit(1)
	}
	os.Exit(exitCode)
}
