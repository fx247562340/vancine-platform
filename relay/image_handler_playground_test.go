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
package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUseImagePassThroughSkipsPlaygroundEvenWhenEnabled(t *testing.T) {
	original := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	model_setting.GetGlobalSettings().PassThroughRequestEnabled = true
	t.Cleanup(func() {
		model_setting.GetGlobalSettings().PassThroughRequestEnabled = original
	})

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	info.ChannelSetting.PassThroughBodyEnabled = true

	gin.SetMode(gin.TestMode)
	playground := httptest.NewRequest(http.MethodPost, "/pg/images/generations", nil)
	pgCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	pgCtx.Request = playground
	assert.False(t, useImagePassThrough(pgCtx, info))

	public := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	v1Ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	v1Ctx.Request = public
	assert.True(t, useImagePassThrough(v1Ctx, info))
}

func TestUseImagePassThroughKeepsV1DisabledByDefault(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	gin.SetMode(gin.TestMode)
	public := httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = public
	require.False(t, useImagePassThrough(ctx, info))
}
