package controller

import (
	"bytes"
	"context"
	"encoding/json"
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
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

var paypalAdaptor = &PayPalAdaptor{}

// Test seams overridable from tests. paypalAPIBase resolves the PayPal REST
// root (sandbox/live) so tests can point it at an httptest.Server. paypalHTTPClient
// is the outbound HTTP client used for every PayPal v2 call. paypalSignatureVerifier
// is the webhook signature check, overridable so webhook tests avoid the network.
var (
	paypalAPIBase           = setting.GetPayPalAPIBase
	paypalHTTPClient        = &http.Client{Timeout: 30 * time.Second}
	paypalSignatureVerifier = verifyPayPalSignature
)

// paypalErrorSummaryLimit bounds both how many bytes of an error response are
// read from the wire and how many appear in a returned error string. PayPal
// error bodies are diagnostic only; capping the read prevents a broken or
// hostile endpoint from forcing us to buffer an unbounded response.
const paypalErrorSummaryLimit = 256

// summarizePayPalErrorBody returns a length-bounded snippet of a PayPal error
// response so non-2xx failures carry a bounded diagnostic without logging the
// full response body (which may contain identifiers we do not want to persist).
func summarizePayPalErrorBody(body []byte) string {
	s := string(body)
	if len(s) > paypalErrorSummaryLimit {
		return s[:paypalErrorSummaryLimit] + "...(truncated)"
	}
	return s
}

// readBoundedPayPalError reads at most paypalErrorSummaryLimit bytes from an
// error response and returns a bounded summary. It must only be called on
// responses whose status code has already been deemed an error; success
// responses are read in full so they can be parsed.
func readBoundedPayPalError(resp *http.Response) string {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, paypalErrorSummaryLimit))
	return summarizePayPalErrorBody(body)
}

// makePayPalRequestID derives a deterministic, length-bounded PayPal-Request-Id
// from an operation and the local trade number. PayPal caps PayPal-Request-Id at
// 38 single-byte characters, but the local trade number is a 40-character SHA-1,
// so the raw trade number (or "capture-"+tradeNo) cannot be used directly.
// Hashing operation+":"+tradeNo with SHA-1 and truncating to 38 bytes keeps the
// id deterministic per operation+tradeNo, distinct across operations, and within
// PayPal's limit, without changing how the trade number is generated or stored.
func makePayPalRequestID(operation, tradeNo string) (string, error) {
	if strings.TrimSpace(operation) == "" {
		return "", fmt.Errorf("operation is empty")
	}
	if strings.TrimSpace(tradeNo) == "" {
		return "", fmt.Errorf("tradeNo is empty")
	}
	const maxPayPalRequestIDLen = 38
	digest := common.Sha1([]byte(operation + ":" + tradeNo))
	if len(digest) > maxPayPalRequestIDLen {
		return digest[:maxPayPalRequestIDLen], nil
	}
	return digest, nil
}

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
	mu          sync.RWMutex
	accessToken string
	expiresAt   time.Time
	testMode    bool
}

var tokenCache = &paypalTokenCache{}

func getPayPalToken() (string, error) {
	currentTestMode := setting.PayPalTestMode

	tokenCache.mu.RLock()
	if tokenCache.accessToken != "" && time.Now().Before(tokenCache.expiresAt) && tokenCache.testMode == currentTestMode {
		defer tokenCache.mu.RUnlock()
		return tokenCache.accessToken, nil
	}
	tokenCache.mu.RUnlock()

	tokenCache.mu.Lock()
	defer tokenCache.mu.Unlock()

	// Double-check after acquiring write lock
	if tokenCache.accessToken != "" && time.Now().Before(tokenCache.expiresAt) && tokenCache.testMode == currentTestMode {
		return tokenCache.accessToken, nil
	}

	apiBase := paypalAPIBase()
	url := apiBase + "/v1/oauth2/token"

	payload := strings.NewReader("grant_type=client_credentials")
	req, err := http.NewRequest("POST", url, payload)
	if err != nil {
		return "", fmt.Errorf("创建 token 请求失败: %w", err)
	}

	req.SetBasicAuth(setting.GetPayPalClientId(), setting.GetPayPalClientSecret())
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := paypalHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("获取 PayPal token 失败: %w", err)
	}
	defer resp.Body.Close()

	// Check status before reading the body: a non-200 response is read through a
	// bounded reader so a large error body is never buffered in full. Only a
	// successful response is read in full for parsing.
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("PayPal token 请求失败 status=%d summary=%s", resp.StatusCode, readBoundedPayPalError(resp))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取 token 响应失败: %w", err)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := common.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("解析 token 响应失败: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("PayPal 返回空 token")
	}

	tokenCache.accessToken = tokenResp.AccessToken
	tokenCache.expiresAt = time.Now().Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second) // 提前5分钟刷新
	tokenCache.testMode = currentTestMode

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
	return amount * topupGroupRatio
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
		PaymentId:       orderId,
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
	if !isPayPalTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "PayPal 支付未开启"})
		return
	}
	var req PayPalPayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	paypalAdaptor.RequestAmount(c, &req)
}

