package disputes

import (
	"net/http"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type detail struct {
	Dispute  core.Dispute          `json:"dispute"`
	Comments []core.DisputeComment `json:"comments"`
}

// entityOf returns the caller's entity; operators and keys without an entity get 403.
func entityOf(r *http.Request) (string, error) {
	p := core.PrincipalFrom(r.Context())
	if p.EntityID == "" {
		return "", core.Errorf(core.ErrForbidden, "bu işlem bir kuruluş hesabı gerektirir")
	}
	return p.EntityID, nil
}

func (s *Service) handleEntList(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	ds, err := s.list(r.Context(), eid, "")
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": ds})
}

func (s *Service) handleEntCreate(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	var in struct {
		TN          string `json:"tn"`
		Kind        string `json:"kind"`
		Title       string `json:"title"`
		Description string `json:"description"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	d, err := s.Create(r.Context(), eid, NewDispute{TN: in.TN, Kind: in.Kind, Title: in.Title, Description: in.Description})
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, d)
}

func (s *Service) handleEntGet(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	d, err := s.getFor(r.Context(), r.PathValue("id"), eid)
	if err != nil {
		return err
	}
	cs, err := s.comments(r.Context(), d.ID, false)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, detail{d, cs})
}

func (s *Service) handleEntComment(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	d, err := s.getFor(r.Context(), r.PathValue("id"), eid)
	if err != nil {
		return err
	}
	if terminal(d.Status) {
		return core.Errorf(core.ErrState, "kapanmış itiraza yorum eklenemez")
	}
	c, err := s.AddComment(r.Context(), d, in.Body, false)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, c)
}

func (s *Service) handleAdminList(w http.ResponseWriter, r *http.Request) error {
	st := core.DisputeStatus(r.URL.Query().Get("status"))
	if st != "" && !validStatus(st) {
		return core.Invalid("status", "geçersiz durum")
	}
	ds, err := s.list(r.Context(), "", st)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": ds})
}

func (s *Service) handleAdminGet(w http.ResponseWriter, r *http.Request) error {
	d, err := s.get(r.Context(), s.db, r.PathValue("id"))
	if err != nil {
		return err
	}
	cs, err := s.comments(r.Context(), d.ID, true)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, detail{d, cs})
}

func (s *Service) handleAdminStatus(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Status     core.DisputeStatus `json:"status"`
		Resolution string             `json:"resolution"`
		ClearLabel bool               `json:"clear_label"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	d, err := s.SetStatus(r.Context(), r.PathValue("id"), StatusChange{Status: in.Status, Resolution: in.Resolution, ClearLabel: in.ClearLabel})
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, d)
}

func (s *Service) handleAdminComment(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Body     string `json:"body"`
		Internal bool   `json:"internal"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	d, err := s.get(r.Context(), s.db, r.PathValue("id"))
	if err != nil {
		return err
	}
	c, err := s.AddComment(r.Context(), d, in.Body, in.Internal)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, c)
}
