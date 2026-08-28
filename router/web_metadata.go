package router

import (
	"bytes"
	"fmt"
	stlhtml "html"
	"strings"

	xhtml "golang.org/x/net/html"
)

// ---------------------------------------------------------------------------
// Public marketing page metadata (server-rendered)
//
// These values are the canonical English metadata for the public marketing
// routes that crawlers and link unfurls see first. They are kept in this
// Go file (not derived from the SPA's `usePageMetadata` hook) for two
// reasons:
//   1. Search crawlers request the raw HTML and never run the SPA, so the
//      contract for these tags must live on the server.
//   2. The three acquisition pages — /kimi-k3-api, /seedance-api, and
//      /ai-media-api — must keep their metadata byte-identical to what the
//      SPA returns for English (`getKimiK3PageMetadata('en')`,
//      `getSeedancePageMetadata('en')`, `getAiMediaPageMetadata('en')`).
//      When the SPA's English copy is updated, the same change must land
//      here; the unit test in web_seo_test.go anchors the contract.
//
// UTM, host, forwarded-host, and origin headers MUST never reach these
// values — they are package-level constants resolved at startup, not at
// request time.
// ---------------------------------------------------------------------------

// canonicalSiteOrigin is the fixed public origin used in every sitemap URL,
// every canonical link, and every og:url. It is hard-coded on purpose:
// deriving it from the request Host, X-Forwarded-Host, or Origin headers
// would enable Host header injection.
const canonicalSiteOrigin = "https://vancine.com"

// publicPageMeta is the complete, fixed metadata for one public marketing
// route. All values are English, escaped by the renderer before they reach
// HTML, and never derived from request data.
type publicPageMeta struct {
	path             string // canonical path (no trailing slash, except "/")
	title            string
	description      string
	ogTitle          string
	ogDescription    string
	twitterTitle     string
	twitterDesc      string
	twitterCardValue string
}

