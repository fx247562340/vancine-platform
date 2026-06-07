package model

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

type WaitlistEntry struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Email     string `json:"email" gorm:"type:varchar(255);not null;uniqueIndex"`
	Source    string `json:"source" gorm:"type:varchar(64)"` // reddit / v2ex / twitter / direct
	IpAddress string `json:"ip_address" gorm:"type:varchar(64)"`
	UserAgent string `json:"user_agent" gorm:"type:varchar(512)"`
	CreatedAt int64  `json:"created_at" gorm:"bigint"`
}

func (WaitlistEntry) TableName() string {
	return "waitlist_entries"
}

func WaitlistAdd(email, source, ip, ua string) error {
	entry := &WaitlistEntry{
		Email:     email,
		Source:    source,
		IpAddress: ip,
		UserAgent: ua,
		CreatedAt: time.Now().Unix(),
	}
	err := DB.Create(entry).Error
	if err != nil {
		// Check for duplicate email (GORM or PostgreSQL/MySQL/SQLite)
		if errors.Is(err, gorm.ErrDuplicatedKey) ||
			strings.Contains(err.Error(), "duplicate key") ||
			strings.Contains(err.Error(), "Duplicate entry") ||
			strings.Contains(err.Error(), "UNIQUE constraint") {
			return errors.New("该邮箱已在等待列表中")
		}
		return errors.New("加入等待列表失败，请稍后重试")
	}
	return nil
}

func GetWaitlistCount() (int64, error) {
	var count int64
	err := DB.Model(&WaitlistEntry{}).Count(&count).Error
	return count, err
}
