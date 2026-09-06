package plugins_test

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// wan3Models are the two production Wan3 models this plugin must claim. They
// share channel type 17 and the DashScope video-synthesis contract with Wan2.
var wan3Models = []string{"wan3.0-video", "wan3.0-video-prime"}

// loadAlibabaWan3Plugin loads the real embedded plugin source through a real
// registry so every assertion below exercises production JS, not a copy.
func loadAlibabaWan3Plugin(t *testing.T) (*jsplugin.RoutingGeneration, *jsplugin.LoadedPlugin) {
	t.Helper()
	source, err := builtinplugins.Source("alibaba")
	require.NoError(t, err)
	registry := jsplugin.NewRegistry()
	plugin, err := registry.RegisterFactory(source, jsplugin.Options{Key: "alibaba"})
	require.NoError(t, err)
	return registry.Generation(), plugin
}

// callAlibabaWan3Hook invokes one exported plugin hook and normalizes the
// result through JSON so numeric comparisons are float64-stable.
func callAlibabaWan3Hook(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	encoded, marshalErr := common.Marshal(value)
	require.NoError(t, marshalErr)
	var decoded map[string]any
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	return decoded
}

// alibabaWan3SubmitContext builds the host-shaped buildSubmitRequest context.
func alibabaWan3SubmitContext(model string, requestBody map[string]any) map[string]any {
	requestBody["model"] = model
	return map[string]any{
		"baseUrl":       "https://dashscope.example",
		"apiKey":        "sk-test",
		"model":         model,
		"upstreamModel": model,
		"requestBody":   requestBody,
	}
}

func TestAlibabaWan3MetaRegistration(t *testing.T) {
	generation, plugin := loadAlibabaWan3Plugin(t)

	t.Run("plugin identity is unchanged", func(t *testing.T) {
		assert.Equal(t, "alibaba", plugin.Meta.Key)
		assert.Equal(t, []int{17}, plugin.Meta.ChannelTypes)
		assert.Equal(t, "QuantumNous", plugin.Meta.Author.Name)
		assert.Equal(t, "per_task", plugin.Meta.FetchMode)
	})

	t.Run("version is bumped to 1.1.0", func(t *testing.T) {
		assert.Equal(t, "1.1.0", plugin.Meta.Version)
	})

	t.Run("declares both exact Wan3 model names", func(t *testing.T) {
		for _, model := range wan3Models {
			assert.Contains(t, plugin.Meta.Models, model)
		}
	})

	t.Run("keeps every Wan2 model declaration", func(t *testing.T) {
		for _, model := range []string{
			"wan2.7-i2v", "wan2.7-t2v", "wan2.5-t2v-preview", "wan2.5-i2v-preview",
			"wan2.2-i2v-flash", "wan2.2-i2v-plus", "wanx2.1-i2v-plus", "wanx2.1-i2v-turbo",
		} {
			assert.Contains(t, plugin.Meta.Models, model)
		}
	})

	t.Run("registry resolves both Wan3 models on shared endpoints", func(t *testing.T) {
		for _, model := range wan3Models {
			responsesBinding, found := generation.LookupEndpoint("POST", "/v1/responses", model)
			require.True(t, found, model)
			assert.Same(t, plugin, responsesBinding.Plugin)
			assert.Equal(t, "openai_responses", responsesBinding.Protocol)

			videoBinding, videoFound := generation.LookupEndpoint("POST", "/v1/videos", model)
			require.True(t, videoFound, model)
			assert.Same(t, plugin, videoBinding.Plugin)
			assert.Equal(t, "openai_video", videoBinding.Protocol)
		}
	})

	t.Run("each Wan3 model keeps an independent billing identity", func(t *testing.T) {
		for _, model := range wan3Models {
			canonical, ok := generation.CanonicalModel(model)
			require.True(t, ok, model)
			assert.Equal(t, model, canonical)
			owner, owned := generation.GetByModel(model)
			require.True(t, owned, model)
			assert.Equal(t, "alibaba", owner.Meta.Key)
		}
		first, firstOK := generation.CanonicalModel("wan3.0-video")
		second, secondOK := generation.CanonicalModel("wan3.0-video-prime")
		require.True(t, firstOK && secondOK)
		assert.NotEqual(t, first, second, "the two models must not fold into one pricing identity")
	})
}

