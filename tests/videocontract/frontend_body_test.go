// Package videocontract proves that the request bodies the Vancine video studio
// builds in the browser are transformed correctly by the existing built-in task
// plugins, without touching a plugin, the Go request pipeline, or the network.
//
// It is a test-only package: it contains no production code.
package videocontract

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// projectThroughTaskSubmitReq reproduces the one step of
// POST /v1/video/generations that is easy to get wrong from the browser: Go
// decodes the client body into relaycommon.TaskSubmitReq and hands the plugin
// the re-serialized projection of that struct (see
// relay/channel/task/jsplugin/adaptor.go, `routeRequest.RequestBody =
// jsonValue(taskRequest)`). Every top-level field outside that struct is
// dropped, `seconds` is a Go string, `duration` is a Go int, and only
// `metadata` survives as an arbitrary passthrough.
func projectThroughTaskSubmitReq(t *testing.T, frontendBody map[string]any) map[string]any {
	t.Helper()
	encoded, err := common.Marshal(frontendBody)
	require.NoError(t, err)

	var request relaycommon.TaskSubmitReq
	require.NoError(t, common.Unmarshal(encoded, &request))

	projected, err := common.Marshal(request)
	require.NoError(t, err)

	var out map[string]any
	require.NoError(t, common.Unmarshal(projected, &out))
	return out
}

func loadPlugin(t *testing.T, key string) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source(key)
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: key})
	require.NoError(t, err)
	return plugin
}

func callBuildSubmitRequest(t *testing.T, plugin *jsplugin.LoadedPlugin, publicModel, upstreamModel, baseURL string, requestBody map[string]any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
		"baseUrl":       baseURL,
		"apiKey":        "sk-contract-test-not-real",
		"model":         publicModel,
		"upstreamModel": upstreamModel,
		"requestBody":   requestBody,
	})
	require.NoError(t, err)

	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var decoded map[string]any
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	return decoded
}

// requireResolutionIsDeclared asserts that a resolution the frontend puts in
// `metadata` is inside the plugin's declared usageSchema enum. The task adaptor
// walks the whole resolved body — including nested metadata — and rejects any
// declared key whose value is not an allowed enum member, so a casing mistake
// here would surface in production as a 400 plugin_usage_invalid.
func requireResolutionIsDeclared(t *testing.T, plugin *jsplugin.LoadedPlugin, metadata map[string]any) {
	t.Helper()
	value, present := metadata["resolution"]
	if !present {
		return
	}
	schema, declared := plugin.Meta.UsageSchema["resolution"]
	require.True(t, declared, "plugin declares no resolution usage field")
	assert.Contains(t, schema.Enum, value, "metadata.resolution must match the plugin usageSchema enum exactly")
}

// requireDurationWithinHostLimit mirrors the adaptor's canonical duration bound
// for every key the host folds onto it.
func requireDurationWithinHostLimit(t *testing.T, body map[string]any) {
	t.Helper()
	for _, key := range []string{"duration", "seconds"} {
		raw, present := body[key]
		if !present {
			continue
		}
		var seconds float64
		switch typed := raw.(type) {
		case float64:
			seconds = typed
		case string:
			parsed, err := strconv.ParseFloat(typed, 64)
			require.NoError(t, err, "%s must be numeric", key)
			seconds = parsed
		default:
			t.Fatalf("%s has an unexpected type %T", key, raw)
		}
		assert.GreaterOrEqual(t, seconds, float64(0))
		assert.LessOrEqual(t, seconds, float64(relaycommon.MaxTaskDurationSeconds))
	}
}

func referenceImageContent(urls ...string) []any {
	content := make([]any, 0, len(urls))
	for _, url := range urls {
		content = append(content, map[string]any{
			"type":      "image_url",
			"role":      "reference_image",
			"image_url": map[string]any{"url": url},
		})
	}
	return content
}

