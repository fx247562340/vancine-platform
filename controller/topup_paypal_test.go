package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// validPayPalTopUpForTest returns a canonical local PayPal top-up record used
// across the validation regression tests. The stored PaymentId matches the
// remote ORDER001 and the TradeNo matches the remote reference id.
func validPayPalTopUpForTest() *model.TopUp {
	return &model.TopUp{
		Money:           9.99,
		TradeNo:         "trade-paypal-001",
		PaymentProvider: model.PaymentProviderPayPal,
		PaymentId:       "ORDER001",
		Status:          common.TopUpStatusPending,
	}
}

// validPayPalCaptureForTest returns a canonical completed PayPal capture whose
// amount/currency match validPayPalTopUpForTest under the default USD config.
func validPayPalCaptureForTest() paypalCapture {
	return paypalCapture{
		ID:     "CAPTURE001",
		Status: "COMPLETED",
		Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
	}
}

// withPayPalCurrencyForTest pins setting.PayPalCurrency for the duration of a
// test so validation results do not depend on global state mutated elsewhere.
func withPayPalCurrencyForTest(t *testing.T, currency string) {
	t.Helper()
	original := setting.PayPalCurrency
	t.Cleanup(func() { setting.PayPalCurrency = original })
	setting.PayPalCurrency = currency
}

func TestValidateCompletedPayPalCapture(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")

	testCases := []struct {
		name              string
		local             *model.TopUp
		remoteOrderID     string
		remoteReferenceID string
		capture           paypalCapture
		wantErr           bool
	}{
		{
			name:              "valid completed capture",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture:           validPayPalCaptureForTest(),
			wantErr:           false,
		},
		{
			name:              "missing capture id",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture: paypalCapture{
				ID:     "",
				Status: "COMPLETED",
				Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
			},
			wantErr: true,
		},
		{
			name:              "status other than completed",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture: paypalCapture{
				ID:     "CAPTURE001",
				Status: "PENDING",
				Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
			},
			wantErr: true,
		},
		{
			name:              "mismatched order id",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER999",
			remoteReferenceID: "trade-paypal-001",
			capture:           validPayPalCaptureForTest(),
			wantErr:           true,
		},
		{
			name:              "mismatched non-empty reference id",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-wrong",
			capture:           validPayPalCaptureForTest(),
			wantErr:           true,
		},
		{
			name:              "empty reference id is allowed",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "",
			capture:           validPayPalCaptureForTest(),
			wantErr:           false,
		},
		{
			name:              "amount 9.98 for local 9.99",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture: paypalCapture{
				ID:     "CAPTURE001",
				Status: "COMPLETED",
				Amount: paypalMoney{Value: "9.98", CurrencyCode: "USD"},
			},
			wantErr: true,
		},
		{
			name:              "currency EUR when configured currency is USD",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture: paypalCapture{
				ID:     "CAPTURE001",
				Status: "COMPLETED",
				Amount: paypalMoney{Value: "9.99", CurrencyCode: "EUR"},
			},
			wantErr: true,
		},
		{
			name:              "empty currency",
			local:             validPayPalTopUpForTest(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture: paypalCapture{
				ID:     "CAPTURE001",
				Status: "COMPLETED",
				Amount: paypalMoney{Value: "9.99", CurrencyCode: ""},
			},
			wantErr: true,
		},
		{
			name:              "nil local order",
			local:             nil,
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture:           validPayPalCaptureForTest(),
			wantErr:           true,
		},
		{
			name: "non-paypal provider",
			local: func() *model.TopUp {
				tu := validPayPalTopUpForTest()
				tu.PaymentProvider = model.PaymentProviderStripe
				return tu
			}(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture:           validPayPalCaptureForTest(),
			wantErr:           true,
		},
		{
			name: "empty stored payment id",
			local: func() *model.TopUp {
				tu := validPayPalTopUpForTest()
				tu.PaymentId = ""
				return tu
			}(),
			remoteOrderID:     "ORDER001",
			remoteReferenceID: "trade-paypal-001",
			capture:           validPayPalCaptureForTest(),
			wantErr:           true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateCompletedPayPalCapture(tc.local, tc.remoteOrderID, tc.remoteReferenceID, tc.capture)
			if tc.wantErr {
				require.Error(t, err, "expected validation error for %s", tc.name)
			} else {
				require.NoError(t, err, "expected no validation error for %s", tc.name)
			}
		})
	}
}

func TestExtractCompletedPayPalCapture(t *testing.T) {
	t.Run("exactly one purchase unit and one capture", func(t *testing.T) {
		order := paypalOrderDetail{
			ID:     "ORDER001",
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				{
					ReferenceID: "trade-paypal-001",
					Amount:      paypalMoney{Value: "9.99", CurrencyCode: "USD"},
					Payments: struct {
						Captures []paypalCapture `json:"captures"`
					}{
						Captures: []paypalCapture{validPayPalCaptureForTest()},
					},
				},
			},
		}
		unit, capture, err := extractCompletedPayPalCapture(order)
		require.NoError(t, err)
		assert.Equal(t, "trade-paypal-001", unit.ReferenceID)
		assert.Equal(t, "CAPTURE001", capture.ID)
		assert.Equal(t, "COMPLETED", capture.Status)
	})

	t.Run("zero purchase units is an error", func(t *testing.T) {
		order := paypalOrderDetail{
			ID:            "ORDER001",
			Status:        "COMPLETED",
			PurchaseUnits: nil,
		}
		_, _, err := extractCompletedPayPalCapture(order)
		require.Error(t, err)
	})

	t.Run("two purchase units is an error", func(t *testing.T) {
		order := paypalOrderDetail{
			ID:     "ORDER001",
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				{
					ReferenceID: "trade-paypal-001",
					Payments: struct {
						Captures []paypalCapture `json:"captures"`
					}{
						Captures: []paypalCapture{validPayPalCaptureForTest()},
					},
				},
				{
					ReferenceID: "trade-paypal-002",
					Payments: struct {
						Captures []paypalCapture `json:"captures"`
					}{
						Captures: []paypalCapture{validPayPalCaptureForTest()},
					},
				},
			},
		}
		_, _, err := extractCompletedPayPalCapture(order)
		require.Error(t, err)
	})

	t.Run("zero captures is an error", func(t *testing.T) {
		order := paypalOrderDetail{
			ID:     "ORDER001",
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				{
					ReferenceID: "trade-paypal-001",
					Payments: struct {
						Captures []paypalCapture `json:"captures"`
					}{
						Captures: nil,
					},
				},
			},
		}
		_, _, err := extractCompletedPayPalCapture(order)
		require.Error(t, err)
	})

	t.Run("two captures is an error", func(t *testing.T) {
		order := paypalOrderDetail{
			ID:     "ORDER001",
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				{
					ReferenceID: "trade-paypal-001",
					Payments: struct {
						Captures []paypalCapture `json:"captures"`
					}{
						Captures: []paypalCapture{
							validPayPalCaptureForTest(),
							{ID: "CAPTURE002", Status: "COMPLETED", Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"}},
						},
					},
				},
			},
		}
		_, _, err := extractCompletedPayPalCapture(order)
		require.Error(t, err)
	})
}

// setupPayPalTestServer stands up an httptest.Server that stands in for the
// PayPal API, points the package-level paypalAPIBase seam at it, and primes the
// OAuth2 token cache with a non-expired test token so no test ever reaches the
// real PayPal network. All overridden globals are restored via t.Cleanup.
func setupPayPalTestServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	origBase := paypalAPIBase
	origClient := paypalHTTPClient
	paypalAPIBase = func() string { return server.URL }
	paypalHTTPClient = &http.Client{}
	t.Cleanup(func() {
		paypalAPIBase = origBase
		paypalHTTPClient = origClient
	})

	tokenCache.mu.Lock()
	origToken := tokenCache.accessToken
	origExpires := tokenCache.expiresAt
	origMode := tokenCache.testMode
	tokenCache.accessToken = "paypal-test-token"
	tokenCache.expiresAt = time.Now().Add(time.Hour)
	tokenCache.testMode = setting.PayPalTestMode
	tokenCache.mu.Unlock()
	t.Cleanup(func() {
		tokenCache.mu.Lock()
		tokenCache.accessToken = origToken
		tokenCache.expiresAt = origExpires
		tokenCache.testMode = origMode
		tokenCache.mu.Unlock()
	})

	return server
}

// payPalApproveOrderResponse builds a minimal create-order response carrying an
// approve link, mirroring what PayPal returns from POST /v2/checkout/orders.
func payPalApproveOrderResponse(t *testing.T, orderID string) []byte {
	t.Helper()
	resp := map[string]interface{}{
		"id":     orderID,
		"status": "CREATED",
		"links": []map[string]string{
			{"href": "https://example.com/approve/" + orderID, "rel": "approve"},
		},
	}
	body, err := common.Marshal(resp)
	require.NoError(t, err)
	return body
}

// assertValidPayPalRequestID checks that a captured PayPal-Request-Id header is
// non-empty, within PayPal's 38-character cap, and equal to the deterministic
// digest produced by makePayPalRequestID(operation, tradeNo).
func assertValidPayPalRequestID(t *testing.T, got, operation, tradeNo string) {
	t.Helper()
	require.NotEmpty(t, got, "PayPal-Request-Id must not be empty")
	assert.LessOrEqual(t, len(got), 38, "PayPal-Request-Id must be <= 38 bytes")
	expected, err := makePayPalRequestID(operation, tradeNo)
	require.NoError(t, err)
	assert.Equal(t, expected, got, "PayPal-Request-Id must match the deterministic digest")
}

// writeOversizedPayPalError writes an error response with a body far larger than
// paypalErrorSummaryLimit so tests can prove the client never buffers or returns
// the full body.
func writeOversizedPayPalError(w http.ResponseWriter, status int) {
	w.WriteHeader(status)
	_, _ = w.Write([]byte(strings.Repeat("x", 100*1024)))
}

// assertPayPalErrorBounded asserts that an error returned from a PayPal client
// call carries only a bounded summary and never the full oversized body.
func assertPayPalErrorBounded(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	msg := err.Error()
	assert.LessOrEqual(t, len(msg), 1024, "error string must be bounded")
	assert.NotContains(t, msg, strings.Repeat("x", 300), "error must not include the oversized body")
}

func TestMakePayPalRequestID(t *testing.T) {
	tradeNo := "trade-paypal-001"

	createID, err := makePayPalRequestID("create", tradeNo)
	require.NoError(t, err)
	captureID, err := makePayPalRequestID("capture", tradeNo)
	require.NoError(t, err)

	t.Run("non-empty and within 38 bytes", func(t *testing.T) {
		assert.NotEmpty(t, createID)
		assert.NotEmpty(t, captureID)
		assert.LessOrEqual(t, len(createID), 38)
		assert.LessOrEqual(t, len(captureID), 38)
	})

	t.Run("stable for same operation and tradeNo", func(t *testing.T) {
		createID2, err := makePayPalRequestID("create", tradeNo)
		require.NoError(t, err)
		assert.Equal(t, createID, createID2)
		captureID2, err := makePayPalRequestID("capture", tradeNo)
		require.NoError(t, err)
		assert.Equal(t, captureID, captureID2)
	})

	t.Run("create and capture differ for same tradeNo", func(t *testing.T) {
		assert.NotEqual(t, createID, captureID)
	})

	t.Run("differs across trade numbers for the same operation", func(t *testing.T) {
		other, err := makePayPalRequestID("create", "trade-paypal-002")
		require.NoError(t, err)
		assert.NotEqual(t, createID, other)
	})

	t.Run("empty operation fails", func(t *testing.T) {
		_, err := makePayPalRequestID("", tradeNo)
		require.Error(t, err)
	})

	t.Run("empty tradeNo fails", func(t *testing.T) {
		_, err := makePayPalRequestID("create", "")
		require.Error(t, err)
	})
}

