package reputation

import (
	"context"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// spammy: 300 calls in 24 h, all distinct, 10 % answered, mostly short.
var spammy = pattern{n: 300, hours: 24, answerRate: 0.1, shortRate: 0.9, uniqueDest: true}

func TestScoreSpamUnregistered(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnSpam, spammy, t0))
	if _, ok, _ := env.svc.ScoreFor(ctx, tnSpam); ok {
		t.Fatal("score must not exist before scoring")
	}
	n, err := env.svc.tick(ctx)
	if err != nil || n != 1 {
		t.Fatal(n, err)
	}
	sc, ok, err := env.svc.ScoreFor(ctx, "0850 333 44 55")
	if err != nil || !ok {
		t.Fatal(ok, err)
	}
	// spike 15 + unique 20 + answer 16 (10 %) + short (30 answered, 27 short) 15 = 66 -> 34
	if sc.RawScore != 34 || sc.Score != 34 || sc.Label != core.LabelSuspect || sc.Floored {
		t.Fatalf("unexpected score %+v", sc)
	}
	if sc.Calls24h != 300 || sc.Calls7d != 300 || sc.Version != "r1" || len(sc.Factors) != 7 {
		t.Fatalf("unexpected meta %+v", sc)
	}
	// dirty set consumed
	if n, _ := env.svc.tick(ctx); n != 0 {
		t.Fatalf("dirty set not cleared: %d", n)
	}
	ev := env.notif.all()
	if len(ev) != 1 || ev[0].Type != core.EventReputationLabel || ev[0].EntityID != "" {
		t.Fatalf("events %+v", ev)
	}
}

func TestFloorVerified(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnBank, spammy, t0))
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	sc, _, _ := env.svc.ScoreFor(ctx, tnBank)
	if sc.RawScore != 34 || sc.Score != 50 || !sc.Floored || sc.Label != core.LabelWatch {
		t.Fatalf("floor not applied: %+v", sc)
	}
	ev := env.notif.all()
	if len(ev) != 1 || ev[0].EntityID != "e1" {
		t.Fatalf("label event must carry owner entity: %+v", ev)
	}

	// complaints maxed (12 per 1000 on 300 calls -> 4 complaints) removes the floor
	for i := 0; i < 4; i++ {
		if _, err := env.svc.AddFeedback(ctx, "carrier-1", "Operatör", FeedbackInput{TN: tnBank, Kind: "complaint", Reason: "ısrarlı arama"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := env.svc.tick(ctx); err != nil {
		t.Fatal(err)
	}
	sc, _, _ = env.svc.ScoreFor(ctx, tnBank)
	if f := factor(t, sc, FactorComplaints); f.Penalty != f.MaxPenalty {
		t.Fatalf("complaints not maxed: %+v", f)
	}
	if sc.Floored || sc.Score != 14 || sc.Label != core.LabelSpam {
		t.Fatalf("floor must not apply when complaints maxed: %+v", sc)
	}
	ev = env.notif.all()
	if len(ev) != 2 || ev[1].EntityID != "e1" {
		t.Fatalf("events %+v", ev)
	}
	if d := ev[1].Data.(map[string]any); d["from"] != core.LabelWatch || d["to"] != core.LabelSpam {
		t.Fatalf("event data %+v", d)
	}
}

func TestFloorNotForPendingNumber(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnNew, spammy, t0))
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	sc, _, _ := env.svc.ScoreFor(ctx, tnNew)
	if sc.Floored || sc.Score != 34 {
		t.Fatalf("pending number must not be floored: %+v", sc)
	}
	if ev := env.notif.all(); len(ev) != 1 || ev[0].EntityID != "e3" {
		t.Fatalf("events %+v", ev)
	}
}

