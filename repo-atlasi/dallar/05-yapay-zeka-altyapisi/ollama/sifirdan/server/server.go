// Package server, Ollama HTTP API'sinin küçük bir alt kümesini sunar.
//
// Gerçek karşılığı: server/routes.go (GenerateRoutes, GenerateHandler, ChatHandler, PullHandler,
// ListHandler, ShowHandler, PsHandler, streamResponse). Akış biçimi NDJSON'dur: her satır bir JSON
// nesnesi, Content-Type: application/x-ndjson. "stream": false verilirse tek bir JSON döner.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"miniollama/api"
	"miniollama/modelfile"
	"miniollama/prompt"
	"miniollama/runner"
	"miniollama/sched"
	"miniollama/store"
)

type Server struct {
	Store       *store.Store
	Sched       *sched.Scheduler
	RegistryURL string
}

// MarkovLoader gerçek sistemdeki "alt süreç başlat + modeli yükle" adımının karşılığı.
func MarkovLoader(order int) sched.Loader {
	return func(_ context.Context, m *store.Model) (runner.Runner, error) {
		return runner.LoadMarkov(m.ModelPath, order)
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, "miniollama çalışıyor") })
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"version": "0.1.0-mini"})
	})
	mux.HandleFunc("POST /api/generate", s.generate)
	mux.HandleFunc("POST /api/chat", s.chat)
	mux.HandleFunc("GET /api/tags", s.tags)
	mux.HandleFunc("POST /api/show", s.show)
	mux.HandleFunc("POST /api/pull", s.pull)
	mux.HandleFunc("GET /api/ps", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, api.ProcessResponse{Models: s.Sched.Ps()})
	})
	mux.HandleFunc("DELETE /api/delete", s.delete)
	return mux
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false) // "<|user|>" gibi işaretler \u003c olarak kaçışlanmasın
	enc.Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	code := http.StatusInternalServerError
	switch {
	case errors.Is(err, store.ErrNotFound):
		code = http.StatusNotFound
	case errors.Is(err, errBadRequest):
		code = http.StatusBadRequest
	}
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

var errBadRequest = errors.New("geçersiz istek")

func decode(r *http.Request, v any) error {
	if err := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(v); err != nil {
		return fmt.Errorf("%w: %v", errBadRequest, err)
	}
	return nil
}

// ndjson her nesneyi bir satıra yazar ve hemen istemciye iter (flush).
type ndjson struct {
	w   http.ResponseWriter
	enc *json.Encoder
}

func newNDJSON(w http.ResponseWriter) *ndjson {
	w.Header().Set("Content-Type", "application/x-ndjson")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	return &ndjson{w, enc}
}

func (n *ndjson) send(v any) error {
	if err := n.enc.Encode(v); err != nil {
		return err
	}
	if f, ok := n.w.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}

func wantsStream(p *bool) bool { return p == nil || *p }

// run ortak çekirdek: modeli bul, istemi hazırla, zamanlayıcıdan çalıştırıcı al, üret.
func (s *Server) run(w http.ResponseWriter, r *http.Request, name string, keepAlive *api.Duration, opts map[string]any,
	stream bool, render func(m *store.Model) (string, error), chunk func(piece string) any, final func(full string, met api.Metrics, reason string) any) {
	start := time.Now()
	m, err := s.Store.GetModel(name)
	if err != nil {
		writeErr(w, err)
		return
	}
	text, err := render(m)
	if err != nil {
		writeErr(w, fmt.Errorf("%w: şablon: %v", errBadRequest, err))
		return
	}
	ref, release, err := s.Sched.Acquire(r.Context(), m, keepAlive)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer release()
	met := api.Metrics{LoadDuration: time.Since(start)}
	if text == "" { // boş istem: yalnızca yükle (gerçekte de "done_reason": "load")
		met.TotalDuration = time.Since(start)
		writeJSON(w, http.StatusOK, final("", met, "load"))
		return
	}
	o := runner.OptionsFrom(m.Params, opts)
	var full strings.Builder
	var out *ndjson
	if stream {
		out = newNDJSON(w)
	}
	evalStart := time.Now()
	res, err := ref.Runner.Generate(r.Context(), text, o, func(piece string) error {
		full.WriteString(piece)
		if out != nil {
			return out.send(chunk(piece))
		}
		return nil
	})
	if err != nil {
		if out != nil { // akış başladıktan sonra hata da bir satır olarak gider
			out.send(map[string]string{"error": err.Error()})
			return
		}
		writeErr(w, err)
		return
	}
	met.PromptEvalCount, met.EvalCount = res.PromptTokens, res.EvalTokens
	met.EvalDuration, met.TotalDuration = time.Since(evalStart), time.Since(start)
	if out != nil {
		out.send(final("", met, res.DoneReason))
		return
	}
	writeJSON(w, http.StatusOK, final(full.String(), met, res.DoneReason))
}

