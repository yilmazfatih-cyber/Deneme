// Package disputes implements enterprise dispute tickets (label, suspension,
// branding, lookup) with an operator review workflow.
package disputes

import (
	"context"
	"embed"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Migrations holds the disputes schema.
//
//go:embed migrations/*.sql
var Migrations embed.FS

// ClearLabelFor is how long a clear_label override lasts.
const ClearLabelFor = 30 * 24 * time.Hour

// Kinds accepted for a dispute.
var Kinds = []string{"label", "suspension", "branding", "lookup", "other"}

// Deps are the constructor inputs. Every interface is optional (nil-safe).
type Deps struct {
	Base       platform.Deps
	Notifier   core.Notifier
	Directory  core.EntityDirectory
	Reputation core.ReputationAdmin
}

// Service stores disputes and serves the dispute routes.
type Service struct {
	base platform.Deps
	db   *platform.DB
	ntf  core.Notifier
	dir  core.EntityDirectory
	rep  core.ReputationAdmin
}

// New constructs the service.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, errors.New("disputes: Base.DB is required")
	}
	return &Service{base: d.Base, db: d.Base.DB, ntf: d.Notifier, dir: d.Directory, rep: d.Reputation}, nil
}

// Start has no background work.
func (s *Service) Start(context.Context) error { return nil }

func (s *Service) now() time.Time { return s.base.Now() }

// Mount registers every dispute route.
func (s *Service) Mount(r *platform.Router) {
	r.Handle("GET", "/v1/enterprise/disputes", core.ScopeEnterpriseRead, s.handleEntList)
	r.Handle("POST", "/v1/enterprise/disputes", core.ScopeEnterpriseWrite, s.handleEntCreate)
	r.Handle("GET", "/v1/enterprise/disputes/{id}", core.ScopeEnterpriseRead, s.handleEntGet)
	r.Handle("POST", "/v1/enterprise/disputes/{id}/comments", core.ScopeEnterpriseWrite, s.handleEntComment)

	r.Handle("GET", "/v1/admin/disputes", core.ScopeAdminRead, s.handleAdminList)
	r.Handle("GET", "/v1/admin/disputes/{id}", core.ScopeAdminRead, s.handleAdminGet)
	r.Handle("POST", "/v1/admin/disputes/{id}/status", core.ScopeAdmin, s.handleAdminStatus)
	r.Handle("POST", "/v1/admin/disputes/{id}/comments", core.ScopeAdmin, s.handleAdminComment)
}

// ---------------------------------------------------------------- state machine

// CanTransition reports whether from -> to is legal:
// open -> in_review|resolved|rejected; in_review -> resolved|rejected.
// resolved and rejected are terminal.
func CanTransition(from, to core.DisputeStatus) bool {
	switch from {
	case core.DisputeOpen:
		return to == core.DisputeInReview || to == core.DisputeResolved || to == core.DisputeRejected
	case core.DisputeInReview:
		return to == core.DisputeResolved || to == core.DisputeRejected
	}
	return false
}

func terminal(st core.DisputeStatus) bool {
	return st == core.DisputeResolved || st == core.DisputeRejected
}

func validStatus(st core.DisputeStatus) bool {
	return st == core.DisputeOpen || st == core.DisputeInReview || terminal(st)
}

// ---------------------------------------------------------------- store

const cols = `id, entity_id, tn, kind, status, title, description, resolution, opened_by, resolved_by, resolved_at, created_at, updated_at`

func scanDispute(sc interface{ Scan(...any) error }) (core.Dispute, error) {
	var d core.Dispute
	var resolvedAt, created, updated string
	if err := sc.Scan(&d.ID, &d.EntityID, &d.TN, &d.Kind, &d.Status, &d.Title, &d.Description, &d.Resolution,
		&d.OpenedBy, &d.ResolvedBy, &resolvedAt, &created, &updated); err != nil {
		return d, err
	}
	d.ResolvedAt = platform.ParseTSPtr(resolvedAt)
	d.CreatedAt = platform.ParseTS(created)
	d.UpdatedAt = platform.ParseTS(updated)
	return d, nil
}

func (s *Service) get(ctx context.Context, q platform.Querier, id string) (core.Dispute, error) {
	d, err := scanDispute(q.QueryRowContext(ctx, `SELECT `+cols+` FROM disputes WHERE id = ?`, id))
	if err != nil {
		return d, platform.NotFound(err, "itiraz")
	}
	return d, nil
}

// getFor returns the dispute only if it belongs to entityID (else ErrNotFound).
func (s *Service) getFor(ctx context.Context, id, entityID string) (core.Dispute, error) {
	d, err := s.get(ctx, s.db, id)
	if err != nil {
		return d, err
	}
	if d.EntityID != entityID {
		return core.Dispute{}, core.Errorf(core.ErrNotFound, "itiraz")
	}
	return d, nil
}

