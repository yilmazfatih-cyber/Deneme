package reputation

import (
	"strings"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

func TestRamp(t *testing.T) {
	cases := []struct {
		v, thr, full float64
		max, want    int
	}{
		{3, 3, 6, 15, 0}, {2, 3, 6, 15, 0}, {6, 3, 6, 15, 15}, {9, 3, 6, 15, 15}, {4.5, 3, 6, 15, 8},
		{0.30, 0.30, 0.05, 20, 0}, {0.05, 0.30, 0.05, 20, 20}, {0, 0.30, 0.05, 20, 20}, {0.175, 0.30, 0.05, 20, 10},
	}
	for _, c := range cases {
		if got := ramp(c.v, c.thr, c.full, c.max); got != c.want {
			t.Errorf("ramp(%v,%v,%v,%d)=%d want %d", c.v, c.thr, c.full, c.max, got, c.want)
		}
	}
}

func TestFactorBoundaries(t *testing.T) {
	cases := []struct {
		name string
		st   windowStats
		code string
		want int
	}{
		// volume spike: ratio = calls24h / (calls7d/7)
		{"spike below min volume", windowStats{Calls24h: 19, Calls7d: 19}, FactorVolumeSpike, 0},
		{"spike at threshold", windowStats{Calls24h: 30, Calls7d: 70}, FactorVolumeSpike, 0},
		{"spike midway", windowStats{Calls24h: 45, Calls7d: 70}, FactorVolumeSpike, 8},
		{"spike full", windowStats{Calls24h: 60, Calls7d: 70}, FactorVolumeSpike, 15},
		{"spike all in 24h", windowStats{Calls24h: 100, Calls7d: 100}, FactorVolumeSpike, 15},
		// unique destinations: >= 50 calls
		{"unique below 50 calls", windowStats{Calls7d: 49, Unique7d: 49}, FactorUniqueDest, 0},
		{"unique at 50 calls all distinct", windowStats{Calls7d: 50, Unique7d: 50}, FactorUniqueDest, 20},
		{"unique at threshold", windowStats{Calls7d: 100, Unique7d: 75}, FactorUniqueDest, 0},
		{"unique midway", windowStats{Calls7d: 100, Unique7d: 85}, FactorUniqueDest, 10},
		{"unique at full", windowStats{Calls7d: 100, Unique7d: 95}, FactorUniqueDest, 20},
		// answer rate below 30 %
		{"answer below min calls", windowStats{Calls7d: 19}, FactorAnswerRate, 0},
		{"answer at 30%", windowStats{Calls7d: 100, Answered7d: 30}, FactorAnswerRate, 0},
		{"answer 29%", windowStats{Calls7d: 100, Answered7d: 29}, FactorAnswerRate, 1},
		{"answer 17.5%", windowStats{Calls7d: 200, Answered7d: 35}, FactorAnswerRate, 10},
		{"answer 5%", windowStats{Calls7d: 100, Answered7d: 5}, FactorAnswerRate, 20},
		{"answer 0%", windowStats{Calls7d: 100}, FactorAnswerRate, 20},
		// short calls among answered
		{"short below min answered", windowStats{Calls7d: 100, Answered7d: 19, Short7d: 19}, FactorShortCalls, 0},
		{"short at threshold", windowStats{Calls7d: 100, Answered7d: 20, Short7d: 6}, FactorShortCalls, 0},
		{"short midway", windowStats{Calls7d: 100, Answered7d: 20, Short7d: 10}, FactorShortCalls, 8},
		{"short full", windowStats{Calls7d: 100, Answered7d: 20, Short7d: 14}, FactorShortCalls, 15},
		// complaints per 1000 (denominator >= 200), blocks weigh 0.5
		{"complaints none", windowStats{Calls7d: 1000}, FactorComplaints, 0},
		{"complaints at threshold", windowStats{Calls7d: 1000, Complaints7d: 2}, FactorComplaints, 0},
		{"blocks at threshold", windowStats{Calls7d: 1000, Blocks7d: 4}, FactorComplaints, 0},
		{"complaints midway", windowStats{Calls7d: 1000, Complaints7d: 7}, FactorComplaints, 10},
		{"complaints full", windowStats{Calls7d: 1000, Complaints7d: 12}, FactorComplaints, 20},
		{"complaints low volume floor", windowStats{Calls7d: 10, Complaints7d: 1}, FactorComplaints, 6},
		// verstat failed among signed
		{"verstat below min signed", windowStats{Signed7d: 19, Failed7d: 19}, FactorVerstatFailed, 0},
		{"verstat at threshold", windowStats{Signed7d: 100, Failed7d: 5}, FactorVerstatFailed, 0},
		{"verstat full", windowStats{Signed7d: 100, Failed7d: 30}, FactorVerstatFailed, 10},
		// third-party labels: severity × confidence × 0.5^(age/7d)
		{"label fresh spam", windowStats{Labels: []labelSignal{{"A", core.LabelSpam, 1, 0}}}, FactorThirdParty, 25},
		{"label week-old half confidence", windowStats{Labels: []labelSignal{{"A", core.LabelSpam, 0.5, 7 * 24 * time.Hour}}}, FactorThirdParty, 6},
		{"label clean offsets", windowStats{Labels: []labelSignal{{"A", core.LabelSpam, 1, 0}, {"B", core.LabelClean, 1, 0}}}, FactorThirdParty, 13},
		{"label only clean", windowStats{Labels: []labelSignal{{"B", core.LabelClean, 1, 0}}}, FactorThirdParty, 0},
		{"label two spam capped", windowStats{Labels: []labelSignal{{"A", core.LabelSpam, 0.9, 0}, {"B", core.LabelSpam, 0.9, 0}}}, FactorThirdParty, 25},
	}
	for _, c := range cases {
		fs := computeFactors(c.st)
		f, _ := factorByCode(fs, c.code)
		if f.Penalty != c.want {
			t.Errorf("%s: penalty %d want %d (value %v)", c.name, f.Penalty, c.want, f.Value)
		}
	}
}

func TestFactorsComplete(t *testing.T) {
	for _, st := range []windowStats{{}, {Calls24h: 900, Calls7d: 1000, Unique7d: 990, Answered7d: 150, Short7d: 120,
		Signed7d: 500, Failed7d: 300, Complaints7d: 30, Blocks7d: 10,
		Labels: []labelSignal{{"TelBilgi", core.LabelSpam, 0.9, 30 * time.Hour}}}} {
		fs := computeFactors(st)
		if len(fs) != 7 {
			t.Fatalf("want 7 factors, got %d", len(fs))
		}
		maxSum := 0
		for _, f := range fs {
			if f.Code == "" || f.TextTR == "" || f.TextEN == "" || f.MaxPenalty == 0 || f.Penalty < 0 || f.Penalty > f.MaxPenalty {
				t.Errorf("incomplete factor %+v", f)
			}
			maxSum += f.MaxPenalty
		}
		if maxSum != 125 {
			t.Errorf("max penalties sum %d", maxSum)
		}
	}
	if got := rawScore(computeFactors(windowStats{Calls24h: 900, Calls7d: 1000, Unique7d: 1000, Answered7d: 20, Short7d: 20,
		Signed7d: 100, Failed7d: 100, Complaints7d: 50, Labels: []labelSignal{{"A", core.LabelSpam, 1, 0}}})); got != 0 {
		t.Errorf("raw score must clamp at 0, got %d", got)
	}
}

func TestFactorTexts(t *testing.T) {
	fs := computeFactors(windowStats{Calls7d: 100, Answered7d: 50, Short7d: 41})
	f, _ := factorByCode(fs, FactorShortCalls)
	if !strings.Contains(f.TextTR, "Son 7 günde cevaplanan aramaların %82'si 6 saniyeden kısa sürdü") {
		t.Errorf("TR text: %s", f.TextTR)
	}
	if !strings.Contains(f.TextEN, "82% of answered calls") {
		t.Errorf("EN text: %s", f.TextEN)
	}
	fs = computeFactors(windowStats{Calls24h: 1234, Calls7d: 1500, Answered7d: 150})
	f, _ = factorByCode(fs, FactorAnswerRate)
	if !strings.Contains(f.TextTR, "yalnızca %10'u cevaplandı") {
		t.Errorf("TR answer text: %s", f.TextTR)
	}
	f, _ = factorByCode(fs, FactorVolumeSpike)
	if !strings.Contains(f.TextTR, "1.234 arama") || !strings.Contains(f.TextEN, "1,234 calls") {
		t.Errorf("grouping: %s / %s", f.TextTR, f.TextEN)
	}
	fs = computeFactors(windowStats{Labels: []labelSignal{{"TelBilgi", core.LabelSpam, 0.9, 50 * time.Hour}}})
	f, _ = factorByCode(fs, FactorThirdParty)
	if !strings.Contains(f.TextTR, "TelBilgi: spam (güven %90, 2 gün önce)") {
		t.Errorf("label text: %s", f.TextTR)
	}
}

func TestPossessiveTR(t *testing.T) {
	cases := map[int64]string{0: "ı", 1: "i", 2: "si", 3: "ü", 4: "ü", 5: "i", 6: "sı", 7: "si", 8: "i", 9: "u",
		10: "u", 20: "si", 30: "u", 40: "ı", 50: "si", 60: "ı", 64: "ü", 70: "i", 80: "i", 82: "si", 90: "ı", 100: "ü", 1000: "i"}
	for n, want := range cases {
		if got := possessiveTR(n); got != want {
			t.Errorf("%d: got %q want %q", n, got, want)
		}
	}
}

func TestLabelThresholds(t *testing.T) {
	cases := map[int]core.ReputationLabel{100: core.LabelClean, 70: core.LabelClean, 69: core.LabelWatch, 50: core.LabelWatch,
		49: core.LabelSuspect, 30: core.LabelSuspect, 29: core.LabelSpam, 0: core.LabelSpam}
	for s, want := range cases {
		if got := labelFor(s); got != want {
			t.Errorf("labelFor(%d)=%s want %s", s, got, want)
		}
	}
	if clampToLabel(20, core.LabelClean) != 70 || clampToLabel(90, core.LabelSpam) != 29 ||
		clampToLabel(90, core.LabelWatch) != 69 || clampToLabel(10, core.LabelSuspect) != 30 || clampToLabel(55, core.LabelWatch) != 55 {
		t.Error("clampToLabel")
	}
}

func TestApplyFloor(t *testing.T) {
	low := computeFactors(windowStats{Calls7d: 1000, Complaints7d: 5})
	maxed := computeFactors(windowStats{Calls7d: 1000, Complaints7d: 12})
	cases := []struct {
		raw      int
		verified bool
		fs       []core.Factor
		want     int
		floored  bool
	}{
		{20, true, low, 50, true},
		{49, true, low, 50, true},
		{50, true, low, 50, false},
		{80, true, low, 80, false},
		{20, false, low, 20, false},
		{20, true, maxed, 20, false},
	}
	for _, c := range cases {
		got, fl := applyFloor(c.raw, c.verified, c.fs)
		if got != c.want || fl != c.floored {
			t.Errorf("applyFloor(%d,%v)=%d,%v want %d,%v", c.raw, c.verified, got, fl, c.want, c.floored)
		}
	}
}