func TestAlibabaWan3SubmitRequestConversion(t *testing.T) {
	_, plugin := loadAlibabaWan3Plugin(t)

	t.Run("text to video keeps the exact upstream contract", func(t *testing.T) {
		for _, model := range wan3Models {
			result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a spaceship gliding over the Great Wall",
			}))
			assert.Equal(t, map[string]any{
				"url":    "https://dashscope.example/api/v1/services/aigc/video-generation/video-synthesis",
				"method": "POST",
				"headers": map[string]any{
					"Authorization":     "Bearer sk-test",
					"Content-Type":      "application/json",
					"X-DashScope-Async": "enable",
				},
				"body": map[string]any{
					"model": model,
					"input": map[string]any{"prompt": "a spaceship gliding over the Great Wall"},
					"parameters": map[string]any{
						"prompt_extend": true,
						"duration":      float64(5),
						"resolution":    "720P",
					},
				},
				"action": "text_to_video",
			}, result, model)
		}
	})

	t.Run("image input switches both models to image_to_video", func(t *testing.T) {
		imageCases := []struct {
			name        string
			requestBody map[string]any
			wantImage   string
		}{
			{"image field", map[string]any{"prompt": "make it move", "image": "https://cdn.example/ref.png"}, "https://cdn.example/ref.png"},
			{"first valid images entry", map[string]any{"prompt": "make it move", "images": []any{"", "https://cdn.example/second.png", "https://cdn.example/third.png"}}, "https://cdn.example/second.png"},
			{"input_reference field", map[string]any{"prompt": "make it move", "input_reference": "https://cdn.example/reference.png"}, "https://cdn.example/reference.png"},
		}
		for _, model := range wan3Models {
			for _, testCase := range imageCases {
				result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, testCase.requestBody))
				assert.Equal(t, "image_to_video", result["action"], model+"/"+testCase.name)
				body, ok := result["body"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, model, body["model"])
				input, ok := body["input"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, testCase.wantImage, input["img_url"])
				assert.Equal(t, "make it move", input["prompt"])
				assert.NotContains(t, input, "media", "Wan3 must not enter the wan2.7-i2v first/last-frame branch")
				parameters, ok := body["parameters"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, float64(5), parameters["duration"])
				assert.Equal(t, "720P", parameters["resolution"])
			}
		}
	})

	t.Run("explicit duration and seconds pass through as integers", func(t *testing.T) {
		for _, model := range wan3Models {
			durationResult := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "duration": 10,
			}))
			durationBody := durationResult["body"].(map[string]any)
			assert.Equal(t, float64(10), durationBody["parameters"].(map[string]any)["duration"], model)

			secondsResult := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "seconds": "8",
			}))
			secondsBody := secondsResult["body"].(map[string]any)
			assert.Equal(t, float64(8), secondsBody["parameters"].(map[string]any)["duration"], model)
		}
	})

	t.Run("explicit size values reuse the existing normalization", func(t *testing.T) {
		for _, model := range wan3Models {
			resolutionResult := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "size": "1080p",
			}))
			resolutionParameters := resolutionResult["body"].(map[string]any)["parameters"].(map[string]any)
			assert.Equal(t, "1080P", resolutionParameters["resolution"], model)
			assert.NotContains(t, resolutionParameters, "size", model)

			sizeResult := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "size": "1920*1080",
			}))
			sizeParameters := sizeResult["body"].(map[string]any)["parameters"].(map[string]any)
			assert.Equal(t, "1920*1080", sizeParameters["size"], model)
			assert.NotContains(t, sizeParameters, "resolution", model)
		}
	})

	t.Run("metadata cannot change the effective model", func(t *testing.T) {
		for _, model := range wan3Models {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "metadata": map[string]any{"model": "wan2.7-t2v"},
			}))
			require.ErrorContains(t, err, "can't change model with metadata", model)

			result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext(model, map[string]any{
				"prompt": "a dragon dancing", "metadata": map[string]any{"model": model},
			}))
			assert.Equal(t, model, result["body"].(map[string]any)["model"], model)
		}
	})

	t.Run("metadata parameters merge without touching the model", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext("wan3.0-video", map[string]any{
			"prompt": "a dragon dancing", "metadata": map[string]any{"parameters": map[string]any{"watermark": true}},
		}))
		body := result["body"].(map[string]any)
		assert.Equal(t, "wan3.0-video", body["model"])
		assert.Equal(t, true, body["parameters"].(map[string]any)["watermark"])
	})
}

