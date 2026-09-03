package model

import (
	"context"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
)

const userCacheSchemaVersion = 2

type UserBase struct {
	Id          int    `json:"id"`
	Group       string `json:"group"`
	Email       string `json:"email"`
	Quota       int    `json:"quota"`
	Status      int    `json:"status"`
	Role        int    `json:"role"`
	Username    string `json:"username"`
	Setting     string `json:"setting"`
	AuthVersion int64  `json:"-"`
	CacheSchema int    `json:"-"`
}

func (user *UserBase) WriteContext(c *gin.Context) {
	common.SetContextKey(c, constant.ContextKeyUserGroup, user.Group)
	common.SetContextKey(c, constant.ContextKeyUserQuota, user.Quota)
	common.SetContextKey(c, constant.ContextKeyUserStatus, user.Status)
	common.SetContextKey(c, constant.ContextKeyUserEmail, user.Email)
	common.SetContextKey(c, constant.ContextKeyUserName, user.Username)
	common.SetContextKey(c, constant.ContextKeyUserSetting, user.GetSetting())
}

func (user *UserBase) GetSetting() dto.UserSetting {
	setting := dto.UserSetting{}
	if user.Setting != "" {
		err := common.Unmarshal([]byte(user.Setting), &setting)
		if err != nil {
			common.SysLog("failed to unmarshal setting: " + err.Error())
		}
	}
	return setting
}

// getUserCacheKey returns the key for user cache
func getUserCacheKey(userId int) string {
	return fmt.Sprintf("user:%d", userId)
}

func userCacheTTLSeconds() int {
	ttl := common.RedisKeyCacheSeconds()
	if ttl <= 0 {
		return 60
	}
	return ttl
}

// invalidateUserCache clears user cache
func invalidateUserCache(userId int) error {
	if !common.RedisEnabled {
		return nil
	}
	return common.RedisDelKey(getUserCacheKey(userId))
}

// InvalidateUserCache is the exported version of invalidateUserCache.
// 供 controller 等上层包在用户状态变更（如禁用、删除、角色变更）后主动清理缓存。
func InvalidateUserCache(userId int) error {
	return invalidateUserCache(userId)
}

func populateUserCache(user User) error {
	if !common.RedisEnabled {
		return nil
	}
	return writeUserCache(user.ToBaseUser(), true)
}

// updateUserCache refreshes non-quota user cache fields.
// Quota is maintained by atomic quota delta paths and must not be overwritten
// by stale user snapshots from profile/settings updates.
func updateUserCache(user User) error {
	if !common.RedisEnabled {
		return nil
	}
	return writeUserCache(user.ToBaseUser(), false)
}

// GetUserCache gets complete user cache from hash
func GetUserCache(userId int) (*UserBase, error) {
	// Try getting from Redis first
	userCache, err := cacheGetUserBase(userId)
	if err == nil {
		return userCache, nil
	}

	// Redis misses and read failures both fall back to the shared database. A
	// version fence newer than the database is the one exception: allowing that
	// snapshot would re-authorize a user while a restrictive update is pending.
	user, err := GetUserById(userId, false)
	if err != nil {
		return nil, err
	}
	if common.RedisEnabled {
		floor, floorErr := getUserAuthVersionFloor(userId)
		if floorErr == nil && floor > user.AuthVersion {
			return nil, ErrUserAuthCachePending
		}
		if err := populateUserCache(*user); err != nil {
			if errors.Is(err, ErrUserAuthCachePending) {
				return nil, err
			}
			common.SysLog("failed to synchronously populate user cache: " + err.Error())
		}
	}
	return user.ToBaseUser(), nil
}

func cacheGetUserBase(userId int) (*UserBase, error) {
	if !common.RedisEnabled {
		return nil, fmt.Errorf("redis is not enabled")
	}
	var userCache UserBase
	// Try getting from Redis first
	err := common.RedisHGetObj(getUserCacheKey(userId), &userCache)
	if err != nil {
		return nil, err
	}
	if userCache.Id != userId || userCache.CacheSchema != userCacheSchemaVersion || userCache.AuthVersion <= 0 {
		return nil, fmt.Errorf("user cache schema is stale")
	}
	floor, err := getUserAuthVersionFloor(userId)
	if err != nil {
		return nil, err
	}
	if floor > userCache.AuthVersion {
		return nil, ErrUserAuthCachePending
	}
	return &userCache, nil
}

// Add atomic quota operations using hash fields
func cacheIncrUserQuota(userId int, delta int64) error {
	if !common.RedisEnabled {
		return nil
	}
	return common.RedisHIncrBy(getUserCacheKey(userId), "Quota", delta)
}

