package reputation

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Version identifies the scoring model.
const Version = "r1"

// Factor codes of model r1, in the order they appear in Score.Factors.
const (
	FactorVolumeSpike   = "volume_spike"
	FactorUniqueDest    = "unique_destinations"
	FactorAnswerRate    = "low_answer_rate"
	FactorShortCalls    = "short_calls"
	FactorComplaints    = "complaints"
	FactorThirdParty    = "third_party_labels"
	FactorVerstatFailed = "verstat_failed"
)

// Model r1 parameters. Each factor penalty grows linearly from 0 at the
// threshold to its maximum at the "full" point and is rounded to an integer.
const (
	spikeMinCalls24h = 20  // below this the 24 h volume is not assessed
	spikeThreshold   = 3.0 // 24 h calls / 7 d daily mean
	spikeFull        = 6.0
	spikeMax         = 15

	uniqueMinCalls  = 50 // contract: unique destination ratio over 7 d with >= 50 calls
	uniqueThreshold = 0.75
	uniqueFull      = 0.95
	uniqueMax       = 20

	answerMinCalls  = 20
	answerThreshold = 0.30 // contract: answer rate below 30 %
	answerFull      = 0.05
	answerMax       = 20

	shortMinAnswered = 20
	shortSeconds     = 6 // contract: answered calls shorter than 6 s
	shortThreshold   = 0.30
	shortFull        = 0.70
	shortMax         = 15

	complaintMinCalls   = 200 // denominator floor so a handful of calls cannot inflate the rate
	complaintBlockWeigh = 0.5 // a block counts as half a complaint
	complaintThreshold  = 2.0 // per 1000 calls
	complaintFull       = 12.0
	complaintMax        = 20

	labelWindow    = 30 * 24 * time.Hour
	labelHalfLife  = 7 * 24 * time.Hour
	labelThreshold = 0.0
	labelFull      = 1.0
	labelMax       = 25

	verstatMinSigned = 20
	verstatThreshold = 0.05
	verstatFull      = 0.30
	verstatMax       = 10

	floorScore = 50
)

// Score label thresholds (contract): >= 70 clean, 50-69 watch, 30-49 suspect, < 30 spam.
func labelFor(score int) core.ReputationLabel {
	switch {
	case score >= 70:
		return core.LabelClean
	case score >= 50:
		return core.LabelWatch
	case score >= 30:
		return core.LabelSuspect
	}
	return core.LabelSpam
}

// clampToLabel moves score into the band of label so an override and the
// numeric score never contradict each other (e.g. in DNS TXT records).
func clampToLabel(score int, l core.ReputationLabel) int {
	lo, hi := 0, 100
	switch l {
	case core.LabelClean:
		lo = 70
	case core.LabelWatch:
		lo, hi = 50, 69
	case core.LabelSuspect:
		lo, hi = 30, 49
	case core.LabelSpam:
		hi = 29
	}
	return min(max(score, lo), hi)
}

// labelSignal is the latest third-party label of one source.
type labelSignal struct {
	Source     string
	Label      core.ReputationLabel
	Confidence float64
	Age        time.Duration
}

// windowStats are the inputs of model r1 for one number.
type windowStats struct {
	Calls24h     int64
	Calls7d      int64
	Answered7d   int64
	Short7d      int64 // answered and < 6 s
	Unique7d     int64 // distinct destinations
	Signed7d     int64 // verstat passed or failed
	Failed7d     int64 // verstat failed
	Complaints7d int64
	Blocks7d     int64
	Labels       []labelSignal // newest label per source within 30 days
}

// ramp is the linear penalty between threshold and full (either direction).
func ramp(v, threshold, full float64, maxPenalty int) int {
	var f float64
	if full >= threshold {
		f = (v - threshold) / (full - threshold)
	} else {
		f = (threshold - v) / (threshold - full)
	}
	if f <= 0 || math.IsNaN(f) {
		return 0
	}
	if f >= 1 {
		return maxPenalty
	}
	return int(math.Round(f * float64(maxPenalty)))
}