func RequestPayPalPay(c *gin.Context) {
	if !isPayPalTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "PayPal 支付未开启"})
		return
	}
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

	apiBase := paypalAPIBase()
	url := apiBase + "/v2/checkout/orders"

	amountStr := strconv.FormatFloat(amount, 'f', 2, 64)

	// reference_id, custom_id, and invoice_id are all bound to the local trade
	// number so the capture can be correlated back to this exact top-up.
	orderReq := map[string]interface{}{
		"intent": "CAPTURE",
		"purchase_units": []map[string]interface{}{
			{
				"reference_id": referenceId,
				"custom_id":    referenceId,
				"invoice_id":   referenceId,
				"amount": map[string]string{
					"currency_code": setting.PayPalCurrency,
					"value":         amountStr,
				},
			},
		},
		"application_context": map[string]interface{}{
			"brand_name":          "Vancine",
			"locale":              "en-US",
			"landing_page":        "BILLING",
			"shipping_preference": "NO_SHIPPING",
			"return_url":          paymentReturnPath("/api/paypal/return"),
			"cancel_url":          paymentReturnPath("/console/topup"),
			"user_action":         "PAY_NOW",
		},
	}

	jsonBody, err := common.Marshal(orderReq)
	if err != nil {
		return "", "", fmt.Errorf("构建 PayPal order 请求失败: %w", err)
	}
	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", "", fmt.Errorf("创建 PayPal order 请求失败: %w", err)
	}

	requestID, err := makePayPalRequestID("create", referenceId)
	if err != nil {
		return "", "", fmt.Errorf("构建 PayPal 创建订单 Request-Id 失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Prefer", "return=representation")
	// PayPal-Request-Id makes order creation idempotent: a replay with the same
	// trade number returns the original order instead of creating a duplicate.
	// It is a deterministic digest of ("create", tradeNo) so it fits PayPal's
	// 38-character cap without exposing the raw trade number.
	req.Header.Set("PayPal-Request-Id", requestID)

	resp, err := paypalHTTPClient.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("PayPal order 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("PayPal order 创建失败 status=%d summary=%s", resp.StatusCode, readBoundedPayPalError(resp))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("读取 PayPal order 响应失败: %w", err)
	}

	var orderResp struct {
		Id    string `json:"id"`
		Links []struct {
			Href string `json:"href"`
			Rel  string `json:"rel"`
		} `json:"links"`
	}
	if err := common.Unmarshal(body, &orderResp); err != nil {
		return "", "", fmt.Errorf("解析 PayPal order 响应失败: %w", err)
	}

	for _, link := range orderResp.Links {
		if link.Rel == "approve" {
			return link.Href, orderResp.Id, nil
		}
	}

	return "", "", fmt.Errorf("PayPal order 响应中未找到 approve 链接")
}

// getPayPalOrder fetches the full order representation from PayPal. Only HTTP 200
// is accepted; any other status is an error so callers never act on a partial or
// ambiguous order. The response is decoded into the canonical paypalOrderDetail.
func getPayPalOrder(orderID string) (paypalOrderDetail, error) {
	if strings.TrimSpace(orderID) == "" {
		return paypalOrderDetail{}, fmt.Errorf("order id is empty")
	}
	token, err := getPayPalToken()
	if err != nil {
		return paypalOrderDetail{}, err
	}

	url := paypalAPIBase() + "/v2/checkout/orders/" + orderID
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("创建 PayPal 查询请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := paypalHTTPClient.Do(req)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("PayPal 查询订单失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return paypalOrderDetail{}, fmt.Errorf("PayPal 查询订单失败 status=%d summary=%s", resp.StatusCode, readBoundedPayPalError(resp))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("读取 PayPal 订单响应失败: %w", err)
	}

	var detail paypalOrderDetail
	if err := common.Unmarshal(body, &detail); err != nil {
		return paypalOrderDetail{}, fmt.Errorf("解析 PayPal 订单响应失败: %w", err)
	}
	return detail, nil
}

// capturePayPalOrder captures an approved PayPal order and returns the full
// representation. The PayPal-Request-Id is derived from the local trade number
// so capture is idempotent: a replay returns the original capture instead of
// double-charging. Only HTTP 200/201 is accepted; Prefer: return=representation
// ensures PayPal returns the full order with capture details.
func capturePayPalOrder(orderID, tradeNo string) (paypalOrderDetail, error) {
	if strings.TrimSpace(orderID) == "" {
		return paypalOrderDetail{}, fmt.Errorf("order id is empty")
	}
	token, err := getPayPalToken()
	if err != nil {
		return paypalOrderDetail{}, err
	}

	url := paypalAPIBase() + "/v2/checkout/orders/" + orderID + "/capture"
	req, err := http.NewRequest("POST", url, strings.NewReader("{}"))
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("创建 PayPal capture 请求失败: %w", err)
	}
	requestID, err := makePayPalRequestID("capture", tradeNo)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("构建 PayPal capture Request-Id 失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Prefer", "return=representation")
	// Deterministic capture request id keyed off ("capture", tradeNo) so retries
	// never produce a second capture for the same order. It is a digest that
	// fits PayPal's 38-character cap and differs from the create request id.
	req.Header.Set("PayPal-Request-Id", requestID)

	resp, err := paypalHTTPClient.Do(req)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("PayPal capture 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return paypalOrderDetail{}, fmt.Errorf("PayPal capture 失败 status=%d summary=%s", resp.StatusCode, readBoundedPayPalError(resp))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return paypalOrderDetail{}, fmt.Errorf("读取 PayPal capture 响应失败: %w", err)
	}

	var detail paypalOrderDetail
	if err := common.Unmarshal(body, &detail); err != nil {
		return paypalOrderDetail{}, fmt.Errorf("解析 PayPal capture 响应失败: %w", err)
	}
	return detail, nil
}

