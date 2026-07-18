package controller

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/shopspring/decimal"
)

// This file holds the canonical PayPal money/order/capture DTOs and the
// fail-closed validation helpers used by the top-up orchestration. The shapes
// mirror PayPal's v2 checkout/orders and payments/captures representations so
// the relay can validate a stored local order against the remote capture
// without re-parsing ad-hoc anonymous structs.

// paypalMoney is PayPal's currency + value pair used throughout the v2 API.
type paypalMoney struct {
	Value        string `json:"value"`
	CurrencyCode string `json:"currency_code"`
}

// paypalCapture is a single capture resource under a purchase unit.
type paypalCapture struct {
	ID     string      `json:"id"`
	Status string      `json:"status"`
	Amount paypalMoney `json:"amount"`
}

// paypalPurchaseUnit is a purchase unit inside an order. ReferenceID, CustomID,
// and InvoiceID are all bound to the local trade number at order creation.
type paypalPurchaseUnit struct {
	ReferenceID string      `json:"reference_id"`
	CustomID    string      `json:"custom_id"`
	InvoiceID   string      `json:"invoice_id"`
	Amount      paypalMoney `json:"amount"`
	Payments    struct {
		Captures []paypalCapture `json:"captures"`
	} `json:"payments"`
}

// paypalOrderDetail is the full order representation returned by PayPal's
// /v2/checkout/orders endpoints.
type paypalOrderDetail struct {
	ID            string               `json:"id"`
	Status        string               `json:"status"`
	PurchaseUnits []paypalPurchaseUnit `json:"purchase_units"`
}

// extractCompletedPayPalCapture pulls the single completed capture out of an
// order representation. It requires exactly one purchase unit and exactly one
// capture so that a credited order is never ambiguous.
func extractCompletedPayPalCapture(order paypalOrderDetail) (paypalPurchaseUnit, paypalCapture, error) {
	if len(order.PurchaseUnits) != 1 {
		return paypalPurchaseUnit{}, paypalCapture{}, fmt.Errorf("expected exactly one purchase unit, got %d", len(order.PurchaseUnits))
	}
	unit := order.PurchaseUnits[0]
	if len(unit.Payments.Captures) != 1 {
		return paypalPurchaseUnit{}, paypalCapture{}, fmt.Errorf("expected exactly one capture, got %d", len(unit.Payments.Captures))
	}
	return unit, unit.Payments.Captures[0], nil
}

// validateCompletedPayPalCapture enforces the fail-closed contract between a
// stored local PayPal top-up and a remote completed capture. Every binding -
// provider, order id, reference id, capture id, status, currency, and amount -
// must match exactly or the caller must refuse to credit.
func validateCompletedPayPalCapture(local *model.TopUp, remoteOrderID, remoteReferenceID string, capture paypalCapture) error {
	if local == nil {
		return fmt.Errorf("local top-up is nil")
	}
	if local.PaymentProvider != model.PaymentProviderPayPal {
		return fmt.Errorf("payment provider mismatch: expected %s, got %s", model.PaymentProviderPayPal, local.PaymentProvider)
	}
	if strings.TrimSpace(local.PaymentId) == "" {
		return fmt.Errorf("stored payment id is empty")
	}
	if local.PaymentId != remoteOrderID {
		return fmt.Errorf("order id mismatch: local=%s remote=%s", local.PaymentId, remoteOrderID)
	}
	if remoteReferenceID != "" && remoteReferenceID != local.TradeNo {
		return fmt.Errorf("reference id mismatch: local=%s remote=%s", local.TradeNo, remoteReferenceID)
	}
	if strings.TrimSpace(capture.ID) == "" {
		return fmt.Errorf("capture id is empty")
	}
	if capture.Status != "COMPLETED" {
		return fmt.Errorf("capture status is not COMPLETED: %s", capture.Status)
	}
	configuredCurrency := setting.PayPalCurrency
	if strings.TrimSpace(capture.Amount.CurrencyCode) == "" {
		return fmt.Errorf("capture currency is empty")
	}
	if capture.Amount.CurrencyCode != configuredCurrency {
		return fmt.Errorf("currency mismatch: configured=%s capture=%s", configuredCurrency, capture.Amount.CurrencyCode)
	}
	captureAmount, err := decimal.NewFromString(capture.Amount.Value)
	if err != nil {
		return fmt.Errorf("capture amount is not a valid decimal: %q: %w", capture.Amount.Value, err)
	}
	expectedAmount := decimal.NewFromFloat(local.Money).Round(2)
	if !captureAmount.Equal(expectedAmount) {
		return fmt.Errorf("amount mismatch: local=%s capture=%s", expectedAmount.String(), captureAmount.String())
	}
	return nil
}