func TestAlibabaWan3UsageFacts(t *testing.T) {
	_, plugin := loadAlibabaWan3Plugin(t)

	usageContext := func(model, purpose string, requestBody map[string]any) map[string]any {
		requestBody["model"] = model
		return map[string]any{
			"model":         model,
			"upstreamModel": model,
			"usagePurpose":  purpose,
			"requestBody":   requestBody,
		}
	}

	t.Run("submit facts carry seconds and resolution", func(t *testing.T) {
		for _, model := range wan3Models {
			facts := callAlibabaWan3Hook(t, plugin, "extractUsage", usageContext(model, "facts", map[string]any{"prompt": "a dragon dancing"}))
			assert.Equal(t, map[string]any{"seconds": float64(5), "resolution": "720P"}, facts, model)

			explicit := callAlibabaWan3Hook(t, plugin, "extractUsage", usageContext(model, "facts", map[string]any{
				"prompt": "a dragon dancing", "duration": 10, "size": "1080p",
			}))
			assert.Equal(t, map[string]any{"seconds": float64(10), "resolution": "1080P"}, explicit, model)

			sizeBased := callAlibabaWan3Hook(t, plugin, "extractUsage", usageContext(model, "facts", map[string]any{
				"prompt": "a dragon dancing", "size": "1920*1080",
			}))
			assert.Equal(t, map[string]any{"seconds": float64(5), "resolution": "1080P"}, sizeBased, model)
		}
	})

	t.Run("billing ratios stay safe without a hardcoded Wan3 resolution ratio", func(t *testing.T) {
		for _, model := range wan3Models {
			ratios := callAlibabaWan3Hook(t, plugin, "extractUsage", usageContext(model, "billing_ratios", map[string]any{"prompt": "a dragon dancing"}))
			require.Len(t, ratios, 1, model)
			seconds, ok := ratios["seconds"].(float64)
			require.True(t, ok, model)
			assert.Equal(t, float64(5), seconds, model)
		}
	})

	t.Run("seconds are capped at the host task duration bound", func(t *testing.T) {
		for _, purpose := range []string{"facts", "billing_ratios"} {
			result := callAlibabaWan3Hook(t, plugin, "extractUsage", usageContext("wan3.0-video", purpose, map[string]any{
				"prompt": "a dragon dancing", "duration": 999999,
			}))
			assert.Equal(t, float64(relaycommon.MaxTaskDurationSeconds), result["seconds"], purpose)
		}
	})

	t.Run("completion facts override seconds and resolution with actual values", func(t *testing.T) {
		facts := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{"duration": 8, "resolution": "1080P"},
		})
		assert.Equal(t, map[string]any{"seconds": float64(8), "resolution": "1080P"}, facts)

		secondsAlias := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{"duration_seconds": 12},
		})
		assert.Equal(t, map[string]any{"seconds": float64(12)}, secondsAlias)

		capped := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{"duration": 999999},
		})
		assert.Equal(t, float64(relaycommon.MaxTaskDurationSeconds), capped["seconds"])
	})

	t.Run("completion facts ignore unusable upstream values", func(t *testing.T) {
		empty := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{},
		})
		assert.Empty(t, empty)

		notNumeric := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{"duration": "abc"},
		})
		assert.Empty(t, notNumeric)

		unsupportedResolution := callAlibabaWan3Hook(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
			"output": map[string]any{"duration": 6, "resolution": "2160p"},
		})
		assert.Equal(t, map[string]any{"seconds": float64(6)}, unsupportedResolution)
	})
}

