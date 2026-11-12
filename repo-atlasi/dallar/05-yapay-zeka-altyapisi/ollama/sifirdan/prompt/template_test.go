package prompt

import (
	"testing"

	"miniollama/api"
)

func TestSohbetSablonu(t *testing.T) {
	got, err := Render("", Values{System: "Kısa cevap ver.", Messages: []api.Message{
		{Role: "user", Content: "Merhaba"}, {Role: "assistant", Content: "Selam!"}, {Role: "user", Content: "Nasılsın?"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := "<|system|>\nKısa cevap ver.\n<|user|>\nMerhaba\n<|assistant|>\nSelam!\n<|user|>\nNasılsın?\n<|assistant|>\n"
	if got != want {
		t.Fatalf("\n%q\n%q", got, want)
	}
}

func TestEskiTipPromptSablonuVeSistemMesaji(t *testing.T) {
	got, _ := Render("[{{ .System }}] {{ .Prompt }}", Values{Messages: []api.Message{
		{Role: "system", Content: "S"}, {Role: "user", Content: "ilk"}, {Role: "user", Content: "son"},
	}})
	if got != "[S] son" {
		t.Fatalf("%q", got)
	}
}

func TestGenerateTekIstem(t *testing.T) {
	got, _ := Render("{{ range .Messages }}{{ .Role }}={{ .Content }}{{ end }}", Values{Prompt: "selam"})
	if got != "user=selam" {
		t.Fatalf("%q", got)
	}
	if _, err := Render("{{ .Yok", Values{}); err == nil {
		t.Fatal("bozuk şablon hata vermeli")
	}
}
