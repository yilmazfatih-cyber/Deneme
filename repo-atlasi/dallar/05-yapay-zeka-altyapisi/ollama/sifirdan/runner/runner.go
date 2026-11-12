// Package runner, "modeli çalıştıran şey"i bir arayüzün arkasına saklar.
//
// Gerçek Ollama'da bu arayüz llm/server.go içindeki LlamaServer'dır: GGUF modeller için ayrı bir
// alt süreç olarak llama.cpp'nin llama-server'ı başlatılır ve onunla yerel HTTP üzerinden konuşulur
// (llm/llama_server.go); safetensors modeller için "ollama runner" alt süreci MLX motorunu çalıştırır
// (mlxrunner/). Sunucu yalnızca arayüzü bilir; burada yerine karakter düzeyinde bir Markov zinciri var.
package runner

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sort"
	"strings"
	"time"
)

type Options struct {
	Temperature float64
	NumPredict  int
	Seed        int64
	Stop        []string
}

// OptionsFrom önce varsayılanları, sonra modelin PARAMETER'larını, en son isteğin options'ını uygular.
func OptionsFrom(layers ...map[string]any) Options {
	o := Options{Temperature: 0.8, NumPredict: 128, Seed: -1}
	for _, m := range layers {
		for k, v := range m {
			switch k {
			case "temperature":
				o.Temperature = toFloat(v)
			case "num_predict":
				o.NumPredict = int(toFloat(v))
			case "seed":
				o.Seed = int64(toFloat(v))
			case "stop":
				o.Stop = toStrings(v)
			}
		}
	}
	return o
}

func toFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case int64:
		return float64(t)
	}
	return 0
}

func toStrings(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			out = append(out, fmt.Sprint(x))
		}
		return out
	case string:
		return []string{t}
	}
	return nil
}

type Result struct {
	PromptTokens int
	EvalTokens   int
	DoneReason   string // "stop" ya da "length"
}

type Runner interface {
	// Generate her yeni parça (belirteç) için fn'i çağırır; fn hata dönerse üretim durur.
	Generate(ctx context.Context, prompt string, opts Options, fn func(piece string) error) (Result, error)
	Size() int64
	Close() error
}

// Markov: bağlamı son `order` karakter olan karakter düzeyinde bir n-gram modeli.
type Markov struct {
	order int
	next  map[string][]candidate // bağlam -> (karakter, sayı), karakter sırasına göre (deterministik)
	size  int64
}

type candidate struct {
	r     rune
	count int
}

// LoadMarkov "ağırlık dosyası"nı (düz metin) okuyup geçiş tablosunu kurar: yüklemenin karşılığı.
func LoadMarkov(path string, order int) (*Markov, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return NewMarkov(string(data), order), nil
}

func NewMarkov(text string, order int) *Markov {
	runes := []rune(text)
	counts := map[string]map[rune]int{}
	for i, r := range runes {
		for k := 0; k <= order && k <= i; k++ { // 0..order uzunluğundaki tüm bağlamlar (geri çekilme için)
			ctx := string(runes[i-k : i])
			if counts[ctx] == nil {
				counts[ctx] = map[rune]int{}
			}
			counts[ctx][r]++
		}
	}
	m := &Markov{order: order, next: map[string][]candidate{}}
	for ctx, c := range counts {
		list := make([]candidate, 0, len(c))
		for r, n := range c {
			list = append(list, candidate{r, n})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].r < list[j].r })
		m.next[ctx] = list
		m.size += int64(len(ctx)*4 + len(list)*12)
	}
	return m
}

func (m *Markov) Size() int64  { return m.size }
func (m *Markov) Close() error { m.next = nil; return nil }

func (m *Markov) Generate(ctx context.Context, prompt string, o Options, fn func(string) error) (Result, error) {
	seed := o.Seed
	if seed < 0 {
		seed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewSource(seed))
	hist := []rune(prompt)
	res := Result{PromptTokens: len(hist), DoneReason: "length"}
	var out strings.Builder
	limit := o.NumPredict
	if limit < 0 {
		limit = math.MaxInt
	}
	for res.EvalTokens < limit {
		if err := ctx.Err(); err != nil {
			return res, err
		}
		r, ok := m.sample(hist, o.Temperature, rng)
		if !ok {
			res.DoneReason = "stop"
			break
		}
		hist = append(hist, r)
		res.EvalTokens++
		out.WriteRune(r)
		if st, hit := stopAt(out.String(), o.Stop); hit { // durdurma dizisi çıktıya yazılmaz
			rest := strings.TrimSuffix(out.String(), st)
			out.Reset()
			out.WriteString(rest)
			res.DoneReason = "stop"
			break
		}
		if !mayBeginStop(out.String(), o.Stop) { // olası bir durdurma dizisinin başıysa beklet
			if err := fn(out.String()); err != nil {
				return res, err
			}
			out.Reset()
		}
	}
	if out.Len() > 0 {
		if err := fn(out.String()); err != nil {
			return res, err
		}
	}
	return res, nil
}

// sample en uzun bilinen bağlamdan sonraki karakteri seçer (bilinmiyorsa daha kısa bağlama geri çekilir).
func (m *Markov) sample(hist []rune, temp float64, rng *rand.Rand) (rune, bool) {
	for k := min(m.order, len(hist)); k >= 0; k-- {
		cands := m.next[string(hist[len(hist)-k:])]
		if len(cands) == 0 {
			continue
		}
		if temp <= 0 { // açgözlü: en sık karakter (eşitlikte en küçük)
			best := cands[0]
			for _, c := range cands[1:] {
				if c.count > best.count {
					best = c
				}
			}
			return best.r, true
		}
		weights := make([]float64, len(cands)) // sıcaklık: sayı^(1/T)
		total := 0.0
		for i, c := range cands {
			weights[i] = math.Pow(float64(c.count), 1/temp)
			total += weights[i]
		}
		x := rng.Float64() * total
		for i, w := range weights {
			if x < w {
				return cands[i].r, true
			}
			x -= w
		}
		return cands[len(cands)-1].r, true
	}
	return 0, false
}

func stopAt(s string, stops []string) (string, bool) {
	for _, st := range stops {
		if st != "" && strings.HasSuffix(s, st) {
			return st, true
		}
	}
	return "", false
}

// mayBeginStop: tampon bir durdurma dizisinin başı olabilir mi? Öyleyse henüz gönderme.
func mayBeginStop(s string, stops []string) bool {
	for _, st := range stops {
		for i := 1; i < len(st) && i <= len(s); i++ {
			if strings.HasSuffix(s, st[:i]) {
				return true
			}
		}
	}
	return false
}
