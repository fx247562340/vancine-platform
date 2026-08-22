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

func setupPlaygroundImageBillingDB(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := model.DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = originalDB
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
	return db
}

func TestPlaygroundImageInvalidRequestDoesNotCallUpstream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","image":"data:image/png;base64,%%%"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
	common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)

	PlaygroundImage(ctx)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Equal(t, int32(0), hits.Load())
}

func TestPlaygroundImageParametersBypassRejectedBeforeBilling(t *testing.T) {
	db := setupPlaygroundImageBillingDB(t)
	user := model.User{
		Username: "pg-image-bypass",
		Password: "password123",
		Quota:    1000,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	gin.SetMode(gin.TestMode)
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	for _, body := range []string{
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","parameters":{"n":9,"size":"512x512"}}`,
		`{"model":"qwen-image-2.0-pro","prompt":"a red apple","input":{"prompt":"hijack"}}`,
	} {
		hits.Store(0)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
		common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)
		common.SetContextKey(ctx, constant.ContextKeyUserId, user.Id)

		PlaygroundImage(ctx)

		require.Equal(t, http.StatusBadRequest, recorder.Code, body)
		assert.Equal(t, int32(0), hits.Load(), body)
		var reloaded model.User
		require.NoError(t, db.First(&reloaded, user.Id).Error)
		assert.Equal(t, 1000, reloaded.Quota, body)
	}
}

func TestPlaygroundImageRejectsNonHTTPReferenceURLBeforeBilling(t *testing.T) {
	db := setupPlaygroundImageBillingDB(t)
	user := model.User{
		Username: "pg-image-url",
		Password: "password123",
		Quota:    1000,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	gin.SetMode(gin.TestMode)
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	for _, rawURL := range []string{
		"file:///tmp/x.png",
		"javascript:alert(1)",
		"/relative.png",
		"not-a-url",
	} {
		hits.Store(0)
		body := fmt.Sprintf(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","image":%q}`, rawURL)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
		common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)
		common.SetContextKey(ctx, constant.ContextKeyUserId, user.Id)

		PlaygroundImage(ctx)

		require.Equal(t, http.StatusBadRequest, recorder.Code, rawURL)
		assert.Equal(t, int32(0), hits.Load(), rawURL)
		var reloaded model.User
		require.NoError(t, db.First(&reloaded, user.Id).Error)
		assert.Equal(t, 1000, reloaded.Quota, rawURL)
	}
}

func TestPlaygroundImageRejectsLooseCustomSizeBeforeBilling(t *testing.T) {
	db := setupPlaygroundImageBillingDB(t)
	user := model.User{
		Username: "pg-image-size",
		Password: "password123",
		Quota:    1000,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	gin.SetMode(gin.TestMode)
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	for _, size := range []string{"1024abcx1024", "1024x1024abc"} {
		hits.Store(0)
		body := fmt.Sprintf(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","size":%q}`, size)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
		common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)
		common.SetContextKey(ctx, constant.ContextKeyUserId, user.Id)

		PlaygroundImage(ctx)

		require.Equal(t, http.StatusBadRequest, recorder.Code, size)
		assert.Equal(t, int32(0), hits.Load(), size)
		var reloaded model.User
		require.NoError(t, db.First(&reloaded, user.Id).Error)
		assert.Equal(t, 1000, reloaded.Quota, size)
	}
}

// A huge uint n (including JSON values that wrap a negative int) must be
// rejected in uint space before billing and upstream, with the user's quota
// untouched.
func TestPlaygroundImageRejectsHugeUintNBeforeBilling(t *testing.T) {
	db := setupPlaygroundImageBillingDB(t)
	user := model.User{
		Username: "pg-image-huge-n",
		Password: "password123",
		Quota:    1000,
		Group:    "default",
	}
	require.NoError(t, db.Create(&user).Error)

	gin.SetMode(gin.TestMode)
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		hits.Add(1)
	}))
	defer upstream.Close()

	for _, rawN := range []string{"18446744073709551615", "18446744073686646784", "4294967296"} {
		hits.Store(0)
		body := fmt.Sprintf(`{"model":"qwen-image-3.0","prompt":"a red apple","n":%s}`, rawN)
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", "application/json")
		common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)
		common.SetContextKey(ctx, constant.ContextKeyChannelBaseUrl, upstream.URL)
		common.SetContextKey(ctx, constant.ContextKeyUserId, user.Id)

		PlaygroundImage(ctx)

		require.Equal(t, http.StatusBadRequest, recorder.Code, rawN)
		assert.Equal(t, int32(0), hits.Load(), rawN)
		var reloaded model.User
		require.NoError(t, db.First(&reloaded, user.Id).Error)
		assert.Equal(t, 1000, reloaded.Quota, rawN)
	}
}
