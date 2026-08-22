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
package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupImageEligibilityDB(t *testing.T) *gorm.DB {
	t.Helper()
	originalDB := DB
	originalCache := common.MemoryCacheEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	DB = db
	t.Cleanup(func() {
		DB = originalDB
		common.MemoryCacheEnabled = originalCache
		if originalCache && originalDB != nil &&
			originalDB.Migrator().HasTable(&Channel{}) && originalDB.Migrator().HasTable(&Ability{}) {
			InitChannelCache()
		}
		sqlDB, err := db.DB()
		if err == nil {
			require.NoError(t, sqlDB.Close())
		}
	})
	return db
}

func createImageEligibilityChannel(t *testing.T, db *gorm.DB, id, channelType int, priority int64, modelName string) {
	t.Helper()
	weight := uint(100)
	require.NoError(t, db.Create(&Channel{
		Id:       id,
		Type:     channelType,
		Key:      fmt.Sprintf("key-%d", id),
		Status:   common.ChannelStatusEnabled,
		Name:     fmt.Sprintf("channel-%d", id),
		Weight:   &weight,
		Models:   modelName,
		Group:    "default",
		Priority: &priority,
	}).Error)
	require.NoError(t, db.Create(&Ability{
		Group:     "default",
		Model:     modelName,
		ChannelId: id,
		Enabled:   true,
		Priority:  &priority,
		Weight:    weight,
	}).Error)
}

func TestGetChannelDoesNotLetIneligibleHighPriorityShadowEligibleOnPlayground(t *testing.T) {
	db := setupImageEligibilityDB(t)
	createImageEligibilityChannel(t, db, 1, constant.ChannelTypeOpenAI, 100, "qwen-image-2.0-pro")
	createImageEligibilityChannel(t, db, 2, constant.ChannelTypeAli, 1, "qwen-image-2.0-pro")

	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache_%v", cacheEnabled), func(t *testing.T) {
			common.MemoryCacheEnabled = cacheEnabled
			if cacheEnabled {
				InitChannelCache()
			}
			channel, err := GetRandomSatisfiedChannel("default", "qwen-image-2.0-pro", 0, "/pg/images/generations")
			require.NoError(t, err)
			require.NotNil(t, channel)
			assert.Equal(t, 2, channel.Id)
			assert.Equal(t, constant.ChannelTypeAli, channel.Type)
		})
	}
}

func TestGetChannelDoesNotApplyImageEligibilityOnV1(t *testing.T) {
	db := setupImageEligibilityDB(t)
	createImageEligibilityChannel(t, db, 1, constant.ChannelTypeOpenAI, 100, "qwen-image-2.0-pro")
	createImageEligibilityChannel(t, db, 2, constant.ChannelTypeAli, 1, "qwen-image-2.0-pro")

	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache_%v", cacheEnabled), func(t *testing.T) {
			common.MemoryCacheEnabled = cacheEnabled
			if cacheEnabled {
				InitChannelCache()
			}
			channel, err := GetRandomSatisfiedChannel("default", "qwen-image-2.0-pro", 0, "/v1/images/generations")
			require.NoError(t, err)
			require.NotNil(t, channel)
			assert.Equal(t, 1, channel.Id)
			assert.Equal(t, constant.ChannelTypeOpenAI, channel.Type)
		})
	}
}

func TestGetChannelRetryUsesEligiblePrioritiesOnPlayground(t *testing.T) {
	db := setupImageEligibilityDB(t)
	createImageEligibilityChannel(t, db, 1, constant.ChannelTypeOpenAI, 100, "qwen-image-2.0-pro")
	createImageEligibilityChannel(t, db, 2, constant.ChannelTypeAli, 50, "qwen-image-2.0-pro")
	createImageEligibilityChannel(t, db, 3, constant.ChannelTypeAli, 10, "qwen-image-2.0-pro")

	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache_%v", cacheEnabled), func(t *testing.T) {
			common.MemoryCacheEnabled = cacheEnabled
			if cacheEnabled {
				InitChannelCache()
			}
			first, err := GetRandomSatisfiedChannel("default", "qwen-image-2.0-pro", 0, "/pg/images/generations")
			require.NoError(t, err)
			require.NotNil(t, first)
			assert.Equal(t, 2, first.Id)

			retry, err := GetRandomSatisfiedChannel("default", "qwen-image-2.0-pro", 1, "/pg/images/generations")
			require.NoError(t, err)
			require.NotNil(t, retry)
			assert.Equal(t, 3, retry.Id)

			v1, err := GetRandomSatisfiedChannel("default", "qwen-image-2.0-pro", 0, "/v1/images/generations")
			require.NoError(t, err)
			require.NotNil(t, v1)
			assert.Equal(t, 1, v1.Id)
		})
	}
}

func TestGetChannelSelectsVolcEngineForSeedreamOnPlayground(t *testing.T) {
	db := setupImageEligibilityDB(t)
	createImageEligibilityChannel(t, db, 1, constant.ChannelTypeAli, 100, "Doubao-Seedream-5.0-pro")
	createImageEligibilityChannel(t, db, 2, constant.ChannelTypeVolcEngine, 1, "Doubao-Seedream-5.0-pro")

	for _, cacheEnabled := range []bool{false, true} {
		t.Run(fmt.Sprintf("cache_%v", cacheEnabled), func(t *testing.T) {
			common.MemoryCacheEnabled = cacheEnabled
			if cacheEnabled {
				InitChannelCache()
			}
			channel, err := GetRandomSatisfiedChannel("default", "Doubao-Seedream-5.0-pro", 0, "/pg/images/generations")
			require.NoError(t, err)
			require.NotNil(t, channel)
			assert.Equal(t, 2, channel.Id)
			assert.Equal(t, constant.ChannelTypeVolcEngine, channel.Type)
		})
	}
}
