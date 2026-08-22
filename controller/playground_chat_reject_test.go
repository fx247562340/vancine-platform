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
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// setupPlaygroundChatRejectDB spins up a fresh in-memory DB with Redis
// disabled so Playground can fall through to GetUserById. We register a
// single user and return its id.
func setupPlaygroundChatRejectDB(t *testing.T) (db *gorm.DB, userID int) {
	t.Helper()
	originalDB := model.DB
	originalRedis := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = originalDB
		common.RedisEnabled = originalRedis
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	user := model.User{
		Username: "playground-chat-reject",
		Password: "password123",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(&user).Error)
	return db, user.Id
}

// TestPlaygroundChatRejectsNonChatModelsBeforeRelay is the production
// guarantee that the Chat playground refuses every media-only model with
// 400 and never reaches the Relay chain, the billing path, or the
// upstream. The test wires a would-be upstream and verifies it is never
// touched for any of the registered media families.
func TestPlaygroundChatRejectsNonChatModelsBeforeRelay(t *testing.T) {
	_, userID := setupPlaygroundChatRejectDB(t)
	gin.SetMode(gin.TestMode)

	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	models := []string{
		// Image
		"Doubao-Seedream-5.0-lite",
		"Doubao-Seedream-5.0-pro",
		"qwen-image-2.0",
		"qwen-image-2.0-pro",
		"qwen-image-3.0",
		"qwen-image-3.0-pro",
		"wan2.7-image-pro",
		// Video
		"Doubao-Seedance-1.5-pro",
		"Doubao-Seedance-2.0",
		// TTS
		"Doubao-tts",
		"Doubao-tts2.0",
		"mimo-v2.5-tts",
		// 3D
		"Doubao-Seed3D-2.0",
		"Hitem3D-2.0",
		"Hyper3D-Gen2",
	}

	for _, modelName := range models {
		hits.Store(0)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		body := fmt.Sprintf(`{"model":%q,"messages":[{"role":"user","content":"hi"}]}`, modelName)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		ctx.Set("id", userID)
		common.SetContextKey(ctx, constant.ContextKeyOriginalModel, modelName)
		common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)

		Playground(ctx)

		require.Equalf(t, http.StatusBadRequest, recorder.Code, "model=%s body=%s", modelName, recorder.Body.String())
		assert.Equalf(t, int32(0), hits.Load(), "model=%s leaked to upstream", modelName)
		assert.Containsf(t, recorder.Body.String(), "not supported on the chat playground", "model=%s", modelName)
	}
}