func cacheDecrUserQuota(userId int, delta int64) error {
	return cacheIncrUserQuota(userId, -delta)
}

// applyUserQuotaHashDelta applies delta to the user quota hash, with safe
// failure semantics. This is the single entry point used by every real
// topup / refund / PayPal settlement / future quota delta. It encodes the
// production contract:
//
//   - HINCRBY on the Quota field is the fast path: it is atomic, supports
//     negative deltas (refunds going to negative balances), and keeps the
//     cache hash in lock-step with whatever the database has agreed to
//     this call.
//   - When the batch update pipeline is enabled, the consumption hot path
//     also writes its deltas to the cache hash as HINCRBY. A pending
//     batch therefore lives in the cache until the batch flush lands in
//     the database; rebuilding the cache from the database on a HINCRBY
//     failure would clobber those pending values. In that mode the
//     fail-closed policy is: if the cache row exists, set the Quota field
//     to common.MinQuota (a sentinel value the consuming code path
//     recognises as "do not consume"), preserving the existing TTL. The
//     user can no longer consume from the cache until an operator or a
//     GetUserCache miss refreshes the row from the database. The cache
//     row is never deleted.
//   - When the batch update pipeline is disabled, the cache hash mirrors
//     the database directly, and a HINCRBY failure means the hash is no
//     longer trustworthy. The original fail-open policy applies: invalidate
//     the cache so the next GetUserCache rebuilds from the database.
//
// This function never deletes the user hash on the batch-update code path,
// even when both the HINCRBY and the fail-closed write fail: a HINCRBY
// failure is logged at the same level as any other accounting hiccup
// (a SysLog entry the operator can grep), but the cache is left alone so
// concurrent consumption does not race against an unexpected rebuild.
func applyUserQuotaHashDelta(userId int, delta int64) {
	if !common.RedisEnabled {
		return
	}
	// Fast path: HINCRBY the Quota field directly. Atomic; supports
	// negative deltas; preserves the existing TTL.
	hinErr := cacheIncrUserQuota(userId, delta)
	if hinErr == nil {
		return
	}
	if !common.BatchUpdateEnabled {
		// Without batch updates the cache mirrors the database; a HINCRBY
		// failure means the hash is no longer trustworthy. Invalidate so
		// the next read rebuilds from the database row.
		common.SysLog(fmt.Sprintf("failed to apply user quota hash delta (HINCRBY): user=%d delta=%d err=%v; falling back to cache invalidation", userId, delta, hinErr))
		if invalidateErr := InvalidateUserCache(userId); invalidateErr != nil {
			common.SysLog("failed to invalidate user quota cache after HINCRBY failure: " + invalidateErr.Error())
		}
		return
	}
	// Batch-update mode: the cache hash may already carry a pending
	// batch delta. Deleting the cache would clobber those pending values
	// and let a subsequent GetUserCache rebuild over-write the user's
	// consumed-but-not-flushed quota back from the database. The
	// fail-closed policy pins the Quota field to MinQuota, which the
	// consuming code path treats as "do not consume", so the user
	// cannot spend from a degraded cache while an operator or the next
	// GetUserCache miss recovers the row from the database.
	//
	// The "cache exists" probe uses Redis EXISTS, not GetUserCache, so
	// the fail-closed path still works when the Quota field is in a
	// state that breaks field-level deserialisation (e.g. an operator
	// wrote a non-integer manually): we only need the key to be there
	// for the HSET pin to land.
	exists, existsErr := common.RDB.Exists(context.Background(), getUserCacheKey(userId)).Result()
	if existsErr != nil || exists == 0 {
		// The cache row does not exist (or we cannot reach Redis to
		// check). There is nothing to fail-closed against; the next
		// GetUserCache miss will rebuild from the database. Log at
		// high priority so an operator notices, and do nothing else.
		common.SysLog(fmt.Sprintf("user quota hash delta failed (HINCRBY) and cache row is unavailable: user=%d delta=%d err=%v; no cache row to pin", userId, delta, hinErr))
		return
	}
	if setErr := updateUserQuotaCache(userId, common.MinQuota); setErr != nil {
		// Even the fail-closed write failed. Log high and do NOT
		// delete the cache: deleting it would let a rebuild race
		// against concurrent consumption and could let the user
		// re-spend quota that the database has not yet seen.
		common.SysLog(fmt.Sprintf("user quota hash fail-closed pin failed: user=%d delta=%d original_err=%v pin_err=%v; cache left untouched", userId, delta, hinErr, setErr))
		return
	}
	common.SysLog(fmt.Sprintf("user quota hash delta failed (HINCRBY) and cache row was pinned to MinQuota: user=%d delta=%d err=%v", userId, delta, hinErr))
}