func (s *Service) list(ctx context.Context, entityID string, status core.DisputeStatus) ([]core.Dispute, error) {
	q := `SELECT ` + cols + ` FROM disputes WHERE 1 = 1`
	var args []any
	if entityID != "" {
		q += ` AND entity_id = ?`
		args = append(args, entityID)
	}
	if status != "" {
		q += ` AND status = ?`
		args = append(args, string(status))
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY created_at DESC, id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Dispute{}
	for rows.Next() {
		d, err := scanDispute(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Service) comments(ctx context.Context, disputeID string, includeInternal bool) ([]core.DisputeComment, error) {
	q := `SELECT id, dispute_id, author_id, author_role, body, internal, created_at FROM dispute_comments WHERE dispute_id = ?`
	if !includeInternal {
		q += ` AND internal = 0`
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY created_at, id`, disputeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.DisputeComment{}
	for rows.Next() {
		var c core.DisputeComment
		var internal int
		var created string
		if err := rows.Scan(&c.ID, &c.DisputeID, &c.AuthorID, &c.AuthorRole, &c.Body, &internal, &created); err != nil {
			return nil, err
		}
		c.Internal = internal == 1
		c.CreatedAt = platform.ParseTS(created)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Service) notify(ctx context.Context, typ string, d core.Dispute, extra map[string]any) {
	if s.ntf == nil {
		return
	}
	data := map[string]any{"dispute": d}
	for k, v := range extra {
		data[k] = v
	}
	if err := s.ntf.Notify(ctx, core.Event{ID: core.NewID(), Type: typ, At: s.now(), EntityID: d.EntityID, Data: data}); err != nil && s.base.Log != nil {
		s.base.Log.Warn("disputes: notify failed", "type", typ, "dispute", d.ID, "err", err)
	}
}

// ---------------------------------------------------------------- operations

// NewDispute is the enterprise input of Create.
type NewDispute struct {
	TN, Kind, Title, Description string
}

// Create opens a dispute for entityID. The number must belong to the entity
// according to the EntityDirectory; without a directory ownership cannot be
// proven and the request is refused.
func (s *Service) Create(ctx context.Context, entityID string, in NewDispute) (core.Dispute, error) {
	v := &core.ValidationError{}
	tn, err := core.NormalizeTN(in.TN)
	if err != nil {
		v.Add("tn", "geçerli bir telefon numarası girin")
	}
	in.Kind = strings.TrimSpace(in.Kind)
	okKind := false
	for _, k := range Kinds {
		okKind = okKind || k == in.Kind
	}
	if !okKind {
		v.Add("kind", "tür label, suspension, branding, lookup veya other olmalı")
	}
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || utf8.RuneCountInString(in.Title) > 200 {
		v.Add("title", "başlık 1-200 karakter olmalı")
	}
	in.Description = strings.TrimSpace(in.Description)
	if utf8.RuneCountInString(in.Description) > 5000 {
		v.Add("description", "açıklama en fazla 5000 karakter olabilir")
	}
	if err := v.Err(); err != nil {
		return core.Dispute{}, err
	}
	if err := s.checkOwner(ctx, tn, entityID); err != nil {
		return core.Dispute{}, err
	}
	now := s.now()
	p := core.PrincipalFrom(ctx)
	d := core.Dispute{ID: core.NewID(), EntityID: entityID, TN: tn, Kind: in.Kind, Status: core.DisputeOpen,
		Title: in.Title, Description: in.Description, OpenedBy: p.ID, CreatedAt: now, UpdatedAt: now}
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO disputes (`+cols+`) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, '', '', ?, ?)`,
			d.ID, d.EntityID, d.TN, d.Kind, string(d.Status), d.Title, d.Description, d.OpenedBy,
			platform.TS(now), platform.TS(now)); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "dispute.create", "dispute", d.ID, map[string]any{"tn": d.TN, "kind": d.Kind, "entity_id": entityID})
	})
	if err != nil {
		return core.Dispute{}, err
	}
	s.notify(ctx, core.EventDisputeCreated, d, nil)
	return d, nil
}

func (s *Service) checkOwner(ctx context.Context, tn, entityID string) error {
	notOwned := core.Errorf(core.ErrForbidden, "bu numara kuruluşunuza kayıtlı değil")
	if s.dir == nil {
		return notOwned
	}
	_, ent, err := s.dir.NumberOwner(ctx, tn)
	if errors.Is(err, core.ErrNotFound) {
		return notOwned
	}
	if err != nil {
		return err
	}
	if ent.ID != entityID {
		return notOwned
	}
	return nil
}