// publicMarketingPages is the ordered, exhaustive set of routes the public
// web router renders with server-injected SEO metadata. The trailing-slash
// form of every non-home path is folded into the same entry at lookup time,
// so canonical links never carry a stray slash.
//
// The English values for the three acquisition routes are mirrored from the
// SPA's getKimiK3PageMetadata('en') / getSeedancePageMetadata('en') /
// getAiMediaPageMetadata('en') and must stay byte-identical to them.
var publicMarketingPages = []publicPageMeta{
	{
		path:  "/",
		title: "Chinese AI Models API for Global Developers | Vancine",
		description: "Access the latest flagship Chinese AI models for text, " +
			"image, video, audio and 3D through one OpenAI-compatible API.",
		ogTitle:          "Chinese AI Models API for Global Developers",
		ogDescription:    "Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.",
		twitterTitle:     "Chinese AI Models API for Global Developers",
		twitterDesc:      "Access the latest flagship Chinese AI models for text, image, video, audio and 3D through one OpenAI-compatible API.",
		twitterCardValue: "summary",
	},
	{
		path:  "/pricing",
		title: "Chinese AI Model API Pricing | Vancine",
		description: "Compare transparent USD pricing for the latest flagship " +
			"Chinese models available through Vancine's OpenAI-compatible API.",
		ogTitle:          "Chinese AI Model API Pricing",
		ogDescription:    "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
		twitterTitle:     "Chinese AI Model API Pricing",
		twitterDesc:      "Compare transparent USD pricing for the latest flagship Chinese models available through Vancine's OpenAI-compatible API.",
		twitterCardValue: "summary",
	},
	{
		path:  "/docs",
		title: "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		description: "Integrate Vancine text, image, video, audio and 3D models " +
			"using one OpenAI-compatible API key.",
		ogTitle:          "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		ogDescription:    "Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.",
		twitterTitle:     "Vancine API Documentation | OpenAI-Compatible Chinese Models",
		twitterDesc:      "Integrate Vancine text, image, video, audio and 3D models using one OpenAI-compatible API key.",
		twitterCardValue: "summary",
	},
	{
		path:  "/kimi-k3-api",
		title: "Kimi K3 API for Coding Agents | Vancine",
		description: "Connect OpenCode, Cline, Roo Code, and OpenAI-compatible " +
			"tools to Kimi K3 with one API key through Vancine.",
		ogTitle:          "Kimi K3 for Coding Agents",
		ogDescription:    "Use one OpenAI-compatible API key to connect coding agents to Kimi K3 and other frontier models.",
		twitterTitle:     "Kimi K3 API for Coding Agents",
		twitterDesc:      "Connect OpenCode, Cline, Roo Code, and OpenAI-compatible tools to Kimi K3 with one API key through Vancine.",
		twitterCardValue: "summary",
	},
	{
		path:  "/seedance-api",
		title: "Seedance 2.5 API for Async Video Generation | Vancine",
		description: "Submit Doubao-Seedance-2.5 video tasks through Vancine " +
			"and retrieve the result with one API key. Submit, poll, and " +
			"retrieve through a documented async workflow.",
		ogTitle:          "Seedance 2.5 for Async Video Generation",
		ogDescription:    "Submit, poll, and retrieve Doubao-Seedance-2.5 video tasks through one API key and documented endpoints.",
		twitterTitle:     "Seedance 2.5 API for Async Video Generation",
		twitterDesc:      "Submit Doubao-Seedance-2.5 video tasks through Vancine and retrieve the result with one API key. Submit, poll, and retrieve through a documented async workflow.",
		twitterCardValue: "summary",
	},
	{
		path:  "/ai-media-api",
		title: "AI Media API: Image, Video, Speech & 3D | Vancine",
		description: "Access Chinese AI media models through one API. " +
			"Image, video, speech, and 3D generation with one API key and " +
			"unified billing.",
		ogTitle:          "Chinese AI Media Models Through One API",
		ogDescription:    "Generate images, videos, speech, and 3D assets with one API key and documented endpoints.",
		twitterTitle:     "AI Media API: Image, Video, Speech & 3D",
		twitterDesc:      "Access Chinese AI media models through one API. Image, video, speech, and 3D generation with one API key and unified billing.",
		twitterCardValue: "summary",
	},
	{
		// SEO-3 Phase 1: /openrouter-alternative. The English values
		// here are mirrored from the SPA's
		// getOpenRouterAlternativePageMetadata('en') and must stay
		// byte-identical to them.
		path:  "/openrouter-alternative",
		title: "OpenRouter Alternative for Chinese AI Models | Vancine",
		description: "Use one OpenAI-compatible API for the latest flagship " +
			"Chinese AI models. Compare Vancine with OpenRouter and save " +
			"20% on selected paid model listings.",
		ogTitle:          "OpenRouter Alternative for Chinese AI Models",
		ogDescription:    "Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.",
		twitterTitle:     "OpenRouter Alternative for Chinese AI Models",
		twitterDesc:      "Use one OpenAI-compatible API for the latest flagship Chinese AI models. Compare Vancine with OpenRouter and save 20% on selected paid model listings.",
		twitterCardValue: "summary",
	},
	{
		// SEO-4 evergreen canonical: /glm-api. The English values here are
		// mirrored from the SPA's getGlm53ApiPageMetadata('en') and must
		// stay byte-identical to them.
		path:  "/glm-api",
		title: "GLM-5.3 & GLM-5.3 Flash API Pricing | Vancine",
		description: "Access GLM-5.3 and GLM-5.3 Flash through one " +
			"OpenAI-compatible API. Compare Vancine and OpenRouter pricing: " +
			"20% lower on these two standard paid listings.",
		ogTitle:          "GLM-5.3 & GLM-5.3 Flash API Pricing",
		ogDescription:    "Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.",
		twitterTitle:     "GLM-5.3 & GLM-5.3 Flash API Pricing",
		twitterDesc:      "Access GLM-5.3 and GLM-5.3 Flash through one OpenAI-compatible API. Compare Vancine and OpenRouter pricing: 20% lower on these two standard paid listings.",
		twitterCardValue: "summary",
	},
	{
		// SEO-5 evergreen canonical: /coding-agent-benchmark. The English
		// values here are mirrored from the SPA's
		// getCodingAgentBenchmarkPageMetadata('en') and must stay
		// byte-identical to them.
		path:  "/coding-agent-benchmark",
		title: "8 Chinese AI Models Tested in Pi Coding Agent | Vancine",
		description: "Eight Chinese AI models completed the same isolated " +
			"Pi coding-agent task through Vancine. See the method, runtime, " +
			"token use, and production-audited cost.",
		ogTitle:          "8 Chinese AI Models Tested in Pi Coding Agent",
		ogDescription:    "Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.",
		twitterTitle:     "8 Chinese AI Models Tested in Pi Coding Agent",
		twitterDesc:      "Eight Chinese AI models completed the same isolated Pi coding-agent task through Vancine. See the method, runtime, token use, and production-audited cost.",
		twitterCardValue: "summary",
	},
}

