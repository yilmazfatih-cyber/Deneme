package registry

import (
	"context"
	"strconv"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// MaxBatchLookup is the largest batch accepted by POST /v1/carrier/lookup.
const MaxBatchLookup = 100

func (s *Service) ttlSeconds() int {
	t := int(s.base.Cfg.LookupTTL / time.Second)
	if t < 1 {
		t = 1
	}
	return t
}

// Lookup implements core.LookupService: who owns tn, is it verified, what to display.
//
//   - Verified = entity verified AND number active.
//   - Attest = A when verified and carrier_confirmed, B when verified only,
//     C for any other registered number, empty when not registered.
//   - Display name, logo and call reason come only from approved branding
//     (number override, else entity default) and only when verified.
//   - Score/Label from the reputation reader; -1/"unknown" without data.
//
// Results are cached for Cfg.LookupTTL; every registry write invalidates the cache.
func (s *Service) Lookup(ctx context.Context, tn string) (core.LookupResult, error) {
	norm, err := core.NormalizeTN(tn)
	if err != nil {
		return core.LookupResult{}, err
	}
	now := s.now()
	if res, ok := s.cache.get(norm, now); ok {
		return res, nil
	}
	gen := s.cache.generation()
	res, err := s.computeLookup(ctx, norm, now)
	if err != nil {
		return core.LookupResult{}, err
	}
	s.cache.put(norm, res, gen, now)
	return res, nil
}

func (s *Service) computeLookup(ctx context.Context, tn string, now time.Time) (core.LookupResult, error) {
	res := core.LookupResult{TN: tn, Score: -1, Label: core.LabelUnknown, TTLSeconds: s.ttlSeconds(), ComputedAt: now}
	n, found, err := findNumber(ctx, s.db, tn)
	if err != nil {
		return res, err
	}
	if found {
		e, err := getEntity(ctx, s.db, n.EntityID)
		if err != nil {
			return res, err
		}
		res.Found = true
		res.EntityID = e.ID
		res.EntityName = e.LegalName
		res.NumberStatus = n.Status
		res.UseCase = n.UseCase
		res.Verified = e.Status == core.EntityVerified && n.Status == core.NumberActive
		switch {
		case res.Verified && n.CarrierConfirmed:
			res.Attest = core.AttestA
		case res.Verified:
			res.Attest = core.AttestB
		default:
			res.Attest = core.AttestC
		}
		if res.Verified {
			b, ok, err := approvedBranding(ctx, s.db, n)
			if err != nil {
				return res, err
			}
			if ok {
				res.DisplayName, res.LogoURL, res.CallReason = b.DisplayName, b.LogoURL, b.CallReason
			}
		}
	}
	if rep := s.reputation(); rep != nil {
		sc, ok, err := rep.ScoreFor(ctx, tn)
		switch {
		case err != nil:
			// Reputation is advisory: a failure must not break call-time lookups.
			s.log.Warn("registry: reputation lookup failed", "tn", tn, "err", err)
		case ok:
			res.Score, res.Label = sc.Score, sc.Label
			if res.Label == "" {
				res.Label = core.LabelUnknown
			}
		}
	}
	return res, nil
}

// LookupMany resolves up to MaxBatchLookup numbers; any invalid number fails the batch.
func (s *Service) LookupMany(ctx context.Context, tns []string) ([]core.LookupResult, error) {
	if len(tns) == 0 {
		return nil, core.Invalid("tns", "En az bir numara gönderin")
	}
	if len(tns) > MaxBatchLookup {
		return nil, core.Invalid("tns", "Tek istekte en fazla 100 numara sorgulanabilir")
	}
	out := make([]core.LookupResult, 0, len(tns))
	v := &core.ValidationError{}
	for i, tn := range tns {
		r, err := s.Lookup(ctx, tn)
		if err != nil {
			if _, ok := err.(*core.ValidationError); ok {
				v.Add("tns["+strconv.Itoa(i)+"]", "Numara tanınmadı: "+tn)
				continue
			}
			return nil, err
		}
		out = append(out, r)
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// Stats is the admin dashboard summary.
type Stats struct {
	Entities map[string]int64 `json:"entities"`
	Numbers  map[string]int64 `json:"numbers"`
	Branding map[string]int64 `json:"branding"`
}

// Stats counts entities, numbers and brandings by status.
func (s *Service) Stats(ctx context.Context) (Stats, error) {
	var st Stats
	var err error
	if st.Entities, err = countByStatus(ctx, s.db, "entities", "pending", "in_review", "verified", "rejected", "suspended"); err != nil {
		return st, err
	}
	if st.Numbers, err = countByStatus(ctx, s.db, "numbers", "pending_verification", "active", "suspended", "released"); err != nil {
		return st, err
	}
	st.Branding, err = countByStatus(ctx, s.db, "branding", brandingStatuses...)
	return st, err
}