// TestVideoStudioWan3BodiesReachDashScopeAsReferenceMedia proves the two Wan3
// bodies the studio builds. The multi-image case is the important one: Wan3's
// upstream contract carries reference images in `input.media`, and the plugin
// reaches that only through its `metadata.input` merge. Top-level `image` /
// `images` are deliberately not sent, because the plugin collapses them into a
// single `input.img_url`, i.e. first-frame semantics.
func TestVideoStudioWan3BodiesReachDashScopeAsReferenceMedia(t *testing.T) {
	plugin := loadPlugin(t, "alibaba")
	const baseURL = "https://dashscope.example"

	for _, publicModel := range []string{"wan3.0-video", "wan3.0-video-prime"} {
		t.Run(publicModel+" text to video", func(t *testing.T) {
			frontendBody := map[string]any{
				"model":    publicModel,
				"prompt":   "a spaceship gliding over the Great Wall",
				"duration": 5,
				"size":     "1080P",
			}
			projected := projectThroughTaskSubmitReq(t, frontendBody)
			requireDurationWithinHostLimit(t, projected)

			descriptor := callBuildSubmitRequest(t, plugin, publicModel, publicModel, baseURL, projected)
			assert.Equal(t, baseURL+"/api/v1/services/aigc/video-generation/video-synthesis", descriptor["url"])
			assert.Equal(t, "text_to_video", descriptor["action"])
			assert.JSONEq(t, `{
				"model": "`+publicModel+`",
				"input": {"prompt": "a spaceship gliding over the Great Wall"},
				"parameters": {"prompt_extend": true, "duration": 5, "resolution": "1080P"}
			}`, mustJSON(t, descriptor["body"]))
		})

		t.Run(publicModel+" keeps every reference image as reference_image media", func(t *testing.T) {
			frontendBody := map[string]any{
				"model":    publicModel,
				"prompt":   "three references, one shot",
				"duration": 8,
				"size":     "720P",
				"metadata": map[string]any{
					"input": map[string]any{
						"media": []any{
							map[string]any{"type": "reference_image", "url": "https://cdn.example/one.png"},
							map[string]any{"type": "reference_image", "url": "https://cdn.example/two.png"},
							map[string]any{"type": "reference_image", "url": "https://cdn.example/three.png"},
						},
					},
				},
			}
			projected := projectThroughTaskSubmitReq(t, frontendBody)

			// The metadata passthrough must survive the Go DTO projection, or the
			// images would never reach the plugin at all.
			metadata, ok := projected["metadata"].(map[string]any)
			require.True(t, ok, "metadata must survive TaskSubmitReq")
			input, ok := metadata["input"].(map[string]any)
			require.True(t, ok, "metadata.input must survive TaskSubmitReq")
			media, ok := input["media"].([]any)
			require.True(t, ok, "metadata.input.media must survive TaskSubmitReq")
			require.Len(t, media, 3, "no reference image may be dropped by the Go projection")

			descriptor := callBuildSubmitRequest(t, plugin, publicModel, publicModel, baseURL, projected)
			body := descriptor["body"].(map[string]any)
			upstreamInput := body["input"].(map[string]any)

			// Every image lands in input.media, in order, as reference_image.
			upstreamMedia, ok := upstreamInput["media"].([]any)
			require.True(t, ok, "Wan3 reference images must reach input.media")
			require.Len(t, upstreamMedia, 3, "no reference image may be silently dropped")
			for index, expected := range []string{
				"https://cdn.example/one.png",
				"https://cdn.example/two.png",
				"https://cdn.example/three.png",
			} {
				item, ok := upstreamMedia[index].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, "reference_image", item["type"], "Wan3 media type at %d", index)
				assert.Equal(t, expected, item["url"], "Wan3 media url at %d", index)
			}

			// The first-frame / image-to-video fields must NOT appear: that is the
			// silent degradation this contract exists to prevent.
			assert.NotContains(t, upstreamInput, "img_url", "reference images must not collapse into img_url")
			assert.NotContains(t, upstreamInput, "first_frame_url")
			assert.NotContains(t, upstreamInput, "last_frame_url")

			assert.JSONEq(t, `{
				"model": "`+publicModel+`",
				"input": {
					"prompt": "three references, one shot",
					"media": [
						{"type": "reference_image", "url": "https://cdn.example/one.png"},
						{"type": "reference_image", "url": "https://cdn.example/two.png"},
						{"type": "reference_image", "url": "https://cdn.example/three.png"}
					]
				},
				"parameters": {"prompt_extend": true, "duration": 8, "resolution": "720P"}
			}`, mustJSON(t, descriptor["body"]))

			// Known, accepted limitation: the plugin derives the task's `action`
			// label from firstImage(), which only looks at the top-level image
			// fields, so a Wan3 reference-media request is recorded as
			// text_to_video. It is a label on the task row only — Wan3 has no
			// entry in resolutionRatio(), so billing is driven purely by seconds.
			assert.Equal(t, "text_to_video", descriptor["action"])
		})
	}

	t.Run("Wan3 carries resolution in top-level size, not in metadata", func(t *testing.T) {
		// The plugin reads `req.size` only, and the Go usage gate would reject a
		// lowercase metadata.resolution against the plugin's ["480P","720P","1080P"]
		// enum. The studio therefore sends no metadata.resolution for Wan3.
		frontendBody := map[string]any{
			"model":    "wan3.0-video",
			"prompt":   "a dragon dancing",
			"duration": 2,
			"size":     "480P",
		}
		projected := projectThroughTaskSubmitReq(t, frontendBody)
		assert.NotContains(t, projected, "metadata")
		requireDurationWithinHostLimit(t, projected)

		descriptor := callBuildSubmitRequest(t, plugin, "wan3.0-video", "wan3.0-video", baseURL, projected)
		parameters := descriptor["body"].(map[string]any)["parameters"].(map[string]any)
		assert.Equal(t, "480P", parameters["resolution"])
		assert.Equal(t, float64(2), parameters["duration"])
	})
}

