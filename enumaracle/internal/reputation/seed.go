package reputation

import (
	"context"
	"fmt"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

const demoSource = "demo-seed"

// demoProfile describes a synthetic calling pattern.
type demoProfile struct {
	perDay      func(daysAgo int) int // weekday call volume for a day
	weekend     float64               // weekend volume factor
	answer      float64               // answer probability
	short       float64               // share of answered calls under 6 s
	poolFactor  float64               // destination pool size / total calls (< 1 = repeat callers)
	passed      float64               // verstat passed probability
	failed      float64               // verstat failed probability (rest: No-TN-Validation)
	hours       [2]int                // local calling hours [from, to)
	minDur      int64                 // answered duration range when not short
	maxDur      int64
	complaints  int // complaints over the last 7 days
	blocks      int
	labels      []demoLabel
	complaintTx []string
}

type demoLabel struct {
	source  string
	label   core.ReputationLabel
	conf    float64
	daysAgo int
}

func flat(n int) func(int) int { return func(int) int { return n } }

func businessProfile(u core.UseCase, verified bool) demoProfile {
	p := demoProfile{perDay: flat(55), weekend: 0.25, answer: 0.72, short: 0.06, poolFactor: 0.45,
		passed: 0.985, failed: 0.003, hours: [2]int{9, 19}, minDur: 25, maxDur: 420}
	switch u {
	case core.UseMarketing, core.UseSurvey:
		p.perDay, p.answer, p.short, p.poolFactor, p.minDur, p.maxDur = flat(130), 0.46, 0.2, 1.1, 15, 240
		p.complaints = 1
		p.complaintTx = []string{"Kampanya araması, izin vermediğimi söyledim."}
	case core.UseCollections:
		p.perDay, p.answer, p.short, p.poolFactor, p.minDur, p.maxDur = flat(85), 0.41, 0.17, 0.3, 20, 300
	case core.UseDelivery, core.UseAppointment:
		p.perDay, p.answer, p.poolFactor, p.minDur, p.maxDur = flat(70), 0.78, 0.7, 10, 90
		p.weekend = 0.6
	case core.UseOTPCallback:
		p.perDay, p.answer, p.short, p.poolFactor, p.minDur, p.maxDur = flat(40), 0.85, 0.25, 0.9, 6, 30
		p.hours, p.weekend = [2]int{0, 24}, 0.9
	}
	if !verified {
		p.passed, p.failed = 0, 0 // unsigned: No-TN-Validation
	}
	return p
}

// spamProfiles are unregistered numbers with abusive patterns.
var spamProfiles = []struct {
	tn string
	p  demoProfile
}{
	{"+908503334455", demoProfile{ // robocall campaign ramping up in the last two days
		perDay: func(d int) int {
			switch d {
			case 0:
				return 1500
			case 1:
				return 700
			}
			return 160
		},
		weekend: 0.8, answer: 0.16, short: 0.76, poolFactor: 30, passed: 0.1, failed: 0.35,
		hours: [2]int{8, 22}, minDur: 6, maxDur: 40, complaints: 24, blocks: 38,
		labels: []demoLabel{{"TelBilgi Analitik", core.LabelSpam, 0.92, 1}, {"ArayanKim", core.LabelSuspect, 0.7, 4}},
		complaintTx: []string{"Açınca kapanıyor, günde üç kez aradı.", "Kredi kartı borcu yapılandırma diye arıyorlar.",
			"Kendini banka çalışanı olarak tanıttı, şifre istedi.", "Kayıtlı ses, kampanya anlatıyor."},
	}},
	{"+908502220011", demoProfile{ // steady unsolicited marketing
		perDay: flat(310), weekend: 0.7, answer: 0.22, short: 0.6, poolFactor: 30, passed: 0.05, failed: 0.1,
		hours: [2]int{9, 21}, minDur: 6, maxDur: 90, complaints: 9, blocks: 14,
		labels:      []demoLabel{{"TelBilgi Analitik", core.LabelSpam, 0.8, 3}},
		complaintTx: []string{"İzinsiz sigorta teklifi.", "Engelledim, başka numaradan aradılar.", "Her gün aynı saatte arıyor."},
	}},
	{"+902129998877", demoProfile{ // spoofed geographic number, last 5 days only
		perDay: func(d int) int {
			if d < 5 {
				return 210
			}
			return 0
		},
		weekend: 1, answer: 0.27, short: 0.42, poolFactor: 30, passed: 0.3, failed: 0.6,
		hours: [2]int{10, 20}, minDur: 6, maxDur: 120, complaints: 6, blocks: 8,
		complaintTx: []string{"Vergi dairesinden arıyoruz dediler, sahte.", "Kargo ücreti istediler."},
	}},
	{"+902124567788", demoProfile{ // borderline: watch / suspect
		perDay: flat(120), weekend: 0.4, answer: 0.22, short: 0.45, poolFactor: 30, passed: 0, failed: 0,
		hours: [2]int{9, 19}, minDur: 10, maxDur: 200, complaints: 1, blocks: 2,
		labels:      []demoLabel{{"ArayanKim", core.LabelSuspect, 0.55, 6}},
		complaintTx: []string{"Anket diye aradılar, kişisel bilgi sordular."},
	}},
}

type demoNum struct {
	tn       string
	useCase  core.UseCase
	verified bool
}

// SeedDemo generates about 14 days of synthetic events and feedback for the
// numbers known to Directory (healthy business patterns) and for a few
// unregistered abusive numbers, then recomputes all scores. It does nothing
// when call events already exist.
func (s *Service) SeedDemo(ctx context.Context) error {
	if has, err := s.hasEvents(ctx); err != nil || has {
		return err
	}
	rng := rand.New(rand.NewPCG(20261107, 90))
	now := s.now()
	nums, err := s.demoNumbers(ctx)
	if err != nil {
		return err
	}
	var events []eventRow
	var fbs []core.LabelFeedback
	for _, n := range nums {
		p := businessProfile(n.useCase, n.verified)
		events = append(events, genEvents(rng, n.tn, p, now)...)
		fbs = append(fbs, genFeedback(rng, n.tn, p, now)...)
	}
	for _, sp := range spamProfiles {
		events = append(events, genEvents(rng, sp.tn, sp.p, now)...)
		fbs = append(fbs, genFeedback(rng, sp.tn, sp.p, now)...)
	}
	for i := 0; i < len(events); i += MaxEventsPerRequest {
		if err := s.insertEvents(ctx, demoSource, events[i:min(i+MaxEventsPerRequest, len(events))]); err != nil {
			return err
		}
	}
	if len(fbs) > 0 {
		if err := s.insertFeedback(ctx, fbs); err != nil {
			return err
		}
	}
	n, err := s.Recompute(ctx)
	s.log.Info("reputation demo data seeded", "events", len(events), "feedback", len(fbs), "business_numbers", len(nums), "scored", n)
	return err
}

// demoNumbers collects up to 12 numbers from Directory. Entity ids come from
// SetDemoEntities when installed, else from the audit log and, best effort,
// from the registry's entity table.
func (s *Service) demoNumbers(ctx context.Context) ([]demoNum, error) {
	if s.dir == nil {
		return nil, nil
	}
	var ids []string
	s.demoMu.Lock()
	f := s.demoEntities
	s.demoMu.Unlock()
	if f != nil {
		got, err := f(ctx)
		if err != nil {
			return nil, err
		}
		ids = got
	} else {
		if ev, err := platform.ListAudit(ctx, s.db, "entity", "", 1000); err == nil {
			for _, e := range ev {
				ids = append(ids, e.TargetID)
			}
		}
		// Best effort: core.EntityDirectory cannot enumerate entities. Errors
		// (e.g. a differently named table) are ignored.
		if more, err := s.queryStrings(ctx, `SELECT id FROM entities`); err == nil {
			ids = append(ids, more...)
		}
	}
	var out []demoNum
	seenEnt, seenTN := map[string]bool{}, map[string]bool{}
	for _, id := range ids {
		if id == "" || seenEnt[id] {
			continue
		}
		seenEnt[id] = true
		nums, err := s.dir.NumbersOf(ctx, id)
		if err != nil {
			continue
		}
		ent, err := s.dir.GetEntity(ctx, id)
		if err != nil {
			continue
		}
		for _, n := range nums {
			if n.Status == core.NumberReleased {
				continue
			}
			verified := ent.Status == core.EntityVerified && n.Status == core.NumberActive
			for _, tn := range sampleRange(n, 3) {
				if seenTN[tn] || len(out) >= 12 {
					continue
				}
				seenTN[tn] = true
				out = append(out, demoNum{tn, n.UseCase, verified})
			}
		}
	}
	return out, nil
}

// sampleRange returns up to k numbers from the start of a number range.
func sampleRange(n core.Number, k int) []string {
	if n.RangeStart == n.RangeEnd || n.RangeEnd == "" {
		return []string{n.RangeStart}
	}
	start, err1 := strconv.ParseInt(core.Digits(n.RangeStart), 10, 64)
	end, err2 := strconv.ParseInt(core.Digits(n.RangeEnd), 10, 64)
	if err1 != nil || err2 != nil {
		return []string{n.RangeStart}
	}
	var out []string
	for v := start; v <= end && len(out) < k; v++ {
		out = append(out, "+"+strconv.FormatInt(v, 10))
	}
	return out
}

func randomMobile(rng *rand.Rand) string {
	prefixes := []string{"532", "533", "535", "537", "541", "542", "505", "506", "551", "553", "555", "544"}
	return fmt.Sprintf("+90%s%07d", prefixes[rng.IntN(len(prefixes))], rng.IntN(10000000))
}

// genEvents produces 14 days of events for tn following profile p.
func genEvents(rng *rand.Rand, tn string, p demoProfile, now time.Time) []eventRow {
	type day struct {
		start time.Time
		n     int
	}
	local := now.In(trZone)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, trZone)
	var days []day
	total := 0
	for d := 13; d >= 0; d-- {
		ds := today.AddDate(0, 0, -d)
		n := p.perDay(d)
		if wd := ds.Weekday(); wd == time.Saturday || wd == time.Sunday {
			n = int(float64(n) * p.weekend)
		}
		n = int(float64(n) * (0.85 + 0.3*rng.Float64()))
		days = append(days, day{ds, n})
		total += n
	}
	pool := make([]string, max(1, int(float64(total)*p.poolFactor)))
	for i := range pool {
		pool[i] = randomMobile(rng)
	}
	var out []eventRow
	for _, d := range days {
		span := p.hours[1] - p.hours[0]
		for i := 0; i < d.n; i++ {
			t := d.start.Add(time.Duration(p.hours[0])*time.Hour + time.Duration(rng.Int64N(int64(span)*int64(time.Hour))))
			if t.After(now) {
				// today's calls beyond the current time are moved into the elapsed part of the day
				el := now.Sub(d.start)
				if el <= 0 {
					continue
				}
				t = d.start.Add(time.Duration(rng.Int64N(int64(el))))
			}
			e := eventRow{OrigTN: tn, DestTN: pool[rng.IntN(len(pool))], StartedAt: t.UTC()}
			if p.poolFactor >= 10 {
				e.DestTN = randomMobile(rng)
			}
			switch x := rng.Float64(); {
			case x < p.answer:
				e.Disposition = "answered"
				if rng.Float64() < p.short {
					e.DurationSec = 1 + rng.Int64N(5)
				} else {
					e.DurationSec = p.minDur + rng.Int64N(max(1, p.maxDur-p.minDur))
				}
			case x < p.answer+(1-p.answer)*0.7:
				e.Disposition = "no_answer"
			case x < p.answer+(1-p.answer)*0.85:
				e.Disposition = "busy"
			default:
				e.Disposition = "rejected"
			}
			switch v := rng.Float64(); {
			case v < p.passed:
				e.Verstat = string(core.VerstatPassed)
			case v < p.passed+p.failed:
				e.Verstat = string(core.VerstatFailed)
			default:
				e.Verstat = string(core.VerstatNone)
			}
			out = append(out, e)
		}
	}
	return out
}

