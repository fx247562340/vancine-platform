package service

import (
	"encoding/hex"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

const (
	piCatalogCacheControl = "public, max-age=60, must-revalidate"
	piCatalogContentType  = "application/json"
)

// PiCatalog is the public Vancine Pi catalog payload. The HTTP response is
// this object at the top level — it is not wrapped in success/data.
type PiCatalog struct {
	Provider      string           `json:"provider"`
	SchemaVersion int              `json:"schemaVersion"`
	GeneratedAt   string           `json:"generatedAt"`
	Models        []PiCatalogModel `json:"models"`
}

// PiCatalogModel is one Pi-compatible chat model.
type PiCatalogModel struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Enabled       bool            `json:"enabled"`
	Available     bool            `json:"available"`
	Kind          string          `json:"kind"`
	API           string          `json:"api"`
	Endpoint      string          `json:"endpoint"`
	Input         []string        `json:"input"`
	Reasoning     bool            `json:"reasoning"`
	ContextWindow int             `json:"contextWindow"`
	MaxTokens     int             `json:"maxTokens"`
	Cost          PiCatalogCost   `json:"cost"`
	Compat        PiCatalogCompat `json:"compat"`
}

// PiCatalogCost is USD per million tokens using the platform base rate.
type PiCatalogCost struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cacheRead"`
	CacheWrite float64 `json:"cacheWrite"`
}

// PiCatalogCompat holds Pi compatibility flags. supportsDeveloperRole is
// always false for Vancine Chat Completions.
type PiCatalogCompat struct {
	SupportsDeveloperRole   bool  `json:"supportsDeveloperRole"`
	SupportsReasoningEffort *bool `json:"supportsReasoningEffort,omitempty"`
}

// PiCatalogSkip records why a live candidate was omitted from the catalog.
type PiCatalogSkip struct {
	ID     string
	Reason string
}

// PiCatalogSnapshot is a thread-safe, reusable catalog representation.
type PiCatalogSnapshot struct {
	Catalog      PiCatalog
	Body         []byte
	ETag         string
	LastModified time.Time
	ContentType  string
	CacheControl string
}

// PiCatalogOptions injects live pricing, time, and registry for tests.
type PiCatalogOptions struct {
	Pricing  func() []model.Pricing
	Now      func() time.Time
	Registry map[string]PiModelMeta
}

// PiCatalogService builds the public catalog from live platform pricing plus
// the compile-time Pi metadata registry.
type PiCatalogService struct {
	pricing  func() []model.Pricing
	now      func() time.Time
	registry map[string]PiModelMeta

	mu       sync.Mutex
	snapshot *PiCatalogSnapshot
	content  string
}

var defaultPiCatalog = NewPiCatalogService(PiCatalogOptions{})

