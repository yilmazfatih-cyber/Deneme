package notify

import (
	"net/http"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type createRequest struct {
	URL    string   `json:"url"`
	Events []string `json:"events"`
}

type createResponse struct {
	Webhook Webhook `json:"webhook"`
	Secret  string  `json:"secret"`
}

// Mount registers the notify routes.
func (s *Service) Mount(r *platform.Router) {
	r.Handle("GET", "/v1/enterprise/webhooks", core.ScopeEnterpriseRead, s.entListWebhooks)
	r.Handle("POST", "/v1/enterprise/webhooks", core.ScopeEnterpriseWrite, s.entCreateWebhook)
	r.Handle("DELETE", "/v1/enterprise/webhooks/{id}", core.ScopeEnterpriseWrite, s.entDeleteWebhook)
	r.Handle("GET", "/v1/enterprise/webhooks/{id}/deliveries", core.ScopeEnterpriseRead, s.entListDeliveries)
	r.Handle("GET", "/v1/admin/webhooks", core.ScopeAdminRead, s.admListWebhooks)
	r.Handle("POST", "/v1/admin/webhooks", core.ScopeAdmin, s.admCreateWebhook)
	r.Handle("DELETE", "/v1/admin/webhooks/{id}", core.ScopeAdmin, s.admDeleteWebhook)
	r.Handle("GET", "/v1/admin/outbox", core.ScopeAdminRead, s.admOutbox)
}

// entityOf returns the caller's entity id or 403.
func entityOf(r *http.Request) (string, error) {
	p := core.PrincipalFrom(r.Context())
	if p.EntityID == "" {
		return "", core.Errorf(core.ErrForbidden, "bu işlem yalnızca firma hesapları içindir")
	}
	return p.EntityID, nil
}

func (s *Service) entListWebhooks(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	items, err := s.ListWebhooks(r.Context(), OwnerEntity, eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) entCreateWebhook(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	return s.create(w, r, OwnerEntity, eid)
}

func (s *Service) create(w http.ResponseWriter, r *http.Request, ownerKind, entityID string) error {
	var req createRequest
	if err := platform.DecodeJSON(r, &req); err != nil {
		return err
	}
	hook, secret, err := s.CreateWebhook(r.Context(), ownerKind, entityID, req.URL, req.Events)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, createResponse{Webhook: hook, Secret: secret})
}

func (s *Service) entDeleteWebhook(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	if err := s.DeleteWebhook(r.Context(), r.PathValue("id"), eid); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Service) entListDeliveries(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	hook, err := s.GetWebhook(r.Context(), r.PathValue("id"), eid)
	if err != nil {
		return err
	}
	items, err := s.ListDeliveries(r.Context(), hook.ID, platform.QueryInt(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) admListWebhooks(w http.ResponseWriter, r *http.Request) error {
	items, err := s.ListWebhooks(r.Context(), "", "")
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) admCreateWebhook(w http.ResponseWriter, r *http.Request) error {
	return s.create(w, r, OwnerOperator, "")
}

func (s *Service) admDeleteWebhook(w http.ResponseWriter, r *http.Request) error {
	if err := s.DeleteWebhook(r.Context(), r.PathValue("id"), ""); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Service) admOutbox(w http.ResponseWriter, r *http.Request) error {
	items, err := s.ListOutbox(r.Context(), platform.QueryInt(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}