// robotsTxtBody is the exact fixed document served at /robots.txt. The
// value is a string literal that ends with an explicit trailing "\n";
// robotsHandler converts it to []byte at request time. A trailing
// newline is required by the RFC 4180-style "POSIX text file"
// convention most crawlers rely on.
const robotsTxtBody = "User-agent: *\n" +
	"Allow: /\n" +
	"Disallow: /api/\n" +
	"Disallow: /v1/\n" +
	"Sitemap: https://vancine.com/sitemap.xml\n"

// crawlerDocumentCacheControl is the public, one-hour cache directive used
// for both /robots.txt and /sitemap.xml. Crawlers and CDNs that respect
// Cache-Control will revalidate at most once per hour.
const crawlerDocumentCacheControl = "public, max-age=3600"

// robotsContentType is the canonical Content-Type for /robots.txt.
const robotsContentType = "text/plain; charset=utf-8"

// sitemapContentType is the canonical Content-Type for /sitemap.xml.
const sitemapContentType = "application/xml; charset=utf-8"

// indexPrimaryMetaAnchor is the literal "<!-- Primary Meta Tags -->" block
// the production dist/index.html uses to wrap the default title, name="title",
// and name="description" meta tags. The metadata rewrite replaces this entire
// block with the route-specific one so the served HTML never carries two
// title / description / canonical / og / twitter tags for the same route.
const indexPrimaryMetaAnchor = `<!-- Primary Meta Tags -->
    <title>Vancine</title>
    <meta name="title" content="Vancine" />
    <meta
      name="description"
      content="Unified AI API gateway and admin dashboard."
    />`

// seoHeadTagSpec is one required SEO tag in the <head> of every variant.
// attrKey is the parsed attribute name (lower-cased by the html package)
// and attrVal is the canonical value the element must carry. For
// <title>, attrKey and attrVal are empty. attrVal is compared with
// strings.EqualFold against the parsed attribute value, and rel
// attributes are tokenised with strings.Fields before the comparison,
// so a token-list rel such as "alternate CANONICAL" still matches the
// "canonical" spec.
type seoHeadTagSpec struct {
	tag     string
	attrKey string
	attrVal string
}

// requiredSEOHeadTags lists the SEO tags that every rewrite variant
// must carry exactly once in its <head>.
var requiredSEOHeadTags = []seoHeadTagSpec{
	{tag: "title"},
	{tag: "meta", attrKey: "name", attrVal: "title"},
	{tag: "meta", attrKey: "name", attrVal: "description"},
	{tag: "link", attrKey: "rel", attrVal: "canonical"},
	{tag: "meta", attrKey: "property", attrVal: "og:type"},
	{tag: "meta", attrKey: "property", attrVal: "og:site_name"},
	{tag: "meta", attrKey: "property", attrVal: "og:title"},
	{tag: "meta", attrKey: "property", attrVal: "og:description"},
	{tag: "meta", attrKey: "property", attrVal: "og:url"},
	{tag: "meta", attrKey: "name", attrVal: "twitter:card"},
	{tag: "meta", attrKey: "name", attrVal: "twitter:title"},
	{tag: "meta", attrKey: "name", attrVal: "twitter:description"},
}

