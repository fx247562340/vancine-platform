package setting

var (
	// Production credentials
	PayPalClientId     = ""
	PayPalClientSecret = ""
	PayPalWebhookId    = ""

	// Sandbox credentials
	PayPalSandboxClientId     = ""
	PayPalSandboxClientSecret = ""
	PayPalSandboxWebhookId    = ""

	// Switch
	PayPalTestMode = false

	// Shared settings
	PayPalProducts  = "[]"
	PayPalMinTopUp  = 1
	PayPalUnitPrice = 8.0
	PayPalCurrency  = "USD"
)

func GetPayPalAPIBase() string {
	if PayPalTestMode {
		return "https://api-m.sandbox.paypal.com"
	}
	return "https://api-m.paypal.com"
}

func GetPayPalClientId() string {
	if PayPalTestMode {
		return PayPalSandboxClientId
	}
	return PayPalClientId
}

func GetPayPalClientSecret() string {
	if PayPalTestMode {
		return PayPalSandboxClientSecret
	}
	return PayPalClientSecret
}

func GetPayPalWebhookId() string {
	if PayPalTestMode {
		return PayPalSandboxWebhookId
	}
	return PayPalWebhookId
}