func TestAlibabaWan3TaskResultMappingAndArtifacts(t *testing.T) {
	_, plugin := loadAlibabaWan3Plugin(t)

	t.Run("poll statuses map onto platform task states", func(t *testing.T) {
		cases := []struct {
			name string
			body map[string]any
			want map[string]any
		}{
			{"PENDING becomes QUEUED", map[string]any{"output": map[string]any{"task_status": "PENDING"}}, map[string]any{"status": "QUEUED"}},
			{"RUNNING becomes IN_PROGRESS", map[string]any{"output": map[string]any{"task_status": "RUNNING"}}, map[string]any{"status": "IN_PROGRESS"}},
			{"SUCCEEDED becomes SUCCESS with the video URL", map[string]any{"output": map[string]any{"task_status": "SUCCEEDED", "video_url": "https://upstream.example/wan3.mp4?Signature=secret"}}, map[string]any{"status": "SUCCESS", "url": "https://upstream.example/wan3.mp4?Signature=secret"}},
			{"FAILED becomes FAILURE with the upstream message", map[string]any{"output": map[string]any{"task_status": "FAILED"}, "message": "invalid parameter"}, map[string]any{"status": "FAILURE", "reason": "invalid parameter"}},
			{"CANCELED becomes FAILURE", map[string]any{"output": map[string]any{"task_status": "CANCELED", "code": "UserCancel", "message": "canceled by user"}}, map[string]any{"status": "FAILURE", "reason": "task failed, code: UserCancel , message: canceled by user"}},
		}
		for _, testCase := range cases {
			result := callAlibabaWan3Hook(t, plugin, "parseTaskResult", map[string]any{}, testCase.body)
			assert.Equal(t, testCase.want, result, testCase.name)
		}
	})

	t.Run("unrecognized poll status stays UNKNOWN", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "parseTaskResult", map[string]any{}, map[string]any{"output": map[string]any{"task_status": "WEIRD"}})
		assert.Equal(t, "UNKNOWN", result["status"])
		assert.Contains(t, result["reason"], "unrecognized status")
	})

	t.Run("a succeeded task exposes exactly one video artifact", func(t *testing.T) {
		value, err := plugin.Engine.Call(t.Context(), "listArtifacts", map[string]any{
			"taskId": "task_wan3",
			"status": "SUCCESS",
			"data":   map[string]any{"output": map[string]any{"video_url": "https://upstream.example/wan3.mp4?Signature=secret"}},
		})
		require.NoError(t, err)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var artifacts []map[string]any
		require.NoError(t, common.Unmarshal(encoded, &artifacts))
		assert.Equal(t, []map[string]any{{"key": "video", "type": "video"}}, artifacts)
	})

	t.Run("unfinished tasks expose no artifacts", func(t *testing.T) {
		value, err := plugin.Engine.Call(t.Context(), "listArtifacts", map[string]any{
			"taskId": "task_wan3",
			"status": "IN_PROGRESS",
			"data":   map[string]any{"output": map[string]any{}},
		})
		require.NoError(t, err)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var artifacts []map[string]any
		require.NoError(t, common.Unmarshal(encoded, &artifacts))
		assert.Empty(t, artifacts)
	})

	t.Run("artifact content requests are credentialless", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "buildContentRequest", map[string]any{
			"artifactKey":   "video",
			"taskId":        "task_wan3",
			"status":        "SUCCESS",
			"data":          map[string]any{"output": map[string]any{"video_url": "https://upstream.example/wan3.mp4?Signature=secret"}},
			"clientRequest": map[string]any{"method": "GET"},
		})
		assert.Equal(t, "https://upstream.example/wan3.mp4?Signature=secret", result["url"])
		assert.Equal(t, "GET", result["method"])
		assert.Equal(t, true, result["credentialless"])
		assert.NotContains(t, result, "headers")
	})

	t.Run("unknown artifact keys are rejected", func(t *testing.T) {
		_, err := plugin.Engine.Call(t.Context(), "buildContentRequest", map[string]any{
			"artifactKey":   "audio",
			"data":          map[string]any{"output": map[string]any{"video_url": "https://upstream.example/wan3.mp4"}},
			"clientRequest": map[string]any{"method": "GET"},
		})
		require.ErrorContains(t, err, "artifact_not_found")
	})
}