func TestOverrideWinsThenExpires(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnSpam, spammy, t0))
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	until := t0.Add(48 * time.Hour)
	if err := env.svc.SetOverride(ctx, tnSpam, core.LabelClean, "itiraz kabul edildi", "admin-1", until); err != nil {
		t.Fatal(err)
	}
	sc, _, _ := env.svc.ScoreFor(ctx, tnSpam)
	if sc.Label != core.LabelClean || sc.OverrideLabel != core.LabelClean || sc.Score != 70 || sc.RawScore != 34 ||
		sc.OverrideUntil == nil || !sc.OverrideUntil.Equal(until) {
		t.Fatalf("override not applied: %+v", sc)
	}
	// new data does not beat the override
	mustIngest(t, env.svc, genRows(tnSpam, pattern{n: 50, hours: 2, answerRate: 0, uniqueDest: true}, t0))
	if _, err := env.svc.tick(ctx); err != nil {
		t.Fatal(err)
	}
	if sc, _, _ = env.svc.ScoreFor(ctx, tnSpam); sc.Label != core.LabelClean {
		t.Fatalf("override must win: %+v", sc)
	}
	list, _ := env.svc.ListScores(ctx, "clean", 10)
	if len(list) != 1 || list[0].TN != tnSpam {
		t.Fatalf("admin list must use effective label: %+v", list)
	}
	// expire: read path reverts immediately, the scorer publishes the change
	env.setNow(until.Add(time.Minute))
	sc, _, _ = env.svc.ScoreFor(ctx, tnSpam)
	if sc.OverrideLabel != "" || sc.Label == core.LabelClean {
		t.Fatalf("override must expire: %+v", sc)
	}
	before := len(env.notif.all())
	if _, err := env.svc.tick(ctx); err != nil {
		t.Fatal(err)
	}
	ev := env.notif.all()
	if len(ev) != before+1 || ev[len(ev)-1].Data.(map[string]any)["from"] != core.LabelClean {
		t.Fatalf("expiry must publish label change: %+v", ev)
	}
	if _, ok, _ := env.svc.getOverride(ctx, tnSpam); ok {
		t.Fatal("expired override must be deleted")
	}
}

func TestOverrideValidationAndClear(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	if err := env.svc.SetOverride(ctx, "abc", "great", "", "a", t0.Add(-time.Hour)); err == nil {
		t.Fatal("expected validation error")
	} else if ve, ok := err.(*core.ValidationError); !ok || len(ve.Fields) != 4 {
		t.Fatalf("want 4 field errors: %v", err)
	}
	if _, err := env.svc.ClearOverride(ctx, tnSpam); err == nil {
		t.Fatal("clear without data must be not found")
	}
	// override on a number without events creates a score
	if err := env.svc.SetOverride(ctx, tnSpam, core.LabelSpam, "dolandırıcılık bildirimi", "a", t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	sc, ok, _ := env.svc.ScoreFor(ctx, tnSpam)
	if !ok || sc.Label != core.LabelSpam || sc.Score != 29 {
		t.Fatalf("%+v", sc)
	}
	sc, err := env.svc.ClearOverride(ctx, tnSpam)
	if err != nil || sc.Label != core.LabelClean || sc.OverrideLabel != "" {
		t.Fatalf("%+v %v", sc, err)
	}
}

func TestThirdPartyLatestPerSource(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	conf := 1.0
	add := func(src, label string) {
		if _, err := env.svc.AddFeedback(ctx, "c1", "Carrier", FeedbackInput{TN: tnSpam, Kind: "label", Label: label, Confidence: &conf, SourceName: src}); err != nil {
			t.Fatal(err)
		}
	}
	add("TelBilgi", "spam")
	env.setNow(t0.Add(time.Minute))
	add("TelBilgi", "clean") // newer label of the same source replaces the old one
	if _, err := env.svc.tick(ctx); err != nil {
		t.Fatal(err)
	}
	sc, _, _ := env.svc.ScoreFor(ctx, tnSpam)
	if f := factor(t, sc, FactorThirdParty); f.Penalty != 0 {
		t.Fatalf("latest label per source must win: %+v", f)
	}
	add("ArayanKim", "spam")
	if _, err := env.svc.tick(ctx); err != nil {
		t.Fatal(err)
	}
	sc, _, _ = env.svc.ScoreFor(ctx, tnSpam)
	if f := factor(t, sc, FactorThirdParty); f.Penalty != 13 {
		t.Fatalf("spam - clean*0.5: %+v", f)
	}
}

func TestFeedbackValidation(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	bad := 1.5
	_, err := env.svc.AddFeedback(ctx, "c1", "", FeedbackInput{TN: "12", Kind: "like", Confidence: &bad})
	ve, ok := err.(*core.ValidationError)
	if !ok || len(ve.Fields) != 3 {
		t.Fatalf("%v", err)
	}
	if _, err := env.svc.AddFeedback(ctx, "c1", "", FeedbackInput{TN: tnSpam, Kind: "label"}); err == nil {
		t.Fatal("label kind requires label")
	}
	if _, err := env.svc.AddFeedback(ctx, "c1", "", FeedbackInput{TN: tnSpam, Kind: "complaint", Label: "spam"}); err == nil {
		t.Fatal("label only for label kind")
	}
	f, err := env.svc.AddFeedback(ctx, "c1", "Operatör A", FeedbackInput{TN: "0850 333 44 55", Kind: "block"})
	if err != nil || f.TN != tnSpam || f.SourceName != "Operatör A" || f.Confidence != 1 || f.SourceID != "c1" {
		t.Fatalf("%+v %v", f, err)
	}
	d, _ := env.svc.Daily(ctx, tnSpam, 14)
	if len(d) != 14 || d[13].Blocks != 1 || d[13].Day != "2026-11-07" {
		t.Fatalf("daily %+v", d[13])
	}
}

func TestWindowsAge(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnSpam, spammy, t0))
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	env.setNow(t0.Add(8 * 24 * time.Hour))
	if _, err := env.svc.tick(ctx); err != nil { // stale (> 1 h) scores are refreshed
		t.Fatal(err)
	}
	sc, _, _ := env.svc.ScoreFor(ctx, tnSpam)
	if sc.Calls7d != 0 || sc.Score != 100 {
		t.Fatalf("events older than 7 days must not count: %+v", sc)
	}
}

