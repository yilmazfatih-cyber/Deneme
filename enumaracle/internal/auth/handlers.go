package auth

import (
	"net/http"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

func (s *Service) setCookie(w http.ResponseWriter, value string, expires time.Time) {
	c := &http.Cookie{Name: platform.SessionCookie, Value: value, Path: "/", HttpOnly: true,
		Secure: s.base.Cfg.CookieSecure, SameSite: http.SameSiteLaxMode}
	if value == "" {
		c.MaxAge = -1
		c.Expires = time.Unix(0, 0)
	} else {
		c.Expires = expires
		c.MaxAge = int(expires.Sub(s.now()).Seconds())
		if c.MaxAge <= 0 {
			c.MaxAge = int(SessionTTL.Seconds())
		}
	}
	http.SetCookie(w, c)
}

func cookieValue(r *http.Request) string {
	if c, err := r.Cookie(platform.SessionCookie); err == nil {
		return c.Value
	}
	return ""
}

func noStore(w http.ResponseWriter) { w.Header().Set("Cache-Control", "no-store") }

type loginResp struct {
	User      core.User `json:"user"`
	CSRFToken string    `json:"csrf_token"`
}

func (s *Service) handleLogin(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	if len(in.Password) > maxPasswordBytes || len(in.Email) > 254 {
		return errBadLogin
	}
	sess, err := s.Login(r.Context(), in.Email, in.Password, cookieValue(r), r.UserAgent())
	if err != nil {
		return err
	}
	s.setCookie(w, sess.Token, sess.ExpiresAt)
	noStore(w)
	return platform.WriteJSON(w, http.StatusOK, loginResp{User: sess.User, CSRFToken: sess.CSRF})
}

func (s *Service) handleLogout(w http.ResponseWriter, r *http.Request) error {
	if err := s.Logout(r.Context(), cookieValue(r)); err != nil {
		return err
	}
	s.setCookie(w, "", time.Time{})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Service) handleMe(w http.ResponseWriter, r *http.Request) error {
	p := core.PrincipalFrom(r.Context())
	if p.Kind != "user" {
		return core.Errorf(core.ErrUnauthorized, "oturum yok")
	}
	u, err := s.GetUser(r.Context(), p.ID)
	if err != nil {
		return core.Errorf(core.ErrUnauthorized, "oturum yok")
	}
	noStore(w)
	return platform.WriteJSON(w, http.StatusOK, struct {
		User      core.User    `json:"user"`
		CSRFToken string       `json:"csrf_token"`
		Scopes    []core.Scope `json:"scopes"`
	}{u, p.CSRF, p.Scopes})
}

// ---------------------------------------------------------------- users

func (s *Service) handleListUsers(w http.ResponseWriter, r *http.Request) error {
	us, err := s.ListUsers(r.Context())
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": us})
}

func (s *Service) handleCreateUser(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string    `json:"email"`
		Name     string    `json:"name"`
		Password string    `json:"password"`
		Role     core.Role `json:"role"`
		EntityID string    `json:"entity_id"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	u, err := s.CreateUser(r.Context(), core.NewUser{Email: in.Email, Name: in.Name, Password: in.Password,
		Role: in.Role, EntityID: in.EntityID})
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, u)
}

func (s *Service) handleSetActive(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Active *bool `json:"active"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	if in.Active == nil {
		return core.Invalid("active", "active alanı gerekli")
	}
	u, err := s.SetActive(r.Context(), r.PathValue("id"), *in.Active)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, u)
}

// ---------------------------------------------------------------- api keys

type keyResp struct {
	APIKey core.APIKey `json:"api_key"`
	Secret string      `json:"secret"`
}

func (s *Service) handleAdminListKeys(w http.ResponseWriter, r *http.Request) error {
	ks, err := s.ListAPIKeys(r.Context(), "", "")
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": ks})
}

func (s *Service) handleAdminCreateKey(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Name      string       `json:"name"`
		OwnerKind string       `json:"owner_kind"`
		OwnerID   string       `json:"owner_id"`
		Scopes    []core.Scope `json:"scopes"`
		RateRPS   int          `json:"rate_rps"`
		ExpiresAt *time.Time   `json:"expires_at"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	k, secret, err := s.CreateAPIKey(r.Context(), NewAPIKey{Name: in.Name, OwnerKind: in.OwnerKind, OwnerID: in.OwnerID,
		Scopes: in.Scopes, RateRPS: in.RateRPS, ExpiresAt: in.ExpiresAt})
	if err != nil {
		return err
	}
	noStore(w)
	return platform.WriteJSON(w, http.StatusCreated, keyResp{k, secret})
}

func (s *Service) handleAdminRevokeKey(w http.ResponseWriter, r *http.Request) error {
	if err := s.RevokeAPIKey(r.Context(), r.PathValue("id"), "", ""); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func entityOf(r *http.Request) (string, error) {
	p := core.PrincipalFrom(r.Context())
	if p.EntityID == "" {
		return "", core.Errorf(core.ErrForbidden, "bu işlem bir kuruluş hesabı gerektirir")
	}
	return p.EntityID, nil
}

func (s *Service) handleEntListKeys(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	ks, err := s.ListAPIKeys(r.Context(), OwnerEntity, eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": ks})
}

func (s *Service) handleEntCreateKey(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	var in struct {
		Name   string       `json:"name"`
		Scopes []core.Scope `json:"scopes"`
	}
	if err := platform.DecodeJSON(r, &in); err != nil {
		return err
	}
	k, secret, err := s.CreateAPIKey(r.Context(), NewAPIKey{Name: in.Name, OwnerKind: OwnerEntity, OwnerID: eid, Scopes: in.Scopes})
	if err != nil {
		return err
	}
	noStore(w)
	return platform.WriteJSON(w, http.StatusCreated, keyResp{k, secret})
}

func (s *Service) handleEntRevokeKey(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	if err := s.RevokeAPIKey(r.Context(), r.PathValue("id"), OwnerEntity, eid); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------------------------------------------------------------- audit

func (s *Service) handleAudit(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	ev, err := platform.ListAudit(r.Context(), s.db, q.Get("target_kind"), q.Get("target_id"),
		platform.QueryInt(r, "limit", 100, 1000))
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": ev})
}