func TestGenPayPalOrder(t *testing.T) {
	tradeNo := "trade-paypal-001"

	t.Run("binds reference_id custom_id invoice_id and bounded PayPal-Request-Id", func(t *testing.T) {
		var capturedBody []byte
		var capturedHeaders http.Header
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			capturedBody, _ = io.ReadAll(r.Body)
			capturedHeaders = r.Header.Clone()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write(payPalApproveOrderResponse(t, "ORDER001"))
		})

		approveURL, orderID, err := genPayPalOrder(tradeNo, 9.99, "user@example.com")
		require.NoError(t, err)
		assert.Equal(t, "ORDER001", orderID)
		assert.Equal(t, "https://example.com/approve/ORDER001", approveURL)

		// Request id is the deterministic create digest, not the raw trade number.
		assertValidPayPalRequestID(t, capturedHeaders.Get("PayPal-Request-Id"), "create", tradeNo)
		assert.NotEqual(t, tradeNo, capturedHeaders.Get("PayPal-Request-Id"))

		var payload map[string]interface{}
		require.NoError(t, common.Unmarshal(capturedBody, &payload))
		units, ok := payload["purchase_units"].([]interface{})
		require.True(t, ok)
		require.Len(t, units, 1)
		unit, ok := units[0].(map[string]interface{})
		require.True(t, ok)
		// reference_id/custom_id/invoice_id still equal the raw local trade number.
		assert.Equal(t, tradeNo, unit["reference_id"])
		assert.Equal(t, tradeNo, unit["custom_id"])
		assert.Equal(t, tradeNo, unit["invoice_id"])
	})

	t.Run("accepts HTTP 200 and 201", func(t *testing.T) {
		for _, status := range []int{http.StatusOK, http.StatusCreated} {
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				_, _ = w.Write(payPalApproveOrderResponse(t, "ORDER001"))
			})
			_, _, err := genPayPalOrder(tradeNo, 9.99, "user@example.com")
			require.NoError(t, err, "status %d must be accepted", status)
		}
	})

	t.Run("other status codes are rejected", func(t *testing.T) {
		for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusInternalServerError} {
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":"bad"}`))
			})
			_, _, err := genPayPalOrder(tradeNo, 9.99, "user@example.com")
			require.Error(t, err, "status %d must be rejected", status)
		}
	})

	t.Run("oversized error response is bounded", func(t *testing.T) {
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			writeOversizedPayPalError(w, http.StatusBadRequest)
		})
		_, _, err := genPayPalOrder(tradeNo, 9.99, "user@example.com")
		assertPayPalErrorBounded(t, err)
	})

	// B04 P1-B04 PayPal cancel feedback: the create-order request body must
	// carry an explicit, stable cancel query parameter on cancel_url so the
	// wallet can render a localized cancel toast (distinct from error/pending/
	// show_history) and the return flow can reject the cancel without crediting.
	t.Run("cancel url carries explicit payment_cancel param and never reuses other payment status flags", func(t *testing.T) {
		// Pre-generate the response bytes in the main goroutine before the
		// handler starts; the mock only writes this pre-generated result and
		// records any read/write error through a mutex-guarded slot.
		approveBody := payPalApproveOrderResponse(t, "ORDER001")
		var capturedBody []byte
		var mockErr error
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				mockErr = err
				return
			}
			capturedBody = body
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			if _, err := w.Write(approveBody); err != nil {
				mockErr = err
			}
		})

		_, _, err := genPayPalOrder(tradeNo, 9.99, "user@example.com")
		require.NoError(t, err)
		require.NoError(t, mockErr, "the loopback PayPal mock must not have recorded an error")

		var payload map[string]interface{}
		require.NoError(t, common.Unmarshal(capturedBody, &payload))
		appCtx, ok := payload["application_context"].(map[string]interface{})
		require.True(t, ok, "application_context must be a map")

		cancelURL, ok := appCtx["cancel_url"].(string)
		require.True(t, ok, "cancel_url must be a string")
		require.NotEmpty(t, cancelURL, "cancel_url must not be empty")

		parsed, parseErr := url.Parse(cancelURL)
		require.NoError(t, parseErr, "cancel_url must be a parseable URL")
		q := parsed.Query()
		// Stable, explicit cancel flag must be present; PayPal reuses the
		// cancel_url query verbatim on the user redirect.
		assert.Equal(t, "true", q.Get("payment_cancel"),
			"cancel_url must carry an explicit payment_cancel=true query parameter so the wallet can render a cancel toast")

		// cancel must not piggy-back on the same keys used by error/pending/
		// show_history; doing so would route a cancel into the wrong feedback.
		for _, reserved := range []string{"payment_error", "payment_pending", "show_history"} {
			assert.Empty(t, q.Get(reserved),
				"cancel_url must not carry reserved payment status key %q", reserved)
		}

		// return_url still goes to the order return endpoint, never to the
		// cancel path: PayPal dispatches to one of the two, never both.
		returnURL, ok := appCtx["return_url"].(string)
		require.True(t, ok)
		assert.NotEqual(t, cancelURL, returnURL,
			"return_url and cancel_url must be distinct so PayPal cannot pick the cancel branch on success")
	})
}

