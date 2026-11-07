package reputation

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestIngestJSONPartialErrors(t *testing.T) {
	env := newEnv(t)
	body := `{"events":[
		{"orig_tn":"0850 111 22 33","dest_tn":"05321234567","started_at":"2026-11-07T14:00:00+03:00","disposition":"answered","duration_sec":42,"verstat":"TN-Validation-Passed"},
		{"orig_tn":"12345","dest_tn":"05321234567","started_at":"2026-11-07T14:00:00+03:00","disposition":"answered","duration_sec":42},
		{"orig_tn":"08501112233","dest_tn":"05321234567","started_at":"dün","disposition":"hung_up","duration_sec":-1},
		{"orig_tn":"08501112233","dest_tn":"05321234567","started_at":"2026-11-07T14:00:00+03:00","disposition":"answered","duration_sec":"kırk"},
		{"orig_tn":"08501112233","dest_tn":"05321234567","started_at":"2026-12-07T14:00:00Z","disposition":"busy","duration_sec":0},
		{"orig_tn":"08501112233","dest_tn":"05321234567","started_at":"2026-11-07T11:59:00Z","disposition":"NO_ANSWER","duration_sec":0,"verstat":"bogus"},
		{"orig_tn":"+908501112233","dest_tn":"+905321234568","started_at":"2026-11-07T11:00:00Z","disposition":"no_answer","duration_sec":0}
	]}`
	in, pre, err := parseEventsJSON(strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	res, err := env.svc.ingest(context.Background(), "carrier-1", in, pre, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Accepted != 2 || res.Rejected != 5 || len(res.Errors) != 5 {
		t.Fatalf("%+v", res)
	}
	want := map[int][]string{
		1: {"arayan numara (orig_tn)"},
		2: {"RFC 3339", "disposition", "duration_sec"},
		3: {"kayıt okunamadı"},
		4: {"gelecekte olamaz"},
		5: {"verstat"},
	}
	for _, e := range res.Errors {
		for _, w := range want[e.Index] {
			if !strings.Contains(e.Message, w) {
				t.Errorf("row %d: %q lacks %q", e.Index, e.Message, w)
			}
		}
		delete(want, e.Index)
	}
	if len(want) != 0 {
		t.Errorf("missing errors for rows %v", want)
	}
	var orig, src, verstat string
	if err := env.svc.db.QueryRowContext(context.Background(),
		`SELECT orig_tn, source_id, verstat FROM call_events WHERE dest_tn = '+905321234567'`).Scan(&orig, &src, &verstat); err != nil {
		t.Fatal(err)
	}
	if orig != tnBank || src != "carrier-1" || verstat != "TN-Validation-Passed" {
		t.Fatal(orig, src, verstat)
	}
	d, _ := env.svc.Daily(context.Background(), tnBank, 14)
	if d[13].Calls != 2 || d[13].Answered != 1 || d[13].Short != 0 {
		t.Fatalf("rollup %+v", d[13])
	}
	marks, _ := env.svc.dirtyTNs(context.Background())
	if len(marks) != 1 || marks[0].tn != tnBank {
		t.Fatalf("dirty %+v", marks)
	}
}

func TestIngestCSV(t *testing.T) {
	env := newEnv(t)
	csvBody := "\xef\xbb\xbfdisposition;orig_tn;dest_tn;started_at;duration_sec;verstat\n" +
		"answered;0850 111 22 33;0532 123 45 67;2026-11-07T10:00:00Z;3;TN-Validation-Failed\n" +
		"answered;0850 111 22 33;0532 123 45 68;2026-11-07T10:01:00Z;beş;\n" +
		"busy;abc;0532 123 45 69;2026-11-07T10:02:00Z;0;\n" +
		"\n" +
		"no_answer;0850 111 22 33\n" +
		"no_answer;0850 111 22 33;0532 123 45 70;2026-11-07T10:03:00Z;0\n"
	in, pre, lines, err := parseEventsCSV(strings.NewReader(csvBody))
	if err != nil {
		t.Fatal(err)
	}
	res, err := env.svc.ingest(context.Background(), "carrier-1", in, pre, lines)
	if err != nil {
		t.Fatal(err)
	}
	if res.Accepted != 2 || res.Rejected != 3 {
		t.Fatalf("%+v", res)
	}
	for _, e := range res.Errors {
		switch e.Index {
		case 1:
			if !strings.Contains(e.Message, "satır 3") || !strings.Contains(e.Message, "tam sayı") {
				t.Error(e)
			}
		case 2:
			if !strings.Contains(e.Message, "satır 4: arayan numara (orig_tn)") {
				t.Error(e)
			}
		case 3:
			if !strings.Contains(e.Message, "satır 6: en az 5 sütun") {
				t.Error(e)
			}
		default:
			t.Errorf("unexpected %+v", e)
		}
	}
	d, _ := env.svc.Daily(context.Background(), tnBank, 1)
	if d[0].Calls != 2 || d[0].Short != 1 {
		t.Fatalf("%+v", d)
	}

	if _, _, _, err := parseEventsCSV(strings.NewReader("orig_tn,dest_tn\n1,2\n")); err == nil ||
		!strings.Contains(err.Error(), "started_at") {
		t.Fatalf("missing header columns must fail: %v", err)
	}
}

func TestIngestLimits(t *testing.T) {
	env := newEnv(t)
	if _, err := env.svc.IngestEvents(context.Background(), "c", nil); err == nil {
		t.Fatal("empty batch must fail")
	}
	rows := genRows(tnSpam, pattern{n: MaxEventsPerRequest + 1, hours: 24}, t0)
	if _, err := env.svc.IngestEvents(context.Background(), "c", rows); err == nil {
		t.Fatal("over limit must fail")
	}
	var b strings.Builder
	b.WriteString("orig_tn,dest_tn,started_at,disposition,duration_sec\n")
	for i := 0; i <= MaxEventsPerRequest; i++ {
		b.WriteString("08503334455,05321234567,2026-11-07T10:00:00Z,busy,0\n")
	}
	if _, _, _, err := parseEventsCSV(strings.NewReader(b.String())); err == nil {
		t.Fatal("CSV over limit must fail")
	}
}

func TestIngest5000Timing(t *testing.T) {
	env := newEnv(t)
	rows := genRows(tnSpam, pattern{n: MaxEventsPerRequest, hours: 72, answerRate: 0.4, shortRate: 0.3, uniqueDest: true}, t0)
	for i := range rows { // spread over several numbers
		rows[i].OrigTN = "+9085033344" + pad7(i % 50)[5:]
	}
	start := time.Now()
	res, err := env.svc.IngestEvents(context.Background(), "carrier-1", rows)
	took := time.Since(start)
	if err != nil || res.Accepted != MaxEventsPerRequest {
		t.Fatal(res.Rejected, err)
	}
	t.Logf("ingest of %d events took %s", MaxEventsPerRequest, took)
	if took > 2*time.Second {
		t.Fatalf("ingest too slow: %s", took)
	}
	var n int
	_ = env.svc.db.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM call_events`).Scan(&n)
	if n != MaxEventsPerRequest {
		t.Fatal(n)
	}
	start = time.Now()
	scored, err := env.svc.tick(context.Background())
	if err != nil || scored != 50 {
		t.Fatal(scored, err)
	}
	t.Logf("scoring 50 numbers took %s", time.Since(start))
}