// TestVideoStudioHailuoH3BodyReachesMiniMaxAsReferenceContent proves the
// MiniMax-H3 body. `metadata.content` is the only way to reach the plugin's
// reference_image semantics: without it the plugin turns top-level `images`
// into at most two frame images, which is both a semantic change and a hard
// error from the third image on.
func TestVideoStudioHailuoH3BodyReachesMiniMaxAsReferenceContent(t *testing.T) {
	plugin := loadPlugin(t, "hailuo")
	const baseURL = "https://api.minimax.example"
	const publicModel = "MiniMax-H3"

	t.Run("text to video", func(t *testing.T) {
		frontendBody := map[string]any{
			"model":    publicModel,
			"prompt":   "a heron landing on a post",
			"duration": 5,
			"metadata": map[string]any{"resolution": "2K"},
		}
		projected := projectThroughTaskSubmitReq(t, frontendBody)
		requireDurationWithinHostLimit(t, projected)
		requireResolutionIsDeclared(t, plugin, projected["metadata"].(map[string]any))

		descriptor := callBuildSubmitRequest(t, plugin, publicModel, publicModel, baseURL, projected)
		assert.Equal(t, baseURL+"/v2/video_generation", descriptor["url"])
		assert.Equal(t, "text_to_video", descriptor["action"])
		assert.JSONEq(t, `{
			"model": "MiniMax-H3",
			"content": [{"type": "text", "text": "a heron landing on a post"}],
			"resolution": "2K",
			"duration": 5,
			"ratio": "16:9"
		}`, mustJSON(t, descriptor["body"]))
	})

	t.Run("reference images stay reference_image and the prompt appears exactly once", func(t *testing.T) {
		frontendBody := map[string]any{
			"model":    publicModel,
			"prompt":   "a heron landing on a post",
			"duration": 15,
			"metadata": map[string]any{
				"resolution": "768P",
				"content":    referenceImageContent("https://cdn.example/heron.jpg", "https://cdn.example/post.webp"),
			},
		}
		projected := projectThroughTaskSubmitReq(t, frontendBody)
		requireDurationWithinHostLimit(t, projected)
		requireResolutionIsDeclared(t, plugin, projected["metadata"].(map[string]any))

		descriptor := callBuildSubmitRequest(t, plugin, publicModel, publicModel, baseURL, projected)
		assert.Equal(t, "image_to_video", descriptor["action"])

		body := descriptor["body"].(map[string]any)
		content := body["content"].([]any)
		require.Len(t, content, 3, "one text item plus two reference images")

		textItems := 0
		referenceImages := 0
		for _, raw := range content {
			item := raw.(map[string]any)
			switch item["type"] {
			case "text":
				textItems++
				assert.Equal(t, "a heron landing on a post", item["text"])
			case "image_url":
				assert.Equal(t, "reference_image", item["role"], "no frame semantics")
				referenceImages++
			default:
				t.Fatalf("unexpected content type %v", item["type"])
			}
		}
		assert.Equal(t, 1, textItems, "the plugin adds the prompt; the studio must not duplicate it")
		assert.Equal(t, 2, referenceImages, "no reference image may be dropped")

		// The studio sends no ratio, so the plugin applies its own documented
		// default: adaptive once visual input exists.
		assert.Equal(t, "adaptive", body["ratio"])
		assert.Equal(t, "768P", body["resolution"])
		assert.Equal(t, float64(15), body["duration"])
		assert.NotContains(t, body, "watermark")
		assert.NotContains(t, body, "aigc_watermark")

		assert.JSONEq(t, `{
			"model": "MiniMax-H3",
			"content": [
				{"type": "text", "text": "a heron landing on a post"},
				{"type": "image_url", "role": "reference_image", "image_url": {"url": "https://cdn.example/heron.jpg"}},
				{"type": "image_url", "role": "reference_image", "image_url": {"url": "https://cdn.example/post.webp"}}
			],
			"resolution": "768P",
			"duration": 15,
			"ratio": "adaptive"
		}`, mustJSON(t, descriptor["body"]))
	})

	t.Run("duration outside 4 to 15 is rejected by the plugin before any upstream call", func(t *testing.T) {
		for _, seconds := range []int{3, 16} {
			projected := projectThroughTaskSubmitReq(t, map[string]any{
				"model":    publicModel,
				"prompt":   "out of range",
				"duration": seconds,
				"metadata": map[string]any{"resolution": "2K"},
			})
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
				"baseUrl":       baseURL,
				"apiKey":        "sk-contract-test-not-real",
				"model":         publicModel,
				"upstreamModel": publicModel,
				"requestBody":   projected,
			})
			require.Error(t, err, "duration %d must be rejected", seconds)
			assert.Contains(t, err.Error(), "duration must be an integer between 4 and 15")
		}
	})
}

