/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/singleflight"
)

// homepageStatsWindowDays is the rolling window length the homepage
// 30-day stats tile uses. It is intentionally a constant (not a config
// option) so the public contract — the tile always says "30 days" —
// stays in lock-step with the server-side query.
const homepageStatsWindowDays = 30

// homepageStatsCacheTTL caps the lifetime of BOTH cache layers
// (Redis and the in-process snapshot). One TTL keeps the two layers
// interchangeable: whichever layer answers first is equally fresh.
const homepageStatsCacheTTL = 5 * time.Minute

// homepageStatsCacheKey is the single Redis key under which the
// homepage stats payload is cached. v4 carries the current counting
// semantics (operational-stats publish gate, failed-consume
// exclusions); older keys expire on their own and are never
// migrated or flushed.
const homepageStatsCacheKey = "vancine:homepage:stats:v4"

// homepageStatsContentType is the response content type for every
// success path, cache hit or miss.
const homepageStatsContentType = "application/json; charset=utf-8"

// homepageStatsCacheHeader names the response header that reports
// which layer served the payload:
//
//	hit        — served from Redis, no DB touch
//	hit-memory — served from the in-process snapshot (Redis
//	             unavailable or empty), no DB touch
//	miss       — freshly computed
//	miss-stale — a refresh failed or was in failure backoff, so the
//	             last successful snapshot was served instead; its
//	             as_of is the original one, never rewritten
const homepageStatsCacheHeader = "X-Vancine-Homepage-Stats-Cache"

// homepageStatsQueryTimeout caps a single live aggregate so a
// pathological scan (e.g. a table without its time index) can never
// block the homepage handler beyond this bound. The context is wired
// into every model query; the driver surfaces the deadline as a
// context error, which the per-aggregate catch converts into an
// "unavailable" availability flag rather than zero.
const homepageStatsQueryTimeout = 3 * time.Second

// homepageStatsFailureBackoff is how long the handler refuses to
// re-run the aggregate after an operational-stats refresh failed.
// During the backoff window requests are served from the last
// successful snapshot (or the last failed envelope if no snapshot
// exists) instead of hammering a sick database once per request.
const homepageStatsFailureBackoff = 30 * time.Second

// homepageStatsRefreshGroup coalesces concurrent refreshes: only one
// goroutine runs the actual aggregate while every other caller waits
// on the same result. The key is constant because the whole
// refresh flow — cache re-check, compute, publish — is one critical
// section. A pointer so tests can swap in a fresh group without
// copying the embedded mutex.
var homepageStatsRefreshGroup = &singleflight.Group{}

// In-process snapshot. The last SUCCESSFUL response, byte-for-byte
// (including its original as_of), plus the wall time it was computed.
// It serves two purposes:
//
//  1. Redis fallback. When Redis is down or disabled the snapshot
//     keeps the homepage off the database for the full cache TTL.
//  2. Failure memory. A wholly-failed refresh serves the snapshot
//     even beyond its TTL (marked miss-stale) instead of publishing
//     an all-unavailable envelope over good numbers — and the
//     snapshot's as_of is never rewritten, so the client can still
//     see how old the numbers really are.
var (
	homepageSnapshotMu        sync.RWMutex
	homepageSnapshotPayload   []byte
	homepageSnapshotAt        time.Time
	homepageLastFailedAt      time.Time
	homepageLastFailedPayload []byte
)

func homepageSnapshotRead() ([]byte, time.Time) {
	homepageSnapshotMu.RLock()
	defer homepageSnapshotMu.RUnlock()
	return homepageSnapshotPayload, homepageSnapshotAt
}

func homepageSnapshotWrite(payload []byte, at time.Time) {
	homepageSnapshotMu.Lock()
	homepageSnapshotPayload = payload
	homepageSnapshotAt = at
	homepageSnapshotMu.Unlock()
}

func homepageMarkFailure(at time.Time, failedPayload []byte) {
	homepageSnapshotMu.Lock()
	homepageLastFailedAt = at
	homepageLastFailedPayload = failedPayload
	homepageSnapshotMu.Unlock()
}

