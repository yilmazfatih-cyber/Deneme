package reputation

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// MaxEventsPerRequest is the ingest batch limit.
const MaxEventsPerRequest = 5000

const (
	maxEventAge    = 30 * 24 * time.Hour
	maxClockSkew   = 5 * time.Minute
	maxDurationSec = 24 * 3600
)

// EventInput is one call event as received by POST /v1/carrier/events.
type EventInput struct {
	OrigTN      string `json:"orig_tn"`
	DestTN      string `json:"dest_tn"`
	StartedAt   string `json:"started_at"` // RFC 3339
	Disposition string `json:"disposition"`
	DurationSec int64  `json:"duration_sec"`
	Verstat     string `json:"verstat,omitempty"`
}

// RowError reports a rejected row by its 0-based index in the request.
type RowError struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
}

// IngestResult is the response of the events endpoint.
type IngestResult struct {
	Accepted int        `json:"accepted"`
	Rejected int        `json:"rejected"`
	Errors   []RowError `json:"errors"`
}

var dispositions = map[string]bool{"answered": true, "no_answer": true, "busy": true, "rejected": true, "failed": true, "blocked": true}

// IngestEvents validates and stores call events reported by sourceID. Valid
// rows are stored in one transaction; invalid rows are reported per index.
func (s *Service) IngestEvents(ctx context.Context, sourceID string, in []EventInput) (IngestResult, error) {
	return s.ingest(ctx, sourceID, in, nil, nil)
}

// ingest is IngestEvents with parse errors (index -> message) found earlier
// and, for CSV, the line number of each row used to prefix messages.
func (s *Service) ingest(ctx context.Context, sourceID string, in []EventInput, pre map[int]string, lines []int) (IngestResult, error) {
	if len(in) == 0 {
		return IngestResult{}, core.Invalid("events", "en az bir arama kaydı gönderin")
	}
	if len(in) > MaxEventsPerRequest {
		return IngestResult{}, core.Invalid("events", fmt.Sprintf("tek istekte en fazla %d kayıt gönderilebilir", MaxEventsPerRequest))
	}
	res := IngestResult{Errors: []RowError{}}
	now := s.now()
	rows := make([]eventRow, 0, len(in))
	fail := func(i int, msg string) {
		if i < len(lines) && lines[i] > 0 {
			msg = fmt.Sprintf("satır %d: %s", lines[i], msg)
		}
		res.Errors = append(res.Errors, RowError{i, msg})
	}
	for i, e := range in {
		if msg, bad := pre[i]; bad {
			fail(i, msg)
			continue
		}
		r, msg := validateEvent(e, now)
		if msg != "" {
			fail(i, msg)
			continue
		}
		rows = append(rows, r)
	}
	if err := s.insertEvents(ctx, sourceID, rows); err != nil {
		return IngestResult{}, err
	}
	res.Accepted, res.Rejected = len(rows), len(res.Errors)
	s.mEvents.WithLabelValues("accepted").Add(float64(res.Accepted))
	s.mEvents.WithLabelValues("rejected").Add(float64(res.Rejected))
	return res, nil
}

// validateEvent normalizes one event; a non-empty message means rejected.
func validateEvent(e EventInput, now time.Time) (eventRow, string) {
	var r eventRow
	var msgs []string
	var err error
	if r.OrigTN, err = core.NormalizeTN(e.OrigTN); err != nil {
		msgs = append(msgs, "arayan numara (orig_tn): "+fieldMsg(err))
	}
	if r.DestTN, err = core.NormalizeTN(e.DestTN); err != nil {
		msgs = append(msgs, "aranan numara (dest_tn): "+fieldMsg(err))
	}
	if strings.TrimSpace(e.StartedAt) == "" {
		msgs = append(msgs, "başlangıç zamanı (started_at) boş")
	} else if t, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(e.StartedAt)); err != nil {
		msgs = append(msgs, "başlangıç zamanı (started_at) RFC 3339 biçiminde olmalı, örnek 2026-05-01T09:30:00+03:00")
	} else if t.After(now.Add(maxClockSkew)) {
		msgs = append(msgs, "başlangıç zamanı (started_at) gelecekte olamaz")
	} else if t.Before(now.Add(-maxEventAge)) {
		msgs = append(msgs, "30 günden eski kayıtlar kabul edilmez")
	} else {
		r.StartedAt = t.UTC()
	}
	r.Disposition = strings.ToLower(strings.TrimSpace(e.Disposition))
	if !dispositions[r.Disposition] {
		msgs = append(msgs, "sonuç (disposition) answered, no_answer, busy, rejected, failed veya blocked olmalı")
	}
	if e.DurationSec < 0 || e.DurationSec > maxDurationSec {
		msgs = append(msgs, "süre (duration_sec) 0 ile 86400 saniye arasında olmalı")
	}
	r.DurationSec = e.DurationSec
	switch v := strings.TrimSpace(e.Verstat); strings.ToLower(v) {
	case "":
	case strings.ToLower(string(core.VerstatPassed)):
		r.Verstat = string(core.VerstatPassed)
	case strings.ToLower(string(core.VerstatFailed)):
		r.Verstat = string(core.VerstatFailed)
	case strings.ToLower(string(core.VerstatNone)):
		r.Verstat = string(core.VerstatNone)
	default:
		msgs = append(msgs, "doğrulama sonucu (verstat) TN-Validation-Passed, TN-Validation-Failed veya No-TN-Validation olmalı")
	}
	return r, strings.Join(msgs, "; ")
}

