package controller

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var uploadDir string

func init() {
	uploadDir = constant.UploadedImageDir
	os.MkdirAll(uploadDir, 0o755)
}

func UploadImage(c *gin.Context) {
	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要上传的图片"})
		return
	}

	// 限制文件大小 (10MB)
	if file.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片大小不能超过 10MB"})
		return
	}

	// 检查文件类型
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowed := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true,
		".webp": true, ".gif": true,
	}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 jpg/jpeg/png/webp/gif 格式"})
		return
	}

	// 生成唯一文件名
	filename := uuid.New().String() + ext
	savePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存图片失败"})
		return
	}

	// 拼接外部可访问的 URL
	serverAddr := system_setting.ServerAddress
	if serverAddr == "" {
		serverAddr = "http://localhost:3000"
	}
	serverAddr = strings.TrimRight(serverAddr, "/")
	url := fmt.Sprintf("%s/uploads/images/%s", serverAddr, filename)

	c.JSON(http.StatusOK, gin.H{"url": url})
}