func TestGetPayPalOrder(t *testing.T) {
	t.Run("200 returns parsed order detail", func(t *testing.T) {
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodGet, r.Method)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"id": "ORDER001",
				"status": "COMPLETED",
				"purchase_units": [{
					"reference_id": "trade-paypal-001",
					"custom_id": "trade-paypal-001",
					"invoice_id": "trade-paypal-001",
					"amount": {"value": "9.99", "currency_code": "USD"},
					"payments": {"captures": [{"id": "CAPTURE001", "status": "COMPLETED", "amount": {"value": "9.99", "currency_code": "USD"}}]}
				}]
			}`))
		})
		order, err := getPayPalOrder("ORDER001")
		require.NoError(t, err)
		assert.Equal(t, "ORDER001", order.ID)
		assert.Equal(t, "COMPLETED", order.Status)
		require.Len(t, order.PurchaseUnits, 1)
		assert.Equal(t, "trade-paypal-001", order.PurchaseUnits[0].ReferenceID)
		require.Len(t, order.PurchaseUnits[0].Payments.Captures, 1)
		assert.Equal(t, "CAPTURE001", order.PurchaseUnits[0].Payments.Captures[0].ID)
	})

	t.Run("only HTTP 200 is accepted", func(t *testing.T) {
		for _, status := range []int{http.StatusCreated, http.StatusAccepted, http.StatusNoContent, http.StatusBadRequest, http.StatusUnauthorized, http.StatusInternalServerError} {
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
			})
			_, err := getPayPalOrder("ORDER001")
			require.Error(t, err, "status %d must be rejected", status)
		}
	})

	t.Run("oversized error response is bounded", func(t *testing.T) {
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			writeOversizedPayPalError(w, http.StatusBadRequest)
		})
		_, err := getPayPalOrder("ORDER001")
		assertPayPalErrorBounded(t, err)
	})
}

func TestCapturePayPalOrder(t *testing.T) {
	tradeNo := "trade-paypal-001"

	t.Run("sends bounded capture PayPal-Request-Id and Prefer return=representation", func(t *testing.T) {
		var capturedHeaders http.Header
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			capturedHeaders = r.Header.Clone()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":"ORDER001","status":"COMPLETED","purchase_units":[{"reference_id":"trade-paypal-001","payments":{"captures":[{"id":"CAPTURE001","status":"COMPLETED","amount":{"value":"9.99","currency_code":"USD"}}]}}]}`))
		})
		order, err := capturePayPalOrder("ORDER001", tradeNo)
		require.NoError(t, err)
		assert.Equal(t, "ORDER001", order.ID)
		assert.Equal(t, "COMPLETED", order.Status)
		require.Len(t, order.PurchaseUnits, 1)
		require.Len(t, order.PurchaseUnits[0].Payments.Captures, 1)
		assert.Equal(t, "CAPTURE001", order.PurchaseUnits[0].Payments.Captures[0].ID)

		// Request id is the deterministic capture digest, not "capture-"+tradeNo.
		assertValidPayPalRequestID(t, capturedHeaders.Get("PayPal-Request-Id"), "capture", tradeNo)
		assert.NotEqual(t, "capture-"+tradeNo, capturedHeaders.Get("PayPal-Request-Id"))
		assert.Equal(t, "return=representation", capturedHeaders.Get("Prefer"))
	})

	t.Run("accepts HTTP 200 and 201", func(t *testing.T) {
		for _, status := range []int{http.StatusOK, http.StatusCreated} {
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"id":"ORDER001","status":"COMPLETED","purchase_units":[]}`))
			})
			_, err := capturePayPalOrder("ORDER001", tradeNo)
			require.NoError(t, err, "status %d must be accepted", status)
		}
	})

	t.Run("other status codes are rejected", func(t *testing.T) {
		for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusConflict, http.StatusInternalServerError} {
			setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":"bad"}`))
			})
			_, err := capturePayPalOrder("ORDER001", tradeNo)
			require.Error(t, err, "status %d must be rejected", status)
		}
	})

	t.Run("full representation is parsed into paypalOrderDetail", func(t *testing.T) {
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{
				"id": "ORDER001",
				"status": "COMPLETED",
				"purchase_units": [{
					"reference_id": "trade-paypal-001",
					"custom_id": "trade-paypal-001",
					"invoice_id": "trade-paypal-001",
					"amount": {"value": "9.99", "currency_code": "USD"},
					"payments": {"captures": [{"id": "CAPTURE001", "status": "COMPLETED", "amount": {"value": "9.99", "currency_code": "USD"}}]}
				}]
			}`))
		})
		order, err := capturePayPalOrder("ORDER001", tradeNo)
		require.NoError(t, err)
		require.Len(t, order.PurchaseUnits, 1)
		unit := order.PurchaseUnits[0]
		assert.Equal(t, "trade-paypal-001", unit.ReferenceID)
		assert.Equal(t, "trade-paypal-001", unit.CustomID)
		assert.Equal(t, "trade-paypal-001", unit.InvoiceID)
		assert.Equal(t, "9.99", unit.Amount.Value)
		require.Len(t, unit.Payments.Captures, 1)
		assert.Equal(t, "CAPTURE001", unit.Payments.Captures[0].ID)
		assert.Equal(t, "COMPLETED", unit.Payments.Captures[0].Status)
		assert.Equal(t, "USD", unit.Payments.Captures[0].Amount.CurrencyCode)
	})

	t.Run("oversized error response is bounded", func(t *testing.T) {
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			writeOversizedPayPalError(w, http.StatusBadRequest)
		})
		_, err := capturePayPalOrder("ORDER001", tradeNo)
		assertPayPalErrorBounded(t, err)
	})
}

// --- HandlePayPalReturn fixtures ---

// setupPayPalReturnTestDB initializes an isolated in-memory SQLite database for
// controller tests that exercise the PayPal return flow through model.DB. It
// migrates only the tables the return path touches (users, top_ups, logs) and
// restores the global DB/driver flags on cleanup.
func setupPayPalReturnTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	origDB := model.DB
	origLogDB := model.LOG_DB
	origMainDBType := common.MainDatabaseType()
	origLogDBType := common.LogDatabaseType()
	origRedisEnabled := common.RedisEnabled
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB = db
	model.LOG_DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}, &model.PayPalSettlementEvent{}))
	t.Cleanup(func() {
		// Restore the global pointers BEFORE closing the test database so any
		// code running after this cleanup sees the original handles, and so the
		// original database is never closed by this helper.
		model.DB = origDB
		model.LOG_DB = origLogDB
		common.SetDatabaseTypes(origMainDBType, origLogDBType)
		common.RedisEnabled = origRedisEnabled
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

// TestSetupPayPalReturnTestDBRestoresGlobals proves the helper restores
// model.DB and model.LOG_DB to their pre-helper values once the owning test
// (and its t.Cleanup) completes. The inner subtest swaps in an in-memory DB;
// after it returns, the outer assertions verify the globals were restored
// rather than left pointing at the now-closed test database.
func TestSetupPayPalReturnTestDBRestoresGlobals(t *testing.T) {
	origDB := model.DB
	origLogDB := model.LOG_DB

	t.Run("uses isolated db", func(t *testing.T) {
		db := setupPayPalReturnTestDB(t)
		require.NotNil(t, db)
		require.Same(t, db, model.DB)
		require.Same(t, db, model.LOG_DB)
	})

	require.Same(t, origDB, model.DB, "model.DB must be restored after cleanup")
	require.Same(t, origLogDB, model.LOG_DB, "model.LOG_DB must be restored after cleanup")
}

func insertPayPalReturnUser(t *testing.T, id int, quota int) {
	t.Helper()
	user := &model.User{
		Id:       id,
		Username: fmt.Sprintf("return_user_%d", id),
		Status:   common.UserStatusEnabled,
		Quota:    quota,
		AffCode:  fmt.Sprintf("aff%d", id),
	}
	require.NoError(t, model.DB.Create(user).Error)
}

func insertPayPalReturnPendingOrder(t *testing.T, userID int, paymentID, tradeNo string, money float64) *model.TopUp {
	t.Helper()
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           money,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodPayPal,
		PaymentProvider: model.PaymentProviderPayPal,
		PaymentId:       paymentID,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

// insertPayPalReturnPendingOrderWithNullTransactionID inserts a pending PayPal
// top-up with transaction_id set to SQL NULL. The production model keeps a
// uniqueIndex on transaction_id, so under SQLite two empty-string rows would
// collide; multiple NULLs are allowed. Used by tests that need more than one
// pending order in the same database.
func insertPayPalReturnPendingOrderWithNullTransactionID(t *testing.T, userID int, paymentID, tradeNo string, money float64) *model.TopUp {
	t.Helper()
	row := map[string]interface{}{
		"user_id":          userID,
		"amount":           2,
		"money":            money,
		"trade_no":         tradeNo,
		"payment_method":   model.PaymentMethodPayPal,
		"payment_provider": model.PaymentProviderPayPal,
		"payment_id":       paymentID,
		"transaction_id":   nil,
		"create_time":      time.Now().Unix(),
		"complete_time":    0,
		"status":           common.TopUpStatusPending,
	}
	require.NoError(t, model.DB.Model(&model.TopUp{}).Create(row).Error)
	var topUp model.TopUp
	require.NoError(t, model.DB.Where("trade_no = ?", tradeNo).First(&topUp).Error)
	return &topUp
}

func getPayPalReturnUserQuota(t *testing.T, userID int) int {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func getPayPalReturnTopUp(t *testing.T, tradeNo string) *model.TopUp {
	t.Helper()
	var topUp model.TopUp
	require.NoError(t, model.DB.Where("trade_no = ?", tradeNo).First(&topUp).Error)
	return &topUp
}

// invokePayPalReturn drives HandlePayPalReturn with the given return token and
// returns the redirect Location header.
func invokePayPalReturn(t *testing.T, token string) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/api/paypal/return?token="+url.QueryEscape(token), nil)
	HandlePayPalReturn(c)
	return w.Result().Header.Get("Location")
}

// payPalOrderJSONForTest marshals an order detail for use as a mock response body.
func payPalOrderJSONForTest(t *testing.T, order paypalOrderDetail) []byte {
	t.Helper()
	body, err := common.Marshal(order)
	require.NoError(t, err)
	return body
}

// payPalUnitForTest builds a purchase unit with the given capture list. The
// unit amount and capture amount are set independently so mismatch cases can
// construct valid-shape but inconsistent orders.
func payPalUnitForTest(referenceID, unitAmount, unitCurrency string, captures ...paypalCapture) paypalPurchaseUnit {
	return paypalPurchaseUnit{
		ReferenceID: referenceID,
		CustomID:    referenceID,
		InvoiceID:   referenceID,
		Amount:      paypalMoney{Value: unitAmount, CurrencyCode: unitCurrency},
		Payments: struct {
			Captures []paypalCapture `json:"captures"`
		}{Captures: captures},
	}
}

// servePayPalOrder returns an httptest handler that replies with a single order
// body for every request, regardless of method/path.
func servePayPalOrder(t *testing.T, status int, order paypalOrderDetail) http.HandlerFunc {
	t.Helper()
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(payPalOrderJSONForTest(t, order))
	}
}

func TestHandlePayPalReturn(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	const (
		userID    = 40
		paymentID = "ORDER001"
		tradeNo   = "trade-return-001"
	)

	// newCheckoutFlow serves APPROVED on GET and COMPLETED-on-capture on POST so
	// the happy path exercises both getPayPalOrder and capturePayPalOrder.
	newCheckoutFlow := func(t *testing.T, captureID, amount, currency string) http.HandlerFunc {
		t.Helper()
		approved := paypalOrderDetail{
			ID:     paymentID,
			Status: "APPROVED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, amount, currency),
			},
		}
		completed := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, amount, currency, paypalCapture{
					ID: captureID, Status: "COMPLETED",
					Amount: paypalMoney{Value: amount, CurrencyCode: currency},
				}),
			},
		}
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			if r.Method == http.MethodPost {
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write(payPalOrderJSONForTest(t, completed))
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(payPalOrderJSONForTest(t, approved))
		}
	}

	t.Run("no local order makes no PayPal call", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		called := false
		setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		})
		location := invokePayPalReturn(t, "UNKNOWN-ORDER")
		require.False(t, called, "must not call PayPal when no local order matches the return token")
		assert.Contains(t, location, "payment_error=true")
	})

	t.Run("PayPal order id mismatch with stored PaymentId does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		// PayPal returns an order whose id differs from the stored PaymentId.
		mismatched := paypalOrderDetail{
			ID:     "ORDER999",
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "USD", paypalCapture{
					ID: "CAPTURE001", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, mismatched))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusPending, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("zero captures does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "USD"),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("two captures does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		cap := paypalCapture{ID: "CAPTURE001", Status: "COMPLETED", Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"}}
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "USD", cap, cap),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("non-completed capture does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "USD", paypalCapture{
					ID: "CAPTURE001", Status: "PENDING",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("amount mismatch does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.98", "USD", paypalCapture{
					ID: "CAPTURE001", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.98", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("currency mismatch does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "EUR", paypalCapture{
					ID: "CAPTURE001", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "EUR"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("completed order with empty reference_id remains pending and does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		// Full COMPLETED order with a valid capture but an empty reference_id.
		// Order creation always writes reference_id = tradeNo, so an empty value
		// must be rejected even though the shared validator tolerates emptiness
		// for the direct-capture webhook path.
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest("", "9.99", "USD", paypalCapture{
					ID: "CAPTURE001", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		topUp := getPayPalReturnTopUp(t, tradeNo)
		assert.Equal(t, common.TopUpStatusPending, topUp.Status)
		assert.Equal(t, "", topUp.GetTransactionId())
	})

	t.Run("completed order with mismatched reference_id does not credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest("trade-return-other", "9.99", "USD", paypalCapture{
					ID: "CAPTURE001", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusPending, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("non-terminal PayPal status redirects pending", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		order := paypalOrderDetail{ID: paymentID, Status: "PAYER_ACTION_REQUIRED"}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, order))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_pending=true")
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("valid order credits once and stores capture id", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		setupPayPalTestServer(t, newCheckoutFlow(t, "CAPTURE001", "9.99", "USD"))

		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "show_history=true")

		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		topUp := getPayPalReturnTopUp(t, tradeNo)
		assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		assert.Equal(t, "CAPTURE001", topUp.GetTransactionId())
	})

	t.Run("duplicate return does not double credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		setupPayPalTestServer(t, newCheckoutFlow(t, "CAPTURE001", "9.99", "USD"))

		first := invokePayPalReturn(t, paymentID)
		assert.Contains(t, first, "show_history=true")
		second := invokePayPalReturn(t, paymentID)
		assert.Contains(t, second, "show_history=true")

		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID),
			"quota must increase exactly once across duplicate returns")
		assert.Equal(t, "CAPTURE001", getPayPalReturnTopUp(t, tradeNo).GetTransactionId())
	})

	t.Run("RechargePayPal real failure is not reported as success", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		// Credit the order with CAPTURE001 so it is already success.
		require.NoError(t, model.RechargePayPal(tradeNo, "", "", "127.0.0.1", "CAPTURE001"))
		require.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
		firstQuota := getPayPalReturnUserQuota(t, userID)

		// Return brings a DIFFERENT completed capture: validation passes but
		// RechargePayPal must reject the capture swap with a real error rather
		// than redirecting to show_history.
		swappedOrder := paypalOrderDetail{
			ID:     paymentID,
			Status: "COMPLETED",
			PurchaseUnits: []paypalPurchaseUnit{
				payPalUnitForTest(tradeNo, "9.99", "USD", paypalCapture{
					ID: "CAPTURE002", Status: "COMPLETED",
					Amount: paypalMoney{Value: "9.99", CurrencyCode: "USD"},
				}),
			},
		}
		setupPayPalTestServer(t, servePayPalOrder(t, http.StatusOK, swappedOrder))
		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "payment_error=true")
		assert.NotContains(t, location, "show_history=true")
		assert.Equal(t, firstQuota, getPayPalReturnUserQuota(t, userID), "swapped capture must not credit")
		assert.Equal(t, "CAPTURE001", getPayPalReturnTopUp(t, tradeNo).GetTransactionId(), "stored capture id must not change")
	})

	t.Run("already-disabled gateway still settles an existing pending order", func(t *testing.T) {
		// An order created while PayPal was enabled must still settle after an
		// admin disables new checkout. The gate blocks creation, not settlement.
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		setPayPalConfigForTest(t, false, true, true)
		setupPayPalTestServer(t, newCheckoutFlow(t, "CAPTURE001", "9.99", "USD"))

		location := invokePayPalReturn(t, paymentID)
		assert.Contains(t, location, "show_history=true")
		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})
}

// --- Webhook fixtures ---

// directCaptureEvent builds a PAYMENT.CAPTURE.COMPLETED event using the official
// direct-capture resource shape: the capture id/status/amount live directly on
// resource, and the PayPal Order id is carried in supplementary_data.related_ids.
func directCaptureEvent(orderID, captureID, status, amount, currency string) PayPalWebhookEvent {
	return PayPalWebhookEvent{
		EventType: "PAYMENT.CAPTURE.COMPLETED",
		Resource: paypalWebhookResource{
			ID:     captureID,
			Status: status,
			Amount: paypalMoney{Value: amount, CurrencyCode: currency},
			SupplementaryData: paypalWebhookSupplementaryData{
				RelatedIDs: paypalWebhookRelatedIDs{OrderID: orderID},
			},
		},
	}
}

// approvedOrderEvent builds a CHECKOUT.ORDER.APPROVED event whose resource.id is
// the PayPal Order id.
func approvedOrderEvent(orderID string) PayPalWebhookEvent {
	return PayPalWebhookEvent{
		EventType: "CHECKOUT.ORDER.APPROVED",
		Resource:  paypalWebhookResource{ID: orderID, Status: "APPROVED"},
	}
}

// servePayPalApprovedFlow serves an APPROVED order on GET and a COMPLETED order
// (with one capture) on POST, so the APPROVED webhook path exercises both
// getPayPalOrder and capturePayPalOrder through the test seam.
func servePayPalApprovedFlow(t *testing.T, orderID, tradeNo, captureID, amount, currency string) http.HandlerFunc {
	t.Helper()
	approved := paypalOrderDetail{
		ID:            orderID,
		Status:        "APPROVED",
		PurchaseUnits: []paypalPurchaseUnit{payPalUnitForTest(tradeNo, amount, currency)},
	}
	completed := paypalOrderDetail{
		ID:     orderID,
		Status: "COMPLETED",
		PurchaseUnits: []paypalPurchaseUnit{payPalUnitForTest(tradeNo, amount, currency, paypalCapture{
			ID: captureID, Status: "COMPLETED",
			Amount: paypalMoney{Value: amount, CurrencyCode: currency},
		})},
	}
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write(payPalOrderJSONForTest(t, completed))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(payPalOrderJSONForTest(t, approved))
	}
}

// sentinelPayPalServer returns an httptest server that fails the test if any
// PayPal API call reaches it, plus primes the token cache. Used to prove the
// direct-capture path makes no outbound PayPal request.
func sentinelPayPalServer(t *testing.T) {
	t.Helper()
	setupPayPalTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("PayPal must not be called: %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
}

// setPayPalSignatureVerifierForTest replaces the signature verifier seam with a
// stub returning the given result. It returns a pointer to a call flag so tests
// can assert whether verification was invoked.
func setPayPalSignatureVerifierForTest(t *testing.T, result bool) *bool {
	t.Helper()
	orig := paypalSignatureVerifier
	called := false
	paypalSignatureVerifier = func(payload []byte, headers map[string]string) bool {
		called = true
		return result
	}
	t.Cleanup(func() { paypalSignatureVerifier = orig })
	return &called
}

// enablePayPalWebhookForTest turns on the PayPal webhook gate (compliance +
// enabled + credentials + webhook id) for the duration of the test.
func enablePayPalWebhookForTest(t *testing.T) {
	t.Helper()
	setPayPalConfigForTest(t, true, true, true)
	origWebhookID := setting.PayPalWebhookId
	t.Cleanup(func() { setting.PayPalWebhookId = origWebhookID })
	setting.PayPalWebhookId = "test-webhook-id"
}

// invokePayPalWebhook drives PayPalWebhook with the given body and headers and
// returns the recorded HTTP status code.
func invokePayPalWebhook(t *testing.T, body []byte, headers map[string]string) int {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/api/paypal/webhook", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		c.Request.Header.Set(k, v)
	}
	PayPalWebhook(c)
	return w.Code
}

func TestHandlePayPalCapture(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	const (
		userID    = 50
		paymentID = "ORDER001"
		tradeNo   = "trade-capture-001"
	)

	t.Run("direct capture credits once and stores capture id", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		sentinelPayPalServer(t)

		event := directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))

		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		topUp := getPayPalReturnTopUp(t, tradeNo)
		assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		assert.Equal(t, "CAPTURE001", topUp.GetTransactionId())
	})

	t.Run("duplicate direct capture is idempotent", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		sentinelPayPalServer(t)

		event := directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))

		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID),
			"quota must increase exactly once across duplicate deliveries")
		assert.Equal(t, "CAPTURE001", getPayPalReturnTopUp(t, tradeNo).GetTransactionId())
	})

	t.Run("direct capture makes no PayPal network request", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		sentinelPayPalServer(t)

		event := directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))
	})

	cases := []struct {
		name  string
		event PayPalWebhookEvent
	}{
		{"missing related order id", directCaptureEvent("", "CAPTURE001", "COMPLETED", "9.99", "USD")},
		{"unknown local order id", directCaptureEvent("ORDER999", "CAPTURE001", "COMPLETED", "9.99", "USD")},
		{"empty capture id", directCaptureEvent(paymentID, "", "COMPLETED", "9.99", "USD")},
		{"non-completed status", directCaptureEvent(paymentID, "CAPTURE001", "PENDING", "9.99", "USD")},
		{"amount mismatch", directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.98", "USD")},
		{"currency mismatch", directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "EUR")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setupPayPalReturnTestDB(t)
			insertPayPalReturnUser(t, userID, 0)
			insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
			sentinelPayPalServer(t)

			err := handlePayPalCapture(nil, &tc.event, nil, "127.0.0.1")
			require.Error(t, err)
			assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
			topUp := getPayPalReturnTopUp(t, tradeNo)
			assert.Equal(t, common.TopUpStatusPending, topUp.Status)
			assert.Equal(t, "", topUp.GetTransactionId())
		})
	}

	t.Run("capture id used by another order is rejected", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrderWithNullTransactionID(t, userID, "ORDER-A", "trade-a", 9.99)
		insertPayPalReturnPendingOrderWithNullTransactionID(t, userID, "ORDER-B", "trade-b", 9.99)
		sentinelPayPalServer(t)

		// Credit order A with CAPTURE001.
		firstEvent := directCaptureEvent("ORDER-A", "CAPTURE001", "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalCapture(nil, &firstEvent, nil, "127.0.0.1"))

		// Order B attempts to reuse CAPTURE001: must fail without crediting.
		secondEvent := directCaptureEvent("ORDER-B", "CAPTURE001", "COMPLETED", "9.99", "USD")
		require.Error(t, handlePayPalCapture(nil, &secondEvent, nil, "127.0.0.1"))
		assert.Equal(t, common.TopUpStatusPending, getPayPalReturnTopUp(t, "trade-b").Status)
	})

	t.Run("approved order binds by resource id then captures and credits", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		setupPayPalTestServer(t, servePayPalApprovedFlow(t, paymentID, tradeNo, "CAPTURE001", "9.99", "USD"))

		event := approvedOrderEvent(paymentID)
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))

		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		topUp := getPayPalReturnTopUp(t, tradeNo)
		assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
		assert.Equal(t, "CAPTURE001", topUp.GetTransactionId())
	})

	t.Run("approved order duplicate delivery is idempotent", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		setupPayPalTestServer(t, servePayPalApprovedFlow(t, paymentID, tradeNo, "CAPTURE001", "9.99", "USD"))

		event := approvedOrderEvent(paymentID)
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))
		require.NoError(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))
		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("approved order with no local order makes no PayPal call and errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		sentinelPayPalServer(t)

		event := approvedOrderEvent("UNKNOWN-ORDER")
		require.Error(t, handlePayPalCapture(nil, &event, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})
}

func TestPayPalWebhook(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	const (
		userID    = 51
		paymentID = "ORDER001"
		tradeNo   = "trade-webhook-001"
	)

	webhookHeaders := map[string]string{
		paypalSignatureHeader:          "t-id",
		paypalSignatureSigHeader:       "sig",
		paypalSignatureCertUrlHeader:   "https://example.com/cert",
		paypalSignatureTimestampHeader: "2026-07-18T00:00:00Z",
		"paypal-auth-algo":             "SHA256withRSA",
	}

	// webhookWithPendingOrder stands up an enabled webhook, a sentinel PayPal
	// server (direct capture must not call PayPal), signature seam=true, and a
	// pending local order. Returns the marshalled event body.
	webhookWithPendingOrder := func(t *testing.T, event PayPalWebhookEvent) []byte {
		t.Helper()
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		sentinelPayPalServer(t)
		insertPayPalReturnUser(t, userID, 0)
		insertPayPalReturnPendingOrder(t, userID, paymentID, tradeNo, 9.99)
		body, err := common.Marshal(event)
		require.NoError(t, err)
		return body
	}

	t.Run("valid capture returns 200 and credits", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		body := webhookWithPendingOrder(t, directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("duplicate capture returns 200 without double credit", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		body := webhookWithPendingOrder(t, directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("unknown ignored event type returns 200", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		body, err := common.Marshal(PayPalWebhookEvent{EventType: "PAYMENT.AUTHORIZATION.CREATED"})
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
	})

	t.Run("recognized event that fails returns 500", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		sentinelPayPalServer(t)
		// Missing related order id -> handlePayPalCapture returns error -> 500.
		body, err := common.Marshal(directCaptureEvent("", "CAPTURE001", "COMPLETED", "9.99", "USD"))
		require.NoError(t, err)
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body, webhookHeaders))
	})

	t.Run("signature failure returns 403", func(t *testing.T) {
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, false)
		body, _ := common.Marshal(directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusForbidden, invokePayPalWebhook(t, body, webhookHeaders))
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		require.Equal(t, http.StatusBadRequest, invokePayPalWebhook(t, []byte("{not json"), webhookHeaders))
	})

	t.Run("body over 1 MiB returns 413 without verifying signature", func(t *testing.T) {
		enablePayPalWebhookForTest(t)
		called := setPayPalSignatureVerifierForTest(t, true)
		big := []byte(strings.Repeat("x", (1<<20)+1))
		require.Equal(t, http.StatusRequestEntityTooLarge, invokePayPalWebhook(t, big, webhookHeaders))
		require.False(t, *called, "signature verifier must not be called when body exceeds the limit")
	})

	t.Run("invalid event does not change quota or status", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		body := webhookWithPendingOrder(t, directCaptureEvent(paymentID, "CAPTURE001", "COMPLETED", "9.98", "USD"))
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		topUp := getPayPalReturnTopUp(t, tradeNo)
		assert.Equal(t, common.TopUpStatusPending, topUp.Status)
		assert.Equal(t, "", topUp.GetTransactionId())
	})

	t.Run("valid refund returns 200", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, "CAPTURE001", 9.99)
		body, err := common.Marshal(refundEvent("REFUND001", "CAPTURE001", paymentID, "COMPLETED", "9.99", "USD"))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("duplicate refund returns 200 without double deduct", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, "CAPTURE001", 9.99)
		body, _ := common.Marshal(refundEvent("REFUND001", "CAPTURE001", paymentID, "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("partial refund returns 500 without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, "CAPTURE001", 9.99)
		body, _ := common.Marshal(refundEvent("REFUND001", "CAPTURE001", paymentID, "COMPLETED", "5.00", "USD"))
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body, webhookHeaders))
		expectedQuota := int64(9.99 * common.QuotaPerUnit)
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("valid reversal returns 200", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, "CAPTURE001", 9.99)
		body, _ := common.Marshal(reversalEvent("CAPTURE001", paymentID, "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("refund with conflicting ids returns 500", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-A", "trade-a", "CAPTURE-A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-B", "trade-b", "CAPTURE-B", 9.99)
		body, _ := common.Marshal(refundEventWithUpLink("REFUND001", "CAPTURE-A", "CAPTURE-B", "", "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-a").Status)
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-b").Status)
	})

	t.Run("reversal with conflicting resource and related capture returns 500", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-A", "trade-a", "CAPTURE-A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-B", "trade-b", "CAPTURE-B", 9.99)
		body, _ := common.Marshal(reversalEventFull("CAPTURE-A", "CAPTURE-B", "", "9.99", "USD"))
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body, webhookHeaders))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-a").Status)
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-b").Status)
	})
}

// --- Refund / Reversal fixtures ---

// refundEvent builds a PAYMENT.CAPTURE.REFUNDED event. resource.id is the refund
// id; the parent capture id and order id are carried in supplementary_data. The
// Event ID defaults to a deterministic value derived from the refund id so
// replays of the same event share an Event ID (settlement idempotency); tests
// that need a distinct Event ID override ev.Id after building.
func refundEvent(refundID, captureID, orderID, status, amount, currency string) PayPalWebhookEvent {
	return PayPalWebhookEvent{
		Id:        "EVT-REFUND-" + refundID,
		EventType: "PAYMENT.CAPTURE.REFUNDED",
		Resource: paypalWebhookResource{
			ID:     refundID,
			Status: status,
			Amount: paypalMoney{Value: amount, CurrencyCode: currency},
			SupplementaryData: paypalWebhookSupplementaryData{
				RelatedIDs: paypalWebhookRelatedIDs{CaptureID: captureID, OrderID: orderID},
			},
		},
	}
}

// reversalEvent builds a PAYMENT.CAPTURE.REVERSED event. resource.id is the
// capture id being reversed. The Event ID defaults to a deterministic value
// derived from the capture id.
func reversalEvent(captureID, orderID, amount, currency string) PayPalWebhookEvent {
	return PayPalWebhookEvent{
		Id:        "EVT-REVERSE-" + captureID,
		EventType: "PAYMENT.CAPTURE.REVERSED",
		Resource: paypalWebhookResource{
			ID:     captureID,
			Amount: paypalMoney{Value: amount, CurrencyCode: currency},
			SupplementaryData: paypalWebhookSupplementaryData{
				RelatedIDs: paypalWebhookRelatedIDs{CaptureID: captureID, OrderID: orderID},
			},
		},
	}
}

// insertCreditedPayPalOrderForTest inserts a pending PayPal order with NULL
// transaction_id then credits it with the given capture id, leaving a success
// order with the capture id stored and quota granted.
func insertCreditedPayPalOrderForTest(t *testing.T, userID int, paymentID, tradeNo, captureID string, money float64) *model.TopUp {
	t.Helper()
	insertPayPalReturnPendingOrderWithNullTransactionID(t, userID, paymentID, tradeNo, money)
	require.NoError(t, model.RechargePayPal(tradeNo, "", "", "127.0.0.1", captureID))
	return getPayPalReturnTopUp(t, tradeNo)
}

// refundEventWithUpLink builds a REFUNDED event that carries both a
// related_ids.capture_id and a rel="up" link capture id, so conflict handling
// between the two can be exercised. Either may be empty to omit that identifier.
func refundEventWithUpLink(refundID, relatedCaptureID, upLinkCaptureID, orderID, status, amount, currency string) PayPalWebhookEvent {
	ev := refundEvent(refundID, relatedCaptureID, orderID, status, amount, currency)
	if upLinkCaptureID != "" {
		ev.Resource.Links = []paypalWebhookLink{
			{Href: "https://api.paypal.com/v2/payments/captures/" + upLinkCaptureID, Rel: "up"},
		}
	}
	return ev
}

// reversalEventFull builds a REVERSED event with resource.id and
// related_ids.capture_id set independently so conflict handling between the two
// can be exercised. Either may be empty to omit that identifier.
func reversalEventFull(resourceCaptureID, relatedCaptureID, orderID, amount, currency string) PayPalWebhookEvent {
	return PayPalWebhookEvent{
		EventType: "PAYMENT.CAPTURE.REVERSED",
		Resource: paypalWebhookResource{
			ID:     resourceCaptureID,
			Amount: paypalMoney{Value: amount, CurrencyCode: currency},
			SupplementaryData: paypalWebhookSupplementaryData{
				RelatedIDs: paypalWebhookRelatedIDs{CaptureID: relatedCaptureID, OrderID: orderID},
			},
		},
	}
}

// handlePayPalRefundErr runs handlePayPalRefund with a value event and returns
// the error, so table-driven cases stay concise.
func handlePayPalRefundErr(t *testing.T, ev PayPalWebhookEvent) error {
	t.Helper()
	return handlePayPalRefund(nil, &ev, nil, "127.0.0.1")
}

// handlePayPalReversalErr runs handlePayPalReversal with a value event.
func handlePayPalReversalErr(t *testing.T, ev PayPalWebhookEvent) error {
	t.Helper()
	return handlePayPalReversal(nil, &ev, nil, "127.0.0.1")
}

func TestHandlePayPalRefund(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	const (
		userID    = 60
		paymentID = "ORDER001"
		tradeNo   = "trade-refund-001"
		captureID = "CAPTURE001"
	)
	expectedQuota := int64(9.99 * common.QuotaPerUnit)

	t.Run("valid full refund deducts once and marks refunded", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))

		ev := refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("duplicate valid full refund is idempotent", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		require.NoError(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	cases := []struct {
		name  string
		event PayPalWebhookEvent
	}{
		{"partial amount", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "5.00", "USD")},
		{"zero amount", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "0.00", "USD")},
		{"over amount", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "20.00", "USD")},
		{"invalid amount", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "not-a-number", "USD")},
		{"empty currency", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "")},
		{"wrong currency", refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "EUR")},
		{"non-completed status", refundEvent("REFUND001", captureID, paymentID, "PENDING", "9.99", "USD")},
		{"missing identifiers", refundEvent("REFUND001", "", "", "COMPLETED", "9.99", "USD")},
		{"unknown capture id", refundEvent("REFUND001", "CAPTURE-UNKNOWN", "", "COMPLETED", "9.99", "USD")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setupPayPalReturnTestDB(t)
			insertPayPalReturnUser(t, userID, 0)
			insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)

			err := handlePayPalRefund(nil, &tc.event, nil, "127.0.0.1")
			require.Error(t, err)
			// Quota, status, and transaction id unchanged.
			assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
			topUp := getPayPalReturnTopUp(t, tradeNo)
			assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
			assert.Equal(t, captureID, topUp.GetTransactionId())
		})
	}

	t.Run("conflicting ids resolve to different orders and error", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-A", "trade-a", "CAPTURE-A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-B", "trade-b", "CAPTURE-B", 9.99)
		// capture_id -> order A, order_id -> order B: conflict.
		ev := refundEvent("REFUND001", "CAPTURE-A", "ORDER-B", "COMPLETED", "9.99", "USD")
		require.Error(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-a").Status)
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-b").Status)
	})

	t.Run("non-paypal order is rejected", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		// Insert a success Stripe order carrying the same capture id.
		row := map[string]interface{}{
			"user_id":          userID,
			"amount":           2,
			"money":            9.99,
			"trade_no":         "trade-stripe",
			"payment_method":   model.PaymentMethodStripe,
			"payment_provider": model.PaymentProviderStripe,
			"payment_id":       "STRIPE-CHARGE",
			"transaction_id":   captureID,
			"create_time":      time.Now().Unix(),
			"status":           common.TopUpStatusSuccess,
		}
		require.NoError(t, model.DB.Model(&model.TopUp{}).Create(row).Error)

		ev := refundEvent("REFUND001", captureID, "", "COMPLETED", "9.99", "USD")
		require.Error(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		var stripe model.TopUp
		require.NoError(t, model.DB.Where("trade_no = ?", "trade-stripe").First(&stripe).Error)
		assert.Equal(t, common.TopUpStatusSuccess, stripe.Status)
	})

	// --- strict identifier containment (fail-closed) ---

	t.Run("unknown capture id with valid order id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalRefundErr(t, refundEvent("REFUND001", "CAPTURE-UNKNOWN", paymentID, "COMPLETED", "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("valid capture id with unknown order id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalRefundErr(t, refundEvent("REFUND001", captureID, "ORDER-UNKNOWN", "COMPLETED", "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("valid capture and order with unknown invoice id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")
		ev.Resource.InvoiceID = "trade-unknown"
		require.Error(t, handlePayPalRefundErr(t, ev))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("related capture and rel=up capture conflict errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-A", "trade-a", "CAPTURE-A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-B", "trade-b", "CAPTURE-B", 9.99)
		require.Error(t, handlePayPalRefundErr(t, refundEventWithUpLink("REFUND001", "CAPTURE-A", "CAPTURE-B", "", "COMPLETED", "9.99", "USD")))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-a").Status)
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-b").Status)
	})

	t.Run("order only fallback succeeds", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.NoError(t, handlePayPalRefundErr(t, refundEvent("REFUND001", "", paymentID, "COMPLETED", "9.99", "USD")))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("capture only fallback succeeds", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.NoError(t, handlePayPalRefundErr(t, refundEvent("REFUND001", captureID, "", "COMPLETED", "9.99", "USD")))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("already refunded with wrong amount errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.NoError(t, handlePayPalRefundErr(t, refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")))
		require.Error(t, handlePayPalRefundErr(t, refundEvent("REFUND002", captureID, paymentID, "COMPLETED", "5.00", "USD")))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("already refunded with wrong currency errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.NoError(t, handlePayPalRefundErr(t, refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")))
		require.Error(t, handlePayPalRefundErr(t, refundEvent("REFUND002", captureID, paymentID, "COMPLETED", "9.99", "EUR")))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})
}

func TestHandlePayPalReversed(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	const (
		userID    = 61
		paymentID = "ORDER001"
		tradeNo   = "trade-reverse-001"
		captureID = "CAPTURE001"
	)
	expectedQuota := int64(9.99 * common.QuotaPerUnit)

	t.Run("valid reversal deducts once and marks refunded", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)

		ev := reversalEvent(captureID, paymentID, "9.99", "USD")
		require.NoError(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("duplicate reversal is idempotent", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := reversalEvent(captureID, paymentID, "9.99", "USD")
		require.NoError(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		require.NoError(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	t.Run("reversal with wrong amount errors without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := reversalEvent(captureID, paymentID, "5.00", "USD")
		require.Error(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("reversal with wrong currency errors without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := reversalEvent(captureID, paymentID, "9.99", "EUR")
		require.Error(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("reversal unknown capture id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := reversalEvent("CAPTURE-UNKNOWN", "", "9.99", "USD")
		require.Error(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("refund then reversal does not double deduct", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		ev = reversalEvent(captureID, paymentID, "9.99", "USD")
		require.NoError(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("reversal then refund does not double deduct", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		ev := reversalEvent(captureID, paymentID, "9.99", "USD")
		require.NoError(t, handlePayPalReversal(nil, &ev, nil, "127.0.0.1"))
		ev = refundEvent("REFUND001", captureID, paymentID, "COMPLETED", "9.99", "USD")
		require.NoError(t, handlePayPalRefund(nil, &ev, nil, "127.0.0.1"))
		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
	})

	// --- strict identifier containment (fail-closed) ---

	t.Run("resource capture and related capture conflict errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-A", "trade-a", "CAPTURE-A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER-B", "trade-b", "CAPTURE-B", 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull("CAPTURE-A", "CAPTURE-B", "", "9.99", "USD")))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-a").Status)
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-b").Status)
	})

	t.Run("valid resource capture with unknown related capture errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull(captureID, "CAPTURE-UNKNOWN", "", "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("unknown resource capture with valid order id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull("CAPTURE-UNKNOWN", "", paymentID, "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("valid capture with unknown order id errors", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull(captureID, "", "ORDER-UNKNOWN", "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("reversal without resource capture id fails closed", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		// REVERSED resource.id is the capture id and the ledger Resource ID; an
		// event carrying only an order id cannot form a valid settlement and
		// must fail closed without deducting or changing status.
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull("", "", paymentID, "9.99", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("invalid amount errors without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull(captureID, "", paymentID, "5.00", "USD")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, tradeNo).Status)
	})

	t.Run("empty currency errors without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull(captureID, "", paymentID, "9.99", "")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})

	t.Run("wrong currency errors without deducting", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
		require.Error(t, handlePayPalReversalErr(t, reversalEventFull(captureID, "", paymentID, "9.99", "EUR")))
		assert.Equal(t, int(expectedQuota), getPayPalReturnUserQuota(t, userID))
	})
}

// TestPayPalSourceHasNoDirectJSONOrHeaderSecrets is a static source guard: it
// reads topup_paypal.go and asserts there are no direct encoding/json
// Marshal/Unmarshal/NewDecoder calls (json.RawMessage as a type is allowed) and
// no PayPal signature/header value placeholders (sig/transmission_id/cert_url/
// timestamp) leak into log formats.
func TestPayPalSourceHasNoDirectJSONOrHeaderSecrets(t *testing.T) {
	src, err := os.ReadFile("topup_paypal.go")
	require.NoError(t, err)
	source := string(src)

	// No direct encoding/json marshal/unmarshal/decoder calls. RawMessage as a
	// type is still permitted.
	assert.NotContains(t, source, "json.Marshal(", "must use common.Marshal")
	assert.NotContains(t, source, "json.Unmarshal(", "must use common.Unmarshal")
	assert.NotContains(t, source, "json.NewDecoder(", "must use common.DecodeJson")

	// No PayPal signature/header value placeholders in log formats.
	for _, bad := range []string{"sig=%", "transmission_id=%", "cert_url=%", "timestamp=%"} {
		assert.NotContains(t, source, bad, "log format must not expose header value: %s", bad)
	}
}

// --- Task 7 final cleanup tests ---

func TestValidatePayPalMoneyAgainstOrder(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")

	t.Run("valid amount and currency pass", func(t *testing.T) {
		require.NoError(t, validatePayPalMoneyAgainstOrder("9.99", "USD", 9.99))
	})

	t.Run("zero amount on zero local money still fails", func(t *testing.T) {
		// Without an explicit <=0 guard, 0.00 would equal a 0.00 local amount
		// and be accepted. It must be rejected.
		require.Error(t, validatePayPalMoneyAgainstOrder("0.00", "USD", 0))
	})

	t.Run("negative amount fails even when equal to a negative local money", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("-5.00", "USD", -5))
	})

	t.Run("zero amount fails against normal local money", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("0.00", "USD", 9.99))
	})

	t.Run("negative amount fails against normal local money", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("-1.00", "USD", 9.99))
	})

	t.Run("amount mismatch still fails", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("9.98", "USD", 9.99))
	})

	t.Run("wrong currency still fails", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("9.99", "EUR", 9.99))
	})

	t.Run("empty currency still fails", func(t *testing.T) {
		require.Error(t, validatePayPalMoneyAgainstOrder("9.99", "", 9.99))
	})
}

// setupPayPalTokenTest points the PayPal API seams at an httptest server and
// clears the OAuth2 token cache so getPayPalToken issues a real request to the
// mock. All seams and the cache are restored on cleanup.
func setupPayPalTokenTest(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	origBase := paypalAPIBase
	origClient := paypalHTTPClient
	paypalAPIBase = func() string { return server.URL }
	paypalHTTPClient = &http.Client{}
	t.Cleanup(func() {
		paypalAPIBase = origBase
		paypalHTTPClient = origClient
	})

	tokenCache.mu.Lock()
	origToken := tokenCache.accessToken
	origExpires := tokenCache.expiresAt
	origMode := tokenCache.testMode
	tokenCache.accessToken = ""
	tokenCache.expiresAt = time.Time{}
	tokenCache.testMode = setting.PayPalTestMode
	tokenCache.mu.Unlock()
	t.Cleanup(func() {
		tokenCache.mu.Lock()
		tokenCache.accessToken = origToken
		tokenCache.expiresAt = origExpires
		tokenCache.testMode = origMode
		tokenCache.mu.Unlock()
	})

	return server
}

func TestGetPayPalToken(t *testing.T) {
	t.Run("200 parses and caches token", func(t *testing.T) {
		setupPayPalTokenTest(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, http.MethodPost, r.Method)
			require.True(t, strings.HasSuffix(r.URL.Path, "/v1/oauth2/token"))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"access_token":"mock-token","expires_in":3600,"token_type":"Bearer"}`))
		})
		token, err := getPayPalToken()
		require.NoError(t, err)
		assert.Equal(t, "mock-token", token)

		// A second call must hit the cache, not the network: swap only the API
		// base to a server that fails the test if hit, leaving the cache intact.
		failServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Errorf("cached token must not trigger a network call")
		}))
		t.Cleanup(failServer.Close)
		origBase := paypalAPIBase
		paypalAPIBase = func() string { return failServer.URL }
		defer func() { paypalAPIBase = origBase }()
		cached, err := getPayPalToken()
		require.NoError(t, err)
		assert.Equal(t, "mock-token", cached)
	})

	t.Run("non-200 is rejected", func(t *testing.T) {
		setupPayPalTokenTest(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_client"}`))
		})
		_, err := getPayPalToken()
		require.Error(t, err)
	})

	t.Run("oversized error response is bounded", func(t *testing.T) {
		setupPayPalTokenTest(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(strings.Repeat("x", 100*1024)))
		})
		_, err := getPayPalToken()
		assertPayPalErrorBounded(t, err)
	})

	t.Run("restores token cache and seams after test", func(t *testing.T) {
		origBase := paypalAPIBase
		origClient := paypalHTTPClient
		tokenCache.mu.RLock()
		origToken := tokenCache.accessToken
		tokenCache.mu.RUnlock()

		// Inner subtest swaps the seams/cache; when it completes its t.Cleanup
		// restores them, so the outer assertions verify restoration.
		t.Run("inner", func(t *testing.T) {
			setupPayPalTokenTest(t, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{"access_token":"mock-token-2","expires_in":3600}`))
			})
			_, _ = getPayPalToken()
		})

		assert.Equal(t, origBase(), paypalAPIBase(), "paypalAPIBase seam must be restored")
		require.Same(t, origClient, paypalHTTPClient, "paypalHTTPClient seam must be restored")
		tokenCache.mu.RLock()
		restoredToken := tokenCache.accessToken
		tokenCache.mu.RUnlock()
		assert.Equal(t, origToken, restoredToken, "token cache must be restored")
	})
}

// --- P0-2B1 settlement ledger webhook integration ---

// settlementLedgerCount returns the number of settlement ledger rows bound to a
// top-up, so webhook integration tests can assert idempotency at the DB layer.
func settlementLedgerCount(t *testing.T, topUpID int) int64 {
	t.Helper()
	count, err := model.CountPayPalSettlementEventsForOrder(topUpID)
	require.NoError(t, err)
	return count
}

// webhookRefundBody stands up an enabled webhook + signature seam + credited
// order and returns the marshalled refund event body.
func webhookRefundBody(t *testing.T, ev PayPalWebhookEvent, userID int, paymentID, tradeNo, captureID string) []byte {
	t.Helper()
	enablePayPalWebhookForTest(t)
	setPayPalSignatureVerifierForTest(t, true)
	insertPayPalReturnUser(t, userID, 0)
	insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)
	body, err := common.Marshal(ev)
	require.NoError(t, err)
	return body
}

func TestPayPalSettlementWebhookIntegration(t *testing.T) {
	withPayPalCurrencyForTest(t, "USD")
	webhookHeaders := map[string]string{
		paypalSignatureHeader:          "t-id",
		paypalSignatureSigHeader:       "sig",
		paypalSignatureCertUrlHeader:   "https://example.com/cert",
		paypalSignatureTimestampHeader: "2026-07-18T00:00:00Z",
		"paypal-auth-algo":             "SHA256withRSA",
	}

	t.Run("refund event id replay is idempotent at webhook layer", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		const userID, paymentID, tradeNo, captureID = 90, "ORDER90", "trade-set-wh-001", "CAP90"
		ev := refundEvent("REFUND90", captureID, paymentID, "COMPLETED", "9.99", "USD")
		body := webhookRefundBody(t, ev, userID, paymentID, tradeNo, captureID)

		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))

		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
		assert.EqualValues(t, 1, settlementLedgerCount(t, getPayPalReturnTopUp(t, tradeNo).Id))
	})

	t.Run("refund resource key replay with different event id is idempotent", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		const userID, paymentID, tradeNo, captureID = 91, "ORDER91", "trade-set-wh-002", "CAP91"
		first := refundEvent("REFUND91", captureID, paymentID, "COMPLETED", "9.99", "USD")
		body := webhookRefundBody(t, first, userID, paymentID, tradeNo, captureID)
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))

		// Same refund id (resource key), different Event ID, identical content.
		second := refundEvent("REFUND91", captureID, paymentID, "COMPLETED", "9.99", "USD")
		second.Id = "EVT-REFUND-91-REPLAY"
		body2, err := common.Marshal(second)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body2, webhookHeaders))

		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.EqualValues(t, 1, settlementLedgerCount(t, getPayPalReturnTopUp(t, tradeNo).Id))
	})

	t.Run("refund event id reused across orders returns 500", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		const userID = 92
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER92A", "trade-92a", "CAP92A", 9.99)
		insertCreditedPayPalOrderForTest(t, userID, "ORDER92B", "trade-92b", "CAP92B", 9.99)

		first := refundEvent("REFUND92A", "CAP92A", "ORDER92A", "COMPLETED", "9.99", "USD")
		first.Id = "EVT-SHARED-WH"
		body, _ := common.Marshal(first)
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders))

		// Same Event ID pointed at a different order -> hard conflict -> 500.
		second := refundEvent("REFUND92B", "CAP92B", "ORDER92B", "COMPLETED", "9.99", "USD")
		second.Id = "EVT-SHARED-WH"
		body2, _ := common.Marshal(second)
		require.Equal(t, http.StatusInternalServerError, invokePayPalWebhook(t, body2, webhookHeaders))

		// Order B untouched.
		assert.Equal(t, common.TopUpStatusSuccess, getPayPalReturnTopUp(t, "trade-92b").Status)
		assert.EqualValues(t, 0, settlementLedgerCount(t, getPayPalReturnTopUp(t, "trade-92b").Id))
	})

	t.Run("refund then reversal both recorded deduct once", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		const userID, paymentID, tradeNo, captureID = 93, "ORDER93", "trade-set-wh-003", "CAP93"
		enablePayPalWebhookForTest(t)
		setPayPalSignatureVerifierForTest(t, true)
		insertPayPalReturnUser(t, userID, 0)
		insertCreditedPayPalOrderForTest(t, userID, paymentID, tradeNo, captureID, 9.99)

		refundBody, _ := common.Marshal(refundEvent("REFUND93", captureID, paymentID, "COMPLETED", "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, refundBody, webhookHeaders))
		reversalBody, _ := common.Marshal(reversalEvent(captureID, paymentID, "9.99", "USD"))
		require.Equal(t, http.StatusOK, invokePayPalWebhook(t, reversalBody, webhookHeaders))

		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID))
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
		assert.EqualValues(t, 2, settlementLedgerCount(t, getPayPalReturnTopUp(t, tradeNo).Id))
	})

	t.Run("repeated duplicate webhook refund deliveries deduct once", func(t *testing.T) {
		setupPayPalReturnTestDB(t)
		const userID, paymentID, tradeNo, captureID = 94, "ORDER94", "trade-set-wh-004", "CAP94"
		ev := refundEvent("REFUND94", captureID, paymentID, "COMPLETED", "9.99", "USD")
		body := webhookRefundBody(t, ev, userID, paymentID, tradeNo, captureID)

		// Concurrent idempotency of the settlement core is proven at the model
		// layer under -race (TestApplyPayPalSettlement_ConcurrentSameEventDeductsOnce).
		// Here we prove the webhook layer deduplicates repeated same-event
		// deliveries: every delivery returns 200, but quota is deducted exactly
		// once and exactly one ledger row survives.
		for i := 0; i < 8; i++ {
			require.Equal(t, http.StatusOK, invokePayPalWebhook(t, body, webhookHeaders),
				"delivery %d must be accepted", i)
		}

		assert.Equal(t, 0, getPayPalReturnUserQuota(t, userID), "quota must be deducted exactly once")
		assert.Equal(t, common.TopUpStatusRefunded, getPayPalReturnTopUp(t, tradeNo).Status)
		assert.EqualValues(t, 1, settlementLedgerCount(t, getPayPalReturnTopUp(t, tradeNo).Id))
	})
}

// --- CP1 P1-B08 Real handler tests for paypal_min_topup ---
//
// The B08 spec requires the *real* RequestPayPalAmount and RequestPayPalPay
// handlers to be exercised against real authenticated users, the real
// PayPal checkout gate (compliance + enabled + credentials), and a
// loopback PayPal mock. Pseudo coverage that copies the production
// comparison (`amount >= getPayPalMinTopup()`) is removed; the gate is
// observed through the production handler's response envelope, the
// downstream DB rows, and the wire hits.

// paypalAmountRouter wires the real UserAuth middleware in front of the
// real RequestPayPalAmount handler.
func paypalAmountRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/user/paypal/amount", middleware.UserAuth(), RequestPayPalAmount)
	return r
}

// paypalPayRouter wires the real UserAuth middleware in front of the real
// RequestPayPalPay handler.
func paypalPayRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/user/paypal/pay", middleware.UserAuth(), RequestPayPalPay)
	return r
}

// callPayPalRequestAmount drives the real RequestPayPalAmount handler
// through UserAuth with a real user token and returns the decoded envelope.
// Any failure to satisfy the production gate surfaces as an HTTP error
// envelope with the real minimum embedded in the message.
func callPayPalRequestAmount(t *testing.T, token string, amount int64) (int, map[string]interface{}) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/user/paypal/amount",
		strings.NewReader(fmt.Sprintf(`{"amount":%d,"payment_method":"paypal"}`, amount)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	paypalAmountRouter().ServeHTTP(rec, req)
	var envelope map[string]interface{}
	if rec.Code == http.StatusOK {
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &envelope))
	}
	return rec.Code, envelope
}

// paypalMockHitCounters records the upstream call counts the loopback
// PayPal mock observed, plus any handler error (ordinary error, asserted by
// the main goroutine). Mutated only from the mock goroutine; read from the
// main goroutine after the client response has been observed.
type paypalMockHitCounters struct {
	create  int64
	get     int64
	capture int64
	err     error
}

// setupPayPalMinTopupLoopbackMock stands up a loopback httptest PayPal
// server, primes the OAuth2 token cache so genPayPalOrder does not hit
// /v1/oauth2/token, and rewires the package-level seams. Counts are
// captured via atomic counters; no testing.T is referenced from the mock,
// and any read/write error is recorded into the counters.err slot.
func setupPayPalMinTopupLoopbackMock(t *testing.T) (*httptest.Server, *paypalMockHitCounters) {
	t.Helper()

	counters := &paypalMockHitCounters{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodPost:
			if strings.HasSuffix(r.URL.Path, "/v2/checkout/orders") {
				atomic.AddInt64(&counters.create, 1)
				w.WriteHeader(http.StatusCreated)
				if _, err := w.Write([]byte(`{
					"id":"ORDER-MIN-001",
					"status":"CREATED",
					"links":[{"href":"https://loopback/approve/ORDER-MIN-001","rel":"approve"}]
				}`)); err != nil {
					counters.err = err
				}
				return
			}
			if strings.Contains(r.URL.Path, "/capture") {
				atomic.AddInt64(&counters.capture, 1)
				w.WriteHeader(http.StatusCreated)
				if _, err := w.Write([]byte(`{"id":"ORDER-MIN-001","status":"COMPLETED"}`)); err != nil {
					counters.err = err
				}
				return
			}
		case http.MethodGet:
			if strings.Contains(r.URL.Path, "/v2/checkout/orders/") {
				atomic.AddInt64(&counters.get, 1)
				w.WriteHeader(http.StatusOK)
				if _, err := w.Write([]byte(`{"id":"ORDER-MIN-001","status":"APPROVED"}`)); err != nil {
					counters.err = err
				}
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(upstream.Close)

	origBase := paypalAPIBase
	origClient := paypalHTTPClient
	paypalAPIBase = func() string { return upstream.URL }
	paypalHTTPClient = &http.Client{Timeout: 5 * time.Second}
	t.Cleanup(func() {
		paypalAPIBase = origBase
		paypalHTTPClient = origClient
	})

	tokenCache.mu.Lock()
	origToken := tokenCache.accessToken
	origExpires := tokenCache.expiresAt
	origTestMode := tokenCache.testMode
	tokenCache.accessToken = "b08-paypal-test-token"
	tokenCache.expiresAt = time.Now().Add(time.Hour)
	tokenCache.testMode = setting.PayPalTestMode
	tokenCache.mu.Unlock()
	t.Cleanup(func() {
		tokenCache.mu.Lock()
		tokenCache.accessToken = origToken
		tokenCache.expiresAt = origExpires
		tokenCache.testMode = origTestMode
		tokenCache.mu.Unlock()
	})

	return upstream, counters
}

// TestRequestPayPalAmountRealHandlerMinTopupBoundary drives the real
// RequestPayPalAmount handler against a real authenticated user with the
// PayPal checkout gate switched on, on both SQLite and PostgreSQL fixtures.
// It observes the response envelope at every boundary the B08 spec calls out.
func TestRequestPayPalAmountRealHandlerMinTopupBoundary(t *testing.T) {
	p10RunAcrossDatabases(t, "boundary", b08AmountBoundaryBody)
}

func b08AmountBoundaryBody(t *testing.T, dbType common.DatabaseType) {
	setupPayPalCancelDB(t, dbType)
	withPayPalMinTopup(t, 10)
	_, token := seedPayPalCancelUser(t, "b08-amt-user", 1000)

	t.Run("amount 9 is rejected with real error envelope containing the configured minimum", func(t *testing.T) {
		code, envelope := callPayPalRequestAmount(t, token, 9)
		require.Equal(t, http.StatusOK, code)
		// RequestPayPalAmount rejects with message="error", data=<reason>.
		assert.Equal(t, "error", envelope["message"])
		data, ok := envelope["data"].(string)
		require.True(t, ok, "rejection data must be a string, got %T", envelope["data"])
		assert.Contains(t, data, "10",
			"the rejection message must reference the configured minimum (10)")
	})

	t.Run("amount 10 at the boundary is accepted with success envelope and correct amount", func(t *testing.T) {
		code, envelope := callPayPalRequestAmount(t, token, 10)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, "success", envelope["message"],
			"amount=10 with the configured minimum must succeed, body=%v", envelope)
		data, ok := envelope["data"].(string)
		require.True(t, ok, "success data must be a formatted-money string")
		assert.Equal(t, "10.00", data,
			"amount=10 with default group ratio=1 must yield 10.00")
	})

	t.Run("amount 25 well above the minimum is accepted with correct amount", func(t *testing.T) {
		code, envelope := callPayPalRequestAmount(t, token, 25)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, "success", envelope["message"],
			"amount=25 with the configured minimum must succeed, body=%v", envelope)
		data, ok := envelope["data"].(string)
		require.True(t, ok, "success data must be a formatted-money string")
		assert.Equal(t, "25.00", data,
			"amount=25 with default group ratio=1 must yield 25.00")
	})
}

// TestRequestPayPalPayRealHandlerMinTopupRejection exercises the real
// RequestPayPalPay handler with a real authenticated user, on both SQLite
// and PostgreSQL fixtures. Below-min amounts must reject, make no PayPal
// call, and create no TopUp row. The production handler returns
// message=<reason-string> (NOT literal "error") on rejection, with data=10
// for legacy clients.
func TestRequestPayPalPayRealHandlerMinTopupRejection(t *testing.T) {
	p10RunAcrossDatabases(t, "rejection", b08PayRejectionBody)
}

func b08PayRejectionBody(t *testing.T, dbType common.DatabaseType) {
	setupPayPalCancelDB(t, dbType)
	withPayPalMinTopup(t, 10)
	_, counters := setupPayPalMinTopupLoopbackMock(t)
	_, token := seedPayPalCancelUser(t, "b08-pay-reject-user", 1000)

	t.Run("below-min amount rejects without calling PayPal or creating a row", func(t *testing.T) {
		var rowsBefore int64
		require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&rowsBefore).Error)

		atomic.StoreInt64(&counters.create, 0)
		atomic.StoreInt64(&counters.get, 0)
		atomic.StoreInt64(&counters.capture, 0)

		req := httptest.NewRequest(http.MethodPost, "/api/user/paypal/pay",
			strings.NewReader(`{"amount":9,"payment_method":"paypal"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		paypalPayRouter().ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)
		var envelope map[string]interface{}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &envelope))
		// RequestPayPalPay rejection shape: message is the formatted reason.
		message, ok := envelope["message"].(string)
		require.True(t, ok, "message must be a string, got %T", envelope["message"])
		assert.Contains(t, message, "10",
			"the rejection message must reference the configured minimum (10)")

		assert.Equal(t, int64(0), atomic.LoadInt64(&counters.create),
			"below-min amount must not reach PayPal create-order")
		assert.Equal(t, int64(0), atomic.LoadInt64(&counters.get),
			"below-min amount must not reach PayPal order-detail GET")
		assert.Equal(t, int64(0), atomic.LoadInt64(&counters.capture),
			"below-min amount must not reach PayPal capture")

		var rowsAfter int64
		require.NoError(t, model.DB.Model(&model.TopUp{}).Count(&rowsAfter).Error)
		assert.Equal(t, rowsBefore, rowsAfter,
			"no TopUp row must be created for an amount below the configured minimum")

		require.NoError(t, counters.err, "the loopback PayPal mock must not have recorded an error")
	})
}

