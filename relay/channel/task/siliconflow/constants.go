package siliconflow

const (
	ChannelName = "siliconflow-video"
)

var ModelList = []string{
	"Wan-AI/Wan2.1-T2V-14B",
	"Wan-AI/Wan2.1-T2V-1.3B",
	"Wan-AI/Wan2.1-I2V-14B-720P",
	"Wan-AI/Wan2.1-I2V-14B-480P",
}

const (
	TextToVideoEndpoint  = "/v1/video/submit"
	ImageToVideoEndpoint = "/v1/video/submit"
	QueryTaskEndpoint    = "/v1/video/status"
)

// SiliconFlow video task statuses
const (
	TaskStatusSubmitted  = "SUBMITTED"
	TaskStatusProcessing = "PROCESSING"
	TaskStatusSucceed    = "SUCCEED"
	TaskStatusFailed     = "FAILED"
	TaskStatusCancelled  = "CANCELLED"
)

const (
	DefaultDuration   = 5
	DefaultResolution = "720p"
)
