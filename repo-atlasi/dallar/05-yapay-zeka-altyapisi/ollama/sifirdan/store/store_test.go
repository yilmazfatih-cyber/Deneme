package store

import (
	"context"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"miniollama/api"
	"miniollama/modelfile"
)

func yeniDepo(t *testing.T) *Store {
	t.Helper()
	s, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func olustur(t *testing.T, s *Store, name, src string) {
	t.Helper()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "agirlik.txt"), []byte("merhaba dünya merhaba deniz"), 0o644)
	mf, err := modelfile.Parse(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(name, mf, dir); err != nil {
		t.Fatal(err)
	}
}

func TestAdCozumleme(t *testing.T) {
	for in, want := range map[string]string{
		"turkce":                  "kayit.yerel/library/turkce:latest",
		"ali/turkce:v2":           "kayit.yerel/ali/turkce:v2",
		"ornek.com/ali/turkce:v2": "ornek.com/ali/turkce:v2",
	} {
		n, err := ParseName(in)
		if err != nil || n.String() != want {
			t.Errorf("%s -> %v %v", in, n, err)
		}
	}
	if _, err := ParseName("../kacis"); err == nil {
		t.Error("geçersiz ad kabul edildi")
	}
}

func TestOlusturListeleMirasSil(t *testing.T) {
	s := yeniDepo(t)
	olustur(t, s, "temel", "FROM ./agirlik.txt\nPARAMETER temperature 0.5\nSYSTEM sistem-1\n")
	olustur(t, s, "turev", "FROM temel\nPARAMETER seed 3\nTEMPLATE {{ .Prompt }}\n")
	m, err := s.GetModel("turev")
	if err != nil {
		t.Fatal(err)
	}
	if m.System != "sistem-1" || m.Template != "{{ .Prompt }}" || m.Params["temperature"] != 0.5 || m.Params["seed"] != 3 {
		t.Fatalf("miras hatalı: %+v", m)
	}
	base, _ := s.GetModel("temel")
	if base.ModelPath != m.ModelPath {
		t.Fatal("aynı ağırlık blob'u paylaşılmalı (içerik adresleme)")
	}
	entries, _ := s.List()
	if len(entries) != 2 {
		t.Fatalf("%d model", len(entries))
	}
	if err := s.Delete(base.Name); err != nil {
		t.Fatal(err)
	}
	if !Exists(m.ModelPath) {
		t.Fatal("türev hâlâ kullanırken blob silinmemeli")
	}
	s.Delete(m.Name)
	if Exists(m.ModelPath) {
		t.Fatal("kimse kullanmayınca blob toplanmalı")
	}
	if _, err := s.GetModel("turev"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ErrNotFound bekleniyordu: %v", err)
	}
}

func TestPullKayitDefterinden(t *testing.T) {
	uzak := yeniDepo(t)
	olustur(t, uzak, "turkce", "FROM ./agirlik.txt\nSYSTEM selam\n")
	srv := httptest.NewServer(RegistryHandler(uzak))
	defer srv.Close()

	yerel := yeniDepo(t)
	var durumlar []string
	if err := yerel.Pull(context.Background(), srv.URL, "turkce", func(p api.ProgressResponse) { durumlar = append(durumlar, p.Status) }); err != nil {
		t.Fatal(err)
	}
	if durumlar[0] != "pulling manifest" || durumlar[len(durumlar)-1] != "success" {
		t.Fatalf("durumlar: %v", durumlar)
	}
	a, _ := uzak.GetModel("turkce")
	b, err := yerel.GetModel("turkce")
	if err != nil || a.Digest != b.Digest || b.System != "selam" {
		t.Fatalf("çekilen model farklı: %v", err)
	}
	if err := yerel.Pull(context.Background(), srv.URL, "yok", func(api.ProgressResponse) {}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("olmayan model: %v", err)
	}
}

func TestBozukBlobReddedilir(t *testing.T) {
	uzak := yeniDepo(t)
	olustur(t, uzak, "turkce", "FROM ./agirlik.txt\n")
	m, _ := uzak.GetModel("turkce")
	os.WriteFile(m.ModelPath, []byte("kurcalanmış içerik"), 0o644) // kayıt defterindeki dosya bozuldu
	srv := httptest.NewServer(RegistryHandler(uzak))
	defer srv.Close()

	yerel := yeniDepo(t)
	err := yerel.Pull(context.Background(), srv.URL, "turkce", func(api.ProgressResponse) {})
	if !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("özet hatası bekleniyordu: %v", err)
	}
	if _, err := yerel.GetModel("turkce"); !errors.Is(err, ErrNotFound) {
		t.Fatal("doğrulanamayan model kurulmuş görünmemeli")
	}
}

func Exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
