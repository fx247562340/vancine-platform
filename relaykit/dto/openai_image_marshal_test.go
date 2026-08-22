package dto

import (
	"strings"
	"testing"
)

func TestImageRequestMarshalJSONPreservesExplicitZeroAndFalse(t *testing.T) {
	seed := 0
	watermark := false
	promptExtend := false
	req := ImageRequest{
		Model:        "seedream-4-0-250828",
		Prompt:       "a red apple",
		Seed:         &seed,
		Watermark:    &watermark,
		PromptExtend: &promptExtend,
	}
	data, err := req.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON returned error: %v", err)
	}
	body := string(data)
	for _, fragment := range []string{`"seed":0`, `"watermark":false`, `"prompt_extend":false`} {
		if !strings.Contains(body, fragment) {
			t.Fatalf("expected %s in %s", fragment, body)
		}
	}
}