func homepageClearFailure() {
	homepageSnapshotMu.Lock()
	homepageLastFailedAt = time.Time{}
	homepageLastFailedPayload = nil
	homepageSnapshotMu.Unlock()
}

func homepageFailedPayload() []byte {
	homepageSnapshotMu.RLock()
	defer homepageSnapshotMu.RUnlock()
	return homepageLastFailedPayload
}

func homepageInFailureBackoff(at time.Time) bool {
	homepageSnapshotMu.RLock()
	failedAt := homepageLastFailedAt
	homepageSnapshotMu.RUnlock()
	return !failedAt.IsZero() && at.Sub(failedAt) < homepageStatsFailureBackoff
}

// freshHomepageSnapshot returns the in-process snapshot when it
// exists and is younger than the cache TTL.
func freshHomepageSnapshot(now time.Time) ([]byte, bool) {
	payload, at := homepageSnapshotRead()
	if payload == nil || now.Sub(at) >= homepageStatsCacheTTL {
		return nil, false
	}
	return payload, true
}

// statAvailability is the per-aggregate health signal the homepage
// frontend consumes. The tile MUST distinguish "the value is 0
// because nothing happened" (ok) from "we cannot compute the value
// right now" (unavailable) so the marketing site never accidentally
// claims "0 successful requests" because the DB blipped.
type statAvailability string

const (
	availabilityOK          statAvailability = "ok"
	availabilityUnavailable statAvailability = "unavailable"
)

// HomepageStatsResponse is the wire shape returned to the public
// homepage — served bare, with NO success/data envelope, exactly as
// the frontend hook parses it. Every aggregate ships with its own
// availability flag so the frontend can tell "real 0" apart from
// "we could not compute this".
//
// Field names use snake_case to match the rest of the project's
// public API.
type HomepageStatsResponse struct {
	WindowDays     int        `json:"window_days"`
	Successful     StatTriple `json:"successful_requests"`
	ProcessedToken StatTriple `json:"processed_tokens"`
	ActiveVendors  StatTriple `json:"active_vendor_count"`
	AvailableModel StatTriple `json:"available_model_count"`
	AsOf           int64      `json:"as_of"`
}

// StatTriple is one homepage tile. Value is the number to render;
// Availability is "ok" when the underlying query succeeded (a real
// 0 stays 0/ok) and "unavailable" when it errored out — the
// frontend renders an em-dash in the latter case. Unknown or
// malformed availability values are treated as unavailable by the
// frontend parser.
type StatTriple struct {
	Value        int64            `json:"value"`
	Availability statAvailability `json:"availability"`
}

// GetHomepageStats serves the public homepage stats aggregate. The
// handler is unauthenticated by design — the numbers are public
// marketing metrics and never expose user, channel, key, or billing
// detail.
//
// Layer order:
//
//  1. Redis hit — serve verbatim, no DB touch.
//  2. Fresh in-process snapshot — covers Redis outages and
//     Redis-disabled deploys for the full cache TTL.
//  3. Refresh — one singleflight critical section performs the
//     cache re-check, the timed compute, and the publish; see
//     refreshHomepageStats.
//
// The endpoint never returns 5xx for backend failures; a wholly
// failed refresh with no prior snapshot serves an honest
// all-unavailable envelope so the homepage can always render.
func GetHomepageStats(c *gin.Context) {
	// 1. Redis hit.
	if common.RedisEnabled {
		if raw, err := common.RedisGet(homepageStatsCacheKey); err == nil && raw != "" {
			c.Header(homepageStatsCacheHeader, "hit")
			c.Data(http.StatusOK, homepageStatsContentType, []byte(raw))
			return
		}
	}

	// 2. Fresh in-process snapshot.
	if payload, ok := freshHomepageSnapshot(time.Now()); ok {
		c.Header(homepageStatsCacheHeader, "hit-memory")
		c.Data(http.StatusOK, homepageStatsContentType, payload)
		return
	}

	// 3. Refresh.
	payload, state := refreshHomepageStats(c.Request.Context())
	c.Header(homepageStatsCacheHeader, state)
	c.Data(http.StatusOK, homepageStatsContentType, payload)
}

