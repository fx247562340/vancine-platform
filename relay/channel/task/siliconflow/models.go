package siliconflow

// VideoRequest is the request body for SiliconFlow video generation API.
// API: POST /v1/video/submit
type VideoRequest struct {
	Model     string `json:"model"`
	Prompt    string `json:"prompt,omitempty"`
	ImageURL  string `json:"image_url,omitempty"`  // For image-to-video
	ImageSize string `json:"image_size,omitempty"`  // e.g. "720p", "480p"
	Extra     *Extra `json:"extra,omitempty"`
}

// Extra holds optional parameters for video generation.
type Extra struct {
	Duration int `json:"duration,omitempty"` // Video duration in seconds
}

// VideoResponse is the response from SiliconFlow video submit API.
type VideoResponse struct {
	RequestID string `json:"request_id"`
	TaskID    string `json:"task_id"`
	Status    string `json:"status"`
}

// QueryTaskResponse is the response from SiliconFlow video status API.
type QueryTaskResponse struct {
	RequestID string `json:"request_id"`
	TaskID    string `json:"task_id"`
	Status    string `json:"status"`
	VideoURL  string `json:"video_url,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Progress  string `json:"progress,omitempty"`
}

// ModelConfig holds per-model configuration.
type ModelConfig struct {
	Name                 string
	IsImageToVideo       bool
	DefaultResolution    string
	SupportedResolutions []string
	SupportedDurations   []int
}

// GetModelConfig returns the configuration for a given model name.
func GetModelConfig(model string) ModelConfig {
	configs := map[string]ModelConfig{
		"Wan-AI/Wan2.1-T2V-14B": {
			Name:                 "Wan-AI/Wan2.1-T2V-14B",
			IsImageToVideo:       false,
			DefaultResolution:    "720p",
			SupportedResolutions: []string{"480p", "720p"},
			SupportedDurations:   []int{5, 10},
		},
		"Wan-AI/Wan2.1-T2V-1.3B": {
			Name:                 "Wan-AI/Wan2.1-T2V-1.3B",
			IsImageToVideo:       false,
			DefaultResolution:    "480p",
			SupportedResolutions: []string{"480p"},
			SupportedDurations:   []int{5},
		},
		"Wan-AI/Wan2.1-I2V-14B-720P": {
			Name:                 "Wan-AI/Wan2.1-I2V-14B-720P",
			IsImageToVideo:       true,
			DefaultResolution:    "720p",
			SupportedResolutions: []string{"720p"},
			SupportedDurations:   []int{5},
		},
		"Wan-AI/Wan2.1-I2V-14B-480P": {
			Name:                 "Wan-AI/Wan2.1-I2V-14B-480P",
			IsImageToVideo:       true,
			DefaultResolution:    "480p",
			SupportedResolutions: []string{"480p"},
			SupportedDurations:   []int{5},
		},
	}

	if config, exists := configs[model]; exists {
		return config
	}

	return ModelConfig{
		Name:                 model,
		DefaultResolution:    DefaultResolution,
		SupportedResolutions: []string{DefaultResolution},
		SupportedDurations:   []int{DefaultDuration},
	}
}
