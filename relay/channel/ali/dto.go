package ali

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type AliMessage struct {
	Content any    `json:"content"`
	Role    string `json:"role"`
}

type AliMediaContent struct {
	Image string `json:"image,omitempty"`
	Text  string `json:"text,omitempty"`
}

type AliInput struct {
	Prompt string `json:"prompt,omitempty"`
	//History []AliMessage `json:"history,omitempty"`
	Messages []AliMessage `json:"messages"`
}

type AliParameters struct {
	TopP              float64 `json:"top_p,omitempty"`
	TopK              int     `json:"top_k,omitempty"`
	Seed              uint64  `json:"seed,omitempty"`
	EnableSearch      bool    `json:"enable_search,omitempty"`
	IncrementalOutput bool    `json:"incremental_output,omitempty"`
}

type AliChatRequest struct {
	Model      string        `json:"model"`
	Input      AliInput      `json:"input,omitempty"`
	Parameters AliParameters `json:"parameters,omitempty"`
}

type AliEmbeddingRequest struct {
	Model string `json:"model"`
	Input struct {
		Texts []string `json:"texts"`
	} `json:"input"`
	Parameters *struct {
		TextType string `json:"text_type,omitempty"`
	} `json:"parameters,omitempty"`
}

type AliEmbedding struct {
	Embedding []float64 `json:"embedding"`
	TextIndex int       `json:"text_index"`
}

type AliEmbeddingResponse struct {
	Output struct {
		Embeddings []AliEmbedding `json:"embeddings"`
	} `json:"output"`
	Usage AliUsage `json:"usage"`
	AliError
}

type AliError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestId string `json:"request_id"`
}

type AliUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
	ImageCount   int `json:"image_count,omitempty"`
}

type TaskResult struct {
	B64Image string `json:"b64_image,omitempty"`
	Url      string `json:"url,omitempty"`
	Code     string `json:"code,omitempty"`
	Message  string `json:"message,omitempty"`
}

type AliOutput struct {
	TaskId       string       `json:"task_id,omitempty"`
	TaskStatus   string       `json:"task_status,omitempty"`
	Text         string       `json:"text"`
	FinishReason string       `json:"finish_reason"`
	Message      string       `json:"message,omitempty"`
	Code         string       `json:"code,omitempty"`
	Results      []TaskResult `json:"results,omitempty"`
	Choices      []struct {
		FinishReason string `json:"finish_reason,omitempty"`
		Message      struct {
			Role             string            `json:"role,omitempty"`
			Content          []AliMediaContent `json:"content,omitempty"`
			ReasoningContent string            `json:"reasoning_content,omitempty"`
		} `json:"message,omitempty"`
	} `json:"choices,omitempty"`
}

func (o *AliOutput) ChoicesToOpenAIImageDate(c *gin.Context, responseFormat string) ([]dto.ImageData, error) {
	var imageData []dto.ImageData
	for _, choice := range o.Choices {
		// P13-B R18 per-image all-valid: every choice may carry MULTIPLE
		// image contents, and each declared (non-empty) image content is
		// validated immediately in upstream order. Each valid image becomes
		// its own ImageData - multiple valid images in one choice are ALL
		// delivered, in order, never collapsed into a single item where
		// later fields overwrite earlier ones. Any invalid image fails the
		// WHOLE response before the body is written, the n ratio is
		// touched, or the relay settles; a valid image can never mask an
		// invalid one.
		var choiceText string
		choiceImages := 0
		for _, content := range choice.Message.Content {
			if content.Image == "" {
				if content.Text != "" {
					choiceText = content.Text
				}
				continue
			}
			imageURL, b64JSON := aliNormalizedImageContent(c, content.Image, responseFormat)
			if !helper.HasUsableGeneratedImage(imageURL, b64JSON) {
				return nil, fmt.Errorf("ali choice contains an unusable image (url=%q)", content.Image)
			}
			imageData = append(imageData, dto.ImageData{
				Url:     imageURL,
				B64Json: b64JSON,
			})
			choiceImages++
		}
		// A choice without any image content is not a successful image:
		// text / revised_prompt alone cannot constitute a delivered image.
		if choiceImages == 0 {
			return nil, fmt.Errorf("ali choice does not contain a usable image")
		}
		// Attach any trailing text (choice commentary delivered after the
		// images) to the choice's images. For a single-image choice this
		// preserves the historical RevisedPrompt placement.
		if choiceText != "" {
			for idx := len(imageData) - choiceImages; idx < len(imageData); idx++ {
				imageData[idx].RevisedPrompt = choiceText
			}
		}
	}
	return imageData, nil
}