// Helper functions to get individual fields if needed
func getUserGroupCache(userId int) (string, error) {
	cache, err := GetUserCache(userId)
	if err != nil {
		return "", err
	}
	return cache.Group, nil
}

func getUserQuotaCache(userId int) (int, error) {
	cache, err := GetUserCache(userId)
	if err != nil {
		return 0, err
	}
	return cache.Quota, nil
}

func getUserStatusCache(userId int) (int, error) {
	cache, err := GetUserCache(userId)
	if err != nil {
		return 0, err
	}
	return cache.Status, nil
}

func getUserNameCache(userId int) (string, error) {
	cache, err := GetUserCache(userId)
	if err != nil {
		return "", err
	}
	return cache.Username, nil
}

func getUserSettingCache(userId int) (dto.UserSetting, error) {
	cache, err := GetUserCache(userId)
	if err != nil {
		return dto.UserSetting{}, err
	}
	return cache.GetSetting(), nil
}

// New functions for individual field updates
func updateUserStatusCache(userId int, status bool) error {
	statusInt := common.UserStatusEnabled
	if !status {
		statusInt = common.UserStatusDisabled
	}
	return updateUserCacheField(userId, "Status", statusInt)
}

func updateUserQuotaCache(userId int, quota int) error {
	if !common.RedisEnabled {
		return nil
	}
	return common.RedisHSetField(getUserCacheKey(userId), "Quota", fmt.Sprintf("%d", quota))
}

// RefreshUserGroupCache writes the database-authoritative group into an
// existing user hash without changing the user's authentication version.
func RefreshUserGroupCache(userId int) error {
	if !common.RedisEnabled {
		return nil
	}
	if userId <= 0 {
		return fmt.Errorf("invalid user id")
	}
	var authoritative User
	if err := DB.Select("id", "auth_version", commonGroupCol).Where("id = ?", userId).First(&authoritative).Error; err != nil {
		return err
	}
	// Group transitions intentionally keep the same authentication version. A
	// refresh that read the previous group can therefore arrive after a newer
	// refresh and still pass the auth-version fence. Re-read after every write
	// and repair the cache when the authoritative group changed in between.
	for range 3 {
		if err := updateUserCacheFieldAtVersion(userId, "Group", authoritative.Group, authoritative.AuthVersion); err != nil {
			return err
		}

		var verified User
		if err := DB.Select("id", "auth_version", commonGroupCol).Where("id = ?", userId).First(&verified).Error; err != nil {
			return err
		}
		if verified.AuthVersion == authoritative.AuthVersion && verified.Group == authoritative.Group {
			return nil
		}
		authoritative = verified
	}

	// Preserve the freshest snapshot observed even when the row was too busy to
	// stabilize within the bounded retries. Returning an error lets best-effort
	// callers emit an operation-specific warning.
	if err := updateUserCacheFieldAtVersion(userId, "Group", authoritative.Group, authoritative.AuthVersion); err != nil {
		return err
	}
	return fmt.Errorf("user group changed repeatedly during cache refresh")
}

func updateUserEmailCache(userId int, email string) error {
	return updateUserCacheField(userId, "Email", email)
}

func updateUserNameCache(userId int, username string) error {
	return updateUserCacheField(userId, "Username", username)
}

func updateUserSettingCache(userId int, setting string) error {
	return updateUserCacheField(userId, "Setting", setting)
}

// updateUserCacheField prevents individual cache refreshes from bypassing the
// auth-version fence. It intentionally does nothing when the complete hash is
// absent; the next GetUserCache call will repopulate it from the database.
func updateUserCacheField(userId int, field string, value interface{}) error {
	if !common.RedisEnabled {
		return nil
	}
	var user User
	if err := DB.Select("id", "auth_version").Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	if user.AuthVersion <= 0 {
		return fmt.Errorf("invalid user auth version")
	}
	return updateUserCacheFieldAtVersion(userId, field, value, user.AuthVersion)
}

// GetUserLanguage returns the user's language preference from cache
// Uses the existing GetUserCache mechanism for efficiency
func GetUserLanguage(userId int) string {
	userCache, err := GetUserCache(userId)
	if err != nil {
		return ""
	}
	return userCache.GetSetting().Language
}