func genFeedback(rng *rand.Rand, tn string, p demoProfile, now time.Time) []core.LabelFeedback {
	var out []core.LabelFeedback
	add := func(kind core.FeedbackKind, reason string) {
		out = append(out, core.LabelFeedback{ID: core.NewID(), TN: tn, SourceID: demoSource, SourceName: "Abone bildirimi",
			Kind: kind, Confidence: 1, Reason: reason,
			CreatedAt: now.Add(-time.Duration(rng.Int64N(int64(6 * 24 * time.Hour))))})
	}
	for i := 0; i < p.complaints; i++ {
		reason := ""
		if len(p.complaintTx) > 0 {
			reason = p.complaintTx[i%len(p.complaintTx)]
		}
		add(core.FeedbackComplaint, reason)
	}
	for i := 0; i < p.blocks; i++ {
		add(core.FeedbackBlock, "")
	}
	for _, l := range p.labels {
		out = append(out, core.LabelFeedback{ID: core.NewID(), TN: tn, SourceID: demoSource, SourceName: l.source,
			Kind: core.FeedbackLabel, Label: l.label, Confidence: l.conf, Reason: "Toplu bildirim analizi",
			CreatedAt: now.Add(-time.Duration(l.daysAgo)*24*time.Hour - time.Hour)})
	}
	return out
}