// homepageRefreshResult is what one singleflight refresh produces.
type homepageRefreshResult struct {
	payload []byte
	state   string
}

// refreshHomepageStats is the single refresh flow: cache re-check,
// compute, publish. Everything happens inside one singleflight
// section so a thundering herd on a cold cache produces exactly one
// aggregate, and the first result — whichever layer produced it —
// is shared by every waiter.
func refreshHomepageStats(ctx context.Context) ([]byte, string) {
	v, err, _ := homepageStatsRefreshGroup.Do(homepageStatsCacheKey, func() (any, error) {
		now := time.Now()

		// Re-check Redis: another instance may have completed a
		// refresh between the handler's check and this section.
		if common.RedisEnabled {
			if raw, err := common.RedisGet(homepageStatsCacheKey); err == nil && raw != "" {
				homepageSnapshotWrite([]byte(raw), now)
				return homepageRefreshResult{payload: []byte(raw), state: "hit"}, nil
			}
		}

		// Re-check the in-process snapshot: a competing goroutine
		// in this process may have already computed.
		if payload, ok := freshHomepageSnapshot(now); ok {
			return homepageRefreshResult{payload: payload, state: "hit-memory"}, nil
		}

		stale, _ := homepageSnapshotRead()
		hasStale := stale != nil

		// Failure backoff: after an operational-stats refresh
		// failed, keep serving the last good snapshot (or the last
		// failed envelope if none exists) instead of re-scanning a
		// sick database on every request. The stale payload keeps
		// its original as_of, so the client sees the true age.
		if homepageInFailureBackoff(now) {
			if hasStale {
				return homepageRefreshResult{payload: stale, state: "miss-stale"}, nil
			}
			if failed := homepageFailedPayload(); failed != nil {
				return homepageRefreshResult{payload: failed, state: "miss"}, nil
			}
		}

		// Compute under a hard timeout. The refresh is shared
		// across callers, so detach it from the originating
		// request's cancellation: one client hanging up must not
		// kill the aggregate everyone else is waiting on.
		computeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), homepageStatsQueryTimeout)
		defer cancel()
		resp := computeHomepageStats(computeCtx)

		payload, err := common.Marshal(resp)
		if err != nil {
			logger.LogError(ctx, "homepage stats: marshal failed: "+err.Error())
			homepageMarkFailure(now, nil)
			if hasStale {
				return homepageRefreshResult{payload: stale, state: "miss-stale"}, nil
			}
			return homepageRefreshResult{payload: homepageUnavailableEnvelope(now), state: "miss"}, nil
		}

		// Publish only when BOTH operational aggregates succeeded.
		// Catalog counts are in-memory and almost always "ok", so
		// they must not promote a failed request/token refresh into
		// a five-minute success snapshot. A failed operational
		// refresh never overwrites the last good snapshot or Redis.
		if operationalStatsOK(resp) {
			homepageSnapshotWrite(payload, now)
			homepageClearFailure()
			if common.RedisEnabled {
				if err := common.RedisSet(homepageStatsCacheKey, string(payload), homepageStatsCacheTTL); err != nil {
					logger.LogError(ctx, "homepage stats: cache write failed: "+err.Error())
				}
			}
			return homepageRefreshResult{payload: payload, state: "miss"}, nil
		}

		homepageMarkFailure(now, payload)
		if hasStale {
			return homepageRefreshResult{payload: stale, state: "miss-stale"}, nil
		}
		return homepageRefreshResult{payload: payload, state: "miss"}, nil
	})
	if err != nil {
		// The refresh function never returns an error; defend the
		// singleflight contract anyway.
		return homepageUnavailableEnvelope(time.Now()), "miss"
	}
	res := v.(homepageRefreshResult)
	return res.payload, res.state
}