func TestSeedDemo(t *testing.T) {
	env := newEnv(t)
	ctx := context.Background()
	env.svc.SetDemoEntities(func(context.Context) ([]string, error) { return []string{"e1", "e2", "e3"}, nil })
	start := time.Now()
	if err := env.svc.SeedDemo(ctx); err != nil {
		t.Fatal(err)
	}
	t.Logf("seed took %s", time.Since(start))
	spam, ok, _ := env.svc.ScoreFor(ctx, "+908503334455")
	if !ok || spam.Label != core.LabelSpam {
		t.Fatalf("robocaller must be spam: %+v", spam)
	}
	for _, f := range spam.Factors {
		t.Logf("%s %d/%d %s", f.Code, f.Penalty, f.MaxPenalty, f.TextTR)
	}
	for _, tn := range []string{tnBank, tnShop} {
		sc, ok, _ := env.svc.ScoreFor(ctx, tn)
		if !ok || sc.Label != core.LabelClean {
			t.Fatalf("verified business %s must be clean: %+v", tn, sc)
		}
	}
	all, _ := env.svc.ListScores(ctx, "", 100)
	for _, s := range all {
		t.Logf("%s score=%d raw=%d label=%s floored=%v calls7d=%d", s.TN, s.Score, s.RawScore, s.Label, s.Floored, s.Calls7d)
	}
	if all[0].Label != core.LabelSpam {
		t.Fatal("worst first")
	}
	st, _ := env.svc.Stats(ctx)
	if st.Events24h == 0 || st.Feedback7d == 0 || st.Labels["spam"] == 0 {
		t.Fatalf("stats %+v", st)
	}
	var before int
	_ = env.svc.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM call_events`).Scan(&before)
	if err := env.svc.SeedDemo(ctx); err != nil {
		t.Fatal(err)
	}
	var after int
	_ = env.svc.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM call_events`).Scan(&after)
	if before != after {
		t.Fatal("second seed must be a no-op")
	}
}

func TestStartStops(t *testing.T) {
	env := newEnv(t)
	env.svc.base.Cfg.ScoreInterval = 10 * time.Millisecond
	mustIngest(t, env.svc, genRows(tnSpam, spammy, t0))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error)
	go func() { done <- env.svc.Start(ctx) }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, ok, _ := env.svc.ScoreFor(context.Background(), tnSpam); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("periodic scorer did not run")
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not stop")
	}
}

func TestNilDependencies(t *testing.T) {
	env := newEnv(t)
	svc, err := New(Deps{Base: env.svc.base})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	mustIngest(t, svc, genRows(tnBank, spammy, t0))
	if _, err := svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	if sc, _, _ := svc.ScoreFor(ctx, tnBank); sc.Floored {
		t.Fatal("no directory -> no floor")
	}
	if err := svc.SeedDemo(ctx); err != nil {
		t.Fatal(err)
	}
}
