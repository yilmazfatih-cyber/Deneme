package reputation

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// ScoreFor returns the latest score of tn with any active override applied.
// ok=false when the number has no reputation data.
func (s *Service) ScoreFor(ctx context.Context, tn string) (core.Score, bool, error) {
	n, err := core.NormalizeTN(tn)
	if err != nil {
		return core.Score{}, false, err
	}
	r, ok, err := s.getScoreRow(ctx, s.db, n)
	if err != nil || !ok {
		return core.Score{}, false, err
	}
	return r.effective(s.now()), true, nil
}

// owner resolves the owning entity and whether the identity is verified
// (entity verified AND number active), as lookup defines Verified.
func (s *Service) owner(ctx context.Context, tn string) (entityID string, verified bool, err error) {
	if s.dir == nil {
		return "", false, nil
	}
	n, e, err := s.dir.NumberOwner(ctx, tn)
	if errors.Is(err, core.ErrNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return e.ID, e.Status == core.EntityVerified && n.Status == core.NumberActive, nil
}

// scoreTN computes and stores the score of one number and publishes a label
// change event when the effective label differs from the last announced one.
func (s *Service) scoreTN(ctx context.Context, tn string) (core.Score, error) {
	now := s.now()
	st, err := s.loadStats(ctx, tn, now)
	if err != nil {
		return core.Score{}, err
	}
	entityID, verified, err := s.owner(ctx, tn)
	if err != nil {
		return core.Score{}, err
	}
	ov, hasOv, err := s.getOverride(ctx, tn)
	if err != nil {
		return core.Score{}, err
	}
	factors := computeFactors(st)
	raw := rawScore(factors)
	final, floored := applyFloor(raw, verified, factors)
	r := scoreRow{Score: core.Score{
		TN: tn, Score: final, RawScore: raw, Label: labelFor(final), Floored: floored, Factors: factors,
		Calls24h: st.Calls24h, Calls7d: st.Calls7d, Version: Version, ComputedAt: now,
	}}
	if hasOv && ov.Until.After(now) {
		r.OverrideLabel, r.OverrideUntilTS = ov.Label, platform.TS(ov.Until)
	}
	eff := r.effective(now)
	r.EffScore, r.EffLabel = eff.Score, eff.Label

	var prev core.ReputationLabel
	var hadPrev bool
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		old, ok, err := s.getScoreRow(ctx, tx, tn)
		if err != nil {
			return err
		}
		hadPrev, prev = ok, old.Announced
		r.Announced = eff.Label
		return s.upsertScore(ctx, tx, r)
	})
	if err != nil {
		return core.Score{}, err
	}
	s.mScored.Inc()
	if (hadPrev && prev != eff.Label) || (!hadPrev && eff.Label != core.LabelClean) {
		from := prev
		if from == "" {
			from = core.LabelUnknown
		}
		s.publishLabel(ctx, entityID, eff, from)
	}
	return eff, nil
}

// applyFloor lifts a verified number to the protective floor unless the
// complaints/blocks penalty is maxed.
func applyFloor(raw int, verified bool, factors []core.Factor) (int, bool) {
	if !verified || raw >= floorScore {
		return raw, false
	}
	if f, ok := factorByCode(factors, FactorComplaints); ok && f.Penalty >= f.MaxPenalty {
		return raw, false
	}
	return floorScore, true
}

func (s *Service) publishLabel(ctx context.Context, entityID string, sc core.Score, from core.ReputationLabel) {
	if s.notifier == nil {
		return
	}
	e := core.Event{ID: core.NewID(), Type: core.EventReputationLabel, At: s.now(), EntityID: entityID, Data: map[string]any{
		"tn": sc.TN, "from": from, "to": sc.Label, "score": sc.Score, "raw_score": sc.RawScore,
		"floored": sc.Floored, "override": sc.OverrideLabel != "", "version": Version,
	}}
	if err := s.notifier.Notify(ctx, e); err != nil {
		s.log.Error("notify label change", "tn", sc.TN, "err", err)
	}
}

