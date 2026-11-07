package registry

import (
	"context"
	"net/http"
	"strings"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type items[T any] struct {
	Items []T `json:"items"`
}

type itemsTotal[T any] struct {
	Items []T   `json:"items"`
	Total int64 `json:"total"`
}

// Mount registers every registry route (contract §4 "registry").
func (s *Service) Mount(r *platform.Router) {
	const (
		eR = core.ScopeEnterpriseRead
		eW = core.ScopeEnterpriseWrite
		aR = core.ScopeAdminRead
		aW = core.ScopeAdmin
		cR = core.ScopeCarrierRead
	)
	r.Handle("POST", "/v1/signup", "", s.hSignup)

	r.Handle("GET", "/v1/enterprise/entity", eR, s.enterprise(s.hEntGetEntity))
	r.Handle("PUT", "/v1/enterprise/entity", eW, s.enterprise(s.hEntPutEntity))
	r.Handle("POST", "/v1/enterprise/entity/submit", eW, s.enterprise(s.hEntSubmit))
	r.Handle("GET", "/v1/enterprise/entity/documents", eR, s.enterprise(s.hEntDocuments))
	r.Handle("POST", "/v1/enterprise/entity/documents", eW, s.enterprise(s.hEntAddDocument))
	r.Handle("GET", "/v1/enterprise/numbers", eR, s.enterprise(s.hEntNumbers))
	r.Handle("POST", "/v1/enterprise/numbers", eW, s.enterprise(s.hEntAddNumber))
	r.Handle("PUT", "/v1/enterprise/numbers/{id}", eW, s.enterprise(s.hEntPutNumber))
	r.Handle("DELETE", "/v1/enterprise/numbers/{id}", eW, s.enterprise(s.hEntDeleteNumber))
	r.Handle("GET", "/v1/enterprise/branding", eR, s.enterprise(s.hEntBranding))
	r.Handle("POST", "/v1/enterprise/branding", eW, s.enterprise(s.hEntAddBranding))
	r.Handle("PUT", "/v1/enterprise/branding/{id}", eW, s.enterprise(s.hEntPutBranding))

	r.Handle("GET", "/v1/admin/entities", aR, s.hAdmEntities)
	r.Handle("POST", "/v1/admin/entities", aW, s.hAdmCreateEntity)
	r.Handle("GET", "/v1/admin/entities/{id}", aR, s.hAdmEntity)
	r.Handle("POST", "/v1/admin/entities/{id}/decision", aW, s.hAdmDecision)
	r.Handle("GET", "/v1/admin/numbers", aR, s.hAdmNumbers)
	r.Handle("POST", "/v1/admin/numbers/{id}/status", aW, s.hAdmNumberStatus)
	r.Handle("GET", "/v1/admin/branding", aR, s.hAdmBranding)
	r.Handle("POST", "/v1/admin/branding/{id}/review", aW, s.hAdmReview)
	r.Handle("GET", "/v1/admin/stats", aR, s.hAdmStats)

	r.Handle("GET", "/v1/carrier/lookup/{tn}", cR, s.hLookup)
	r.Handle("POST", "/v1/carrier/lookup", cR, s.hLookupBatch)
}

// enterpriseHandler receives the caller's entity id.
type enterpriseHandler func(w http.ResponseWriter, r *http.Request, entityID string) error

// enterprise scopes a handler to core.PrincipalFrom(ctx).EntityID. Callers
// without an entity id, and operator principals, get 403.
func (s *Service) enterprise(h enterpriseHandler) platform.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := enterpriseID(r.Context())
		if err != nil {
			return err
		}
		return h(w, r, id)
	}
}

func enterpriseID(ctx context.Context) (string, error) {
	p := core.PrincipalFrom(ctx)
	if p.EntityID == "" || p.IsOperator() {
		return "", core.Errorf(core.ErrForbidden, "bu işlem yalnızca kurumsal hesaplar için kullanılabilir")
	}
	return p.EntityID, nil
}

// ---------------------------------------------------------------- public

func (s *Service) hSignup(w http.ResponseWriter, r *http.Request) error {
	var in SignupInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	res, err := s.Signup(r.Context(), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, res)
}

// ---------------------------------------------------------------- enterprise

func (s *Service) hEntGetEntity(w http.ResponseWriter, r *http.Request, eid string) error {
	e, err := s.GetEntity(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, e)
}

func (s *Service) hEntPutEntity(w http.ResponseWriter, r *http.Request, eid string) error {
	var in EntityInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	e, err := s.UpdateEntity(r.Context(), eid, in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, e)
}

