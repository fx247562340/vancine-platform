package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/acquisition"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

func TelegramBind(c *gin.Context) {
	if !common.TelegramOAuthEnabled {
		c.JSON(200, gin.H{
			"message": "管理员未开启通过 Telegram 登录以及注册",
			"success": false,
		})
		return
	}
	params := c.Request.URL.Query()
	if !checkTelegramAuthorization(params, common.TelegramBotToken) {
		c.JSON(200, gin.H{
			"message": "无效的请求",
			"success": false,
		})
		return
	}
	telegramId := params["id"][0]
	if model.IsTelegramIdAlreadyTaken(telegramId) {
		c.JSON(200, gin.H{
			"message": "该 Telegram 账户已被绑定",
			"success": false,
		})
		return
	}

	session := sessions.Default(c)
	id := session.Get("id")
	user := model.User{Id: id.(int)}
	if err := user.FillUserById(); err != nil {
		c.JSON(200, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}
	if user.Id == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户已注销",
		})
		return
	}
	user.TelegramId = telegramId
	if err := user.Update(false); err != nil {
		c.JSON(200, gin.H{
			"message": err.Error(),
			"success": false,
		})
		return
	}

	c.Redirect(302, common.ThemeAwarePath("/console/personal"))
}

func TelegramLogin(c *gin.Context) {
	if !common.TelegramOAuthEnabled {
		c.JSON(200, gin.H{
			"message": "管理员未开启通过 Telegram 登录以及注册",
			"success": false,
		})
		return
	}
	params := c.Request.URL.Query()
	if !checkTelegramAuthorization(params, common.TelegramBotToken) {
		c.JSON(200, gin.H{
			"message": "无效的请求",
			"success": false,
		})
		return
	}

	telegramId := params["id"][0]
	user := model.User{
		TelegramId: telegramId,
	}

	// Only an active (non-deleted) user counts as "taken". A soft-deleted
	// user's telegram_id must be re-registrable: the previous unscoped "taken"
	// check plus scoped fill returned "该 Telegram 账户未绑定" and locked the
	// account out of both login and re-registration.
	if model.IsTelegramIdTakenByActiveUser(telegramId) {
		if err := user.FillUserByTelegramId(); err != nil {
			c.JSON(200, gin.H{
				"message": err.Error(),
				"success": false,
			})
			return
		}
		if user.Id == 0 {
			c.JSON(200, gin.H{
				"success": false,
				"message": "用户已注销",
			})
			return
		}
	} else {
		if !common.RegisterEnabled {
			c.JSON(200, gin.H{
				"success": false,
				"message": "管理员关闭了新用户注册",
			})
			return
		}

		// Clear any soft-deleted residue so the new active user becomes the sole
		// holder of this telegram_id (avoids stale bindings / future confusion).
		if err := model.ClearTelegramIdFromDeletedUsers(telegramId); err != nil {
			c.JSON(200, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}

		user.Username = "telegram_" + strconv.Itoa(model.GetMaxUserId()+1)
		user.DisplayName = telegramDisplayName(params)
		user.Role = common.RoleCommonUser
		user.Status = common.UserStatusEnabled

		session := sessions.Default(c)
		inviterId := 0
		if affCode := session.Get("aff"); affCode != nil {
			if code, ok := affCode.(string); ok && code != "" {
				inviterId, _ = model.GetUserIdByAffCode(code)
			}
		}

		if err := user.Insert(inviterId); err != nil {
			c.JSON(200, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		// Default token for the new user (mirrors password register); abort
		// before binding/login on failure to avoid a half-provisioned account.
		if err := ensureDefaultTokenForNewUser(&user); err != nil {
			c.JSON(200, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		// New user only — bind first-touch attribution (soft-fail).
		acquisition.BindTouchToUser(c, user.Id)
	}

	if user.Status != common.UserStatusEnabled {
		c.JSON(200, gin.H{
			"message": "用户已被封禁",
			"success": false,
		})
		return
	}
	setupLogin(&user, c)
}

// telegramDisplayName builds a human-readable display name from Telegram widget
// query params, preferring first+last name, then username, then a generic label.
func telegramDisplayName(params map[string][]string) string {
	first := firstQueryValue(params, "first_name")
	last := firstQueryValue(params, "last_name")
	name := strings.TrimSpace(strings.TrimSpace(first) + " " + strings.TrimSpace(last))
	if name != "" {
		return name
	}
	if username := firstQueryValue(params, "username"); username != "" {
		return username
	}
	return "Telegram User"
}

func firstQueryValue(params map[string][]string, key string) string {
	if values, ok := params[key]; ok && len(values) > 0 {
		return values[0]
	}
	return ""
}

func checkTelegramAuthorization(params map[string][]string, token string) bool {
	strs := []string{}
	var hash = ""
	for k, v := range params {
		if k == "hash" {
			hash = v[0]
			continue
		}
		strs = append(strs, k+"="+v[0])
	}
	sort.Strings(strs)
	var imploded = ""
	for _, s := range strs {
		if imploded != "" {
			imploded += "\n"
		}
		imploded += s
	}
	sha256hash := sha256.New()
	io.WriteString(sha256hash, token)
	hmachash := hmac.New(sha256.New, sha256hash.Sum(nil))
	io.WriteString(hmachash, imploded)
	ss := hex.EncodeToString(hmachash.Sum(nil))
	return hash == ss
}