// NewPiCatalogService constructs a catalog builder. Nil option fields fall
// back to production pricing, time.Now, and the built-in registry.
func NewPiCatalogService(opts PiCatalogOptions) *PiCatalogService {
	pricing := opts.Pricing
	if pricing == nil {
		pricing = model.GetPricing
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	registry := opts.Registry
	if registry == nil {
		registry = piCatalogRegistry
	}
	return &PiCatalogService{
		pricing:  pricing,
		now:      now,
		registry: copyPiCatalogRegistry(registry),
	}
}

// SnapshotPiCatalog returns the current public catalog snapshot.
func SnapshotPiCatalog() (*PiCatalogSnapshot, error) {
	return defaultPiCatalog.Snapshot()
}

// SwapPiCatalogService replaces the process-wide catalog service. The
// returned function restores the previous service. Tests must not run this
// in parallel with other catalog HTTP tests.
func SwapPiCatalogService(next *PiCatalogService) func() {
	previous := defaultPiCatalog
	defaultPiCatalog = next
	return func() {
		defaultPiCatalog = previous
	}
}

// Snapshot returns a stable catalog snapshot. generatedAt and ETag change
// only when the normalized model list actually changes.
func (s *PiCatalogService) Snapshot() (*PiCatalogSnapshot, error) {
	pricing := s.pricing()
	models, _ := s.BuildModels(pricing)
	key, err := piCatalogContentKey(models)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshot != nil && s.content == key {
		return s.snapshot, nil
	}

	now := s.now().UTC().Truncate(time.Second)
	if s.snapshot != nil && !now.After(s.snapshot.LastModified) {
		now = s.snapshot.LastModified.Add(time.Second)
	}
	catalog := PiCatalog{
		Provider:      piCatalogProvider,
		SchemaVersion: piCatalogSchemaVersion,
		GeneratedAt:   now.Format(time.RFC3339),
		Models:        models,
	}
	body, err := common.Marshal(catalog)
	if err != nil {
		return nil, err
	}
	snapshot := &PiCatalogSnapshot{
		Catalog:      catalog,
		Body:         body,
		ETag:         `"` + key + `"`,
		LastModified: now,
		ContentType:  piCatalogContentType,
		CacheControl: piCatalogCacheControl,
	}
	s.snapshot = snapshot
	s.content = key
	return snapshot, nil
}

// BuildModels filters live pricing through the Pi registry and returns a
// stably sorted catalog plus skip reasons. It does not mutate service cache.
func (s *PiCatalogService) BuildModels(pricing []model.Pricing) ([]PiCatalogModel, []PiCatalogSkip) {
	models := make([]PiCatalogModel, 0)
	skipped := make([]PiCatalogSkip, 0)
	seen := make(map[string]struct{})

	for _, item := range pricing {
		id := strings.TrimSpace(item.ModelName)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			skipped = append(skipped, PiCatalogSkip{ID: id, Reason: "duplicate live model id"})
			continue
		}
		seen[id] = struct{}{}

		meta, ok := s.registry[id]
		if !ok {
			skipped = append(skipped, PiCatalogSkip{ID: id, Reason: "missing Pi metadata"})
			continue
		}
		if reason := piCatalogEligibilityReject(meta); reason != "" {
			skipped = append(skipped, PiCatalogSkip{ID: id, Reason: reason})
			continue
		}
		if !piCatalogHasLiveChatCompletions(item) {
			skipped = append(skipped, PiCatalogSkip{ID: id, Reason: "no live chat completions endpoint"})
			continue
		}
		cost, reason := piCatalogTokenCost(item)
		if reason != "" {
			skipped = append(skipped, PiCatalogSkip{ID: id, Reason: reason})
			continue
		}

		models = append(models, PiCatalogModel{
			ID:            meta.ID,
			Name:          meta.Name,
			Enabled:       true,
			Available:     true,
			Kind:          meta.Kind,
			API:           meta.API,
			Endpoint:      meta.Endpoint,
			Input:         append([]string(nil), meta.Input...),
			Reasoning:     meta.Reasoning,
			ContextWindow: meta.ContextWindow,
			MaxTokens:     meta.MaxTokens,
			Cost:          cost,
			Compat: PiCatalogCompat{
				SupportsDeveloperRole:   false,
				SupportsReasoningEffort: meta.SupportsReasoningEffort,
			},
		})
	}

	sort.Slice(models, func(i, j int) bool {
		return models[i].ID < models[j].ID
	})
	return models, skipped
}

func piCatalogEligibilityReject(meta PiModelMeta) string {
	if _, ok := validatePiModelMeta(meta); !ok {
		return "incomplete or invalid Pi metadata"
	}
	if meta.Kind != piCatalogKindChat || meta.API != piCatalogAPI || meta.Endpoint != piCatalogEndpoint {
		return "not a chat completions model"
	}
	return ""
}

// piCatalogHasLiveChatCompletions reports whether current pricing advertises
// OpenAI Chat Completions (/v1/chat/completions). Registry api/endpoint is
// not sufficient; empty lists and Responses/media-only lists are omitted.
func piCatalogHasLiveChatCompletions(item model.Pricing) bool {
	for _, endpoint := range item.SupportedEndpointTypes {
		if endpoint == constant.EndpointTypeOpenAI {
			return true
		}
	}
	return false
}

func piCatalogTokenCost(item model.Pricing) (PiCatalogCost, string) {
	if item.BillingMode == billing_setting.BillingModeTieredExpr {
		cost, ok := piCatalogCostFromStandardExpr(item.BillingExpr)
		if !ok {
			return PiCatalogCost{}, "unsupported Pi token pricing expression"
		}
		if !piCatalogCostFinite(cost.Input) || !piCatalogCostFinite(cost.Output) || !piCatalogCostFinite(cost.CacheRead) || !piCatalogCostFinite(cost.CacheWrite) {
			return PiCatalogCost{}, "invalid token cost"
		}
		return cost, ""
	}
	if item.QuotaType != 0 {
		return PiCatalogCost{}, "per-request pricing"
	}

	input := item.ModelRatio * 2
	output := input * item.CompletionRatio
	cacheRead := 0.0
	if item.CacheRatio != nil {
		cacheRead = input * *item.CacheRatio
	}
	cacheWrite := 0.0
	if item.CreateCacheRatio != nil {
		cacheWrite = input * *item.CreateCacheRatio
	}
	if !piCatalogCostFinite(input) || !piCatalogCostFinite(output) || !piCatalogCostFinite(cacheRead) || !piCatalogCostFinite(cacheWrite) {
		return PiCatalogCost{}, "invalid token cost"
	}
	return PiCatalogCost{
		Input:      input,
		Output:     output,
		CacheRead:  cacheRead,
		CacheWrite: cacheWrite,
	}, ""
}

