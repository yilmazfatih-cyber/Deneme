package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"miniollama/api"
	"miniollama/modelfile"
	"miniollama/runner"
	"miniollama/sched"
	"miniollama/store"
)

// yanki: istemi kelime kelime geri akıtan sahte çalıştırıcı; şablonun ne ürettiğini görmemizi sağlar.
type yanki struct{}

func (yanki) Generate(_ context.Context, p string, o runner.Options, fn func(string) error) (runner.Result, error) {
	words := strings.SplitAfter(p, " ")
	for i, w := range words {
		if o.NumPredict >= 0 && i >= o.NumPredict {
			return runner.Result{PromptTokens: len(words), EvalTokens: i, DoneReason: "length"}, nil
		}
		if err := fn(w); err != nil {
			return runner.Result{}, err
		}
	}
	return runner.Result{PromptTokens: len(words), EvalTokens: len(words), DoneReason: "stop"}, nil
}
func (yanki) Size() int64  { return 42 }
func (yanki) Close() error { return nil }

const mf = "FROM ./w.txt\nSYSTEM sistem\nTEMPLATE \"\"\"{{ if .System }}[{{ .System }}] {{ end }}{{ range .Messages }}{{ .Role }}: {{ .Content }} {{ end }}asistan:\"\"\"\n"

func kur(t *testing.T, loader sched.Loader) (*httptest.Server, *store.Store) {
	t.Helper()
	st, _ := store.New(t.TempDir())
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "w.txt"), []byte("merhaba merhaba dünya"), 0o644)
	parsed, err := modelfile.Parse(strings.NewReader(mf))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.Create("deneme", parsed, dir); err != nil {
		t.Fatal(err)
	}
	if loader == nil {
		loader = func(context.Context, *store.Model) (runner.Runner, error) { return yanki{}, nil }
	}
	s := &Server{Store: st, Sched: sched.New(loader, 2, time.Minute)}
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)
	return srv, st
}

func post(t *testing.T, url, body string) *http.Response {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func satirlar[T any](t *testing.T, resp *http.Response) []T {
	t.Helper()
	if ct := resp.Header.Get("Content-Type"); ct != "application/x-ndjson" {
		t.Fatalf("Content-Type %q", ct)
	}
	var out []T
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		var v T
		if err := json.Unmarshal(sc.Bytes(), &v); err != nil {
			t.Fatalf("NDJSON satırı bozuk: %q", sc.Text())
		}
		out = append(out, v)
	}
	return out
}

func TestGenerateAkis(t *testing.T) {
	srv, _ := kur(t, nil)
	lines := satirlar[api.GenerateResponse](t, post(t, srv.URL+"/api/generate", `{"model":"deneme","prompt":"selam dünya"}`))
	var full strings.Builder
	for _, l := range lines[:len(lines)-1] {
		if l.Done {
			t.Fatal("ara satır done=true olmamalı")
		}
		full.WriteString(l.Response)
	}
	last := lines[len(lines)-1]
	if !last.Done || last.DoneReason != "stop" || last.EvalCount != len(lines)-1 {
		t.Fatalf("son satır: %+v", last)
	}
	if full.String() != "[sistem] user: selam dünya asistan:" {
		t.Fatalf("şablon uygulanmamış: %q", full.String())
	}
}

func TestGenerateAkissizVeRawVeSecenek(t *testing.T) {
	srv, _ := kur(t, nil)
	var r api.GenerateResponse
	json.NewDecoder(post(t, srv.URL+"/api/generate", `{"model":"deneme","prompt":"a b c d","raw":true,"stream":false,"options":{"num_predict":2}}`).Body).Decode(&r)
	if !r.Done || r.Response != "a b " || r.DoneReason != "length" {
		t.Fatalf("%+v", r)
	}
}