// --- Webhook ---

const paypalSignatureHeader = "paypal-transmission-id"
const paypalSignatureSigHeader = "paypal-transmission-sig"
const paypalSignatureCertUrlHeader = "paypal-cert-url"
const paypalSignatureTimestampHeader = "paypal-transmission-time"

type paypalWebhookPayer struct {
	EmailAddress string `json:"email_address"`
	PayerID      string `json:"payer_id"`
}

type paypalWebhookLink struct {
	Href   string `json:"href"`
	Rel    string `json:"rel"`
	Method string `json:"method"`
}

// paypalWebhookRelatedIDs carries the parent ids for capture/refund/reversal
// events: order_id binds to the stored PayPal Order id, capture_id binds to the
// stored transaction id (the capture id captured at credit time).
// authorization_id is part of the official shape but not used to identify
// refunds in this task.
type paypalWebhookRelatedIDs struct {
	OrderID         string `json:"order_id"`
	CaptureID       string `json:"capture_id"`
	AuthorizationID string `json:"authorization_id"`
}

// paypalWebhookSupplementaryData mirrors the official supplementary_data block.
type paypalWebhookSupplementaryData struct {
	RelatedIDs paypalWebhookRelatedIDs `json:"related_ids"`
}

// paypalWebhookResource is the canonical resource block shared by capture,
// order, and refund events. Field names use Go's ID convention while json tags
// keep PayPal's official snake_case.
type paypalWebhookResource struct {
	ID                string                         `json:"id"`
	Status            string                         `json:"status"`
	CustomID          string                         `json:"custom_id"`
	InvoiceID         string                         `json:"invoice_id"`
	Payer             paypalWebhookPayer             `json:"payer"`
	Amount            paypalMoney                    `json:"amount"`
	Links             []paypalWebhookLink            `json:"links"`
	PurchaseUnits     []paypalPurchaseUnit           `json:"purchase_units"`
	SupplementaryData paypalWebhookSupplementaryData `json:"supplementary_data"`
}

type PayPalWebhookEvent struct {
	Id           string                `json:"id"`
	ResourceType string                `json:"resource_type"`
	EventType    string                `json:"event_type"`
	Summary      string                `json:"summary"`
	Resource     paypalWebhookResource `json:"resource"`
}

func verifyPayPalSignature(payload []byte, headers map[string]string) bool {
	webhookId := setting.GetPayPalWebhookId()
	if webhookId == "" {
		logger.LogError(nil, "PayPal webhook 验签失败: WebhookId 未配置")
		return false
	}

	certUrl := headers[paypalSignatureCertUrlHeader]
	transmissionId := headers[paypalSignatureHeader]
	sig := headers[paypalSignatureSigHeader]
	timestamp := headers[paypalSignatureTimestampHeader]

	if certUrl == "" || transmissionId == "" || sig == "" || timestamp == "" {
		logger.LogWarn(nil, "PayPal webhook 验签失败: 缺少必要请求头")
		return false
	}

	// Build verify request per PayPal official API
	// https://developer.paypal.com/api/rest/webhooks/
	verifyReq := struct {
		AuthAlgo         string          `json:"auth_algo"`
		CertUrl          string          `json:"cert_url"`
		TransmissionId   string          `json:"transmission_id"`
		TransmissionSig  string          `json:"transmission_sig"`
		TransmissionTime string          `json:"transmission_time"`
		WebhookId        string          `json:"webhook_id"`
		WebhookEvent     json.RawMessage `json:"webhook_event"`
	}{
		AuthAlgo:         headers["paypal-auth-algo"],
		CertUrl:          certUrl,
		TransmissionId:   transmissionId,
		TransmissionSig:  sig,
		TransmissionTime: timestamp,
		WebhookId:        webhookId,
		WebhookEvent:     payload,
	}

	body, err := common.Marshal(verifyReq)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签构建请求失败 error=%q", err.Error()))
		return false
	}

	apiBase := setting.GetPayPalAPIBase()
	url := apiBase + "/v1/notifications/verify-webhook-signature"

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签创建请求失败 error=%q", err.Error()))
		return false
	}

	token, err := getPayPalToken()
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签获取 token 失败 error=%q", err.Error()))
		return false
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签请求失败 error=%q", err.Error()))
		return false
	}
	defer resp.Body.Close()

	// Check status before reading the body: a non-200 verify response is read
	// through a bounded reader so a large error body is never buffered in full.
	if resp.StatusCode != http.StatusOK {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签请求异常 status=%d summary=%s", resp.StatusCode, readBoundedPayPalError(resp)))
		return false
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("PayPal webhook 验签读取响应失败 error=%q", err.Error()))
		return false
	}

	var verifyResp struct {
		VerificationStatus string `json:"verification_status"`
	}
	if err := common.Unmarshal(respBody, &verifyResp); err != nil {
		logger.LogError(nil, "PayPal webhook 验签解析响应失败")
		return false
	}

	if verifyResp.VerificationStatus != "SUCCESS" {
		logger.LogWarn(nil, fmt.Sprintf("PayPal webhook 验签未通过 status=%s", verifyResp.VerificationStatus))
		return false
	}

	return true
}

func PayPalWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	if !isPayPalWebhookEnabled() {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.AbortWithStatus(http.StatusForbidden)
		return
	}

	// Bound the request body before reading so a malicious or broken delivery
	// cannot force us to buffer an unbounded payload. The limit is checked
	// before signature verification so an oversized body never reaches the
	// verifier or business logic.
	const paypalWebhookMaxBodyBytes = 1 << 20 // 1 MiB
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, paypalWebhookMaxBodyBytes)
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 请求体超过限制 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
			c.AbortWithStatus(http.StatusRequestEntityTooLarge)
			return
		}
		logger.LogError(ctx, fmt.Sprintf("PayPal webhook 读取请求体失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	// Collect only the headers the verifier needs; do not log their values.
	headers := map[string]string{
		paypalSignatureHeader:          c.GetHeader(paypalSignatureHeader),
		paypalSignatureSigHeader:       c.GetHeader(paypalSignatureSigHeader),
		paypalSignatureCertUrlHeader:   c.GetHeader(paypalSignatureCertUrlHeader),
		paypalSignatureTimestampHeader: c.GetHeader(paypalSignatureTimestampHeader),
		"paypal-auth-algo":             c.GetHeader("paypal-auth-algo"),
	}

	if !paypalSignatureVerifier(payload, headers) {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal webhook 签名验证失败 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.AbortWithStatus(http.StatusForbidden)
		return
	}

	var event PayPalWebhookEvent
	if err := common.Unmarshal(payload, &event); err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal webhook 解析失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	logger.LogInfo(ctx, fmt.Sprintf("PayPal webhook 收到事件 event_type=%s id=%s client_ip=%s", event.EventType, event.Id, c.ClientIP()))

	callerIp := c.ClientIP()

	var handleErr error
	switch event.EventType {
	case "CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED":
		handleErr = handlePayPalCapture(ctx, &event, payload, callerIp)
	case "PAYMENT.CAPTURE.REFUNDED":
		handleErr = handlePayPalRefund(ctx, &event, payload, callerIp)
	case "PAYMENT.CAPTURE.REVERSED":
		handleErr = handlePayPalReversal(ctx, &event, payload, callerIp)
	default:
		logger.LogInfo(ctx, fmt.Sprintf("PayPal webhook 忽略事件 event_type=%s", event.EventType))
	}

	// A recognized event that could not be safely processed must return 500 so
	// PayPal retries. Only a committed, already-committed, or intentionally
	// ignored event returns 200.
	if handleErr != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal webhook 处理失败 event_type=%s id=%s error=%q", event.EventType, event.Id, handleErr.Error()))
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusOK)
}

