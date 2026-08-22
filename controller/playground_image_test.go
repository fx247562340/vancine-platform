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
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlaygroundImageRejectsUnknownFieldsBeforeRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","quality":"hd"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)

	PlaygroundImage(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "quality")
}

func TestPlaygroundImageRejectsInvalidParamsBeforeRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","n":99}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)

	PlaygroundImage(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "n must be between")
}

func TestPlaygroundImageRejectsChannelMismatchBeforeRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(`{"model":"qwen-image-2.0-pro","prompt":"a red apple"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)

	PlaygroundImage(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "not eligible")
}

func TestPlaygroundImageRejectsInvalidBase64BeforeRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(`{"model":"qwen-image-2.0-pro","prompt":"a red apple","image":"data:image/png;base64,%%%"}`))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)

	PlaygroundImage(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "invalid base64")
}

func TestPlaygroundCapabilitiesRejectsNonImageModality(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/pg/capabilities?modality=video", nil)

	PlaygroundCapabilities(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "unsupported modality")
}

func TestPlaygroundImageClosesOriginalBodyStorageAfterReplace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	before := common.GetDiskCacheStats()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := `{"model":"qwen-image-2.0-pro","prompt":"a red apple","group":"default"}`
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)

	PlaygroundImage(ctx)

	storage, ok := ctx.Get(common.KeyBodyStorage)
	require.True(t, ok)
	bs, ok := storage.(common.BodyStorage)
	require.True(t, ok)
	require.NotNil(t, bs)
	replaced, err := bs.Bytes()
	require.NoError(t, err)
	assert.NotContains(t, string(replaced), `"group"`)

	afterReplace := common.GetDiskCacheStats()
	assert.Equal(t, before.ActiveMemoryBuffers+1, afterReplace.ActiveMemoryBuffers)

	common.CleanupBodyStorage(ctx)
	afterCleanup := common.GetDiskCacheStats()
	assert.Equal(t, before.ActiveMemoryBuffers, afterCleanup.ActiveMemoryBuffers)
	assert.Equal(t, before.CurrentMemoryUsageBytes, afterCleanup.CurrentMemoryUsageBytes)
}

func TestPlaygroundImageClosesOriginalDiskBodyStorageAfterReplace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	original := common.GetDiskCacheConfig()
	dir := t.TempDir()
	common.SetDiskCacheConfig(common.DiskCacheConfig{
		Enabled:     true,
		ThresholdMB: 0,
		MaxSizeMB:   1024,
		Path:        dir,
	})
	t.Cleanup(func() {
		common.SetDiskCacheConfig(original)
	})

	before := common.GetDiskCacheStats()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := `{"model":"qwen-image-2.0-pro","prompt":"a red apple","group":"default"}`
	ctx.Request = httptest.NewRequest(http.MethodPost, "/pg/images/generations", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	common.SetContextKey(ctx, constant.ContextKeyChannelType, constant.ChannelTypeAli)

	PlaygroundImage(ctx)

	afterReplace := common.GetDiskCacheStats()
	assert.Equal(t, before.ActiveDiskFiles+1, afterReplace.ActiveDiskFiles)

	common.CleanupBodyStorage(ctx)
	afterCleanup := common.GetDiskCacheStats()
	assert.Equal(t, before.ActiveDiskFiles, afterCleanup.ActiveDiskFiles)

	entries, err := os.ReadDir(filepath.Join(dir, "vancine-body-cache"))
	if err != nil && !os.IsNotExist(err) {
		require.NoError(t, err)
	}
	assert.Empty(t, entries)
}

func TestImageRequestMarshalsExplicitZeroAndFalse(t *testing.T) {
	t.Helper()
	watermark := false
	seed := 0
	promptExtend := false
	n := uint(1)
	payload := map[string]any{
		"model":         "seedream-4-0-250828",
		"prompt":        "a red apple",
		"n":             n,
		"watermark":     watermark,
		"seed":          seed,
		"prompt_extend": promptExtend,
	}
	data, err := common.Marshal(payload)
	require.NoError(t, err)
	assert.Contains(t, string(data), `"watermark":false`)
	assert.Contains(t, string(data), `"seed":0`)
	assert.Contains(t, string(data), `"prompt_extend":false`)
}