// AddComment adds a comment. Enterprise callers (internal=false enforced by
// the handler) cannot comment on closed disputes.
func (s *Service) AddComment(ctx context.Context, d core.Dispute, body string, internal bool) (core.DisputeComment, error) {
	body = strings.TrimSpace(body)
	if body == "" || utf8.RuneCountInString(body) > 5000 {
		return core.DisputeComment{}, core.Invalid("body", "yorum 1-5000 karakter olmalı")
	}
	p := core.PrincipalFrom(ctx)
	role := p.Role
	if role == "" {
		role = core.Role(p.Kind)
	}
	now := s.now()
	c := core.DisputeComment{ID: core.NewID(), DisputeID: d.ID, AuthorID: p.ID, AuthorRole: role, Body: body,
		Internal: internal, CreatedAt: now}
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO dispute_comments (id, dispute_id, author_id, author_role, body, internal, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`, c.ID, c.DisputeID, c.AuthorID, string(c.AuthorRole), c.Body,
			platform.Bool(internal), platform.TS(now)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE disputes SET updated_at = ? WHERE id = ?`, platform.TS(now), d.ID); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "dispute.comment", "dispute", d.ID, map[string]any{"comment_id": c.ID, "internal": internal})
	})
	if err != nil {
		return core.DisputeComment{}, err
	}
	d.UpdatedAt = now
	if !internal { // internal notes never leave the operator
		s.notify(ctx, core.EventDisputeUpdated, d, map[string]any{"comment": c})
	}
	return c, nil
}

// StatusChange is the admin input of SetStatus.
type StatusChange struct {
	Status     core.DisputeStatus
	Resolution string
	ClearLabel bool
}

// SetStatus moves a dispute through the state machine. Illegal transitions
// (including anything out of resolved/rejected) return ErrState (409).
// ClearLabel is only valid when resolving a "label" dispute; it sets a
// "clean" reputation override for 30 days before the dispute is updated.
func (s *Service) SetStatus(ctx context.Context, id string, in StatusChange) (core.Dispute, error) {
	v := &core.ValidationError{}
	if in.Status != core.DisputeInReview && !terminal(in.Status) {
		v.Add("status", "durum in_review, resolved veya rejected olmalı")
	}
	in.Resolution = strings.TrimSpace(in.Resolution)
	if utf8.RuneCountInString(in.Resolution) > 2000 {
		v.Add("resolution", "çözüm notu en fazla 2000 karakter olabilir")
	}
	if err := v.Err(); err != nil {
		return core.Dispute{}, err
	}
	d, err := s.get(ctx, s.db, id)
	if err != nil {
		return d, err
	}
	if !CanTransition(d.Status, in.Status) {
		return core.Dispute{}, core.Errorf(core.ErrState, "itiraz durumu %s → %s geçişine izin verilmiyor", d.Status, in.Status)
	}
	p := core.PrincipalFrom(ctx)
	now := s.now()
	if in.ClearLabel {
		if in.Status != core.DisputeResolved || d.Kind != "label" {
			return core.Dispute{}, core.Invalid("clear_label", "etiket temizleme yalnızca çözülen etiket itirazlarında kullanılabilir")
		}
		if s.rep == nil {
			return core.Dispute{}, core.Errorf(core.ErrState, "itibar servisi kullanılamıyor")
		}
		reason := in.Resolution
		if reason == "" {
			reason = "itiraz " + d.ID + " çözüldü"
		}
		// Applied before the status update (and outside our transaction) so a
		// failure leaves the dispute open for a retry.
		if err := s.rep.SetOverride(ctx, d.TN, core.LabelClean, reason, p.ID, now.Add(ClearLabelFor)); err != nil {
			return core.Dispute{}, err
		}
	}
	from := d.Status
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		cur, err := s.get(ctx, tx, id)
		if err != nil {
			return err
		}
		if cur.Status != from { // concurrent change
			return core.Errorf(core.ErrState, "itiraz durumu değişti")
		}
		d.Status, d.UpdatedAt = in.Status, now
		if in.Resolution != "" {
			d.Resolution = in.Resolution
		}
		if terminal(in.Status) {
			d.ResolvedBy, d.ResolvedAt = p.ID, &now
		}
		if _, err := tx.ExecContext(ctx, `UPDATE disputes SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
			string(d.Status), d.Resolution, d.ResolvedBy, platform.TSPtr(d.ResolvedAt), platform.TS(now), id); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "dispute.status", "dispute", id, map[string]any{
			"from": from, "to": in.Status, "resolution": d.Resolution, "clear_label": in.ClearLabel})
	})
	if err != nil {
		return core.Dispute{}, err
	}
	s.notify(ctx, core.EventDisputeUpdated, d, map[string]any{"from_status": from, "label_cleared": in.ClearLabel})
	return d, nil
}
