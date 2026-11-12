package runner

import (
	"context"
	"strings"
	"testing"
)

const metin = "kedi kediye bakti. kedi kaba bakti. kopek kediye bakti. "

func generate(t *testing.T, m *Markov, prompt string, o Options) (string, Result) {
	t.Helper()
	var b strings.Builder
	res, err := m.Generate(context.Background(), prompt, o, func(p string) error { b.WriteString(p); return nil })
	if err != nil {
		t.Fatal(err)
	}
	return b.String(), res
}

func TestTohumlaDeterministik(t *testing.T) {
	m := NewMarkov(metin, 3)
	o := Options{Temperature: 1.0, NumPredict: 40, Seed: 42}
	a, _ := generate(t, m, "kedi", o)
	b, _ := generate(t, m, "kedi", o)
	if a != b {
		t.Fatalf("aynı tohum farklı çıktı: %q / %q", a, b)
	}
}

func TestNumPredictVeUzunlukNedeni(t *testing.T) {
	out, res := generate(t, NewMarkov(metin, 3), "ked", Options{Temperature: 0, NumPredict: 7})
	if len([]rune(out)) != 7 || res.EvalTokens != 7 || res.DoneReason != "length" || res.PromptTokens != 3 {
		t.Fatalf("%q %+v", out, res)
	}
}

func TestDurdurmaDizisiCiktiyaGirmez(t *testing.T) {
	out, res := generate(t, NewMarkov(metin, 4), "kopek ", Options{Temperature: 0, NumPredict: 50, Stop: []string{"bakti"}})
	if strings.Contains(out, "bakti") || res.DoneReason != "stop" || out != "kedi kaba " { // açgözlü; eşitlikte küçük karakter ("a" < "e")
		t.Fatalf("%q %+v", out, res)
	}
}

func TestIptal(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := NewMarkov(metin, 2).Generate(ctx, "k", Options{NumPredict: 5}, func(string) error { return nil })
	if err == nil {
		t.Fatal("iptal edilen bağlam hata döndürmeli")
	}
}

func TestSecenekKatmanlari(t *testing.T) {
	o := OptionsFrom(map[string]any{"temperature": 0.2, "stop": []string{"x"}}, map[string]any{"temperature": 0.9, "num_predict": float64(5)})
	if o.Temperature != 0.9 || o.NumPredict != 5 || len(o.Stop) != 1 || o.Seed != -1 {
		t.Fatalf("%+v", o)
	}
}