func (s *Service) hEntSubmit(w http.ResponseWriter, r *http.Request, eid string) error {
	e, err := s.Submit(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, e)
}

func (s *Service) hEntDocuments(w http.ResponseWriter, r *http.Request, eid string) error {
	d, err := s.Documents(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, items[core.EntityDocument]{d})
}

func (s *Service) hEntAddDocument(w http.ResponseWriter, r *http.Request, eid string) error {
	var in DocumentInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	d, err := s.AddDocument(r.Context(), eid, in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, d)
}

func (s *Service) hEntNumbers(w http.ResponseWriter, r *http.Request, eid string) error {
	n, err := s.EntityNumbers(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, items[core.Number]{n})
}

func (s *Service) hEntAddNumber(w http.ResponseWriter, r *http.Request, eid string) error {
	var in NumberInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	n, err := s.RegisterNumber(r.Context(), eid, in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, n)
}

func (s *Service) hEntPutNumber(w http.ResponseWriter, r *http.Request, eid string) error {
	var in NumberUpdate
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	n, err := s.UpdateNumber(r.Context(), eid, r.PathValue("id"), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, n)
}

func (s *Service) hEntDeleteNumber(w http.ResponseWriter, r *http.Request, eid string) error {
	if err := s.ReleaseNumber(r.Context(), eid, r.PathValue("id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Service) hEntBranding(w http.ResponseWriter, r *http.Request, eid string) error {
	b, err := s.EntityBranding(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, items[core.Branding]{b})
}

func (s *Service) hEntAddBranding(w http.ResponseWriter, r *http.Request, eid string) error {
	var in BrandingInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	b, err := s.CreateBranding(r.Context(), eid, in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, b)
}

func (s *Service) hEntPutBranding(w http.ResponseWriter, r *http.Request, eid string) error {
	var in BrandingInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	b, err := s.UpdateBranding(r.Context(), eid, r.PathValue("id"), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, b)
}

// ---------------------------------------------------------------- admin

func (s *Service) hAdmEntities(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	list, total, err := s.ListEntities(r.Context(), EntityFilter{
		Status: core.EntityStatus(q.Get("status")), Query: q.Get("q"), Limit: platform.QueryInt(r, "limit", 50, 500)})
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, itemsTotal[core.Entity]{list, total})
}

func (s *Service) hAdmCreateEntity(w http.ResponseWriter, r *http.Request) error {
	var in EntityInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	e, err := s.CreateEntity(r.Context(), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, e)
}

func (s *Service) hAdmEntity(w http.ResponseWriter, r *http.Request) error {
	d, err := s.EntityDetail(r.Context(), r.PathValue("id"))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, d)
}

func (s *Service) hAdmDecision(w http.ResponseWriter, r *http.Request) error {
	var in DecisionInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	e, err := s.Transition(r.Context(), r.PathValue("id"), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, e)
}

func (s *Service) hAdmNumbers(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	list, total, err := s.ListNumbers(r.Context(), NumberFilter{Status: core.NumberStatus(q.Get("status")),
		EntityID: strings.TrimSpace(q.Get("entity_id")), Limit: platform.QueryInt(r, "limit", 100, 1000)})
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, itemsTotal[core.Number]{list, total})
}

func (s *Service) hAdmNumberStatus(w http.ResponseWriter, r *http.Request) error {
	var in NumberStatusInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	n, err := s.SetNumberStatus(r.Context(), r.PathValue("id"), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, n)
}

func (s *Service) hAdmBranding(w http.ResponseWriter, r *http.Request) error {
	b, err := s.ListBranding(r.Context(), core.BrandingStatus(r.URL.Query().Get("status")), platform.QueryInt(r, "limit", 200, 1000))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, items[core.Branding]{b})
}

func (s *Service) hAdmReview(w http.ResponseWriter, r *http.Request) error {
	var in ReviewInput
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	b, err := s.ReviewBranding(r.Context(), r.PathValue("id"), in)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, b)
}

func (s *Service) hAdmStats(w http.ResponseWriter, r *http.Request) error {
	st, err := s.Stats(r.Context())
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, st)
}

// ---------------------------------------------------------------- carrier

func (s *Service) hLookup(w http.ResponseWriter, r *http.Request) error {
	res, err := s.Lookup(r.Context(), r.PathValue("tn"))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, res)
}

func (s *Service) hLookupBatch(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		TNs []string `json:"tns"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	res, err := s.LookupMany(r.Context(), in.TNs)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, items[core.LookupResult]{res})
}