// validateSEOHeadTags is the stable complex business concept behind the
// per-variant SEO duplicate-tag guard. It parses the variant bytes as
// HTML, finds the <head> element, walks its descendants iteratively
// (without nested functions), and verifies that every entry in
// requiredSEOHeadTags appears exactly once in the <head>.
//
// The x/net/html parser normalises tag names and attribute names to
// lower case and resolves character references in attribute values,
// but it preserves the original case of attribute values. The
// comparison logic here therefore uses strings.EqualFold for attribute
// values and strings.Fields to tokenise the rel attribute, so all
// four attribute-value-semantic shapes the rev3 implementation
// silently accepted are caught:
//
//   - <link REL="CANONICAL" href="…">      (uppercased value)
//   - <link rel="alternate CANONICAL" …>   (canonical as a rel token)
//   - <META NAME="DESCRIPTION" …>          (uppercased name value)
//   - <meta property="OG:TITLE" …>         (uppercased property value)
//
// The path argument is used only to format the returned error so the
// panic site at the caller's boundary stays self-explanatory; it does
// not influence the comparison logic.
//
// The function returns nil on success and a non-nil error describing
// the first spec whose count is not exactly 1.
func validateSEOHeadTags(variant []byte, path string) error {
	doc, err := xhtml.Parse(bytes.NewReader(variant))
	if err != nil {
		return fmt.Errorf("router: validateSEOHeadTags: failed to parse variant for path %q as HTML: %w", path, err)
	}

	// Iterative DFS to find the first <head> element. We do not recurse
	// via nested functions: the stack is an explicit slice so the
	// traversal shape is obvious and there is no closure overhead per
	// node.
	stack := make([]*xhtml.Node, 0, 16)
	stack = append(stack, doc)
	var head *xhtml.Node
search:
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if n.Type == xhtml.ElementNode && n.Data == "head" {
			head = n
			break search
		}
		// Push children right-to-left so the leftmost child is
		// processed first; this matches the natural left-to-right
		// reading order expected by a left-to-right walker.
		for c := n.LastChild; c != nil; c = c.PrevSibling {
			stack = append(stack, c)
		}
	}
	if head == nil {
		return fmt.Errorf("router: validateSEOHeadTags: variant for path %q has no <head> element", path)
	}

	// Iterative DFS over the <head>'s descendants. The head element
	// itself is not counted (a <head> element with no SEO tag inside
	// it is not a spec candidate). The per-node match is inlined so
	// there is no extra subroutine just for the walk body.
	counts := make(map[seoHeadTagSpec]int, len(requiredSEOHeadTags))
	stack = stack[:0]
	for c := head.FirstChild; c != nil; c = c.NextSibling {
		stack = append(stack, c)
	}
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if n.Type == xhtml.ElementNode {
			for _, spec := range requiredSEOHeadTags {
				if n.Data != spec.tag {
					continue
				}
				if spec.attrKey == "" {
					counts[spec]++
					continue
				}
				// The parser normalises tag names and attribute
				// names to lower case but preserves the original
				// case of attribute values; the comparison here
				// uses strings.EqualFold so the original case does
				// not matter. The rel attribute is treated as a
				// whitespace-separated token list (per HTML
				// semantics) so rel="alternate CANONICAL" still
				// matches the "canonical" spec.
				matched := false
				for _, a := range n.Attr {
					if a.Key != spec.attrKey {
						continue
					}
					if spec.attrKey == "rel" {
						for _, token := range strings.Fields(a.Val) {
							if strings.EqualFold(token, spec.attrVal) {
								matched = true
								break
							}
						}
					} else if strings.EqualFold(a.Val, spec.attrVal) {
						matched = true
					}
					if matched {
						break
					}
				}
				if matched {
					counts[spec]++
				}
			}
		}
		for c := n.LastChild; c != nil; c = c.PrevSibling {
			stack = append(stack, c)
		}
	}

	for _, spec := range requiredSEOHeadTags {
		if c := counts[spec]; c != 1 {
			specDesc := spec.tag
			if spec.attrKey != "" {
				specDesc += "[" + spec.attrKey + "=" + spec.attrVal + "]"
			}
			return fmt.Errorf(
				"router: validateSEOHeadTags: variant for path %q has %d %s in <head>; "+
					"the source indexPage must carry exactly one of each required SEO tag so the rewrite does not produce duplicates",
				path, c, specDesc)
		}
	}
	return nil
}