// piCatalogCostFromStandardExpr maps a lossless single-tier token expression
// onto Pi's four static USD/1M prices. Only
// tier("base", p*X + c*Y [+ cr*Z] [+ cc*W]) is accepted; coefficients are
// taken from numeric literals without recomputation. Omitted cr/cc fall back
// to the input price because those tokens stay inside p.
func piCatalogCostFromStandardExpr(exprStr string) (PiCatalogCost, bool) {
	exprStr = strings.TrimSpace(exprStr)
	if exprStr == "" {
		return PiCatalogCost{}, false
	}
	_, body := billingexpr.ParseExprVersion(exprStr)
	body = strings.TrimSpace(body)
	if body == "" {
		return PiCatalogCost{}, false
	}
	tree, err := parser.Parse(body)
	if err != nil || tree == nil || tree.Node == nil {
		return PiCatalogCost{}, false
	}
	call, ok := tree.Node.(*ast.CallNode)
	if !ok || len(call.Arguments) != 2 {
		return PiCatalogCost{}, false
	}
	callee, ok := call.Callee.(*ast.IdentifierNode)
	if !ok || callee.Value != "tier" {
		return PiCatalogCost{}, false
	}
	name, ok := call.Arguments[0].(*ast.StringNode)
	if !ok || name.Value != "base" {
		return PiCatalogCost{}, false
	}
	prices := make(map[string]float64, 4)
	if !piCatalogCollectStandardTokenTerms(call.Arguments[1], prices) {
		return PiCatalogCost{}, false
	}
	input, hasP := prices["p"]
	output, hasC := prices["c"]
	if !hasP || !hasC {
		return PiCatalogCost{}, false
	}
	cacheRead, hasCR := prices["cr"]
	if !hasCR {
		cacheRead = input
	}
	cacheWrite, hasCC := prices["cc"]
	if !hasCC {
		cacheWrite = input
	}
	return PiCatalogCost{
		Input:      input,
		Output:     output,
		CacheRead:  cacheRead,
		CacheWrite: cacheWrite,
	}, true
}

func piCatalogCollectStandardTokenTerms(node ast.Node, prices map[string]float64) bool {
	bin, ok := node.(*ast.BinaryNode)
	if !ok {
		return false
	}
	switch bin.Operator {
	case "+":
		return piCatalogCollectStandardTokenTerms(bin.Left, prices) && piCatalogCollectStandardTokenTerms(bin.Right, prices)
	case "*":
		ident, coeff, ok := piCatalogStandardMulTerm(bin)
		if !ok {
			return false
		}
		if _, exists := prices[ident]; exists {
			return false
		}
		switch ident {
		case "p", "c", "cr", "cc":
			prices[ident] = coeff
			return true
		default:
			return false
		}
	default:
		return false
	}
}

func piCatalogStandardMulTerm(bin *ast.BinaryNode) (string, float64, bool) {
	if ident, coeff, ok := piCatalogIdentTimesNumber(bin.Left, bin.Right); ok {
		return ident, coeff, true
	}
	return piCatalogIdentTimesNumber(bin.Right, bin.Left)
}

func piCatalogIdentTimesNumber(maybeIdent, maybeNumber ast.Node) (string, float64, bool) {
	ident, ok := maybeIdent.(*ast.IdentifierNode)
	if !ok || ident.Value == "" {
		return "", 0, false
	}
	switch n := maybeNumber.(type) {
	case *ast.IntegerNode:
		if n.Value < 0 {
			return "", 0, false
		}
		return ident.Value, float64(n.Value), true
	case *ast.FloatNode:
		if math.IsNaN(n.Value) || math.IsInf(n.Value, 0) || n.Value < 0 {
			return "", 0, false
		}
		return ident.Value, n.Value, true
	default:
		return "", 0, false
	}
}

func piCatalogCostFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}

func piCatalogContentKey(models []PiCatalogModel) (string, error) {
	if models == nil {
		models = []PiCatalogModel{}
	}
	raw, err := common.Marshal(models)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(common.Sha256Raw(raw)), nil
}