func ratio(a, b int64) float64 {
	if b <= 0 {
		return 0
	}
	return float64(a) / float64(b)
}

// computeFactors evaluates every factor of model r1. The result always has
// seven entries, also when a factor has too little data (penalty 0).
func computeFactors(st windowStats) []core.Factor {
	return []core.Factor{
		volumeFactor(st), uniqueFactor(st), answerFactor(st), shortFactor(st),
		complaintFactor(st), thirdPartyFactor(st), verstatFactor(st),
	}
}

// rawScore is 100 minus the sum of penalties, clamped to 0..100.
func rawScore(fs []core.Factor) int {
	s := 100
	for _, f := range fs {
		s -= f.Penalty
	}
	return min(max(s, 0), 100)
}

func factorByCode(fs []core.Factor, code string) (core.Factor, bool) {
	for _, f := range fs {
		if f.Code == code {
			return f, true
		}
	}
	return core.Factor{}, false
}

func volumeFactor(st windowStats) core.Factor {
	mean := float64(st.Calls7d) / 7
	v := 0.0
	if mean > 0 {
		v = float64(st.Calls24h) / mean
	}
	f := core.Factor{Code: FactorVolumeSpike, Value: round2(v), Threshold: spikeThreshold, MaxPenalty: spikeMax}
	c24 := intTR(st.Calls24h)
	switch {
	case st.Calls24h < spikeMinCalls24h:
		f.TextTR = fmt.Sprintf("Son 24 saatte %s arama yapıldı. Ani artış için hacim düşük.", c24)
		f.TextEN = fmt.Sprintf("%s calls in the last 24 hours; too few to assess a volume spike.", intEN(st.Calls24h))
	default:
		f.Penalty = ramp(v, spikeThreshold, spikeFull, spikeMax)
		if f.Penalty == 0 {
			f.TextTR = fmt.Sprintf("Son 24 saatte %s arama yapıldı. Bu, 7 günlük ortalamanın %s katı; olağan düzeyde.", c24, decTR(v))
			f.TextEN = fmt.Sprintf("%s calls in the last 24 hours, %s× the 7-day daily average; within normal range.", intEN(st.Calls24h), decEN(v))
		} else {
			f.TextTR = fmt.Sprintf("Son 24 saatte %s arama yapıldı. Bu, günlük ortalamanın (%s) %s katı. Ani artış toplu arama kampanyalarına işaret eder.",
				c24, decTR(mean), decTR(v))
			f.TextEN = fmt.Sprintf("%s calls in the last 24 hours, %s× the 7-day daily average of %s. Sudden spikes are typical of bulk calling campaigns.",
				intEN(st.Calls24h), decEN(v), decEN(mean))
		}
	}
	return f
}

func uniqueFactor(st windowStats) core.Factor {
	v := ratio(st.Unique7d, st.Calls7d)
	f := core.Factor{Code: FactorUniqueDest, Value: round2(v), Threshold: uniqueThreshold, MaxPenalty: uniqueMax}
	switch {
	case st.Calls7d < uniqueMinCalls:
		f.TextTR = fmt.Sprintf("Son 7 günde %s arama yapıldı. Farklı numara oranı için en az %d arama gerekir.", intTR(st.Calls7d), uniqueMinCalls)
		f.TextEN = fmt.Sprintf("%s calls in the last 7 days; at least %d are needed to assess destination spread.", intEN(st.Calls7d), uniqueMinCalls)
	default:
		f.Penalty = ramp(v, uniqueThreshold, uniqueFull, uniqueMax)
		if f.Penalty == 0 {
			f.TextTR = fmt.Sprintf("Son 7 gündeki aramaların %s farklı numaralara yapıldı; olağan düzeyde.", pctTR(v))
			f.TextEN = fmt.Sprintf("%s of calls in the last 7 days went to distinct numbers; within normal range.", pctEN(v))
		} else {
			f.TextTR = fmt.Sprintf("Son 7 günde %s aramanın %s farklı numaralara yapıldı. Bu, sırayla numara taramasına işaret eder.",
				intTR(st.Calls7d), pctTR(v))
			f.TextEN = fmt.Sprintf("%s of the %s calls in the last 7 days went to distinct numbers, a pattern typical of number scanning.",
				pctEN(v), intEN(st.Calls7d))
		}
	}
	return f
}

