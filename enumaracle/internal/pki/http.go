package pki

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

const maxBody = 64 << 10

var certFileRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pem$`)

// Mount registers the pki routes.
func (s *Service) Mount(r *platform.Router) {
	r.Handle("GET", "/certs/{file}", "", s.handleCertFile)
	r.Handle("GET", "/v1/admin/pki/certificates", core.ScopeAdminRead, s.handleAdminList)
	r.Handle("POST", "/v1/admin/pki/certificates/{id}/revoke", core.ScopeAdmin, s.handleRevoke)
	r.Handle("POST", "/v1/admin/pki/rotate-sp", core.ScopeAdmin, s.handleRotate)
	r.Handle("GET", "/v1/enterprise/certificates", core.ScopeEnterpriseRead, s.handleEntList)
	r.Handle("POST", "/v1/enterprise/certificates", core.ScopeEnterpriseWrite, s.handleEntIssue)
	r.Handle("POST", "/v1/carrier/sign", core.ScopeCarrierWrite, s.handleSign)
	r.Handle("POST", "/v1/carrier/verify", core.ScopeCarrierRead, s.handleVerify)
	r.Handle("POST", "/v1/enterprise/rcd/sign", core.ScopeEnterpriseWrite, s.handleRCDSign)
}

func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	return platform.DecodeJSON(r, v)
}

func entityOf(r *http.Request) (string, error) {
	p := core.PrincipalFrom(r.Context())
	if p.EntityID == "" {
		return "", core.Errorf(core.ErrForbidden, "bu işlem yalnızca kurum hesapları içindir")
	}
	return p.EntityID, nil
}

func (s *Service) handleCertFile(w http.ResponseWriter, r *http.Request) error {
	file := r.PathValue("file")
	if !certFileRE.MatchString(file) {
		return core.Errorf(core.ErrNotFound, "sertifika bulunamadı")
	}
	b, err := s.ChainPEM(r.Context(), strings.TrimSuffix(file, ".pem"))
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, err = w.Write(b)
	return err
}

func (s *Service) handleAdminList(w http.ResponseWriter, r *http.Request) error {
	items, err := s.ListCertificates(r.Context())
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) handleRevoke(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Reason string `json:"reason"`
	}
	if err := decode(w, r, &body); err != nil {
		return err
	}
	c, err := s.RevokeCertificate(r.Context(), r.PathValue("id"), body.Reason)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, c)
}

func (s *Service) handleRotate(w http.ResponseWriter, r *http.Request) error {
	c, err := s.RotateSP(r.Context())
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, c)
}

func (s *Service) handleEntList(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	items, err := s.EntityCertificates(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Service) handleEntIssue(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	c, err := s.IssueDelegate(r.Context(), eid)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusCreated, c)
}

func (s *Service) handleSign(w http.ResponseWriter, r *http.Request) error {
	var req core.SignRequest
	if err := decode(w, r, &req); err != nil {
		return err
	}
	res, err := s.Sign(r.Context(), req)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, res)
}

func (s *Service) handleVerify(w http.ResponseWriter, r *http.Request) error {
	var req core.VerifyRequest
	if err := decode(w, r, &req); err != nil {
		return err
	}
	res, err := s.Verify(r.Context(), req)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, res)
}

func (s *Service) handleRCDSign(w http.ResponseWriter, r *http.Request) error {
	eid, err := entityOf(r)
	if err != nil {
		return err
	}
	var req struct {
		OrigTN string `json:"orig_tn"`
		DestTN string `json:"dest_tn"`
	}
	if err := decode(w, r, &req); err != nil {
		return err
	}
	res, err := s.SignRCD(r.Context(), eid, req.OrigTN, req.DestTN)
	if err != nil {
		return err
	}
	return platform.WriteJSON(w, http.StatusOK, res)
}