func (s *Server) generate(w http.ResponseWriter, r *http.Request) {
	var req api.GenerateRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	now := time.Now().UTC()
	s.run(w, r, req.Model, req.KeepAlive, req.Options, wantsStream(req.Stream),
		func(m *store.Model) (string, error) {
			if req.Raw || req.Prompt == "" {
				return req.Prompt, nil
			}
			tmpl, system := m.Template, m.System
			if req.Template != "" {
				tmpl = req.Template
			}
			if req.System != "" {
				system = req.System
			}
			return prompt.Render(tmpl, prompt.Values{System: system, Prompt: req.Prompt})
		},
		func(piece string) any { return api.GenerateResponse{Model: req.Model, CreatedAt: now, Response: piece} },
		func(full string, met api.Metrics, reason string) any {
			return api.GenerateResponse{Model: req.Model, CreatedAt: time.Now().UTC(), Response: full, Done: true, DoneReason: reason, Metrics: met}
		})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	var req api.ChatRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	now := time.Now().UTC()
	s.run(w, r, req.Model, req.KeepAlive, req.Options, wantsStream(req.Stream),
		func(m *store.Model) (string, error) {
			if len(req.Messages) == 0 {
				return "", nil
			}
			system := m.System
			for _, msg := range req.Messages { // istekte sistem mesajı varsa modelinkini ezer
				if msg.Role == "system" {
					system = ""
				}
			}
			return prompt.Render(m.Template, prompt.Values{System: system, Messages: req.Messages})
		},
		func(piece string) any {
			return api.ChatResponse{Model: req.Model, CreatedAt: now, Message: api.Message{Role: "assistant", Content: piece}}
		},
		func(full string, met api.Metrics, reason string) any {
			return api.ChatResponse{Model: req.Model, CreatedAt: time.Now().UTC(), Message: api.Message{Role: "assistant", Content: full},
				Done: true, DoneReason: reason, Metrics: met}
		})
}

func (s *Server) tags(w http.ResponseWriter, _ *http.Request) {
	entries, err := s.Store.List()
	if err != nil {
		writeErr(w, err)
		return
	}
	resp := api.ListResponse{Models: []api.ListModelResponse{}}
	for _, e := range entries {
		var size int64
		for _, l := range e.Manifest.Layers {
			size += l.Size
		}
		n := e.Name.Short()
		resp.Models = append(resp.Models, api.ListModelResponse{Name: n, Model: n, ModifiedAt: e.ModTime, Size: size,
			Digest: e.Digest, Details: api.ModelDetails{Format: "markov-metin", Family: "markov"}})
	}
	sort.Slice(resp.Models, func(i, j int) bool { return resp.Models[i].Name < resp.Models[j].Name })
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) show(w http.ResponseWriter, r *http.Request) {
	var req api.ShowRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	m, err := s.Store.GetModel(req.Model)
	if err != nil {
		writeErr(w, err)
		return
	}
	mf := modelfile.Modelfile{From: m.ModelPath, Template: m.Template, System: m.System, License: m.License, Parameters: m.RawParams}
	var params []string
	for k, vals := range m.RawParams {
		for _, v := range vals {
			params = append(params, fmt.Sprintf("%-12s %s", k, v))
		}
	}
	sort.Strings(params)
	writeJSON(w, http.StatusOK, api.ShowResponse{Modelfile: mf.String(), Parameters: strings.Join(params, "\n"),
		Template: m.Template, System: m.System, License: m.License, Details: api.ModelDetails{Format: "markov-metin", Family: "markov"}})
}

func (s *Server) pull(w http.ResponseWriter, r *http.Request) {
	var req api.PullRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	if s.RegistryURL == "" {
		writeErr(w, fmt.Errorf("%w: sunucuya kayıt defteri adresi verilmedi (-registry)", errBadRequest))
		return
	}
	if !wantsStream(req.Stream) {
		if err := s.Store.Pull(r.Context(), s.RegistryURL, req.Model, func(api.ProgressResponse) {}); err != nil {
			writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, api.ProgressResponse{Status: "success"})
		return
	}
	out := newNDJSON(w)
	if err := s.Store.Pull(r.Context(), s.RegistryURL, req.Model, func(p api.ProgressResponse) { out.send(p) }); err != nil {
		out.send(map[string]string{"error": err.Error()})
	}
}

func (s *Server) delete(w http.ResponseWriter, r *http.Request) {
	var req api.ShowRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, err)
		return
	}
	m, err := s.Store.GetModel(req.Model)
	if err != nil {
		writeErr(w, err)
		return
	}
	s.Sched.Unload(m.Digest)
	if err := s.Store.Delete(m.Name); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusOK)
}