func TestAlibabaWan3ProtocolDecode(t *testing.T) {
	_, plugin := loadAlibabaWan3Plugin(t)

	t.Run("openai_responses decodes a Wan3 text-to-video request", func(t *testing.T) {
		value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
			"model": "wan3.0-video", "body": map[string]any{"kind": "json", "value": map[string]any{
				"model": "wan3.0-video",
				"input": "a dragon dancing at night",
			}},
			"stream": false,
		})
		require.NoError(t, err)
		encoded, marshalErr := common.Marshal(value)
		require.NoError(t, marshalErr)
		var resolved map[string]any
		require.NoError(t, common.Unmarshal(encoded, &resolved))
		assert.Equal(t, "submit", resolved["kind"])
		assert.Equal(t, "wan3.0-video", resolved["model"])
		assert.Equal(t, "text_to_video", resolved["action"])
		requestBody, ok := resolved["requestBody"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "a dragon dancing at night", requestBody["prompt"])
	})

	t.Run("openai_responses turns a URL image into image_to_video", func(t *testing.T) {
		for _, model := range wan3Models {
			value, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
				"model": model, "body": map[string]any{"kind": "json", "value": map[string]any{
					"model": model,
					"input": []any{
						map[string]any{"type": "input_text", "text": "animate the reference"},
						map[string]any{"type": "input_image", "image_url": "https://cdn.example/ref.png"},
					},
				}},
				"stream": false,
			})
			require.NoError(t, err, model)
			encoded, marshalErr := common.Marshal(value)
			require.NoError(t, marshalErr)
			var resolved map[string]any
			require.NoError(t, common.Unmarshal(encoded, &resolved))
			assert.Equal(t, "image_to_video", resolved["action"], model)
			requestBody, ok := resolved["requestBody"].(map[string]any)
			require.True(t, ok)
			assert.Equal(t, []any{"https://cdn.example/ref.png"}, requestBody["images"], model)
		}
	})

	t.Run("openai_video decodes JSON and multipart image requests", func(t *testing.T) {
		jsonValue, jsonErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model": "wan3.0-video-prime", "body": map[string]any{"kind": "json", "value": map[string]any{
				"model": "wan3.0-video", "prompt": "animate the reference", "images": []any{"https://cdn.example/ref.png"}, "seconds": 8,
			}},
		})
		require.NoError(t, jsonErr)
		jsonEncoded, jsonMarshalErr := common.Marshal(jsonValue)
		require.NoError(t, jsonMarshalErr)
		var jsonResolved map[string]any
		require.NoError(t, common.Unmarshal(jsonEncoded, &jsonResolved))
		assert.Equal(t, "image_to_video", jsonResolved["action"])
		assert.Equal(t, "wan3.0-video-prime", jsonResolved["model"], "the context model must win over the body model")
		jsonBody, ok := jsonResolved["requestBody"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "wan3.0-video-prime", jsonBody["model"])
		assert.Equal(t, []any{"https://cdn.example/ref.png"}, jsonBody["images"])

		multipartValue, multipartErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model": "wan3.0-video", "body": map[string]any{"kind": "multipart", "files": []any{}, "fields": map[string]any{
				"model":           []any{"wan3.0-video"},
				"prompt":          []any{"animate the reference"},
				"input_reference": []any{"https://cdn.example/ref.png"},
				"seconds":         []any{"8"},
			}},
		})
		require.NoError(t, multipartErr)
		multipartEncoded, multipartMarshalErr := common.Marshal(multipartValue)
		require.NoError(t, multipartMarshalErr)
		var multipartResolved map[string]any
		require.NoError(t, common.Unmarshal(multipartEncoded, &multipartResolved))
		assert.Equal(t, "image_to_video", multipartResolved["action"])
		multipartBody, multipartBodyOK := multipartResolved["requestBody"].(map[string]any)
		require.True(t, multipartBodyOK)
		assert.Equal(t, "https://cdn.example/ref.png", multipartBody["input_reference"])
		assert.Equal(t, float64(8), multipartBody["seconds"])
	})
}