// TestVideoStudioSeedanceBodiesReachArk proves both Seedance bodies. Duration
// travels as the top-level STRING `seconds` because that is how the Go DTO types
// it and what the plugin parses; resolution travels in `metadata` in the
// plugin's lowercase enum; reference images travel in `metadata.content`.
func TestVideoStudioSeedanceBodiesReachArk(t *testing.T) {
	plugin := loadPlugin(t, "doubao")
	const baseURL = "https://ark.example"

	cases := []struct {
		name          string
		publicModel   string
		upstreamModel string
		frontendBody  map[string]any
		wantAction    string
		wantBody      string
	}{
		{
			name:          "Seedance 2.0 text to video at 4k",
			publicModel:   "Doubao-Seedance-2.0",
			upstreamModel: "doubao-seedance-2-0-260128",
			frontendBody: map[string]any{
				"model":    "Doubao-Seedance-2.0",
				"prompt":   "a market street at dusk",
				"seconds":  "12",
				"metadata": map[string]any{"resolution": "4k"},
			},
			wantAction: "text_to_video",
			wantBody: `{
				"model": "doubao-seedance-2-0-260128",
				"content": [{"type": "text", "text": "a market street at dusk"}],
				"resolution": "4k",
				"duration": 12
			}`,
		},
		{
			name:          "Seedance 2.0 with reference images",
			publicModel:   "Doubao-Seedance-2.0",
			upstreamModel: "doubao-seedance-2-0-260128",
			frontendBody: map[string]any{
				"model":   "Doubao-Seedance-2.0",
				"prompt":  "a market street at dusk",
				"seconds": "5",
				"metadata": map[string]any{
					"resolution": "4k",
					"content":    referenceImageContent("https://cdn.example/street.png", "https://cdn.example/stall.png"),
				},
			},
			wantAction: "image_to_video",
			wantBody: `{
				"model": "doubao-seedance-2-0-260128",
				"content": [
					{"type": "image_url", "role": "reference_image", "image_url": {"url": "https://cdn.example/street.png"}},
					{"type": "image_url", "role": "reference_image", "image_url": {"url": "https://cdn.example/stall.png"}},
					{"type": "text", "text": "a market street at dusk"}
				],
				"resolution": "4k",
				"duration": 5
			}`,
		},
		{
			name:          "Seedance 2.5 text to video at 1080p for thirty seconds",
			publicModel:   "Doubao-Seedance-2.5",
			upstreamModel: "doubao-seedance-2-5-260628",
			frontendBody: map[string]any{
				"model":    "Doubao-Seedance-2.5",
				"prompt":   "one long take through a station",
				"seconds":  "30",
				"metadata": map[string]any{"resolution": "1080p"},
			},
			wantAction: "text_to_video",
			wantBody: `{
				"model": "doubao-seedance-2-5-260628",
				"content": [{"type": "text", "text": "one long take through a station"}],
				"resolution": "1080p",
				"duration": 30
			}`,
		},
		{
			name:          "Seedance 2.5 with reference images",
			publicModel:   "Doubao-Seedance-2.5",
			upstreamModel: "doubao-seedance-2-5-260628",
			frontendBody: map[string]any{
				"model":   "Doubao-Seedance-2.5",
				"prompt":  "one long take through a station",
				"seconds": "8",
				"metadata": map[string]any{
					"resolution": "720p",
					"content":    referenceImageContent("https://cdn.example/hall.png"),
				},
			},
			wantAction: "image_to_video",
			wantBody: `{
				"model": "doubao-seedance-2-5-260628",
				"content": [
					{"type": "image_url", "role": "reference_image", "image_url": {"url": "https://cdn.example/hall.png"}},
					{"type": "text", "text": "one long take through a station"}
				],
				"resolution": "720p",
				"duration": 8
			}`,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			projected := projectThroughTaskSubmitReq(t, testCase.frontendBody)

			// `seconds` must survive the Go DTO as a string: the plugin parses it
			// with parseInt, and a JSON number would fail to unmarshal at all.
			seconds, ok := projected["seconds"].(string)
			require.True(t, ok, "seconds must reach the plugin as a string")
			assert.NotEmpty(t, seconds)
			requireDurationWithinHostLimit(t, projected)

			metadata := projected["metadata"].(map[string]any)
			requireResolutionIsDeclared(t, plugin, metadata)

			descriptor := callBuildSubmitRequest(t, plugin, testCase.publicModel, testCase.upstreamModel, baseURL, projected)
			assert.Equal(t, baseURL+"/api/v3/contents/generations/tasks", descriptor["url"])
			assert.Equal(t, testCase.wantAction, descriptor["action"])

			body := descriptor["body"].(map[string]any)
			// Retired studio controls must never reach Ark.
			for _, field := range []string{"ratio", "generate_audio", "seed", "watermark", "return_last_frame", "frames", "camerafixed", "camera_fixed"} {
				assert.NotContains(t, body, field, "the studio no longer offers %s", field)
			}
			// No image may be dropped, and no text item may be duplicated.
			content := body["content"].([]any)
			textItems := 0
			for _, raw := range content {
				if raw.(map[string]any)["type"] == "text" {
					textItems++
				}
			}
			assert.Equal(t, 1, textItems, "the plugin appends the prompt exactly once")

			assert.JSONEq(t, testCase.wantBody, mustJSON(t, descriptor["body"]))
		})
	}
}