// buildPublicPageVariants pre-renders one HTML variant per public marketing
// route. The variants are computed once at SetWebRouter init time so the
// per-request NoRoute handler is a single map lookup + bytes write.
//
// The IndexPage is intentionally taken by value (not embedded as a global):
// the production SPA's dist/index.html may be loaded once and the bytes must
// be reused for every variant. The original bytes are also returned for any
// path that does not match a known marketing route, so unknown SPA paths
// keep their default metadata.
//
// The build validates indexPrimaryMetaAnchor count up front: a missing or
// duplicated anchor would mean the rewrite either silently no-ops or
// silently leaves two title tags in the served HTML. Both outcomes
// re-introduce the Phase 0 SEO gap without any signal, so the build
// panics with a clear message rather than shipping bad variants.
func buildPublicPageVariants(indexPage []byte) (map[string][]byte, []byte) {
	anchorCount := bytes.Count(indexPage, []byte(indexPrimaryMetaAnchor))
	if anchorCount == 0 {
		panic("router: buildPublicPageVariants: indexPage is missing the primary-meta anchor " +
			"(" + indexPrimaryMetaAnchor + "); refusing to ship variants that would silently fall back to the unmodified IndexPage")
	}
	if anchorCount > 1 {
		panic(fmt.Sprintf(
			"router: buildPublicPageVariants: indexPage contains %d occurrences of the primary-meta anchor; "+
				"expected exactly 1 so each variant can carry a single title block",
			anchorCount))
	}

	variants := make(map[string][]byte, len(publicMarketingPages))
	for _, page := range publicMarketingPages {
		variant := rewriteIndexPageWithMeta(indexPage, page)
		// Each variant must carry exactly one of every required SEO
		// tag in its <head>, evaluated by HTML semantics (not by
		// raw byte matching). The validation logic lives in
		// validateSEOHeadTags so the build loop here stays a thin
		// "rewrite, validate, panic on error" sequence.
		if err := validateSEOHeadTags(variant, page.path); err != nil {
			panic(err.Error())
		}
		variants[page.path] = variant
		// Fold the trailing-slash form into the same entry so the canonical
		// link (which never carries a trailing slash) is reached regardless
		// of which form the user types or the SPA links from.
		if page.path != "/" {
			variants[page.path+"/"] = variants[page.path]
		}
	}
	return variants, indexPage
}

