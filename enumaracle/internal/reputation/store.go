package reputation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// ---------------------------------------------------------------- raw transaction helper

// rawTx wraps *sql.Tx so ingest can use prepared statements (platform.Tx does
// not expose Prepare) while keeping '?' placeholders portable.
type rawTx struct {
	tx *sql.Tx
	db *platform.DB
}

func (t rawTx) exec(ctx context.Context, q string, args ...any) (sql.Result, error) {
	return t.tx.ExecContext(ctx, t.db.Rebind(q), args...)
}

func (s *Service) inRawTx(ctx context.Context, fn func(t rawTx) error) error {
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		var tx *sql.Tx
		tx, err = s.db.SQL.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if err = fn(rawTx{tx, s.db}); err != nil {
			_ = tx.Rollback()
			if platform.IsUniqueViolation(err) { // concurrent rollup/dirty insert: retry
				continue
			}
			return err
		}
		if err = tx.Commit(); err == nil || !platform.IsUniqueViolation(err) {
			return err
		}
	}
	return err
}

// ---------------------------------------------------------------- events

type eventRow struct {
	OrigTN, DestTN string
	StartedAt      time.Time
	Disposition    string
	DurationSec    int64
	Verstat        string
}

type rollupKey struct{ tn, day string }

type rollupDelta struct{ calls, answered, short, failed, complaints, blocks int64 }

const insertChunk = 100

const eventCols = `(id, source_id, orig_tn, dest_tn, started_at, disposition, duration_sec, verstat, ingested_at)`

func multiInsert(n int) string {
	var b strings.Builder
	b.WriteString(`INSERT INTO call_events ` + eventCols + ` VALUES `)
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(`(?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	}
	return b.String()
}

// insertEvents stores rows in one transaction with a prepared multi-row
// INSERT, updates the daily rollup and marks the calling numbers dirty.
func (s *Service) insertEvents(ctx context.Context, sourceID string, rows []eventRow) error {
	if len(rows) == 0 {
		return nil
	}
	now := s.now()
	ingested := platform.TS(now)
	roll := map[rollupKey]*rollupDelta{}
	var tns []string
	seen := map[string]bool{}
	for _, r := range rows {
		k := rollupKey{r.OrigTN, dayOf(r.StartedAt)}
		d := roll[k]
		if d == nil {
			d = &rollupDelta{}
			roll[k] = d
		}
		d.calls++
		if r.Disposition == "answered" {
			d.answered++
			if r.DurationSec < shortSeconds {
				d.short++
			}
		}
		if r.Verstat == string(core.VerstatFailed) {
			d.failed++
		}
		if !seen[r.OrigTN] {
			seen[r.OrigTN] = true
			tns = append(tns, r.OrigTN)
		}
	}
	return s.inRawTx(ctx, func(t rawTx) error {
		full, err := t.tx.PrepareContext(ctx, s.db.Rebind(multiInsert(insertChunk)))
		if err != nil {
			return err
		}
		defer full.Close()
		args := make([]any, 0, insertChunk*9)
		for i := 0; i < len(rows); i += insertChunk {
			end := min(i+insertChunk, len(rows))
			args = args[:0]
			for _, r := range rows[i:end] {
				args = append(args, core.NewID(), sourceID, r.OrigTN, r.DestTN, platform.TS(r.StartedAt),
					r.Disposition, r.DurationSec, r.Verstat, ingested)
			}
			if end-i == insertChunk {
				_, err = full.ExecContext(ctx, args...)
			} else {
				_, err = t.exec(ctx, multiInsert(end-i), args...)
			}
			if err != nil {
				return err
			}
		}
		if err := applyRollup(ctx, t, roll); err != nil {
			return err
		}
		return markDirty(ctx, t, tns, ingested)
	})
}

func applyRollup(ctx context.Context, t rawTx, roll map[rollupKey]*rollupDelta) error {
	for k, d := range roll {
		res, err := t.exec(ctx, `UPDATE reputation_daily SET calls = calls + ?, answered = answered + ?, short = short + ?,
			verstat_failed = verstat_failed + ?, complaints = complaints + ?, blocks = blocks + ? WHERE tn = ? AND day = ?`,
			d.calls, d.answered, d.short, d.failed, d.complaints, d.blocks, k.tn, k.day)
		if err != nil {
			return err
		}
		if n, err := res.RowsAffected(); err != nil {
			return err
		} else if n > 0 {
			continue
		}
		if _, err := t.exec(ctx, `INSERT INTO reputation_daily (tn, day, calls, answered, short, verstat_failed, complaints, blocks)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, k.tn, k.day, d.calls, d.answered, d.short, d.failed, d.complaints, d.blocks); err != nil {
			return err
		}
	}
	return nil
}