// HandlePayPalReturn handles the user redirect back from PayPal after payment approval.
// PayPal appends ?token={ORDER_ID} to the return_url. This handler looks up the
// local PayPal order by that Order ID first, then queries/captures the exact
// stored PayPal order, validates a single completed capture against the stored
// amount/currency, and credits the user idempotently. It serves as a fallback
// alongside the webhook to ensure payment completion even if webhook delivery
// fails. An existing pending order may settle even if an admin later disables
// new PayPal checkout; the enable gate blocks creation, not settlement.
func HandlePayPalReturn(c *gin.Context) {
	ctx := c.Request.Context()
	orderId := c.Query("token")
	if orderId == "" {
		logger.LogWarn(ctx, "PayPal return 回调缺少 token 参数")
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup"))
		return
	}

	// 1. Look up the LOCAL PayPal order by the return Order ID before any
	//    outbound PayPal request. A return token with no matching local order
	//    cannot be settled and must not trigger PayPal API calls.
	localOrder, err := model.FindTopUpByPaymentID(orderId, model.PaymentProviderPayPal)
	if err != nil || localOrder == nil {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal return 本地订单不存在 order_id=%s client_ip=%s", orderId, c.ClientIP()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}

	// The stored PaymentId is the authoritative PayPal Order ID; every PayPal
	// call targets it, never the raw return token.
	paypalOrderID := localOrder.PaymentId
	tradeNo := localOrder.TradeNo

	LockOrder(tradeNo)
	defer UnlockOrder(tradeNo)

	// 2. Query the exact stored PayPal order.
	order, err := getPayPalOrder(paypalOrderID)
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal return 查询订单失败 trade_no=%s order_id=%s error=%q", tradeNo, paypalOrderID, err.Error()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}

	// 3. Capture if still APPROVED; COMPLETED orders are used as-is. Any other
	//    status is non-terminal and must not credit.
	var captureOrder paypalOrderDetail
	switch order.Status {
	case "COMPLETED":
		captureOrder = order
	case "APPROVED":
		captured, err := capturePayPalOrder(paypalOrderID, tradeNo)
		if err != nil {
			logger.LogError(ctx, fmt.Sprintf("PayPal return capture 失败 trade_no=%s order_id=%s error=%q", tradeNo, paypalOrderID, err.Error()))
			c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
			return
		}
		if captured.Status != "COMPLETED" {
			logger.LogInfo(ctx, fmt.Sprintf("PayPal return capture 状态非 COMPLETED trade_no=%s order_id=%s status=%s", tradeNo, paypalOrderID, captured.Status))
			c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_pending=true"))
			return
		}
		captureOrder = captured
	default:
		logger.LogInfo(ctx, fmt.Sprintf("PayPal return 订单状态非终态 trade_no=%s order_id=%s status=%s", tradeNo, paypalOrderID, order.Status))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_pending=true"))
		return
	}

	// 4. Extract exactly one capture so a credited order is never ambiguous.
	unit, capture, err := extractCompletedPayPalCapture(captureOrder)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal return 提取 capture 失败 trade_no=%s order_id=%s error=%q", tradeNo, paypalOrderID, err.Error()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}

	// 4b. The return flow always carries the full order representation, and
	//     order creation wrote reference_id = tradeNo, so a returned empty or
	//     mismatched reference id is a hard failure. The shared validator still
	//     tolerates an empty reference id for the direct-capture webhook path;
	//     this explicit check keeps that compatibility without weakening return
	//     settlement.
	if strings.TrimSpace(unit.ReferenceID) == "" || unit.ReferenceID != localOrder.TradeNo {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal return reference_id 校验失败 trade_no=%s order_id=%s reference_id=%s", tradeNo, paypalOrderID, unit.ReferenceID))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}

	// 5. Validate every binding: provider, order id, reference id, capture id,
	//    status, currency, and amount must all match the stored local order.
	if err := validateCompletedPayPalCapture(localOrder, captureOrder.ID, unit.ReferenceID, capture); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("PayPal return 校验失败 trade_no=%s order_id=%s error=%q", tradeNo, paypalOrderID, err.Error()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}

	// 6. Credit idempotently. RechargePayPal returns nil for a fresh credit or
	//    an already-committed matching capture; any real failure must not be
	//    reported as success.
	callerIp := c.ClientIP()
	if err := model.RechargePayPal(tradeNo, "", "", callerIp, capture.ID); err != nil {
		logger.LogError(ctx, fmt.Sprintf("PayPal return 充值失败 trade_no=%s order_id=%s capture_id=%s error=%q", tradeNo, paypalOrderID, capture.ID, err.Error()))
		c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?payment_error=true"))
		return
	}
	logger.LogInfo(ctx, fmt.Sprintf("PayPal return 充值成功 trade_no=%s order_id=%s capture_id=%s", tradeNo, paypalOrderID, capture.ID))
	c.Redirect(http.StatusFound, paymentReturnPath("/console/topup?show_history=true"))
}

func handlePayPalCapture(ctx context.Context, event *PayPalWebhookEvent, rawPayload []byte, callerIp string) error {
	if event == nil {
		return fmt.Errorf("webhook event is nil")
	}

	switch event.EventType {
	case "PAYMENT.CAPTURE.COMPLETED":
		return handlePayPalDirectCapture(ctx, event, callerIp)
	case "CHECKOUT.ORDER.APPROVED":
		return handlePayPalOrderApproved(ctx, event, callerIp)
	default:
		return fmt.Errorf("unsupported capture event type: %s", event.EventType)
	}
}

// handlePayPalDirectCapture processes a PAYMENT.CAPTURE.COMPLETED event whose
// resource is the capture itself. The parent PayPal Order id is carried in
// supplementary_data.related_ids.order_id; the capture id/status/amount live
// directly on resource. This path never calls PayPal: the event already carries
// the canonical capture, so it is validated against the stored local order and
// credited idempotently. An empty remoteReferenceID is passed to the shared
// validator, which tolerates it for this direct-capture path.
func handlePayPalDirectCapture(ctx context.Context, event *PayPalWebhookEvent, callerIp string) error {
	orderID := strings.TrimSpace(event.Resource.SupplementaryData.RelatedIDs.OrderID)
	if orderID == "" {
		return fmt.Errorf("direct capture missing related order id event_id=%s", event.Id)
	}

	localOrder, err := model.FindTopUpByPaymentID(orderID, model.PaymentProviderPayPal)
	if err != nil || localOrder == nil {
		return fmt.Errorf("direct capture local order not found order_id=%s event_id=%s", orderID, event.Id)
	}

	capture := paypalCapture{
		ID:     event.Resource.ID,
		Status: event.Resource.Status,
		Amount: event.Resource.Amount,
	}
	if err := validateCompletedPayPalCapture(localOrder, orderID, "", capture); err != nil {
		return fmt.Errorf("direct capture validation failed trade_no=%s order_id=%s: %w", localOrder.TradeNo, orderID, err)
	}

	LockOrder(localOrder.TradeNo)
	defer UnlockOrder(localOrder.TradeNo)

	payerEmail := event.Resource.Payer.EmailAddress
	payerName := event.Resource.Payer.PayerID
	if err := model.RechargePayPal(localOrder.TradeNo, payerEmail, payerName, callerIp, capture.ID); err != nil {
		return fmt.Errorf("direct capture recharge failed trade_no=%s capture_id=%s: %w", localOrder.TradeNo, capture.ID, err)
	}
	if ctx != nil {
		logger.LogInfo(ctx, fmt.Sprintf("PayPal direct capture 充值成功 trade_no=%s order_id=%s capture_id=%s", localOrder.TradeNo, orderID, capture.ID))
	}
	return nil
}

// handlePayPalOrderApproved processes a CHECKOUT.ORDER.APPROVED event. The
// resource.id is the PayPal Order id; the local order is bound first by that id
// (provider-scoped) before any PayPal call. The exact stored PaymentId is then
// queried and, if still APPROVED, captured. The returned full order must carry
// exactly one completed capture whose reference_id equals the local trade no.
func handlePayPalOrderApproved(ctx context.Context, event *PayPalWebhookEvent, callerIp string) error {
	orderID := strings.TrimSpace(event.Resource.ID)
	if orderID == "" {
		return fmt.Errorf("approved order event missing resource id event_id=%s", event.Id)
	}

	localOrder, err := model.FindTopUpByPaymentID(orderID, model.PaymentProviderPayPal)
	if err != nil || localOrder == nil {
		return fmt.Errorf("approved order local order not found order_id=%s event_id=%s", orderID, event.Id)
	}

	LockOrder(localOrder.TradeNo)
	defer UnlockOrder(localOrder.TradeNo)

	paypalOrderID := localOrder.PaymentId
	order, err := getPayPalOrder(paypalOrderID)
	if err != nil {
		return fmt.Errorf("approved order query failed trade_no=%s order_id=%s: %w", localOrder.TradeNo, paypalOrderID, err)
	}

	var captureOrder paypalOrderDetail
	switch order.Status {
	case "COMPLETED":
		captureOrder = order
	case "APPROVED":
		captured, err := capturePayPalOrder(paypalOrderID, localOrder.TradeNo)
		if err != nil {
			return fmt.Errorf("approved order capture failed trade_no=%s order_id=%s: %w", localOrder.TradeNo, paypalOrderID, err)
		}
		if captured.Status != "COMPLETED" {
			return fmt.Errorf("approved order capture non-completed trade_no=%s order_id=%s status=%s", localOrder.TradeNo, paypalOrderID, captured.Status)
		}
		captureOrder = captured
	default:
		return fmt.Errorf("approved order non-terminal status trade_no=%s order_id=%s status=%s", localOrder.TradeNo, paypalOrderID, order.Status)
	}

	unit, capture, err := extractCompletedPayPalCapture(captureOrder)
	if err != nil {
		return fmt.Errorf("approved order extract capture failed trade_no=%s order_id=%s: %w", localOrder.TradeNo, paypalOrderID, err)
	}
	if strings.TrimSpace(unit.ReferenceID) == "" || unit.ReferenceID != localOrder.TradeNo {
		return fmt.Errorf("approved order reference_id mismatch trade_no=%s order_id=%s reference_id=%s", localOrder.TradeNo, paypalOrderID, unit.ReferenceID)
	}
	if err := validateCompletedPayPalCapture(localOrder, captureOrder.ID, unit.ReferenceID, capture); err != nil {
		return fmt.Errorf("approved order validation failed trade_no=%s order_id=%s: %w", localOrder.TradeNo, paypalOrderID, err)
	}

	if err := model.RechargePayPal(localOrder.TradeNo, "", "", callerIp, capture.ID); err != nil {
		return fmt.Errorf("approved order recharge failed trade_no=%s capture_id=%s: %w", localOrder.TradeNo, capture.ID, err)
	}
	if ctx != nil {
		logger.LogInfo(ctx, fmt.Sprintf("PayPal approved order 充值成功 trade_no=%s order_id=%s capture_id=%s", localOrder.TradeNo, paypalOrderID, capture.ID))
	}
	return nil
}

// validatePayPalMoneyAgainstOrder enforces the fail-closed amount and currency
// contract for refund/reversal events: currency must be non-empty and equal to
// the configured currency, and the amount must parse as a decimal and equal the
// local order amount rounded to 2 decimal places. Any mismatch is an error.
func validatePayPalMoneyAgainstOrder(amount, currency string, localMoney float64) error {
	if strings.TrimSpace(currency) == "" {
		return fmt.Errorf("currency is empty")
	}
	if currency != setting.PayPalCurrency {
		return fmt.Errorf("currency mismatch: configured=%s event=%s", setting.PayPalCurrency, currency)
	}
	amt, err := decimal.NewFromString(amount)
	if err != nil {
		return fmt.Errorf("amount is not a valid decimal: %q: %w", amount, err)
	}
	// Explicitly reject non-positive amounts. Relying on inequality with the
	// local order amount alone would accept a 0.00 (or negative) event when the
	// local amount is also 0, so the guard is independent of the equality check.
	if !amt.GreaterThan(decimal.Zero) {
		return fmt.Errorf("amount must be positive: %s", amt.String())
	}
	expected := decimal.NewFromFloat(localMoney).Round(2)
	if !amt.Equal(expected) {
		return fmt.Errorf("amount mismatch: local=%s event=%s", expected.String(), amt.String())
	}
	return nil
}

// findPayPalTopUpForRefund resolves the local PayPal top-up from any combination
// of capture id, order id, and trade no (invoice id). When more than one
// identifier is present, all must resolve to the same order or the event is
// rejected as ambiguous. A non-PayPal order matched by transaction id is also
// rejected. Returns an error when no order can be resolved.
// paypalRefundIdentifier is one external id carried by a refund/reversal event
// together with its source label and a lookup function. Every non-empty
// identifier must resolve to the same local order or the event is rejected.
type paypalRefundIdentifier struct {
	value  string
	src    string
	lookup func(string) (*model.TopUp, error)
}

// findPayPalTopUpForRefund resolves the local PayPal top-up from the set of
// identifiers carried by a refund/reversal event. Every non-empty identifier
// MUST resolve to an order, all must bind the same order, and the resolved
// order must be a PayPal order. A non-empty identifier that does not resolve,
// a lookup error (including ErrTopUpNotFound from FindTopUpByPaymentID), or a
// conflict between identifiers is a hard error - there is no silent fallback.
func findPayPalTopUpForRefund(ids ...paypalRefundIdentifier) (*model.TopUp, error) {
	var topUp *model.TopUp
	for _, id := range ids {
		if strings.TrimSpace(id.value) == "" {
			continue
		}
		found, err := id.lookup(id.value)
		if err != nil {
			return nil, fmt.Errorf("%s lookup failed: %w", id.src, err)
		}
		if found == nil {
			return nil, fmt.Errorf("%s did not resolve to an order: %s", id.src, id.value)
		}
		if topUp == nil {
			topUp = found
			continue
		}
		if topUp.Id != found.Id {
			return nil, fmt.Errorf("identifier conflict: %s resolves to a different order", id.src)
		}
	}
	if topUp == nil {
		return nil, fmt.Errorf("no identifiers provided")
	}
	if topUp.PaymentProvider != model.PaymentProviderPayPal {
		return nil, fmt.Errorf("order is not a PayPal order")
	}
	return topUp, nil
}

// captureIDLookup binds a capture id to the stored transaction id.
func captureIDLookup(src string) func(string) (*model.TopUp, error) {
	return func(s string) (*model.TopUp, error) { return model.GetTopUpByTransactionId(s), nil }
}

// orderIDLookup binds a PayPal Order id to the stored payment id (provider-scoped).
func orderIDLookup(src string) func(string) (*model.TopUp, error) {
	return func(s string) (*model.TopUp, error) {
		return model.FindTopUpByPaymentID(s, model.PaymentProviderPayPal)
	}
}

// tradeNoLookup binds an invoice id to the stored trade no.
func tradeNoLookup(src string) func(string) (*model.TopUp, error) {
	return func(s string) (*model.TopUp, error) { return model.GetTopUpByTradeNo(s), nil }
}

// handlePayPalRefund handles PAYMENT.CAPTURE.REFUNDED webhook events by routing
// them through the atomic settlement ledger (model.ApplyPayPalSettlement). The
// ledger enforces, inside a single transaction: PayPal provider, capture id,
// amount, currency, and order status checks; a one-time quota deduction; and
// idempotency by Event ID and Resource Key. The webhook Event ID and the Refund
// ID (resource.id) become the ledger identifiers.
//
// Pre-settlement validation (identifier resolution, status, money) is kept here
// so a malformed event fails fast and fail-closed before the ledger transaction
// opens; the ledger re-validates the same bindings under the row lock as the
// authoritative guard. A fully-valid duplicate on an already-refunded order is an
// idempotent no-op.
func handlePayPalRefund(ctx context.Context, event *PayPalWebhookEvent, rawPayload []byte, callerIp string) error {
	if event == nil {
		return fmt.Errorf("refund event is nil")
	}
	relatedCaptureID := strings.TrimSpace(event.Resource.SupplementaryData.RelatedIDs.CaptureID)
	var linkCaptureID string
	for _, link := range event.Resource.Links {
		if link.Rel == "up" {
			parts := strings.Split(link.Href, "/")
			if len(parts) > 0 {
				linkCaptureID = strings.TrimSpace(parts[len(parts)-1])
			}
			break
		}
	}
	orderID := strings.TrimSpace(event.Resource.SupplementaryData.RelatedIDs.OrderID)
	tradeNo := strings.TrimSpace(event.Resource.InvoiceID)
	refundID := strings.TrimSpace(event.Resource.ID)

	if refundID == "" {
		return fmt.Errorf("refund missing resource id (refund id) event_id=%s", event.Id)
	}
	if relatedCaptureID == "" && linkCaptureID == "" && orderID == "" && tradeNo == "" {
		return fmt.Errorf("refund missing identifiers event_id=%s", event.Id)
	}

	topUp, err := findPayPalTopUpForRefund(
		paypalRefundIdentifier{relatedCaptureID, "capture_id", captureIDLookup("capture_id")},
		paypalRefundIdentifier{linkCaptureID, "up_link_capture_id", captureIDLookup("up_link_capture_id")},
		paypalRefundIdentifier{orderID, "order_id", orderIDLookup("order_id")},
		paypalRefundIdentifier{tradeNo, "invoice_id", tradeNoLookup("invoice_id")},
	)
	if err != nil {
		return fmt.Errorf("refund resolve order failed: %w", err)
	}

	// Fail fast on status/money before opening the settlement transaction. The
	// ledger re-checks these under the row lock as the authoritative guard.
	if event.Resource.Status != "COMPLETED" {
		return fmt.Errorf("refund status not completed trade_no=%s status=%s", topUp.TradeNo, event.Resource.Status)
	}
	if err := validatePayPalMoneyAgainstOrder(event.Resource.Amount.Value, event.Resource.Amount.CurrencyCode, topUp.Money); err != nil {
		return fmt.Errorf("refund validation failed trade_no=%s: %w", topUp.TradeNo, err)
	}

	// The capture id bound to the order is the authoritative transaction id; a
	// refund event must carry it (directly or via the rel="up" link) so the
	// ledger can bind the settlement to the exact capture that was credited.
	captureID := strings.TrimSpace(topUp.TransactionId)
	if captureID == "" {
		return fmt.Errorf("refund order has no captured transaction id trade_no=%s", topUp.TradeNo)
	}
	if relatedCaptureID != "" && relatedCaptureID != captureID {
		return fmt.Errorf("refund capture id mismatch trade_no=%s local=%s event=%s", topUp.TradeNo, captureID, relatedCaptureID)
	}
	if linkCaptureID != "" && linkCaptureID != captureID {
		return fmt.Errorf("refund up-link capture id mismatch trade_no=%s local=%s event=%s", topUp.TradeNo, captureID, linkCaptureID)
	}

	in := model.PayPalSettlementInput{
		EventID:          strings.TrimSpace(event.Id),
		EventType:        model.PayPalSettlementRefunded,
		ResourceID:       refundID,
		TradeNo:          topUp.TradeNo,
		CaptureID:        captureID,
		Amount:           event.Resource.Amount.Value,
		Currency:         event.Resource.Amount.CurrencyCode,
		ExpectedCurrency: setting.PayPalCurrency,
	}
	if err := model.ApplyPayPalSettlement(in); err != nil {
		return fmt.Errorf("refund settlement failed trade_no=%s event_id=%s: %w", topUp.TradeNo, event.Id, err)
	}
	if ctx != nil {
		logger.LogInfo(ctx, fmt.Sprintf("PayPal 退款处理成功 trade_no=%s user_id=%d event_id=%s refund_id=%s", topUp.TradeNo, topUp.UserId, event.Id, refundID))
	}
	return nil
}

// handlePayPalReversal handles PAYMENT.CAPTURE.REVERSED webhook events by routing
// them through the atomic settlement ledger. The webhook Event ID and the Capture
// ID (resource.id) become the ledger identifiers. Reuse of P0-2A's identifier
// resolution and money validation keeps the fail-closed contract; the ledger
// applies the one-time deduction and idempotency under a row lock.
func handlePayPalReversal(ctx context.Context, event *PayPalWebhookEvent, rawPayload []byte, callerIp string) error {
	if event == nil {
		return fmt.Errorf("reversal event is nil")
	}
	resourceCaptureID := strings.TrimSpace(event.Resource.ID)
	relatedCaptureID := strings.TrimSpace(event.Resource.SupplementaryData.RelatedIDs.CaptureID)
	orderID := strings.TrimSpace(event.Resource.SupplementaryData.RelatedIDs.OrderID)
	tradeNo := strings.TrimSpace(event.Resource.InvoiceID)

	if resourceCaptureID == "" {
		return fmt.Errorf("reversal missing resource id (capture id) event_id=%s", event.Id)
	}

	topUp, err := findPayPalTopUpForRefund(
		paypalRefundIdentifier{resourceCaptureID, "resource_capture_id", captureIDLookup("resource_capture_id")},
		paypalRefundIdentifier{relatedCaptureID, "capture_id", captureIDLookup("capture_id")},
		paypalRefundIdentifier{orderID, "order_id", orderIDLookup("order_id")},
		paypalRefundIdentifier{tradeNo, "invoice_id", tradeNoLookup("invoice_id")},
	)
	if err != nil {
		return fmt.Errorf("reversal resolve order failed: %w", err)
	}

	if err := validatePayPalMoneyAgainstOrder(event.Resource.Amount.Value, event.Resource.Amount.CurrencyCode, topUp.Money); err != nil {
		return fmt.Errorf("reversal validation failed trade_no=%s: %w", topUp.TradeNo, err)
	}

	// The reversal resource.id is the capture id; it must match the order's
	// captured transaction id so the ledger binds the settlement correctly.
	captureID := strings.TrimSpace(topUp.TransactionId)
	if captureID == "" {
		return fmt.Errorf("reversal order has no captured transaction id trade_no=%s", topUp.TradeNo)
	}
	if resourceCaptureID != captureID {
		return fmt.Errorf("reversal capture id mismatch trade_no=%s local=%s event=%s", topUp.TradeNo, captureID, resourceCaptureID)
	}
	if relatedCaptureID != "" && relatedCaptureID != captureID {
		return fmt.Errorf("reversal related capture id mismatch trade_no=%s local=%s event=%s", topUp.TradeNo, captureID, relatedCaptureID)
	}

	in := model.PayPalSettlementInput{
		EventID:          strings.TrimSpace(event.Id),
		EventType:        model.PayPalSettlementReversed,
		ResourceID:       resourceCaptureID,
		TradeNo:          topUp.TradeNo,
		CaptureID:        captureID,
		Amount:           event.Resource.Amount.Value,
		Currency:         event.Resource.Amount.CurrencyCode,
		ExpectedCurrency: setting.PayPalCurrency,
	}
	if err := model.ApplyPayPalSettlement(in); err != nil {
		return fmt.Errorf("reversal settlement failed trade_no=%s event_id=%s: %w", topUp.TradeNo, event.Id, err)
	}
	if ctx != nil {
		logger.LogInfo(ctx, fmt.Sprintf("PayPal 撤销处理成功 trade_no=%s user_id=%d event_id=%s capture_id=%s", topUp.TradeNo, topUp.UserId, event.Id, resourceCaptureID))
	}
	return nil
}
