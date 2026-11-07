package reputation

import (
	"context"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Mount registers the reputation routes.
func (s *Service) Mount(r *platform.Router) {
	r.Handle("POST", "/v1/carrier/events", core.ScopeCarrierWrite, s.handleEvents)
	r.Handle("POST", "/v1/carrier/labels", core.ScopeCarrierWrite, s.handleLabels)
	r.Handle("GET", "/v1/carrier/reputation/{tn}", core.ScopeCarrierRead, s.handleCarrierScore)
	r.Handle("GET", "/v1/enterprise/reputation", core.ScopeEnterpriseRead, s.handleEnterpriseList)
	r.Handle("GET", "/v1/enterprise/reputation/{tn}", core.ScopeEnterpriseRead, s.handleEnterpriseScore)
	r.Handle("GET", "/v1/admin/reputation", core.ScopeAdminRead, s.handleAdminList)
	r.Handle("GET", "/v1/admin/reputation/{tn}", core.ScopeAdminRead, s.handleAdminDetail)
	r.Handle("POST", "/v1/admin/reputation/{tn}/override", core.ScopeAdmin, s.handleSetOverride)
	r.Handle("DELETE", "/v1/admin/reputation/{tn}/override", core.ScopeAdmin, s.handleClearOverride)
	r.Handle("POST", "/v1/admin/reputation/recompute", core.ScopeAdmin, s.handleRecompute)
	r.Handle("GET", "/v1/admin/reputation-stats", core.ScopeAdminRead, s.handleStats)
}

// ---------------------------------------------------------------- carrier

func (s *Service) handleEvents(w http.ResponseWriter, r *http.Request) error {
	p := core.PrincipalFrom(r.Context())
	mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	var (
		in    []EventInput
		pre   map[int]string
		lines []int
		err   error
	)
	switch mt {
	case "text/csv", "application/csv":
		in, pre, lines, err = parseEventsCSV(r.Body)
	default:
		in, pre, err = parseEventsJSON(r.Body)
	}
	if err != nil {
		return err
	}
	res, err := s.ingest(r.Context(), p.ID, in, pre, lines)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, res)
}

func (s *Service) handleLabels(w http.ResponseWriter, r *http.Request) error {
	var in FeedbackInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	p := core.PrincipalFrom(r.Context())
	f, err := s.AddFeedback(r.Context(), p.ID, p.Name, in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, f)
}

func (s *Service) handleCarrierScore(w http.ResponseWriter, r *http.Request) error {
	sc, err := s.mustScore(r.Context(), r.PathValue("tn"))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, sc)
}

func (s *Service) mustScore(ctx context.Context, tn string) (core.Score, error) {
	sc, ok, err := s.ScoreFor(ctx, tn)
	if err != nil {
		return sc, err
	}
	if !ok {
		return sc, core.Errorf(core.ErrNotFound, "bu numara için itibar verisi yok")
	}
	return sc, nil
}

// ---------------------------------------------------------------- enterprise

// entityNumbers returns the caller's entity numbers; 403 without an entity.
func (s *Service) entityNumbers(ctx context.Context) ([]core.Number, error) {
	p := core.PrincipalFrom(ctx)
	if p.EntityID == "" {
		return nil, core.Errorf(core.ErrForbidden, "bu işlem yalnızca kurum hesaplarına açık")
	}
	if s.dir == nil {
		return nil, nil
	}
	return s.dir.NumbersOf(ctx, p.EntityID)
}