// parseEventsJSON reads {"events": [...]}; a row that does not decode is
// reported by index instead of failing the whole request.
func parseEventsJSON(body io.Reader) ([]EventInput, map[int]string, error) {
	var req struct {
		Events []json.RawMessage `json:"events"`
	}
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return nil, nil, err
		}
		if errors.Is(err, io.EOF) {
			return nil, nil, core.Invalid("body", "istek gövdesi boş")
		}
		return nil, nil, core.Invalid("body", "geçersiz JSON: "+err.Error())
	}
	if dec.More() {
		return nil, nil, core.Invalid("body", "JSON sonrasında fazladan veri")
	}
	if len(req.Events) > MaxEventsPerRequest {
		return nil, nil, core.Invalid("events", fmt.Sprintf("tek istekte en fazla %d kayıt gönderilebilir", MaxEventsPerRequest))
	}
	out := make([]EventInput, len(req.Events))
	pre := map[int]string{}
	for i, raw := range req.Events {
		d := json.NewDecoder(bytes.NewReader(raw))
		d.DisallowUnknownFields()
		if err := d.Decode(&out[i]); err != nil {
			pre[i] = "kayıt okunamadı: alan adları ve türleri kontrol edin (" + err.Error() + ")"
		}
	}
	return out, pre, nil
}

var csvRequired = []string{"orig_tn", "dest_tn", "started_at", "disposition", "duration_sec"}

// parseEventsCSV reads text/csv with a header row (orig_tn, dest_tn,
// started_at, disposition, duration_sec[, verstat]) in any column order.
// ';' is accepted as separator (spreadsheet exports in Turkish locale).
// The returned lines hold the 1-based line number of every row.
func parseEventsCSV(body io.Reader) ([]EventInput, map[int]string, []int, error) {
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, nil, nil, err
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, nil, nil, core.Invalid("body", "CSV boş")
	}
	first := data
	if i := bytes.IndexByte(data, '\n'); i >= 0 {
		first = data[:i]
	}
	cr := csv.NewReader(bytes.NewReader(data))
	if bytes.IndexByte(first, ';') >= 0 && bytes.IndexByte(first, ',') < 0 {
		cr.Comma = ';'
	}
	cr.FieldsPerRecord = -1
	cr.TrimLeadingSpace = true
	header, err := cr.Read()
	if err != nil {
		return nil, nil, nil, core.Invalid("body", "CSV başlık satırı okunamadı")
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.ToLower(strings.TrimSpace(h))] = i
	}
	ve := &core.ValidationError{}
	for _, c := range csvRequired {
		if _, ok := col[c]; !ok {
			ve.Add("header", "CSV başlığında "+c+" sütunu yok")
		}
	}
	if err := ve.Err(); err != nil {
		return nil, nil, nil, err
	}
	need := 0 // rows may omit trailing optional columns (verstat)
	for _, c := range csvRequired {
		need = max(need, col[c]+1)
	}
	get := func(rec []string, name string) string {
		if i, ok := col[name]; ok && i < len(rec) {
			return strings.TrimSpace(rec[i])
		}
		return ""
	}
	var out []EventInput
	var lines []int
	pre := map[int]string{}
	for {
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		idx := len(out)
		if idx >= MaxEventsPerRequest {
			return nil, nil, nil, core.Invalid("events", fmt.Sprintf("tek istekte en fazla %d kayıt gönderilebilir", MaxEventsPerRequest))
		}
		if err != nil {
			var pe *csv.ParseError
			if !errors.As(err, &pe) {
				return nil, nil, nil, err
			}
			out = append(out, EventInput{})
			lines = append(lines, pe.Line)
			pre[idx] = "satır okunamadı: tırnak işaretlerini kontrol edin"
			continue
		}
		if len(rec) == 1 && strings.TrimSpace(rec[0]) == "" {
			continue // blank line
		}
		line, _ := cr.FieldPos(0)
		lines = append(lines, line)
		e := EventInput{
			OrigTN: get(rec, "orig_tn"), DestTN: get(rec, "dest_tn"), StartedAt: get(rec, "started_at"),
			Disposition: get(rec, "disposition"), Verstat: get(rec, "verstat"),
		}
		if len(rec) < need {
			pre[idx] = fmt.Sprintf("en az %d sütun bekleniyordu, %d bulundu", need, len(rec))
		} else if d := get(rec, "duration_sec"); d != "" {
			n, err := strconv.ParseInt(d, 10, 64)
			if err != nil {
				pre[idx] = "süre (duration_sec) tam sayı olmalı"
			}
			e.DurationSec = n
		}
		out = append(out, e)
	}
	return out, pre, lines, nil
}