// TestVideoStudioBodiesNeverCarryRetiredFields is the wire-level counterpart of
// the frontend assertion. It pins two separate facts: a retired field sent at
// the top level cannot survive the Go DTO at all, and the studio's own bodies
// only ever put `resolution`, `content` or `input` inside the metadata
// passthrough.
func TestVideoStudioBodiesNeverCarryRetiredFields(t *testing.T) {
	t.Run("the Go DTO has no slot for a retired top-level field", func(t *testing.T) {
		projected := projectThroughTaskSubmitReq(t, map[string]any{
			"model": "wan3.0-video", "prompt": "p", "duration": 5, "size": "1080P",
			// None of these exist on relaycommon.TaskSubmitReq, so a client that did
			// send them would still be stripped before the plugin runs.
			"ratio": "16:9", "generate_audio": true, "seed": 42, "watermark": true,
			"return_last_frame": true, "frames": 120, "n": 4,
			"first_frame": "a.png", "last_frame": "b.png",
		})
		for _, field := range []string{"ratio", "generate_audio", "seed", "watermark", "return_last_frame", "frames", "n", "first_frame", "last_frame"} {
			assert.NotContains(t, projected, field, "%s must not survive the Go DTO", field)
		}
		assert.Contains(t, projected, "duration")
		assert.Contains(t, projected, "size")
	})

	t.Run("mode has a DTO slot but no plugin reads it, and the studio never sends it", func(t *testing.T) {
		// TaskSubmitReq does declare `mode`, so unlike the fields above it would
		// survive the projection. None of the three plugins reads `req.mode`, and
		// the studio expresses intent solely through the reference-image role, so
		// it never sends one. The next sub-test pins that for every real body.
		projected := projectThroughTaskSubmitReq(t, map[string]any{
			"model": "wan3.0-video", "prompt": "p", "mode": "videoEdit",
		})
		assert.Contains(t, projected, "mode", "mode does survive the DTO, which is why the studio must not send it")
	})

	t.Run("the studio bodies keep metadata to resolution, content and input", func(t *testing.T) {
		studioBodies := []map[string]any{
			{"model": "wan3.0-video", "prompt": "p", "duration": 5, "size": "1080P"},
			{"model": "wan3.0-video", "prompt": "p", "duration": 8, "size": "720P",
				"metadata": map[string]any{"input": map[string]any{"media": []any{
					map[string]any{"type": "reference_image", "url": "https://cdn.example/one.png"},
				}}}},
			{"model": "MiniMax-H3", "prompt": "p", "duration": 5,
				"metadata": map[string]any{"resolution": "2K", "content": referenceImageContent("https://cdn.example/a.png")}},
			{"model": "Doubao-Seedance-2.0", "prompt": "p", "seconds": "5",
				"metadata": map[string]any{"resolution": "4k", "content": referenceImageContent("https://cdn.example/a.png")}},
			{"model": "Doubao-Seedance-2.5", "prompt": "p", "seconds": "30",
				"metadata": map[string]any{"resolution": "1080p"}},
		}
		for index, frontendBody := range studioBodies {
			projected := projectThroughTaskSubmitReq(t, frontendBody)
			for _, field := range []string{"ratio", "generate_audio", "seed", "watermark", "return_last_frame", "frames", "mode", "n", "image", "images", "input_reference"} {
				assert.NotContains(t, projected, field, "body %d must not carry %s", index, field)
			}
			metadata, present := projected["metadata"]
			if !present {
				continue
			}
			for key := range metadata.(map[string]any) {
				assert.Contains(t, []string{"resolution", "content", "input"}, key,
					"body %d puts an unexpected key %q in metadata", index, key)
			}
		}
	})
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	return string(encoded)
}
