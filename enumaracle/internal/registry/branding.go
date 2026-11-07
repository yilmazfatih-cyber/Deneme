package registry

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// BrandingInput is the enterprise branding body.
type BrandingInput struct {
	DisplayName string `json:"display_name"`
	LogoURL     string `json:"logo_url,omitempty"`
	CallReason  string `json:"call_reason,omitempty"`
	IsDefault   bool   `json:"is_default"`
}

// ReviewInput is the operator branding review.
type ReviewInput struct {
	Status core.BrandingStatus `json:"status"`
	Note   string              `json:"note"`
}

var brandingStatuses = []string{string(core.BrandingDraft), string(core.BrandingPending),
	string(core.BrandingApproved), string(core.BrandingRejected)}

func (in *BrandingInput) normalize() error {
	v := &core.ValidationError{}
	in.DisplayName = cleanText(in.DisplayName)
	in.CallReason = cleanText(in.CallReason)
	in.LogoURL = strings.TrimSpace(in.LogoURL)
	switch {
	case in.DisplayName == "":
		v.Add("display_name", "Görünen ad zorunludur")
	case utf8.RuneCountInString(in.DisplayName) > 32:
		v.Add("display_name", "Görünen ad en fazla 32 karakter olabilir")
	case hasControl(in.DisplayName):
		v.Add("display_name", "Görünen ad geçersiz karakter içeriyor")
	}
	if in.LogoURL != "" {
		u, err := url.Parse(in.LogoURL)
		switch {
		case len(in.LogoURL) > 512:
			v.Add("logo_url", "Logo adresi en fazla 512 karakter olabilir")
		case err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil:
			v.Add("logo_url", "Logo adresi https:// ile başlayan geçerli bir adres olmalıdır")
		}
	}
	switch {
	case utf8.RuneCountInString(in.CallReason) > 64:
		v.Add("call_reason", "Arama nedeni en fazla 64 karakter olabilir")
	case hasControl(in.CallReason):
		v.Add("call_reason", "Arama nedeni geçersiz karakter içeriyor")
	}
	return v.Err()
}

// CreateBranding adds a branding in status pending_review.
func (s *Service) CreateBranding(ctx context.Context, entityID string, in BrandingInput) (core.Branding, error) {
	if err := in.normalize(); err != nil {
		return core.Branding{}, err
	}
	now := s.now()
	b := core.Branding{ID: core.NewID(), EntityID: entityID, DisplayName: in.DisplayName, LogoURL: in.LogoURL,
		CallReason: in.CallReason, IsDefault: in.IsDefault, Status: core.BrandingPending, CreatedAt: now, UpdatedAt: now}
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := getEntity(ctx, tx, entityID); err != nil {
			return err
		}
		if err := insertBranding(ctx, tx, b); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "branding.create", "branding", b.ID, in)
	})
	if err != nil {
		return core.Branding{}, err
	}
	return b, nil
}

// UpdateBranding replaces a branding's content and sends it back to review.
// An approved branding stops being displayed until it is approved again.
func (s *Service) UpdateBranding(ctx context.Context, entityID, id string, in BrandingInput) (core.Branding, error) {
	if err := in.normalize(); err != nil {
		return core.Branding{}, err
	}
	var out core.Branding
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		b, err := getBranding(ctx, tx, id)
		if err != nil {
			return err
		}
		if b.EntityID != entityID {
			return core.Errorf(core.ErrNotFound, "marka kaydı bulunamadı")
		}
		b.DisplayName, b.LogoURL, b.CallReason, b.IsDefault = in.DisplayName, in.LogoURL, in.CallReason, in.IsDefault
		b.Status, b.ReviewNote, b.ReviewedBy, b.ReviewedAt, b.UpdatedAt = core.BrandingPending, "", "", nil, s.now()
		if err := updateBrandingRow(ctx, tx, b); err != nil {
			return err
		}
		out = b
		return platform.Audit(ctx, tx, "branding.update", "branding", b.ID, in)
	})
	if err == nil {
		s.cache.invalidate()
	}
	return out, err
}