func answerFactor(st windowStats) core.Factor {
	v := ratio(st.Answered7d, st.Calls7d)
	f := core.Factor{Code: FactorAnswerRate, Value: round2(v), Threshold: answerThreshold, MaxPenalty: answerMax}
	switch {
	case st.Calls7d < answerMinCalls:
		f.TextTR = fmt.Sprintf("Son 7 günde %s arama yapıldı. Cevaplanma oranı için en az %d arama gerekir.", intTR(st.Calls7d), answerMinCalls)
		f.TextEN = fmt.Sprintf("%s calls in the last 7 days; at least %d are needed to assess the answer rate.", intEN(st.Calls7d), answerMinCalls)
	default:
		f.Penalty = ramp(v, answerThreshold, answerFull, answerMax)
		if f.Penalty == 0 {
			f.TextTR = fmt.Sprintf("Son 7 gündeki aramaların %s cevaplandı; olağan düzeyde.", pctTR(v))
			f.TextEN = fmt.Sprintf("%s of calls in the last 7 days were answered; within normal range.", pctEN(v))
		} else {
			f.TextTR = fmt.Sprintf("Son 7 gündeki aramaların yalnızca %s cevaplandı. Aranan kişilerin çoğu bu numarayı açmıyor.", pctTR(v))
			f.TextEN = fmt.Sprintf("Only %s of calls in the last 7 days were answered; most recipients do not pick up.", pctEN(v))
		}
	}
	return f
}

func shortFactor(st windowStats) core.Factor {
	v := ratio(st.Short7d, st.Answered7d)
	f := core.Factor{Code: FactorShortCalls, Value: round2(v), Threshold: shortThreshold, MaxPenalty: shortMax}
	switch {
	case st.Answered7d < shortMinAnswered:
		f.TextTR = fmt.Sprintf("Son 7 günde %s arama cevaplandı. Kısa arama oranı için en az %d gerekir.", intTR(st.Answered7d), shortMinAnswered)
		f.TextEN = fmt.Sprintf("%s answered calls in the last 7 days; at least %d are needed to assess short calls.", intEN(st.Answered7d), shortMinAnswered)
	default:
		f.Penalty = ramp(v, shortThreshold, shortFull, shortMax)
		if f.Penalty == 0 {
			f.TextTR = fmt.Sprintf("Son 7 günde cevaplanan aramaların %s %d saniyeden kısa sürdü; olağan düzeyde.", pctTR(v), shortSeconds)
			f.TextEN = fmt.Sprintf("%s of answered calls in the last 7 days lasted under %d seconds; within normal range.", pctEN(v), shortSeconds)
		} else {
			f.TextTR = fmt.Sprintf("Son 7 günde cevaplanan aramaların %s %d saniyeden kısa sürdü. Kişiler aramayı hemen kapatıyor.", pctTR(v), shortSeconds)
			f.TextEN = fmt.Sprintf("%s of answered calls in the last 7 days lasted under %d seconds; recipients hang up almost immediately.", pctEN(v), shortSeconds)
		}
	}
	return f
}