// TestRequestPayPalPayRealHandlerMinTopupSuccess exercises the real
// RequestPayPalPay handler with a real authenticated user, on both SQLite
// and PostgreSQL fixtures. At-min amount must reach the wire exactly once,
// create exactly one pending TopUp row, return a real pay_link from the
// loopback mock, and leave the user quota untouched.
func TestRequestPayPalPayRealHandlerMinTopupSuccess(t *testing.T) {
	p10RunAcrossDatabases(t, "success", b08PaySuccessBody)
}

func b08PaySuccessBody(t *testing.T, dbType common.DatabaseType) {
	setupPayPalCancelDB(t, dbType)
	withPayPalMinTopup(t, 10)
	_, counters := setupPayPalMinTopupLoopbackMock(t)

	const startQuota = 5000
	user, token := seedPayPalCancelUser(t, "b08-pay-success-user", startQuota)

	atomic.StoreInt64(&counters.create, 0)
	atomic.StoreInt64(&counters.get, 0)
	atomic.StoreInt64(&counters.capture, 0)

	req := httptest.NewRequest(http.MethodPost, "/api/user/paypal/pay",
		strings.NewReader(`{"amount":10,"payment_method":"paypal"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	paypalPayRouter().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var envelope struct {
		Message string                 `json:"message"`
		Data    map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "success", envelope.Message)
	payLink, ok := envelope.Data["pay_link"].(string)
	require.True(t, ok, "data.pay_link must be a string")
	assert.Contains(t, payLink, "loopback",
		"pay_link must come from the loopback PayPal mock")

	assert.Equal(t, int64(1), atomic.LoadInt64(&counters.create),
		"successful order creation must hit PayPal create-order exactly once")
	assert.Equal(t, int64(0), atomic.LoadInt64(&counters.capture),
		"creation must not trigger a capture (capture only happens in HandlePayPalReturn / webhook)")
	assert.Equal(t, int64(0), atomic.LoadInt64(&counters.get))

	var topUps []model.TopUp
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&topUps).Error)
	require.Len(t, topUps, 1, "exactly one TopUp row must be created")
	assert.Equal(t, common.TopUpStatusPending, topUps[0].Status)
	assert.Equal(t, "ORDER-MIN-001", topUps[0].PaymentId)
	assert.Empty(t, topUps[0].GetTransactionId(), "creation must not record a capture id")

	assert.Equal(t, startQuota, getPayPalReturnUserQuota(t, user.Id),
		"order creation must not credit the user quota")

	var consumeCount int64
	require.NoError(t, model.DB.Model(&model.Log{}).
		Where("user_id = ? AND type = ?", user.Id, model.LogTypeConsume).
		Count(&consumeCount).Error)
	assert.Equal(t, int64(0), consumeCount,
		"order creation must not produce a consume log entry")

	require.NoError(t, counters.err, "the loopback PayPal mock must not have recorded an error")
}

// --- B04 P1-B04 Real order creation evidence (cancel path) —

// setupPayPalCancelDB initializes the P10 database-run fixture (real
// model.InitDB / model.InitLogDB chain, so reserved-word columns are set)
// and enables the PayPal checkout gate. It migrates the tables the real
// top-up / cancel flow touches.
func setupPayPalCancelDB(t *testing.T, dbType common.DatabaseType) {
	t.Helper()

	p10SetupDatabase(t, dbType,
		&model.User{}, &model.TopUp{}, &model.Log{},
		&model.PayPalSettlementEvent{}, &model.UserSession{},
	)

	prevCryptoSecret := common.CryptoSecret
	prevGroupRatio := common.TopupGroupRatio2JSONString()
	prevPayPalEnabled := setting.PayPalEnabled
	prevPayPalTestMode := setting.PayPalTestMode
	prevPayPalClientID := setting.PayPalClientId
	prevPayPalClientSecret := setting.PayPalClientSecret
	prevPayPalSandboxClientID := setting.PayPalSandboxClientId
	prevPayPalSandboxClientSecret := setting.PayPalSandboxClientSecret
	prevCompliance := operation_setting.GetPaymentSetting().ComplianceConfirmed
	prevComplianceVer := operation_setting.GetPaymentSetting().ComplianceTermsVersion

	common.CryptoSecret = "b04-cancel-secret"
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1}`))

	// PayPal checkout gate must be on or the handler short-circuits before
	// genPayPalOrder.
	setting.PayPalTestMode = false
	setting.PayPalEnabled = true
	setting.PayPalClientId = "test-client-id"
	setting.PayPalClientSecret = "test-client-secret"
	setting.PayPalSandboxClientId = ""
	setting.PayPalSandboxClientSecret = ""
	paySetting := operation_setting.GetPaymentSetting()
	paySetting.ComplianceConfirmed = true
	paySetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	t.Cleanup(func() {
		common.CryptoSecret = prevCryptoSecret
		setting.PayPalEnabled = prevPayPalEnabled
		setting.PayPalTestMode = prevPayPalTestMode
		setting.PayPalClientId = prevPayPalClientID
		setting.PayPalClientSecret = prevPayPalClientSecret
		setting.PayPalSandboxClientId = prevPayPalSandboxClientID
		setting.PayPalSandboxClientSecret = prevPayPalSandboxClientSecret
		_ = common.UpdateTopupGroupRatioByJSONString(prevGroupRatio)
		operation_setting.GetPaymentSetting().ComplianceConfirmed = prevCompliance
		operation_setting.GetPaymentSetting().ComplianceTermsVersion = prevComplianceVer
	})
}