func TestChatSistemMesajiModelinkiniEzer(t *testing.T) {
	srv, _ := kur(t, nil)
	var r api.ChatResponse
	body := `{"model":"deneme","stream":false,"messages":[{"role":"system","content":"özel"},{"role":"user","content":"selam"}]}`
	json.NewDecoder(post(t, srv.URL+"/api/chat", body).Body).Decode(&r)
	if r.Message.Role != "assistant" || r.Message.Content != "[özel] user: selam asistan:" {
		t.Fatalf("%+v", r)
	}
}

func TestMarkovIleGercekUretim(t *testing.T) {
	srv, _ := kur(t, MarkovLoader(3))
	lines := satirlar[api.ChatResponse](t, post(t, srv.URL+"/api/chat", `{"model":"deneme","messages":[{"role":"user","content":"merhaba"}],"options":{"num_predict":5,"seed":1}}`))
	if len(lines) != 6 || !lines[5].Done || lines[5].EvalCount != 5 {
		t.Fatalf("%d satır, son: %+v", len(lines), lines[len(lines)-1])
	}
}

func TestTagsShowPsDelete(t *testing.T) {
	srv, _ := kur(t, nil)
	resp, _ := http.Get(srv.URL + "/api/tags")
	var tags api.ListResponse
	json.NewDecoder(resp.Body).Decode(&tags)
	resp.Body.Close()
	if len(tags.Models) != 1 || tags.Models[0].Name != "deneme:latest" || len(tags.Models[0].Digest) != 64 {
		t.Fatalf("%+v", tags)
	}
	var show api.ShowResponse
	json.NewDecoder(post(t, srv.URL+"/api/show", `{"model":"deneme"}`).Body).Decode(&show)
	if show.System != "sistem" || !strings.Contains(show.Modelfile, "TEMPLATE") {
		t.Fatalf("%+v", show)
	}
	// boş istem: yalnızca yükle; keep_alive=-1 ile sonsuza dek bellekte
	var load api.GenerateResponse
	json.NewDecoder(post(t, srv.URL+"/api/generate", `{"model":"deneme","keep_alive":-1}`).Body).Decode(&load)
	if load.DoneReason != "load" {
		t.Fatalf("%+v", load)
	}
	resp, _ = http.Get(srv.URL + "/api/ps")
	var ps api.ProcessResponse
	json.NewDecoder(resp.Body).Decode(&ps)
	resp.Body.Close()
	if len(ps.Models) != 1 || !ps.Models[0].ExpiresAt.IsZero() {
		t.Fatalf("%+v", ps)
	}
	req, _ := http.NewRequest(http.MethodDelete, srv.URL+"/api/delete", strings.NewReader(`{"model":"deneme"}`))
	if resp, err := http.DefaultClient.Do(req); err != nil || resp.StatusCode != 200 {
		t.Fatalf("silme: %v", err)
	}
	if r := post(t, srv.URL+"/api/generate", `{"model":"deneme","prompt":"x"}`); r.StatusCode != http.StatusNotFound {
		t.Fatalf("silinen model için 404 bekleniyordu: %d", r.StatusCode)
	}
}

func TestPullUcNoktasi(t *testing.T) {
	_, uzak := kur(t, nil)
	reg := httptest.NewServer(store.RegistryHandler(uzak))
	defer reg.Close()
	st, _ := store.New(t.TempDir())
	s := &Server{Store: st, Sched: sched.New(MarkovLoader(2), 1, time.Minute), RegistryURL: reg.URL}
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()
	lines := satirlar[api.ProgressResponse](t, post(t, srv.URL+"/api/pull", `{"model":"deneme"}`))
	if lines[0].Status != "pulling manifest" || lines[len(lines)-1].Status != "success" {
		t.Fatalf("%+v", lines)
	}
	if _, err := st.GetModel("deneme"); err != nil {
		t.Fatal(err)
	}
	if r := post(t, srv.URL+"/api/generate", `{"model":"bilinmeyen","prompt":"x"}`); r.StatusCode != http.StatusNotFound {
		t.Fatalf("%d", r.StatusCode)
	}
	if r := post(t, srv.URL+"/api/generate", `{bozuk json`); r.StatusCode != http.StatusBadRequest {
		t.Fatalf("%d", r.StatusCode)
	}
}