func complaintFactor(st windowStats) core.Factor {
	den := float64(max(st.Calls7d, complaintMinCalls))
	v := (float64(st.Complaints7d) + complaintBlockWeigh*float64(st.Blocks7d)) * 1000 / den
	f := core.Factor{Code: FactorComplaints, Value: round2(v), Threshold: complaintThreshold, MaxPenalty: complaintMax}
	f.Penalty = ramp(v, complaintThreshold, complaintFull, complaintMax)
	switch {
	case st.Complaints7d == 0 && st.Blocks7d == 0:
		f.TextTR = "Son 7 günde abonelerden şikâyet veya engelleme gelmedi."
		f.TextEN = "No subscriber complaints or blocks in the last 7 days."
	case f.Penalty == 0:
		f.TextTR = fmt.Sprintf("Son 7 günde %d şikâyet ve %d engelleme geldi. 1000 aramada %s ile eşiğin altında.", st.Complaints7d, st.Blocks7d, decTR(v))
		f.TextEN = fmt.Sprintf("%d complaints and %d blocks in the last 7 days; %s per 1,000 calls is below the threshold.", st.Complaints7d, st.Blocks7d, decEN(v))
	default:
		f.TextTR = fmt.Sprintf("Son 7 günde %d şikâyet ve %d engelleme geldi. Bu, 1000 aramada %s demek.", st.Complaints7d, st.Blocks7d, decTR(v))
		f.TextEN = fmt.Sprintf("%d complaints and %d blocks in the last 7 days, %s per 1,000 calls.", st.Complaints7d, st.Blocks7d, decEN(v))
	}
	return f
}

// labelSeverity weights a third-party label; a "clean" label offsets others.
func labelSeverity(l core.ReputationLabel) float64 {
	switch l {
	case core.LabelSpam:
		return 1
	case core.LabelSuspect:
		return 0.6
	case core.LabelWatch:
		return 0.3
	case core.LabelClean:
		return -0.5
	}
	return 0
}

// labelWeight is severity × confidence × recency (half-life 7 days).
func labelWeight(s labelSignal) float64 {
	rec := math.Pow(0.5, float64(s.Age)/float64(labelHalfLife))
	return labelSeverity(s.Label) * s.Confidence * rec
}

func thirdPartyFactor(st windowStats) core.Factor {
	v := 0.0
	for _, s := range st.Labels {
		v += labelWeight(s)
	}
	v = max(v, 0)
	f := core.Factor{Code: FactorThirdParty, Value: round2(v), Threshold: labelThreshold, MaxPenalty: labelMax}
	f.Penalty = ramp(v, labelThreshold, labelFull, labelMax)
	if len(st.Labels) == 0 {
		f.TextTR = "Son 30 günde dış kaynaklardan etiket gelmedi."
		f.TextEN = "No third-party labels in the last 30 days."
		return f
	}
	var tr, en []string
	for i, s := range st.Labels {
		if i == 3 {
			tr = append(tr, fmt.Sprintf("ve %d kaynak daha", len(st.Labels)-3))
			en = append(en, fmt.Sprintf("and %d more", len(st.Labels)-3))
			break
		}
		tr = append(tr, fmt.Sprintf("%s: %s (güven %s, %s)", s.Source, labelTR(s.Label), pctPlainTR(s.Confidence), ageTR(s.Age)))
		en = append(en, fmt.Sprintf("%s: %s (%s confidence, %s)", s.Source, string(s.Label), pctEN(s.Confidence), ageEN(s.Age)))
	}
	if f.Penalty == 0 {
		f.TextTR = "Dış kaynak etiketleri olumsuz değil. " + strings.Join(tr, "; ") + "."
		f.TextEN = "Third-party labels are not negative: " + strings.Join(en, "; ") + "."
	} else {
		f.TextTR = "Dış kaynaklar bu numarayı işaretledi. " + strings.Join(tr, "; ") + "."
		f.TextEN = "Third-party sources flagged this number: " + strings.Join(en, "; ") + "."
	}
	return f
}