func TestAlibabaWan2RepresentativeRegression(t *testing.T) {
	_, plugin := loadAlibabaWan3Plugin(t)

	t.Run("wan2.7-t2v keeps its default size and rejects p-style sizes", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext("wan2.7-t2v", map[string]any{
			"prompt": "waves at sunset",
		}))
		parameters := result["body"].(map[string]any)["parameters"].(map[string]any)
		assert.Equal(t, "1280*720", parameters["size"])
		assert.NotContains(t, parameters, "resolution")
		assert.Equal(t, "text_to_video", result["action"])

		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", alibabaWan3SubmitContext("wan2.7-t2v", map[string]any{
			"prompt": "waves at sunset", "size": "1080p",
		}))
		require.ErrorContains(t, err, "invalid size: 1080p, example: 1920*1080")
	})

	t.Run("wan2.7-i2v keeps the first/last frame media contract", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext("wan2.7-i2v", map[string]any{
			"prompt": "animate between frames",
			"images": []any{"https://cdn.example/first.png", "https://cdn.example/last.png"},
		}))
		assert.Equal(t, "image_to_video", result["action"])
		input := result["body"].(map[string]any)["input"].(map[string]any)
		assert.Equal(t, []any{
			map[string]any{"type": "first_frame", "url": "https://cdn.example/first.png"},
			map[string]any{"type": "last_frame", "url": "https://cdn.example/last.png"},
		}, input["media"])
		assert.NotContains(t, input, "img_url")
		parameters := result["body"].(map[string]any)["parameters"].(map[string]any)
		assert.Equal(t, "720P", parameters["resolution"])
	})

	t.Run("wan2.5-i2v-preview keeps its 1080P default and resolution ratio", func(t *testing.T) {
		result := callAlibabaWan3Hook(t, plugin, "buildSubmitRequest", alibabaWan3SubmitContext("wan2.5-i2v-preview", map[string]any{
			"prompt": "a quiet harbor", "image": "https://cdn.example/harbor.png",
		}))
		parameters := result["body"].(map[string]any)["parameters"].(map[string]any)
		assert.Equal(t, "1080P", parameters["resolution"])
		assert.Equal(t, float64(5), parameters["duration"])

		ratios := callAlibabaWan3Hook(t, plugin, "extractUsage", map[string]any{
			"model":         "wan2.5-i2v-preview",
			"upstreamModel": "wan2.5-i2v-preview",
			"usagePurpose":  "billing_ratios",
			"requestBody": map[string]any{
				"model": "wan2.5-i2v-preview", "prompt": "a quiet harbor", "image": "https://cdn.example/harbor.png",
			},
		})
		assert.Equal(t, float64(5), ratios["seconds"])
		resolutionRatio, hasRatio := ratios["resolution-1080P"].(float64)
		require.True(t, hasRatio)
		assert.InDelta(t, 1/0.3, resolutionRatio, 1e-9)
	})
}