// EnterpriseScores returns scores for the entity's numbers: every single
// number (score -1/unknown when there is no data yet) and, for ranges, every
// number inside the range that has a score.
func (s *Service) EnterpriseScores(ctx context.Context, nums []core.Number) ([]core.Score, error) {
	now := s.now()
	out := []core.Score{}
	seen := map[string]bool{}
	for _, n := range nums {
		if n.RangeStart == n.RangeEnd {
			if seen[n.RangeStart] {
				continue
			}
			seen[n.RangeStart] = true
			r, ok, err := s.getScoreRow(ctx, s.db, n.RangeStart)
			if err != nil {
				return nil, err
			}
			if ok {
				out = append(out, r.effective(now))
			} else {
				out = append(out, core.Score{TN: n.RangeStart, Score: -1, RawScore: -1, Label: core.LabelUnknown,
					Factors: []core.Factor{}, Version: Version})
			}
			continue
		}
		rows, err := s.db.QueryContext(ctx, `SELECT `+scoreCols+` FROM reputation_scores
			WHERE tn >= ? AND tn <= ? AND LENGTH(tn) = ? ORDER BY tn`, n.RangeStart, n.RangeEnd, len(n.RangeStart))
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			r, err := scanScore(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			if !seen[r.TN] {
				seen[r.TN] = true
				out = append(out, r.effective(now))
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Service) handleEnterpriseList(w http.ResponseWriter, r *http.Request) error {
	nums, err := s.entityNumbers(r.Context())
	if err != nil {
		return err
	}
	items, err := s.EnterpriseScores(r.Context(), nums)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) handleEnterpriseScore(w http.ResponseWriter, r *http.Request) error {
	nums, err := s.entityNumbers(r.Context())
	if err != nil {
		return err
	}
	tn, err := core.NormalizeTN(r.PathValue("tn"))
	if err != nil {
		return err
	}
	if !ownsTN(nums, tn) {
		return core.Errorf(core.ErrForbidden, "bu numara kurumunuza kayıtlı değil")
	}
	sc, err := s.mustScore(r.Context(), tn)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, sc)
}

func ownsTN(nums []core.Number, tn string) bool {
	for _, n := range nums {
		if n.Contains(tn) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- admin

var labelSet = map[string]bool{"clean": true, "watch": true, "suspect": true, "spam": true}

// effSQL selects the effective label/score: the stored override values while
// the override is active, else the computed ones.
const effLabelSQL = `(CASE WHEN override_until <> '' AND override_until > ? THEN eff_label ELSE label END)`
const effScoreSQL = `(CASE WHEN override_until <> '' AND override_until > ? THEN eff_score ELSE score END)`

// ListScores returns effective scores worst first, optionally filtered by label.
func (s *Service) ListScores(ctx context.Context, label string, limit int) ([]core.Score, error) {
	label = strings.ToLower(strings.TrimSpace(label))
	if label != "" && !labelSet[label] {
		return nil, core.Invalid("label", "etiket clean, watch, suspect veya spam olmalı")
	}
	now := s.now()
	ts := platform.TS(now)
	rows, err := s.db.QueryContext(ctx, `SELECT `+scoreCols+` FROM reputation_scores
		WHERE (? = '' OR `+effLabelSQL+` = ?) ORDER BY `+effScoreSQL+` ASC, calls_7d DESC, tn LIMIT ?`,
		label, ts, label, ts, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Score{}
	for rows.Next() {
		r, err := scanScore(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r.effective(now))
	}
	return out, rows.Err()
}

func (s *Service) handleAdminList(w http.ResponseWriter, r *http.Request) error {
	items, err := s.ListScores(r.Context(), r.URL.Query().Get("label"), platform.QueryInt(r, "limit", 100, 1000))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// DailyStat is one day of the admin daily view (Türkiye time, UTC+3).
type DailyStat struct {
	Day        string `json:"day"`
	Calls      int64  `json:"calls"`
	Answered   int64  `json:"answered"`
	Short      int64  `json:"short"`
	Complaints int64  `json:"complaints"`
	Blocks     int64  `json:"blocks"`
}

// Daily returns the last `days` days for tn, oldest first, zero-filled.
func (s *Service) Daily(ctx context.Context, tn string, days int) ([]DailyStat, error) {
	now := s.now()
	first := dayOf(now.AddDate(0, 0, -(days - 1)))
	rows, err := s.db.QueryContext(ctx, `SELECT day, calls, answered, short, complaints, blocks FROM reputation_daily
		WHERE tn = ? AND day >= ? ORDER BY day`, tn, first)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	got := map[string]DailyStat{}
	for rows.Next() {
		var d DailyStat
		if err := rows.Scan(&d.Day, &d.Calls, &d.Answered, &d.Short, &d.Complaints, &d.Blocks); err != nil {
			return nil, err
		}
		got[d.Day] = d
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]DailyStat, 0, days)
	for i := days - 1; i >= 0; i-- {
		day := dayOf(now.AddDate(0, 0, -i))
		d, ok := got[day]
		if !ok {
			d = DailyStat{Day: day}
		}
		out = append(out, d)
	}
	return out, nil
}

func (s *Service) handleAdminDetail(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	sc, err := s.mustScore(ctx, r.PathValue("tn"))
	if err != nil {
		return err
	}
	fb, err := s.listFeedback(ctx, sc.TN, 100)
	if err != nil {
		return err
	}
	daily, err := s.Daily(ctx, sc.TN, 14)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"score": sc, "feedback": fb, "daily": daily})
}

func (s *Service) handleSetOverride(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Label  string `json:"label"`
		Reason string `json:"reason"`
		Until  string `json:"until"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	var until time.Time
	if in.Until != "" {
		t, err := time.Parse(time.RFC3339Nano, in.Until)
		if err != nil {
			return core.Invalid("until", "bitiş zamanı RFC 3339 biçiminde olmalı")
		}
		until = t
	}
	p := core.PrincipalFrom(r.Context())
	sc, err := s.setOverride(r.Context(), r.PathValue("tn"), core.ReputationLabel(strings.ToLower(in.Label)), in.Reason, p.ID, until)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, sc)
}

func (s *Service) handleClearOverride(w http.ResponseWriter, r *http.Request) error {
	sc, err := s.ClearOverride(r.Context(), r.PathValue("tn"))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, sc)
}

func (s *Service) handleRecompute(w http.ResponseWriter, r *http.Request) error {
	n, err := s.Recompute(r.Context())
	if err != nil {
		return err
	}
	if err := platform.Audit(r.Context(), s.db, "reputation.recompute", "reputation", "all", map[string]int{"scored": n}); err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]int{"scored": n})
}

// Stats is the body of GET /v1/admin/reputation-stats.
type Stats struct {
	Labels     map[string]int64 `json:"labels"`
	Events24h  int64            `json:"events_24h"`
	Feedback7d int64            `json:"feedback_7d"`
}

// Stats counts effective labels, events of the last 24 h and feedback of the last 7 days.
func (s *Service) Stats(ctx context.Context) (Stats, error) {
	now := s.now()
	st := Stats{Labels: map[string]int64{"clean": 0, "watch": 0, "suspect": 0, "spam": 0}}
	rows, err := s.db.QueryContext(ctx, `SELECT `+effLabelSQL+` AS l, COUNT(*) FROM reputation_scores GROUP BY 1`, platform.TS(now))
	if err != nil {
		return st, err
	}
	for rows.Next() {
		var l string
		var n int64
		if err := rows.Scan(&l, &n); err != nil {
			rows.Close()
			return st, err
		}
		st.Labels[l] += n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return st, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM call_events WHERE started_at >= ?`,
		platform.TS(now.Add(-window24h))).Scan(&st.Events24h); err != nil {
		return st, err
	}
	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM label_feedback WHERE created_at >= ?`,
		platform.TS(now.Add(-window7d))).Scan(&st.Feedback7d)
	return st, err
}

func (s *Service) handleStats(w http.ResponseWriter, r *http.Request) error {
	st, err := s.Stats(r.Context())
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, st)
}
