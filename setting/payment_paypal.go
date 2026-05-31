package setting

var (
	PayPalClientId     = ""
	PayPalClientSecret = ""
	PayPalWebhookId    = ""
	PayPalTestMode     = false
	PayPalProducts     = "[]"
	PayPalMinTopUp     = 1
	PayPalUnitPrice    = 8.0
	PayPalCurrency     = "USD"
)

func GetPayPalAPIBase() string {
	if PayPalTestMode {
		return "https://api-m.sandbox.paypal.com"
	}
	return "https://api-m.paypal.com"
}
