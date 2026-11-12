// Package api, HTTP API'nin istek/yanıt tiplerini tanımlar.
// Gerçek karşılığı: api/types.go (GenerateRequest, ChatRequest, ProgressResponse, Duration...).
package api

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GenerateRequest struct {
	Model     string         `json:"model"`
	Prompt    string         `json:"prompt"`
	System    string         `json:"system,omitempty"`
	Template  string         `json:"template,omitempty"`
	Raw       bool           `json:"raw,omitempty"`
	Stream    *bool          `json:"stream,omitempty"`
	KeepAlive *Duration      `json:"keep_alive,omitempty"`
	Options   map[string]any `json:"options,omitempty"`
}

type ChatRequest struct {
	Model     string         `json:"model"`
	Messages  []Message      `json:"messages"`
	Stream    *bool          `json:"stream,omitempty"`
	KeepAlive *Duration      `json:"keep_alive,omitempty"`
	Options   map[string]any `json:"options,omitempty"`
}

// Metrics süreler nanosaniye cinsindendir (gerçek API ile aynı).
type Metrics struct {
	TotalDuration   time.Duration `json:"total_duration,omitempty"`
	LoadDuration    time.Duration `json:"load_duration,omitempty"`
	PromptEvalCount int           `json:"prompt_eval_count,omitempty"`
	EvalCount       int           `json:"eval_count,omitempty"`
	EvalDuration    time.Duration `json:"eval_duration,omitempty"`
}

type GenerateResponse struct {
	Model      string    `json:"model"`
	CreatedAt  time.Time `json:"created_at"`
	Response   string    `json:"response"`
	Done       bool      `json:"done"`
	DoneReason string    `json:"done_reason,omitempty"`
	Metrics
}

type ChatResponse struct {
	Model      string    `json:"model"`
	CreatedAt  time.Time `json:"created_at"`
	Message    Message   `json:"message"`
	Done       bool      `json:"done"`
	DoneReason string    `json:"done_reason,omitempty"`
	Metrics
}

type ProgressResponse struct {
	Status    string `json:"status"`
	Digest    string `json:"digest,omitempty"`
	Total     int64  `json:"total,omitempty"`
	Completed int64  `json:"completed,omitempty"`
}

type ModelDetails struct {
	Format string `json:"format"`
	Family string `json:"family"`
}

type ListModelResponse struct {
	Name       string       `json:"name"`
	Model      string       `json:"model"`
	ModifiedAt time.Time    `json:"modified_at"`
	Size       int64        `json:"size"`
	Digest     string       `json:"digest"`
	Details    ModelDetails `json:"details"`
}

type ListResponse struct {
	Models []ListModelResponse `json:"models"`
}

type ShowRequest struct {
	Model string `json:"model"`
}

type ShowResponse struct {
	Modelfile  string       `json:"modelfile"`
	Parameters string       `json:"parameters,omitempty"`
	Template   string       `json:"template,omitempty"`
	System     string       `json:"system,omitempty"`
	License    string       `json:"license,omitempty"`
	Details    ModelDetails `json:"details"`
}

type PullRequest struct {
	Model  string `json:"model"`
	Stream *bool  `json:"stream,omitempty"`
}

type ProcessModelResponse struct {
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	ExpiresAt time.Time `json:"expires_at"`
}

type ProcessResponse struct {
	Models []ProcessModelResponse `json:"models"`
}

// Duration, keep_alive alanı: "5m" gibi metin, saniye cinsinden sayı ya da negatif (= sonsuza dek) olabilir.
type Duration struct{ time.Duration }

const Forever = time.Duration(math.MaxInt64)

func (d *Duration) UnmarshalJSON(b []byte) error {
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	switch t := v.(type) {
	case float64:
		d.Duration = time.Duration(t * float64(time.Second))
	case string:
		dur, err := time.ParseDuration(t)
		if err != nil {
			return err
		}
		d.Duration = dur
	default:
		return fmt.Errorf("keep_alive için desteklenmeyen tip: %T", v)
	}
	if d.Duration < 0 {
		d.Duration = Forever
	}
	return nil
}
