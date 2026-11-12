// Package prompt, sohbet mesajlarını modelin beklediği düz metin isteme (prompt) çevirir.
//
// Her model ailesi farklı özel işaretler bekler (<|im_start|>, [INST], <|start_header_id|> ...).
// Ollama bunu Go'nun text/template paketiyle yazılmış şablonlarla çözer: template/*.gotmpl ve
// template/template.go. Yeni modellerde ise Go koduyla yazılmış "renderer"lar da var: model/renderers/.
package prompt

import (
	"strings"
	"text/template"

	"miniollama/api"
)

// DefaultTemplate ChatML'e benzeyen basit bir şablon.
const DefaultTemplate = `{{ if .System }}<|system|>
{{ .System }}
{{ end }}{{ range .Messages }}<|{{ .Role }}|>
{{ .Content }}
{{ end }}<|assistant|>
`

// Values şablona verilen veri. Eski tip şablonlar .Prompt kullanır, yeni tipler .Messages.
type Values struct {
	System   string
	Prompt   string
	Messages []api.Message
}

// Render şablonu çalıştırır. Sistem mesajları .System'a taşınır; son kullanıcı mesajı .Prompt olur.
func Render(tmpl string, v Values) (string, error) {
	if tmpl == "" {
		tmpl = DefaultTemplate
	}
	t, err := template.New("istem").Option("missingkey=zero").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var msgs []api.Message
	var systems []string
	if v.System != "" {
		systems = append(systems, v.System)
	}
	for _, m := range v.Messages {
		if m.Role == "system" {
			systems = append(systems, m.Content)
			continue
		}
		msgs = append(msgs, m)
		if m.Role == "user" {
			v.Prompt = m.Content
		}
	}
	if len(msgs) == 0 && v.Prompt != "" {
		msgs = []api.Message{{Role: "user", Content: v.Prompt}}
	}
	v.System, v.Messages = strings.Join(systems, "\n"), msgs
	var b strings.Builder
	if err := t.Execute(&b, v); err != nil {
		return "", err
	}
	return b.String(), nil
}
