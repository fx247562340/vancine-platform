package controller

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"github.com/thanhpk/randstr"
)

var paypalAdaptor = &PayPalAdaptor{}

// PayPalPayRequest represents a payment request for PayPal checkout.
type PayPalPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
	SuccessURL    string `json:"success_url,omitempty"`
	CancelURL     string `json:"cancel_url,omitempty"`
}

type PayPalAdaptor struct{}

// --- OAuth2 Token Cache ---

type paypalTokenCache struct {
	mu         sync.RWMutex
	accessToken string
	expiresAt   time.Time
}

var tokenCache = &paypalTokenCache{}

func getPayPalToken() (string, error) {
	tokenCache.mu.RLock()
	if tokenCache.accessToken != "" && time.Now().Before(tokenCache.expiresAt) {
		defer tokenCache.mu.RUnlock()
		return tokenCache.accessToken, nil
	}
	tokenCache.mu.RUnlock()

	tokenCache.mu.Lock()
	defer tokenCache.mu.Unlock()

	// Double-check after acquiring write lock
	if tokenCache.accessToken != "" && time.Now().Before(tokenCache.expiresAt) {
		return tokenCache.accessToken, nil
	}

	apiBase := setting.GetPayPalAPIBase()
	url := apiBase + "/v1/oauth2/token"

	payload := strings.NewReader("grant_type=client_credentials")
	req, err := http.NewRequest("POST", url, payload)
	if err != nil {
		return "", fmt.Errorf("创建 token 请求失败: %w", err)
	}

	req.SetBasicAuth(setting.PayPalClientId, setting.PayPalClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取 PayPal token 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取 token 响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("PayPal token 请求失败 status=%d body=%s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("解析 token 响应失败: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("PayPal 返回空 token")
	}

	tokenCache.accessToken = tokenResp.AccessToken
	tokenCache.expiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second) // 提前5分钟刷新

	logger.LogInfo(nil, fmt.Sprintf("PayPal token 获取成功 expires_in=%d", tokenResp.ExpiresIn))
	return tokenResp.AccessToken, nil
}

// --- Amount Calculation ---

func getPayPalMinTopup() int64 {
	if setting.PayPalMinTopUp > 0 {
		return int64(setting.PayPalMinTopUp)
	}
	return 1
}

func getPayPalPayMoney(amount float64, group string) float64 {
	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}
	return amount * setting.PayPalUnitPrice * topupGroupRatio
}

// --- Request Handlers ---

func (*PayPalAdaptor) RequestAmount(c *gin.Context, req *PayPalPayRequest) {
	if req.Amount < getPayPalMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getPayPalMinTopup())})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayPalPayMoney(float64(req.Amount), group)
	if payMoney <= 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func (*PayPalAdaptor) RequestPay(c *gin.Context, req *PayPalPayRequest) {
	ctx := c.Request.Context()

	if req.PaymentMethod != model.PaymentMethodPayPal {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "不支持的支付渠道"})
		return
	}
	if req.Amount < getPayPalMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("充值数量不能小于 %d", getPayPalMinTopup()), "data": 10})
		return
	}
	if req.Amount > 10000 {
		c.JSON(http.StatusOK, gin.H{"message": "充值数量不能大于 10000", "data": 10})
		return
	}

	if req.SuccessURL != "" && common.ValidateRedirectURL(req.SuccessURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付成功重定向URL不在可信任域名列表中", "data": ""})
		return
	}
	if req.CancelURL != "" && common.ValidateRedirectURL(req.CancelURL) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "支付取消重定向URL不在可信任域名列表中", "data": ""})
		return
	}

	id := c.GetInt("id")
	user, _ := model.GetUserById(id, false)
	chargedMoney := GetChargedAmount(float64(req.Amount), *user)

	reference := fmt.Sprintf("paypal-ref-%d-%d-%s", user.Id, time.Now().UnixMilli(), randstr.String(4))
	referenceId := common.Sha1([]byte(reference))

	approveURL, orderId, err := genPayPalOrder(referenceId, chargedMoney, user.Email)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal 创建订单失败 user_id=%d trade_no=%s amount=%d error=%q", id, referenceId, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	topUp := &model.TopUp{
		UserId:          id,
		Amount:          req.Amount,
		Money:           chargedMoney,
		TradeNo:         referenceId,
		PaymentMethod:   model.PaymentMethodPayPal,
		PaymentProvider: model.PaymentProviderPayPal,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal 创建充值订单失败 user_id=%d trade_no=%s amount=%d error=%q", id, referenceId, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(ctx, fmt.Sprintf("PayPal 充值订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f paypal_order=%s", id, referenceId, req.Amount, chargedMoney, orderId))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_link": approveURL,
		},
	})
}