// homepageUnavailableEnvelope marshals a structurally valid
// all-unavailable response. It is the absolute fallback when nothing
// better exists: the homepage renders em-dashes instead of fake
// numbers.
func homepageUnavailableEnvelope(now time.Time) []byte {
	payload, err := common.Marshal(HomepageStatsResponse{
		WindowDays:     homepageStatsWindowDays,
		Successful:     StatTriple{Availability: availabilityUnavailable},
		ProcessedToken: StatTriple{Availability: availabilityUnavailable},
		ActiveVendors:  StatTriple{Availability: availabilityUnavailable},
		AvailableModel: StatTriple{Availability: availabilityUnavailable},
		AsOf:           now.Unix(),
	})
	if err != nil {
		// Marshaling a fixed struct cannot fail; fall back to the
		// minimal literal rather than returning nothing.
		return []byte(`{"window_days":30,"as_of":0}`)
	}
	return payload
}

// operationalStatsOK reports whether the two database-backed
// marketing tiles both computed successfully. Catalog counts are
// deliberately excluded: they come from the in-memory pricing list
// and stay "ok" even when the logs table is down, so they must not
// decide that a refresh is safe to publish as the five-minute
// snapshot.
func operationalStatsOK(r HomepageStatsResponse) bool {
	return r.Successful.Availability == availabilityOK &&
		r.ProcessedToken.Availability == availabilityOK
}

// computeHomepageStats runs the four aggregates that back the
// homepage stats tile. Each aggregate is independently fault-tolerant:
// a query failure is logged and downgraded to (0, unavailable); a
// normal empty result stays (0, ok). The ctx deadline applies to the
// database-backed aggregates.
func computeHomepageStats(ctx context.Context) HomepageStatsResponse {
	now := time.Now()
	// Rolling 30-day window ending at "now", inclusive on both
	// edges of the query.
	endTs := now.Unix()
	startTs := now.AddDate(0, 0, -homepageStatsWindowDays).Unix()

	resp := HomepageStatsResponse{
		WindowDays: homepageStatsWindowDays,
		AsOf:       endTs,
	}

	// 1. Distinct successful requests — see
	// model.CountDistinctSuccessfulRequestIds for the exact
	// inclusion/exclusion rules and the coverage boundary.
	if n, err := model.CountDistinctSuccessfulRequestIds(ctx, startTs, endTs); err != nil {
		logger.LogError(ctx, "homepage stats: distinct successful requests failed: "+err.Error())
		resp.Successful = StatTriple{Availability: availabilityUnavailable}
	} else {
		resp.Successful = StatTriple{Value: n, Availability: availabilityOK}
	}

	// 2. Processed tokens. SumConsumeTokens returns (0, nil) for
	// an empty window; any error — including a corrupt negative
	// sum — becomes unavailable.
	if tokens, err := model.SumConsumeTokens(ctx, startTs, endTs); err != nil {
		logger.LogError(ctx, "homepage stats: token sum failed: "+err.Error())
		resp.ProcessedToken = StatTriple{Availability: availabilityUnavailable}
	} else {
		resp.ProcessedToken = StatTriple{Value: tokens, Availability: availabilityOK}
	}

	// 3 + 4. Catalog counts. Both numbers come from ONE walk over
	// the same anonymous public-available model set the public
	// /api/pricing endpoint serves: the full pricing list filtered
	// by the anonymous usable groups. Models that are only enabled
	// for private groups never reach either count. An empty catalog
	// is a real 0, not an error.
	usableGroups := service.GetUserUsableGroups("")
	publicCatalog := filterPricingByUsableGroups(model.GetPricing(), usableGroups)
	counts := model.CountActiveVendorsAndModels(publicCatalog)
	resp.ActiveVendors = StatTriple{Value: int64(counts.VendorCount), Availability: availabilityOK}
	resp.AvailableModel = StatTriple{Value: int64(counts.ModelCount), Availability: availabilityOK}

	return resp
}
