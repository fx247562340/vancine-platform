package controller

import (
	"net/http"
	"regexp"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type WaitlistRequest struct {
	Email  string `json:"email"`
	Source string `json:"source"`
}

func JoinWaitlist(c *gin.Context) {
	var req WaitlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求格式错误")
		return
	}

	if req.Email == "" || !emailRegex.MatchString(req.Email) {
		common.ApiErrorMsg(c, "请输入有效的邮箱地址")
		return
	}

	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")
	if len(ua) > 512 {
		ua = ua[:512]
	}

	err := model.WaitlistAdd(req.Email, req.Source, ip, ua)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	common.ApiSuccess(c, gin.H{
		"message": "已成功加入等待列表！",
	})
}

func GetWaitlistCount(c *gin.Context) {
	count, err := model.GetWaitlistCount()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    gin.H{"count": 0},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    gin.H{"count": count},
	})
}