func RequestPayPalAmount(c *gin.Context) {
	var req PayPalPayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	paypalAdaptor.RequestAmount(c, &req)
}

func RequestPayPalPay(c *gin.Context) {
	var req PayPalPayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	paypalAdaptor.RequestPay(c, &req)
}

// --- PayPal API ---

func genPayPalOrder(referenceId string, amount float64, email string) (approveURL string, orderId string, err error) {
	token, err := getPayPalToken()
	if err != nil {
		return "", "", err
	}

	apiBase := setting.GetPayPalAPIBase()
	url := apiBase + "/v2/checkout/orders"

	amountStr := strconv.FormatFloat(amount, 'f', 2, 64)

	orderReq := map[string]interface{}{
		"intent": "CAPTURE",
		"purchase_units": []map[string]interface{}{
			{
				"reference_id": referenceId,
				"amount": map[string]string{
					"currency_code": setting.PayPalCurrency,
					"value":         amountStr,
				},
			},
		},
		"application_context": map[string]interface{}{
			"brand_name":  "Vancine",
			"locale":      "en-US",
			"landing_page": "BILLING",
			"shipping_preference": "NO_SHIPPING",
		},
	}

	jsonBody, _ := json.Marshal(orderReq)
	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", "", fmt.Errorf("创建 PayPal order 请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Prefer", "return=representation")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("PayPal order 请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("读取 PayPal order 响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("PayPal order 创建失败 status=%d body=%s", resp.StatusCode, string(body))
	}

	var orderResp struct {
		Id     string `json:"id"`
		Links  []struct {
			Href string `json:"href"`
			Rel  string `json:"rel"`
		} `json:"links"`
	}
	if err := json.Unmarshal(body, &orderResp); err != nil {
		return "", "", fmt.Errorf("解析 PayPal order 响应失败: %w", err)
	}

	for _, link := range orderResp.Links {
		if link.Rel == "approve" {
			return link.Href, orderResp.Id, nil
		}
	}

	return "", "", fmt.Errorf("PayPal order 响应中未找到 approve 链接")
}

// --- Webhook ---

const paypalSignatureHeader = "paypal-transmission-id"
const paypalSignatureSigHeader = "paypal-transmission-sig"
const paypalSignatureCertUrlHeader = "paypal-transmission-cert-url"
const paypalSignatureTimestampHeader = "paypal-transmission-timestamp"

type PayPalWebhookEvent struct {
	Id           string `json:"id"`
	ResourceType string `json:"resource_type"`
	EventType    string `json:"event_type"`
	Summary      string `json:"summary"`
	Resource     struct {
		Id            string `json:"id"`
		Status        string `json:"status"`
		CustomId      string `json:"custom_id"`
		Payer         struct {
			EmailAddress string `json:"email_address"`
			PayerId      string `json:"payer_id"`
		} `json:"payer"`
		PurchaseUnits []struct {
			ReferenceId string `json:"reference_id"`
			Payments    struct {
				Captures []struct {
					Id     string `json:"id"`
					Status string `json:"status"`
					Amount struct {
						Value string `json:"value"`
					} `json:"amount"`
				} `json:"captures"`
			} `json:"payments"`
		} `json:"purchase_units"`
	} `json:"resource"`
}

func verifyPayPalSignature(payload []byte, headers map[string]string) bool {
	if setting.PayPalWebhookId == "" {
		return false
	}

	certURL := headers[paypalSignatureCertUrlHeader]
	if certURL == "" {
		return false
	}

	// Fetch the certificate
	client := &http.Client{Timeout: 10 * time.Second}
	certResp, err := client.Get(certURL)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal 获取签名证书失败 error=%q", err.Error()))
		return false
	}
	defer certResp.Body.Close()

	certBody, err := io.ReadAll(certResp.Body)
	if err != nil {
		return false
	}

	// Parse the PEM certificate
	block, _ := pem.Decode(certBody)
	if block == nil {
		return false
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false
	}

	// Verify the signature
	transmissionId := headers[paypalSignatureHeader]
	timestamp := headers[paypalSignatureTimestampHeader]
	webhookId := setting.PayPalWebhookId

	signedData := fmt.Sprintf("%s|%s|%s|%s", transmissionId, timestamp, webhookId, string(payload))
	sigBytes, err := base64.StdEncoding.DecodeString(headers[paypalSignatureSigHeader])
	if err != nil {
		return false
	}

	hash := sha256.Sum256([]byte(signedData))
	err = rsa.VerifyPKCS1v15(cert.PublicKey.(*rsa.PublicKey), crypto.SHA256, hash[:], sigBytes)
	return err == nil
}

func PayPalWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	if !isPayPalWebhookEnabled() {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.AbortWithStatus(http.StatusForbidden)
		return
	}

	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal webhook 读取请求体失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	// Verify signature
	headers := make(map[string]string)
	for _, h := range []string{paypalSignatureHeader, paypalSignatureSigHeader, paypalSignatureCertUrlHeader, paypalSignatureTimestampHeader} {
		headers[h] = c.GetHeader(h)
	}

	if !verifyPayPalSignature(payload, headers) {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 签名验证失败 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		// In test mode, skip signature verification
		if !setting.PayPalTestMode {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
	}

	var event PayPalWebhookEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal webhook 解析失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	logger.LogInfo(ctx, fmt.Sprintf("PayPal webhook 收到事件 event_type=%s id=%s client_ip=%s", event.EventType, event.Id, c.ClientIP()))

	callerIp := c.ClientIP()

	switch event.EventType {
	case "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED":
		handlePayPalCapture(ctx, &event, payload, callerIp)
	default:
		logger.LogInfo(ctx, fmt.Sprintf("PayPal webhook 忽略事件 event_type=%s", event.EventType))
	}

	c.Status(http.StatusOK)
}

func handlePayPalCapture(ctx context.Context, event *PayPalWebhookEvent, rawPayload []byte, callerIp string) {
	// Extract referenceId from custom_id or purchase_units
	var referenceId string
	if event.Resource.CustomId != "" {
		referenceId = event.Resource.CustomId
	} else if len(event.Resource.PurchaseUnits) > 0 {
		referenceId = event.Resource.PurchaseUnits[0].ReferenceId
	}

	if referenceId == "" {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 无法提取 referenceId event_id=%s", event.Id))
		return
	}

	// Check if payment was captured
	if event.EventType == "CHECKOUT.ORDER.APPROVED" {
		// For APPROVED events, we need to check if the order has been captured
		// The capture might happen asynchronously, so we check the order status
		token, err := getPayPalToken()
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("PayPal 获取 token 失败 error=%q", err.Error()))
			return
		}

		apiBase := setting.GetPayPalAPIBase()
		url := fmt.Sprintf("%s/v2/checkout/orders/%s", apiBase, event.Resource.Id)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return
		}
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("PayPal 查询订单失败 order_id=%s error=%q", event.Resource.Id, err.Error()))
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var orderDetail struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(body, &orderDetail); err != nil {
			return
		}

		if orderDetail.Status != "COMPLETED" {
			logger.LogInfo(ctx, fmt.Sprintf("PayPal 订单未完成 order_id=%s status=%s, 等待 capture", event.Resource.Id, orderDetail.Status))
			return
		}
	}

	LockOrder(referenceId)
	defer UnlockOrder(referenceId)

	// Try subscription first
	if err := model.CompleteSubscriptionOrder(referenceId, string(rawPayload), model.PaymentProviderPayPal, callerIp); err == nil {
		logger.LogInfo(ctx, fmt.Sprintf("PayPal 订阅订单完成 trade_no=%s", referenceId))
		return
	} else if err != nil && !errors.Is(err, model.ErrSubscriptionOrderNotFound) {
		logger.LogError(ctx, fmt.Sprintf("PayPal 订阅订单处理失败 trade_no=%s error=%q", referenceId, err.Error()))
	}

	// Regular topup
	payerEmail := event.Resource.Payer.EmailAddress
	payerName := event.Resource.Payer.PayerId

	err := model.RechargePayPal(referenceId, payerEmail, payerName, callerIp)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal 充值失败 trade_no=%s error=%q", referenceId, err.Error()))
		return
	}

	logger.LogInfo(ctx, fmt.Sprintf("PayPal 充值成功 trade_no=%s payer=%s", referenceId, payerEmail))
}