// seedPayPalCancelUser inserts a real enabled user with a real opaque
// access token that the UserAuth middleware will recognize.
func seedPayPalCancelUser(t *testing.T, username string, quota int) (*model.User, string) {
	t.Helper()
	token := common.GetRandomString(32)
	user := &model.User{
		Username:    username,
		Password:    "ignored-hash",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AffCode:     username,
		AuthVersion: 1,
		Quota:       quota,
		AccessToken: &token,
	}
	require.NoError(t, model.DB.Create(user).Error)
	return user, token
}

// payPalCancelRouter wires the real UserAuth middleware in front of the real
// RequestPayPalPay handler so the slice exercises production auth +
// production handler + loopback PayPal mock.
func payPalCancelRouter() *gin.Engine {
	r := gin.New()
	r.POST("/api/user/paypal/pay", middleware.UserAuth(), RequestPayPalPay)
	return r
}

// TestPayPalCancelRealOrderCreationAndCancelContract drives a real
// authenticated RequestPayPalPay through a loopback PayPal mock and proves:
//
//   - the PayPal order request body carries cancel_url with explicit
//     payment_cancel=true and never reuses payment_error/payment_pending/show_history
//   - the local TopUp row is inserted as pending and quota is unchanged
//   - the cancel "path" never reaches capture, settlement, or success:
//     the sentinel PayPal server records zero GET (no order detail fetch)
//     and zero POST /capture calls, and the local TopUp row remains in
//     pending status with quota unchanged for as long as the test waits
//
// Handler discipline: the PayPal mock and the upstream closure do NOT call
// testing.T / require / assert. Errors and hit counts are recorded through
// atomic counters and read by the main goroutine after the client
// response has been observed.
func TestPayPalCancelRealOrderCreationAndCancelContract(t *testing.T) {
	p10RunAcrossDatabases(t, "cancel", b04CancelBody)
}