func verstatFactor(st windowStats) core.Factor {
	v := ratio(st.Failed7d, st.Signed7d)
	f := core.Factor{Code: FactorVerstatFailed, Value: round2(v), Threshold: verstatThreshold, MaxPenalty: verstatMax}
	switch {
	case st.Signed7d < verstatMinSigned:
		f.TextTR = fmt.Sprintf("Son 7 günde imza doğrulaması yapılan %s arama var. Değerlendirme için en az %d gerekir.", intTR(st.Signed7d), verstatMinSigned)
		f.TextEN = fmt.Sprintf("%s calls with a STIR/SHAKEN result in the last 7 days; at least %d are needed.", intEN(st.Signed7d), verstatMinSigned)
	default:
		f.Penalty = ramp(v, verstatThreshold, verstatFull, verstatMax)
		if f.Penalty == 0 {
			f.TextTR = fmt.Sprintf("Son 7 günde imzalı aramaların %s doğrulamadan geçemedi; olağan düzeyde.", pctTR(v))
			f.TextEN = fmt.Sprintf("%s of signed calls in the last 7 days failed verification; within normal range.", pctEN(v))
		} else {
			f.TextTR = fmt.Sprintf("Son 7 günde imzalı aramaların %s doğrulamadan geçemedi. Numara başkası tarafından taklit ediliyor olabilir.", pctTR(v))
			f.TextEN = fmt.Sprintf("%s of signed calls in the last 7 days failed STIR/SHAKEN verification; the number may be spoofed.", pctEN(v))
		}
	}
	return f
}

// ---------------------------------------------------------------- text helpers

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func pctInt(v float64) int64 { return int64(math.Round(v * 100)) }

// pctTR renders a ratio as Turkish percent with the possessive suffix: "%82'si", "%40'ı".
func pctTR(v float64) string {
	n := pctInt(v)
	return "%" + strconv.FormatInt(n, 10) + "'" + possessiveTR(n)
}

// pctPlainTR renders "%90" without suffix.
func pctPlainTR(v float64) string { return "%" + strconv.FormatInt(pctInt(v), 10) }

func pctEN(v float64) string { return strconv.FormatInt(pctInt(v), 10) + "%" }

// possessiveTR returns the 3rd person possessive suffix (-(s)I) for a number
// as it is read aloud, following vowel harmony of its last word.
func possessiveTR(n int64) string {
	if n < 0 {
		n = -n
	}
	ones := []string{"sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"}
	tens := []string{"", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"}
	var word string
	switch {
	case n == 0:
		word = ones[0]
	case n%10 != 0:
		word = ones[n%10]
	case n%100 != 0:
		word = tens[(n/10)%10]
	case n%1000 != 0:
		word = "yüz"
	case n%1000000 != 0:
		word = "bin"
	default:
		word = "milyon"
	}
	var last rune
	for _, r := range word {
		if strings.ContainsRune("aeıioöuü", r) {
			last = r
		}
	}
	var h string
	switch last {
	case 'a', 'ı':
		h = "ı"
	case 'e', 'i':
		h = "i"
	case 'o', 'u':
		h = "u"
	default:
		h = "ü"
	}
	r := []rune(word)
	if strings.ContainsRune("aeıioöuü", r[len(r)-1]) {
		return "s" + h
	}
	return h
}

func group(n int64, sep string) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteString(sep)
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

func intTR(n int64) string { return group(n, ".") }
func intEN(n int64) string { return group(n, ",") }

func decEN(v float64) string { return strconv.FormatFloat(math.Round(v*10)/10, 'f', 1, 64) }
func decTR(v float64) string { return strings.Replace(decEN(v), ".", ",", 1) }

func labelTR(l core.ReputationLabel) string {
	switch l {
	case core.LabelClean:
		return "temiz"
	case core.LabelWatch:
		return "izlemede"
	case core.LabelSuspect:
		return "şüpheli"
	case core.LabelSpam:
		return "spam"
	}
	return "bilinmiyor"
}

func ageDays(d time.Duration) int { return int(d / (24 * time.Hour)) }

func ageTR(d time.Duration) string {
	if n := ageDays(d); n > 0 {
		return fmt.Sprintf("%d gün önce", n)
	}
	return "son 24 saatte"
}

func ageEN(d time.Duration) string {
	switch n := ageDays(d); n {
	case 0:
		return "within the last day"
	case 1:
		return "1 day ago"
	default:
		return fmt.Sprintf("%d days ago", n)
	}
}