// rescore scores each tn, returning how many were written.
func (s *Service) rescore(ctx context.Context, tns []string) (int, error) {
	s.scoreMu.Lock()
	defer s.scoreMu.Unlock()
	n := 0
	for _, tn := range tns {
		if err := ctx.Err(); err != nil {
			return n, err
		}
		if _, err := s.scoreTN(ctx, tn); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// rescoreDirty scores every number in the dirty set and clears the marks it
// consumed (marks added meanwhile survive for the next pass).
func (s *Service) rescoreDirty(ctx context.Context) (int, error) {
	marks, err := s.dirtyTNs(ctx)
	if err != nil || len(marks) == 0 {
		return 0, err
	}
	n := 0
	for _, m := range marks {
		if _, err := s.rescore(ctx, []string{m.tn}); err != nil {
			return n, err
		}
		n++
		if _, err := s.db.ExecContext(ctx, `DELETE FROM reputation_dirty WHERE tn = ? AND marked_at <= ?`, m.tn, m.at); err != nil {
			return n, err
		}
	}
	return n, nil
}

// Recompute rescores every number with recent events, feedback, an override
// or an existing score, and clears the dirty set. It returns the count scored.
func (s *Service) Recompute(ctx context.Context) (int, error) {
	now := s.now()
	if err := s.expireOverrides(ctx, now); err != nil {
		return 0, err
	}
	marks, err := s.dirtyTNs(ctx)
	if err != nil {
		return 0, err
	}
	tns, err := s.knownTNs(ctx, now)
	if err != nil {
		return 0, err
	}
	n, err := s.rescore(ctx, tns)
	if err != nil {
		return n, err
	}
	for _, m := range marks {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM reputation_dirty WHERE tn = ? AND marked_at <= ?`, m.tn, m.at); err != nil {
			return n, err
		}
	}
	return n, nil
}

// SetOverride applies an operator label override until the given time and
// rescores the number immediately. Implements core.ReputationAdmin.
func (s *Service) SetOverride(ctx context.Context, tn string, label core.ReputationLabel, reason, setBy string, until time.Time) error {
	_, err := s.setOverride(ctx, tn, label, reason, setBy, until)
	return err
}

func (s *Service) setOverride(ctx context.Context, tn string, label core.ReputationLabel, reason, setBy string, until time.Time) (core.Score, error) {
	ve := &core.ValidationError{}
	n, err := core.NormalizeTN(tn)
	if err != nil {
		ve.Add("tn", fieldMsg(err))
	}
	switch label {
	case core.LabelClean, core.LabelWatch, core.LabelSuspect, core.LabelSpam:
	default:
		ve.Add("label", "etiket clean, watch, suspect veya spam olmalı")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		ve.Add("reason", "gerekçe zorunlu")
	} else if utf8.RuneCountInString(reason) > 500 {
		ve.Add("reason", "gerekçe en fazla 500 karakter olabilir")
	}
	now := s.now()
	switch {
	case until.IsZero():
		ve.Add("until", "bitiş zamanı zorunlu")
	case !until.After(now):
		ve.Add("until", "bitiş zamanı gelecekte olmalı")
	case until.After(now.Add(366 * 24 * time.Hour)):
		ve.Add("until", "geçersiz kılma en fazla 1 yıl sürebilir")
	}
	if err := ve.Err(); err != nil {
		return core.Score{}, err
	}
	if setBy == "" {
		setBy = core.PrincipalFrom(ctx).ID
	}
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := tx.ExecContext(ctx, `DELETE FROM reputation_overrides WHERE tn = ?`, n); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO reputation_overrides (tn, label, reason, set_by, until_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`, n, string(label), reason, setBy, platform.TS(until), platform.TS(now)); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "reputation.override_set", "number", n, map[string]any{
			"label": label, "reason": reason, "until": until.UTC().Format(time.RFC3339), "set_by": setBy})
	})
	if err != nil {
		return core.Score{}, err
	}
	s.scoreMu.Lock()
	defer s.scoreMu.Unlock()
	return s.scoreTN(ctx, n)
}

// ClearOverride removes the operator override of tn and returns the rescored
// number. ErrNotFound when the number has neither an override nor a score.
func (s *Service) ClearOverride(ctx context.Context, tn string) (core.Score, error) {
	n, err := core.NormalizeTN(tn)
	if err != nil {
		return core.Score{}, err
	}
	_, hasOv, err := s.getOverride(ctx, n)
	if err != nil {
		return core.Score{}, err
	}
	if hasOv {
		err = s.db.InTx(ctx, func(tx *platform.Tx) error {
			if _, err := tx.ExecContext(ctx, `DELETE FROM reputation_overrides WHERE tn = ?`, n); err != nil {
				return err
			}
			return platform.Audit(ctx, tx, "reputation.override_cleared", "number", n, nil)
		})
		if err != nil {
			return core.Score{}, err
		}
	} else if _, ok, err := s.getScoreRow(ctx, s.db, n); err != nil {
		return core.Score{}, err
	} else if !ok {
		return core.Score{}, core.Errorf(core.ErrNotFound, "%s için itibar verisi yok", n)
	}
	s.scoreMu.Lock()
	defer s.scoreMu.Unlock()
	return s.scoreTN(ctx, n)
}

// fieldMsg extracts the Turkish message of a single-field validation error.
func fieldMsg(err error) string {
	var ve *core.ValidationError
	if errors.As(err, &ve) && len(ve.Fields) > 0 {
		return ve.Fields[0].Message
	}
	return err.Error()
}