func b04CancelBody(t *testing.T, dbType common.DatabaseType) {
	setupPayPalCancelDB(t, dbType)
	withPayPalCurrencyForTest(t, "USD")
	withPayPalMinTopup(t, 10)

	const startQuota = 100000
	user, token := seedPayPalCancelUser(t, "b04-cancel-user", startQuota)

	// Capture both the order request body and a hit counter. The mock
	// MUST NOT call testing.T; it only mutates atomics and shared state, and
	// records any read/unmarshal/write error into a mutex-guarded slot that
	// the main goroutine asserts after the client response.
	var mu sync.Mutex
	var capturedCancelURL string
	var capturedPayPalRequestID string
	var createHits int64
	var getOrderHits int64
	var captureHits int64
	var mockErr error

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			mu.Lock()
			mockErr = err
			mu.Unlock()
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodPost:
			if strings.HasSuffix(r.URL.Path, "/v2/checkout/orders") {
				atomic.AddInt64(&createHits, 1)
				mu.Lock()
				capturedPayPalRequestID = r.Header.Get("PayPal-Request-Id")
				var payload map[string]interface{}
				if err := common.Unmarshal(body, &payload); err != nil {
					mockErr = err
				}
				if appCtx, ok := payload["application_context"].(map[string]interface{}); ok {
					if cancelURL, ok := appCtx["cancel_url"].(string); ok {
						capturedCancelURL = cancelURL
					}
				}
				mu.Unlock()
				w.WriteHeader(http.StatusCreated)
				if _, err := w.Write([]byte(`{
					"id":"ORDER-CANCEL-001",
					"status":"CREATED",
					"links":[{"href":"https://loopback/approve/ORDER-CANCEL-001","rel":"approve"}]
				}`)); err != nil {
					mu.Lock()
					mockErr = err
					mu.Unlock()
				}
				return
			}
			if strings.Contains(r.URL.Path, "/capture") {
				atomic.AddInt64(&captureHits, 1)
				w.WriteHeader(http.StatusCreated)
				if _, err := w.Write([]byte(`{"id":"ORDER-CANCEL-001","status":"COMPLETED"}`)); err != nil {
					mu.Lock()
					mockErr = err
					mu.Unlock()
				}
				return
			}
		case http.MethodGet:
			if strings.Contains(r.URL.Path, "/v2/checkout/orders/") {
				atomic.AddInt64(&getOrderHits, 1)
				w.WriteHeader(http.StatusOK)
				if _, err := w.Write([]byte(`{"id":"ORDER-CANCEL-001","status":"CREATED"}`)); err != nil {
					mu.Lock()
					mockErr = err
					mu.Unlock()
				}
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(upstream.Close)

	origBase := paypalAPIBase
	origClient := paypalHTTPClient
	paypalAPIBase = func() string { return upstream.URL }
	paypalHTTPClient = &http.Client{Timeout: 5 * time.Second}
	t.Cleanup(func() {
		paypalAPIBase = origBase
		paypalHTTPClient = origClient
	})

	tokenCache.mu.Lock()
	origToken := tokenCache.accessToken
	origExpires := tokenCache.expiresAt
	origTestMode := tokenCache.testMode
	tokenCache.accessToken = "b04-paypal-test-token"
	tokenCache.expiresAt = time.Now().Add(time.Hour)
	tokenCache.testMode = setting.PayPalTestMode
	tokenCache.mu.Unlock()
	t.Cleanup(func() {
		tokenCache.mu.Lock()
		tokenCache.accessToken = origToken
		tokenCache.expiresAt = origExpires
		tokenCache.testMode = origTestMode
		tokenCache.mu.Unlock()
	})

	// Drive the real handler with real auth.
	req := httptest.NewRequest(http.MethodPost, "/api/user/paypal/pay",
		strings.NewReader(`{"amount":15,"payment_method":"paypal"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	payPalCancelRouter().ServeHTTP(rec, req)

	// Assert from the main goroutine AFTER the client response is observed.
	require.Equal(t, http.StatusOK, rec.Code, "real handler must return 2xx, body=%s", rec.Body.String())
	var envelope struct {
		Message string                 `json:"message"`
		Data    map[string]interface{} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.Equal(t, "success", envelope.Message, "RequestPayPalPay must succeed and return success envelope")
	payLink, ok := envelope.Data["pay_link"].(string)
	require.True(t, ok, "data.pay_link must be a string")
	assert.Contains(t, payLink, "loopback", "pay_link must come from the loopback PayPal mock")

	// cancel_url invariants recorded by the loopback mock.
	mu.Lock()
	gotCancelURL := capturedCancelURL
	gotReqID := capturedPayPalRequestID
	mu.Unlock()
	require.NotEmpty(t, gotCancelURL, "the loopback mock must have observed a cancel_url")
	parsed, parseErr := url.Parse(gotCancelURL)
	require.NoError(t, parseErr)
	assert.Equal(t, "true", parsed.Query().Get("payment_cancel"),
		"cancel_url must carry an explicit payment_cancel=true query parameter")
	for _, reserved := range []string{"payment_error", "payment_pending", "show_history"} {
		assert.Empty(t, parsed.Query().Get(reserved),
			"cancel_url must not carry reserved payment status key %q", reserved)
	}
	// PayPal-Request-Id must be a deterministic create digest, not the raw
	// trade number — defensive coverage for the request-id invariant.
	require.NotEmpty(t, gotReqID, "PayPal-Request-Id must be set on the create request")
	assert.LessOrEqual(t, len(gotReqID), 38, "PayPal-Request-Id must be within PayPal's 38-byte cap")
	assert.NotContains(t, gotReqID, "b04-cancel", "PayPal-Request-Id must not leak the trade number")

	// Wire hit counts: one POST /v2/checkout/orders for create, ZERO captures,
	// ZERO order-detail GETs. The user "cancels" by not completing PayPal, so
	// HandlePayPalReturn is never invoked.
	assert.Equal(t, int64(1), atomic.LoadInt64(&createHits), "create-order must hit the mock exactly once")
	assert.Equal(t, int64(0), atomic.LoadInt64(&captureHits), "cancel must not reach capture")
	assert.Equal(t, int64(0), atomic.LoadInt64(&getOrderHits), "cancel must not reach order detail fetch")

	// The loopback mock must not have recorded a read/unmarshal/write error.
	mu.Lock()
	mockErrCopy := mockErr
	mu.Unlock()
	require.NoError(t, mockErrCopy, "the loopback PayPal mock must not have recorded an error")

	// Local TopUp state: exactly one pending row, quota unchanged.
	var topUps []model.TopUp
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Find(&topUps).Error)
	require.Len(t, topUps, 1, "exactly one TopUp row must be created on successful order creation")
	assert.Equal(t, common.TopUpStatusPending, topUps[0].Status,
		"cancel path must leave the TopUp in pending (no success mark)")
	assert.Equal(t, "ORDER-CANCEL-001", topUps[0].PaymentId)
	assert.Equal(t, model.PaymentProviderPayPal, topUps[0].PaymentProvider)
	assert.Equal(t, model.PaymentMethodPayPal, topUps[0].PaymentMethod)
	assert.Empty(t, topUps[0].GetTransactionId(), "cancel must not record a capture transaction id")
	assert.Equal(t, startQuota, getPayPalReturnUserQuota(t, user.Id),
		"cancel path must not credit the user")

	// No consume log must have been written for the cancel path.
	var consumeCount int64
	require.NoError(t, model.DB.Model(&model.Log{}).
		Where("user_id = ? AND type = ?", user.Id, model.LogTypeConsume).
		Count(&consumeCount).Error)
	assert.Equal(t, int64(0), consumeCount,
		"cancel must not produce a consume log entry")

	// No PayPalSettlementEvent rows must have been written (the direct-capture
	// path is the only writer; cancel skips it).
	var settlementCount int64
	require.NoError(t, model.DB.Model(&model.PayPalSettlementEvent{}).
		Where("top_up_id = ?", topUps[0].Id).
		Count(&settlementCount).Error)
	assert.Equal(t, int64(0), settlementCount,
		"cancel must not produce a settlement ledger row")
}