// ReviewBranding approves or rejects a branding. Pending brandings can be
// approved or rejected; an approved branding can be withdrawn (rejected).
// Approving a default branding makes it the entity's only default.
func (s *Service) ReviewBranding(ctx context.Context, id string, in ReviewInput) (core.Branding, error) {
	in.Note = strings.TrimSpace(in.Note)
	v := &core.ValidationError{}
	if in.Status != core.BrandingApproved && in.Status != core.BrandingRejected {
		v.Add("status", "Durum approved veya rejected olmalıdır")
	}
	if in.Status == core.BrandingRejected && in.Note == "" {
		v.Add("note", "Ret kararında gerekçe zorunludur")
	}
	if utf8.RuneCountInString(in.Note) > maxNoteRunes {
		v.Add("note", fmt.Sprintf("Not en fazla %d karakter olabilir", maxNoteRunes))
	}
	if err := v.Err(); err != nil {
		return core.Branding{}, err
	}
	p := core.PrincipalFrom(ctx)
	var out core.Branding
	var from core.BrandingStatus
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		b, err := getBranding(ctx, tx, id)
		if err != nil {
			return err
		}
		from = b.Status
		legal := from == core.BrandingPending || (from == core.BrandingApproved && in.Status == core.BrandingRejected)
		if !legal {
			return core.Errorf(core.ErrState, "marka kaydı %s durumundayken %s kararı verilemez", from, in.Status)
		}
		now := s.now()
		b.Status, b.ReviewNote, b.ReviewedBy, b.ReviewedAt, b.UpdatedAt = in.Status, in.Note, p.ID, &now, now
		if err := updateBrandingRow(ctx, tx, b); err != nil {
			return err
		}
		if b.Status == core.BrandingApproved && b.IsDefault {
			if _, err := tx.ExecContext(ctx, `UPDATE branding SET is_default = 0, updated_at = ? WHERE entity_id = ? AND id <> ? AND is_default = 1`,
				platform.TS(now), b.EntityID, b.ID); err != nil {
				return err
			}
		}
		out = b
		return platform.Audit(ctx, tx, "branding.review", "branding", b.ID, map[string]any{
			"from": from, "to": b.Status, "note": in.Note})
	})
	if err != nil {
		return core.Branding{}, err
	}
	s.cache.invalidate()
	s.emit(ctx, core.EventBrandingReviewed, out.EntityID, map[string]any{
		"branding_id": out.ID, "display_name": out.DisplayName, "from": from, "status": out.Status, "note": out.ReviewNote})
	return out, nil
}

func (s *Service) brandingOf(ctx context.Context, entityID string) ([]core.Branding, error) {
	return scanBrandings(s.db.QueryContext(ctx, `SELECT `+brandingCols+` FROM branding WHERE entity_id = ? ORDER BY created_at, id`, entityID))
}

// EntityBranding lists an entity's brandings.
func (s *Service) EntityBranding(ctx context.Context, entityID string) ([]core.Branding, error) {
	return s.brandingOf(ctx, entityID)
}

// ListBranding lists brandings for the operator, optionally by status (oldest pending first).
func (s *Service) ListBranding(ctx context.Context, status core.BrandingStatus, limit int) ([]core.Branding, error) {
	where, args := ``, []any{}
	if status != "" {
		ok := false
		for _, st := range brandingStatuses {
			ok = ok || st == string(status)
		}
		if !ok {
			return nil, core.Invalid("status", "Geçersiz marka durumu")
		}
		where, args = ` WHERE status = ?`, append(args, string(status))
	}
	if limit <= 0 {
		limit = 200
	}
	return scanBrandings(s.db.QueryContext(ctx, `SELECT `+brandingCols+` FROM branding`+where+
		` ORDER BY updated_at, id LIMIT ?`, append(args, limit)...))
}

// ApprovedBranding implements core.EntityDirectory.
func (s *Service) ApprovedBranding(ctx context.Context, n core.Number) (core.Branding, bool, error) {
	return approvedBranding(ctx, s.db, n)
}