func markDirty(ctx context.Context, t rawTx, tns []string, at string) error {
	for _, tn := range tns {
		if _, err := t.exec(ctx, `DELETE FROM reputation_dirty WHERE tn = ?`, tn); err != nil {
			return err
		}
		if _, err := t.exec(ctx, `INSERT INTO reputation_dirty (tn, marked_at) VALUES (?, ?)`, tn, at); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- feedback

func (s *Service) insertFeedback(ctx context.Context, fbs []core.LabelFeedback) error {
	roll := map[rollupKey]*rollupDelta{}
	var tns []string
	seen := map[string]bool{}
	for _, f := range fbs {
		if f.Kind == core.FeedbackComplaint || f.Kind == core.FeedbackBlock {
			k := rollupKey{f.TN, dayOf(f.CreatedAt)}
			d := roll[k]
			if d == nil {
				d = &rollupDelta{}
				roll[k] = d
			}
			if f.Kind == core.FeedbackComplaint {
				d.complaints++
			} else {
				d.blocks++
			}
		}
		if !seen[f.TN] {
			seen[f.TN] = true
			tns = append(tns, f.TN)
		}
	}
	return s.inRawTx(ctx, func(t rawTx) error {
		for _, f := range fbs {
			if _, err := t.exec(ctx, `INSERT INTO label_feedback (id, tn, source_id, source_name, kind, label, confidence, reason, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, f.ID, f.TN, f.SourceID, f.SourceName, string(f.Kind), string(f.Label),
				f.Confidence, f.Reason, platform.TS(f.CreatedAt)); err != nil {
				return err
			}
		}
		if err := applyRollup(ctx, t, roll); err != nil {
			return err
		}
		return markDirty(ctx, t, tns, platform.TS(s.now()))
	})
}

func (s *Service) listFeedback(ctx context.Context, tn string, limit int) ([]core.LabelFeedback, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, tn, source_id, source_name, kind, label, confidence, reason, created_at
		FROM label_feedback WHERE tn = ? ORDER BY created_at DESC LIMIT ?`, tn, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.LabelFeedback{}
	for rows.Next() {
		var f core.LabelFeedback
		var kind, label, at string
		if err := rows.Scan(&f.ID, &f.TN, &f.SourceID, &f.SourceName, &kind, &label, &f.Confidence, &f.Reason, &at); err != nil {
			return nil, err
		}
		f.Kind, f.Label, f.CreatedAt = core.FeedbackKind(kind), core.ReputationLabel(label), platform.ParseTS(at)
		out = append(out, f)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- stats

func (s *Service) loadStats(ctx context.Context, tn string, now time.Time) (windowStats, error) {
	var st windowStats
	since7 := platform.TS(now.Add(-window7d))
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*),
		COALESCE(SUM(CASE WHEN started_at >= ? THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN disposition = 'answered' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN disposition = 'answered' AND duration_sec < ? THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN verstat = 'TN-Validation-Passed' OR verstat = 'TN-Validation-Failed' THEN 1 ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN verstat = 'TN-Validation-Failed' THEN 1 ELSE 0 END), 0),
		COUNT(DISTINCT dest_tn)
		FROM call_events WHERE orig_tn = ? AND started_at >= ?`,
		platform.TS(now.Add(-window24h)), shortSeconds, tn, since7).
		Scan(&st.Calls7d, &st.Calls24h, &st.Answered7d, &st.Short7d, &st.Signed7d, &st.Failed7d, &st.Unique7d)
	if err != nil {
		return st, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT kind, COUNT(*) FROM label_feedback
		WHERE tn = ? AND created_at >= ? AND kind IN ('complaint', 'block') GROUP BY kind`, tn, since7)
	if err != nil {
		return st, err
	}
	for rows.Next() {
		var k string
		var n int64
		if err := rows.Scan(&k, &n); err != nil {
			rows.Close()
			return st, err
		}
		if k == string(core.FeedbackComplaint) {
			st.Complaints7d = n
		} else {
			st.Blocks7d = n
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return st, err
	}
	rows, err = s.db.QueryContext(ctx, `SELECT source_id, source_name, label, confidence, created_at FROM label_feedback
		WHERE tn = ? AND kind = 'label' AND created_at >= ? ORDER BY created_at DESC`, tn, platform.TS(now.Add(-labelWindow)))
	if err != nil {
		return st, err
	}
	defer rows.Close()
	latest := map[string]bool{}
	for rows.Next() {
		var sid, name, label, at string
		var conf float64
		if err := rows.Scan(&sid, &name, &label, &conf, &at); err != nil {
			return st, err
		}
		key := sid + "\x00" + name
		if latest[key] {
			continue
		}
		latest[key] = true
		src := name
		if src == "" {
			src = sid
		}
		age := max(now.Sub(platform.ParseTS(at)), 0)
		st.Labels = append(st.Labels, labelSignal{Source: src, Label: core.ReputationLabel(label), Confidence: conf, Age: age})
	}
	return st, rows.Err()
}

// ---------------------------------------------------------------- scores

type scoreRow struct {
	core.Score
	OverrideUntilTS string
	EffScore        int
	EffLabel        core.ReputationLabel
	Announced       core.ReputationLabel
}

const scoreCols = `tn, score, raw_score, label, floored, factors, calls_24h, calls_7d, version, computed_at,
	override_label, override_until, eff_score, eff_label, announced_label`

func scanScore(sc interface{ Scan(...any) error }) (scoreRow, error) {
	var r scoreRow
	var floored int
	var factors, computed, ovLabel, label, eff, ann string
	err := sc.Scan(&r.TN, &r.Score.Score, &r.RawScore, &label, &floored, &factors, &r.Calls24h, &r.Calls7d,
		&r.Version, &computed, &ovLabel, &r.OverrideUntilTS, &r.EffScore, &eff, &ann)
	if err != nil {
		return r, err
	}
	r.Label, r.Floored, r.ComputedAt = core.ReputationLabel(label), floored == 1, platform.ParseTS(computed)
	r.OverrideLabel = core.ReputationLabel(ovLabel)
	r.EffLabel, r.Announced = core.ReputationLabel(eff), core.ReputationLabel(ann)
	r.Factors = []core.Factor{}
	if err := json.Unmarshal([]byte(factors), &r.Factors); err != nil {
		return r, err
	}
	return r, nil
}

// effective returns the public score at time now: the override (clamped
// score, override label) while it is active, else the computed values.
func (r scoreRow) effective(now time.Time) core.Score {
	sc := r.Score
	sc.OverrideLabel, sc.OverrideUntil = "", nil
	if r.OverrideLabel != "" && r.OverrideUntilTS != "" {
		until := platform.ParseTS(r.OverrideUntilTS)
		if until.After(now) {
			sc.OverrideLabel, sc.OverrideUntil = r.OverrideLabel, &until
			sc.Label = r.OverrideLabel
			sc.Score = clampToLabel(sc.Score, r.OverrideLabel)
		}
	}
	return sc
}

func (s *Service) getScoreRow(ctx context.Context, q platform.Querier, tn string) (scoreRow, bool, error) {
	r, err := scanScore(q.QueryRowContext(ctx, `SELECT `+scoreCols+` FROM reputation_scores WHERE tn = ?`, tn))
	if errors.Is(err, sql.ErrNoRows) {
		return r, false, nil
	}
	return r, err == nil, err
}

func (s *Service) upsertScore(ctx context.Context, q platform.Querier, r scoreRow) error {
	fj, err := json.Marshal(r.Factors)
	if err != nil {
		return err
	}
	args := []any{r.Score.Score, r.RawScore, string(r.Label), platform.Bool(r.Floored), string(fj), r.Calls24h, r.Calls7d,
		r.Version, platform.TS(r.ComputedAt), string(r.OverrideLabel), r.OverrideUntilTS, r.EffScore, string(r.EffLabel),
		string(r.Announced), r.TN}
	res, err := q.ExecContext(ctx, `UPDATE reputation_scores SET score = ?, raw_score = ?, label = ?, floored = ?, factors = ?,
		calls_24h = ?, calls_7d = ?, version = ?, computed_at = ?, override_label = ?, override_until = ?, eff_score = ?,
		eff_label = ?, announced_label = ? WHERE tn = ?`, args...)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil || n > 0 {
		return err
	}
	_, err = q.ExecContext(ctx, `INSERT INTO reputation_scores (score, raw_score, label, floored, factors, calls_24h, calls_7d,
		version, computed_at, override_label, override_until, eff_score, eff_label, announced_label, tn)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args...)
	return err
}

// ---------------------------------------------------------------- overrides

type override struct {
	Label core.ReputationLabel
	Until time.Time
}

func (s *Service) getOverride(ctx context.Context, tn string) (override, bool, error) {
	var o override
	var label, until string
	err := s.db.QueryRowContext(ctx, `SELECT label, until_at FROM reputation_overrides WHERE tn = ?`, tn).Scan(&label, &until)
	if errors.Is(err, sql.ErrNoRows) {
		return o, false, nil
	}
	if err != nil {
		return o, false, err
	}
	o.Label, o.Until = core.ReputationLabel(label), platform.ParseTS(until)
	return o, true, nil
}

// expireOverrides deletes overrides that ended and marks their numbers dirty
// so the next pass publishes the label change.
func (s *Service) expireOverrides(ctx context.Context, now time.Time) error {
	tns, err := s.queryStrings(ctx, `SELECT tn FROM reputation_overrides WHERE until_at <= ?`, platform.TS(now))
	if err != nil || len(tns) == 0 {
		return err
	}
	return s.inRawTx(ctx, func(t rawTx) error {
		for _, tn := range tns {
			if _, err := t.exec(ctx, `DELETE FROM reputation_overrides WHERE tn = ? AND until_at <= ?`, tn, platform.TS(now)); err != nil {
				return err
			}
		}
		return markDirty(ctx, t, tns, platform.TS(now))
	})
}

// ---------------------------------------------------------------- misc queries

func (s *Service) queryStrings(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

type dirtyMark struct{ tn, at string }

func (s *Service) dirtyTNs(ctx context.Context) ([]dirtyMark, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT tn, marked_at FROM reputation_dirty ORDER BY marked_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dirtyMark
	for rows.Next() {
		var d dirtyMark
		if err := rows.Scan(&d.tn, &d.at); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Service) staleTNs(ctx context.Context, before time.Time, limit int) ([]string, error) {
	return s.queryStrings(ctx, `SELECT tn FROM reputation_scores WHERE computed_at < ? ORDER BY computed_at LIMIT ?`,
		platform.TS(before), limit)
}

func (s *Service) knownTNs(ctx context.Context, now time.Time) ([]string, error) {
	return s.queryStrings(ctx, `SELECT DISTINCT orig_tn FROM call_events WHERE started_at >= ?
		UNION SELECT tn FROM label_feedback WHERE created_at >= ?
		UNION SELECT tn FROM reputation_overrides
		UNION SELECT tn FROM reputation_scores`,
		platform.TS(now.Add(-window7d)), platform.TS(now.Add(-labelWindow)))
}

func (s *Service) prune(ctx context.Context, now time.Time) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM call_events WHERE started_at < ?`, platform.TS(now.Add(-eventRetention))); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM reputation_daily WHERE day < ?`, dayOf(now.Add(-dailyRetention)))
	return err
}

func (s *Service) hasEvents(ctx context.Context) (bool, error) {
	var x string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM call_events LIMIT 1`).Scan(&x)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