func (o *AliOutput) ResultToOpenAIImageDate(c *gin.Context, responseFormat string) ([]dto.ImageData, error) {
	var imageData []dto.ImageData
	for _, data := range o.Results {
		imageURL, b64JSON := aliNormalizedImageContent(c, data.Url, responseFormat)
		if b64JSON == "" && isValidRawBase64(data.B64Image) {
			b64JSON = strings.TrimSpace(data.B64Image)
		}
		// P13-B R17 all-valid, fail-closed: every declared result MUST
		// produce a usable image. Silently skipping invalid results
		// would let a mixed valid/invalid response succeed with fewer
		// images than the upstream declared, breaking the
		// delivery == billing contract.
		if !helper.HasUsableGeneratedImage(imageURL, b64JSON) {
			return nil, fmt.Errorf("ali result does not contain a usable image (url=%q)", imageURL)
		}
		imageData = append(imageData, dto.ImageData{
			Url:           imageURL,
			B64Json:       b64JSON,
			RevisedPrompt: "",
		})
	}
	return imageData, nil
}

func aliNormalizedImageContent(c *gin.Context, image, responseFormat string) (string, string) {
	image = strings.TrimSpace(image)
	if image == "" {
		return "", ""
	}
	if helper.IsUsableImageHTTPURL(image) {
		if responseFormat == "b64_json" {
			_, b64, err := service.GetImageFromUrl(image)
			if err != nil {
				logger.LogError(c, "get_image_data_failed: "+err.Error())
				return "", ""
			}
			return image, b64
		}
		return image, ""
	}
	if isValidRawBase64(image) {
		return "", image
	}
	return "", ""
}

func isValidRawBase64(raw string) bool {
	// Same semantics as the OpenAI-compatible path: decodable base64 that
	// does not start with a real image signature is not a generated image.
	return helper.IsValidGeneratedImageBase64(strings.TrimSpace(raw))
}

type AliResponse struct {
	Output AliOutput `json:"output"`
	Usage  AliUsage  `json:"usage"`
	AliError
}

type AliImageRequest struct {
	Model          string             `json:"model"`
	Input          any                `json:"input"`
	Parameters     AliImageParameters `json:"parameters,omitempty"`
	ResponseFormat string             `json:"response_format,omitempty"`
}

type AliImageParameters struct {
	Size             string  `json:"size,omitempty"`
	N                int     `json:"n,omitempty"`
	Steps            string  `json:"steps,omitempty"`
	Scale            string  `json:"scale,omitempty"`
	Watermark        *bool   `json:"watermark,omitempty"`
	PromptExtend     *bool   `json:"prompt_extend,omitempty"`
	PromptExtendMode *string `json:"prompt_extend_mode,omitempty"`
	// ThinkingMode is Wan's outbound thinking flag. Qwen Image 3.0/3.0-pro
	// must serialize enable_thinking instead; never both.
	ThinkingMode *bool `json:"thinking_mode,omitempty"`
	// EnableThinking is the Qwen Image 3.0/3.0-pro outbound thinking flag.
	EnableThinking   *bool   `json:"enable_thinking,omitempty"`
	NegativePrompt   *string `json:"negative_prompt,omitempty"`
	EnableSequential *bool   `json:"enable_sequential,omitempty"`
	BboxList         any     `json:"bbox_list,omitempty"`
	ColorPalette     any     `json:"color_palette,omitempty"`
	Seed             *int    `json:"seed,omitempty"`
}

func (p *AliImageParameters) PromptExtendValue() bool {
	if p != nil && p.PromptExtend != nil {
		return *p.PromptExtend
	}
	return false
}

type AliImageInput struct {
	Prompt         string       `json:"prompt,omitempty"`
	NegativePrompt string       `json:"negative_prompt,omitempty"`
	Messages       []AliMessage `json:"messages,omitempty"`
}

type WanImageInput struct {
	Prompt         string   `json:"prompt"`                    // 必需：文本提示词，描述生成图像中期望包含的元素和视觉特点
	Images         []string `json:"images"`                    // 必需：图像URL数组，长度不超过2，支持HTTP/HTTPS URL或Base64编码
	NegativePrompt string   `json:"negative_prompt,omitempty"` // 可选：反向提示词，描述不希望在画面中看到的内容
}

type WanImageParameters struct {
	N         int     `json:"n,omitempty"`         // 生成图片数量，取值范围1-4，默认4
	Watermark *bool   `json:"watermark,omitempty"` // 是否添加水印标识，默认false
	Seed      int     `json:"seed,omitempty"`      // 随机数种子，取值范围[0, 2147483647]
	Strength  float64 `json:"strength,omitempty"`  // 修改幅度 0.0-1.0，默认0.5（部分模型支持）
}

type AliRerankParameters struct {
	TopN            *int  `json:"top_n,omitempty"`
	ReturnDocuments *bool `json:"return_documents,omitempty"`
}

type AliRerankInput struct {
	Query     string `json:"query"`
	Documents []any  `json:"documents"`
}

type AliRerankRequest struct {
	Model      string              `json:"model"`
	Input      AliRerankInput      `json:"input"`
	Parameters AliRerankParameters `json:"parameters,omitempty"`
}

type AliRerankResponse struct {
	Output struct {
		Results []dto.RerankResponseResult `json:"results"`
	} `json:"output"`
	Usage     AliUsage `json:"usage"`
	RequestId string   `json:"request_id"`
	AliError
}