// rewriteIndexPageWithMeta returns a copy of indexPage with the primary-meta
// block replaced by a full SEO block for the given page. The function
// intentionally does no request-time input parsing: every value is taken
// from the publicPageMeta struct, which is a package-level constant.
//
// The caller (buildPublicPageVariants) has already verified that
// indexPrimaryMetaAnchor occurs exactly once in indexPage, so this
// function can call bytes.Replace with a count of 1 without re-checking
// or silently failing.
func rewriteIndexPageWithMeta(indexPage []byte, page publicPageMeta) []byte {
	// lineSeparator is the literal text inserted between adjacent tags
	// inside the rewritten SEO block, so the served HTML keeps the
	// original 4-space indented shape of the dist/index.html primary
	// meta block.
	const lineSeparator = "\n    "
	canonical := canonicalSiteOrigin + page.path
	ogURL := canonical

	// All values are escaped at render time. Even though every value here
	// is a literal in source code, escaping guards against a future edit
	// introducing a stray quote, ampersand, or angle bracket.
	title := stlhtml.EscapeString(page.title)
	description := stlhtml.EscapeString(page.description)
	ogTitle := stlhtml.EscapeString(page.ogTitle)
	ogDescription := stlhtml.EscapeString(page.ogDescription)
	twitterTitle := stlhtml.EscapeString(page.twitterTitle)
	twitterDesc := stlhtml.EscapeString(page.twitterDesc)
	twitterCard := stlhtml.EscapeString(page.twitterCardValue)
	canonicalEsc := stlhtml.EscapeString(canonical)
	ogURLEsc := stlhtml.EscapeString(ogURL)

	seoBlock := strings.Join([]string{
		"<!-- Primary Meta Tags -->",
		`<title>` + title + `</title>`,
		`<meta name="title" content="` + title + `" />`,
		`<meta name="description" content="` + description + `" />`,
		`<link rel="canonical" href="` + canonicalEsc + `" />`,
		`<meta property="og:type" content="website" />`,
		`<meta property="og:site_name" content="Vancine" />`,
		`<meta property="og:title" content="` + ogTitle + `" />`,
		`<meta property="og:description" content="` + ogDescription + `" />`,
		`<meta property="og:url" content="` + ogURLEsc + `" />`,
		`<meta name="twitter:card" content="` + twitterCard + `" />`,
		`<meta name="twitter:title" content="` + twitterTitle + `" />`,
		`<meta name="twitter:description" content="` + twitterDesc + `" />`,
	}, lineSeparator+"\n    ")

	// The whole injected block is preceded and followed by lineSeparator
	// so it occupies the same vertical space the original block had.
	seoBlock = lineSeparator + seoBlock + "\n"

	anchorBytes := []byte(indexPrimaryMetaAnchor)
	replacementBytes := []byte(seoBlock)
	// The replacement is a single in-place rewrite, so the order of <title>,
	// <meta name="title">, <meta name="description">, <link rel="canonical">,
	// and the og/twitter tags is the only place these tags appear. The
	// resulting document cannot carry a duplicate of any of them.
	return bytes.Replace(indexPage, anchorBytes, replacementBytes, 1)
}

// routeIsRelayPrefix reports whether the URL path is one of the protected
// surfaces (/api/*, /v1/*, /assets/*) that must reach the relay NotFound
// handler instead of being served marketing HTML. The /assets/* arm matches
// the pre-SEO behaviour: if the static middleware cannot serve a static
// asset, the request should still surface as a NotFound rather than the
// SPA shell.
//
// The argument is the already percent-decoded, query-stripped URL.Path
// (gin/net/http guarantee), so a raw-bytes prefix check is correct here
// and the brief forbids reading the raw RequestURI.
func routeIsRelayPrefix(path string) bool {
	return strings.HasPrefix(path, "/api") ||
		strings.HasPrefix(path, "/v1") ||
		strings.HasPrefix(path, "/assets")
}

// assertPublicMetadataInvariant is a compile-time / init-time guard that
// every publicPageMeta has a non-empty path. It is intentionally a
// runtime panic: a missing path would be a programming error, not a
// recoverable condition, and the panic message will be obvious in any
// test output.
func assertPublicMetadataInvariant() {
	if len(publicMarketingPages) == 0 {
		panic("router: publicMarketingPages must not be empty")
	}
	for _, page := range publicMarketingPages {
		if page.path == "" {
			panic("router: publicPageMeta with empty path is not allowed")
		}
		if page.title == "" || page.description == "" {
			panic(fmt.Sprintf("router: publicPageMeta %q has empty title or description", page.path))
		}
	}
}
