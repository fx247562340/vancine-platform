package model

import (
	"log"

	"github.com/QuantumNous/new-api/constant"
)

// MigrateLongcatChannelType migrates LongCat channels from the old type=58
// (now AdvancedCustom in upstream rc.23) to type=100 (Vancine custom LongCat).
// This runs once on startup before AutoMigrate; idempotent for subsequent runs.
func MigrateLongcatChannelType() error {
	if DB == nil {
		return nil
	}

	// Guard: only run if the channels table exists (fresh installs may not have it yet).
	if !DB.Migrator().HasTable(&Channel{}) {
		return nil
	}

	var count int64
	if err := DB.Model(&Channel{}).
		Where("type = ? AND (base_url LIKE ? OR name LIKE ?)",
			58, "%longcat%", "%LongCat%").
		Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return nil
	}

	log.Printf("[MIGRATION] Migrating %d LongCat channel(s) from type=58 to type=%d", count, constant.ChannelTypeLongcat)
	if err := DB.Model(&Channel{}).
		Where("type = ? AND (base_url LIKE ? OR name LIKE ?)",
			58, "%longcat%", "%LongCat%").
		Update("type", constant.ChannelTypeLongcat).Error; err != nil {
		return err
	}

	return nil
}