// ---------------------------------------------------------------- feedback

// FeedbackInput is the body of POST /v1/carrier/labels.
type FeedbackInput struct {
	TN         string   `json:"tn"`
	Kind       string   `json:"kind"`
	Label      string   `json:"label,omitempty"`
	Confidence *float64 `json:"confidence,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	SourceName string   `json:"source_name,omitempty"`
}

// AddFeedback validates and stores one label/complaint/block for tn and marks
// the number for rescoring.
func (s *Service) AddFeedback(ctx context.Context, sourceID, defaultSourceName string, in FeedbackInput) (core.LabelFeedback, error) {
	ve := &core.ValidationError{}
	f := core.LabelFeedback{ID: core.NewID(), SourceID: sourceID, CreatedAt: s.now(), Confidence: 1}
	var err error
	if f.TN, err = core.NormalizeTN(in.TN); err != nil {
		ve.Add("tn", fieldMsg(err))
	}
	f.Kind = core.FeedbackKind(strings.ToLower(strings.TrimSpace(in.Kind)))
	switch f.Kind {
	case core.FeedbackLabel, core.FeedbackComplaint, core.FeedbackBlock:
	default:
		ve.Add("kind", "tür label, complaint veya block olmalı")
	}
	label := core.ReputationLabel(strings.ToLower(strings.TrimSpace(in.Label)))
	switch {
	case f.Kind == core.FeedbackLabel:
		switch label {
		case core.LabelClean, core.LabelWatch, core.LabelSuspect, core.LabelSpam:
			f.Label = label
		case "":
			ve.Add("label", "etiket bildiriminde etiket zorunlu")
		default:
			ve.Add("label", "etiket clean, watch, suspect veya spam olmalı")
		}
	case label != "":
		ve.Add("label", "etiket yalnızca label türünde gönderilir")
	}
	if in.Confidence != nil {
		c := *in.Confidence
		if math.IsNaN(c) || c < 0 || c > 1 {
			ve.Add("confidence", "güven 0 ile 1 arasında olmalı")
		} else {
			f.Confidence = c
		}
	}
	f.Reason = strings.TrimSpace(in.Reason)
	if utf8.RuneCountInString(f.Reason) > 500 {
		ve.Add("reason", "açıklama en fazla 500 karakter olabilir")
	}
	f.SourceName = strings.TrimSpace(in.SourceName)
	if f.SourceName == "" {
		f.SourceName = defaultSourceName
	}
	if utf8.RuneCountInString(f.SourceName) > 64 {
		ve.Add("source_name", "kaynak adı en fazla 64 karakter olabilir")
	}
	if err := ve.Err(); err != nil {
		return core.LabelFeedback{}, err
	}
	if err := s.insertFeedback(ctx, []core.LabelFeedback{f}); err != nil {
		return core.LabelFeedback{}, err
	}
	s.mFeedback.Inc()
	return f, nil
}
