package registry

import (
	"context"
	"database/sql"
	"errors"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type scanner interface{ Scan(dest ...any) error }

// ---------------------------------------------------------------- entities

const entityCols = `id, legal_name, trade_name, country, vkn, mersis, sector, website, city,
	contact_name, contact_email, contact_phone, iys_registered, status, risk_tier, reject_reason,
	submitted_at, vetted_at, vetted_by, created_at, updated_at`

func scanEntity(sc scanner) (core.Entity, error) {
	var e core.Entity
	var iys int
	var submitted, vetted, created, updated string
	err := sc.Scan(&e.ID, &e.LegalName, &e.TradeName, &e.Country, &e.VKN, &e.MERSIS, &e.Sector, &e.Website,
		&e.City, &e.ContactName, &e.ContactEmail, &e.ContactPhone, &iys, &e.Status, &e.RiskTier, &e.RejectReason,
		&submitted, &vetted, &e.VettedBy, &created, &updated)
	if err != nil {
		return e, err
	}
	e.IYSRegistered = iys != 0
	e.SubmittedAt = platform.ParseTSPtr(submitted)
	e.VettedAt = platform.ParseTSPtr(vetted)
	e.CreatedAt = platform.ParseTS(created)
	e.UpdatedAt = platform.ParseTS(updated)
	return e, nil
}

func getEntity(ctx context.Context, q platform.Querier, id string) (core.Entity, error) {
	e, err := scanEntity(q.QueryRowContext(ctx, `SELECT `+entityCols+` FROM entities WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return e, core.Errorf(core.ErrNotFound, "kuruluş bulunamadı")
	}
	return e, err
}

func insertEntity(ctx context.Context, q platform.Querier, e core.Entity) error {
	_, err := q.ExecContext(ctx, `INSERT INTO entities (`+entityCols+`)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.LegalName, e.TradeName, e.Country, e.VKN, e.MERSIS, e.Sector, e.Website, e.City,
		e.ContactName, e.ContactEmail, e.ContactPhone, platform.Bool(e.IYSRegistered), string(e.Status), e.RiskTier,
		e.RejectReason, platform.TSPtr(e.SubmittedAt), platform.TSPtr(e.VettedAt), e.VettedBy,
		platform.TS(e.CreatedAt), platform.TS(e.UpdatedAt))
	if platform.IsUniqueViolation(err) {
		return errDuplicateVKN
	}
	return err
}

func updateEntityRow(ctx context.Context, q platform.Querier, e core.Entity) error {
	_, err := q.ExecContext(ctx, `UPDATE entities SET legal_name = ?, trade_name = ?, country = ?, vkn = ?, mersis = ?,
		sector = ?, website = ?, city = ?, contact_name = ?, contact_email = ?, contact_phone = ?, iys_registered = ?,
		status = ?, risk_tier = ?, reject_reason = ?, submitted_at = ?, vetted_at = ?, vetted_by = ?, updated_at = ?
		WHERE id = ?`,
		e.LegalName, e.TradeName, e.Country, e.VKN, e.MERSIS, e.Sector, e.Website, e.City, e.ContactName,
		e.ContactEmail, e.ContactPhone, platform.Bool(e.IYSRegistered), string(e.Status), e.RiskTier, e.RejectReason,
		platform.TSPtr(e.SubmittedAt), platform.TSPtr(e.VettedAt), e.VettedBy, platform.TS(e.UpdatedAt), e.ID)
	if platform.IsUniqueViolation(err) {
		return errDuplicateVKN
	}
	return err
}

var errDuplicateVKN = core.Errorf(core.ErrConflict, "bu vergi kimlik numarasıyla kayıtlı bir kuruluş zaten var")

// vknTaken reports whether another entity (other than exceptID) uses vkn.
func vknTaken(ctx context.Context, q platform.Querier, vkn, exceptID string) (bool, error) {
	var id string
	err := q.QueryRowContext(ctx, `SELECT id FROM entities WHERE vkn = ? AND id <> ?`, vkn, exceptID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func scanEntities(rows *sql.Rows, err error) ([]core.Entity, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Entity{}
	for rows.Next() {
		e, err := scanEntity(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- documents and decisions

const documentCols = `id, entity_id, kind, file_name, mime_type, sha256, size_bytes, uploaded_by, created_at`

func listDocuments(ctx context.Context, q platform.Querier, entityID string) ([]core.EntityDocument, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+documentCols+` FROM entity_documents WHERE entity_id = ? ORDER BY created_at, id`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.EntityDocument{}
	for rows.Next() {
		var d core.EntityDocument
		var created string
		if err := rows.Scan(&d.ID, &d.EntityID, &d.Kind, &d.FileName, &d.MimeType, &d.SHA256, &d.SizeBytes, &d.UploadedBy, &created); err != nil {
			return nil, err
		}
		d.CreatedAt = platform.ParseTS(created)
		out = append(out, d)
	}
	return out, rows.Err()
}

func insertDocument(ctx context.Context, q platform.Querier, d core.EntityDocument) error {
	_, err := q.ExecContext(ctx, `INSERT INTO entity_documents (`+documentCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.EntityID, string(d.Kind), d.FileName, d.MimeType, d.SHA256, d.SizeBytes, d.UploadedBy, platform.TS(d.CreatedAt))
	return err
}

func listDecisions(ctx context.Context, q platform.Querier, entityID string) ([]core.VettingDecision, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, entity_id, from_status, to_status, reviewer_id, note, created_at
		FROM vetting_decisions WHERE entity_id = ? ORDER BY created_at, id`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.VettingDecision{}
	for rows.Next() {
		var d core.VettingDecision
		var created string
		if err := rows.Scan(&d.ID, &d.EntityID, &d.FromStatus, &d.ToStatus, &d.ReviewerID, &d.Note, &created); err != nil {
			return nil, err
		}
		d.CreatedAt = platform.ParseTS(created)
		out = append(out, d)
	}
	return out, rows.Err()
}

func insertDecision(ctx context.Context, q platform.Querier, d core.VettingDecision) error {
	_, err := q.ExecContext(ctx, `INSERT INTO vetting_decisions (id, entity_id, from_status, to_status, reviewer_id, note, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		d.ID, d.EntityID, string(d.FromStatus), string(d.ToStatus), d.ReviewerID, d.Note, platform.TS(d.CreatedAt))
	return err
}

// ---------------------------------------------------------------- numbers

const numberCols = `id, entity_id, range_start, range_end, tn_count, kind, use_case, call_reason, branding_id,
	status, carrier_confirmed, suspend_reason, activated_at, created_at, updated_at`

func scanNumber(sc scanner) (core.Number, error) {
	var n core.Number
	var cc int
	var activated, created, updated string
	err := sc.Scan(&n.ID, &n.EntityID, &n.RangeStart, &n.RangeEnd, &n.Count, &n.Kind, &n.UseCase, &n.CallReason,
		&n.BrandingID, &n.Status, &cc, &n.SuspendReason, &activated, &created, &updated)
	if err != nil {
		return n, err
	}
	n.CarrierConfirmed = cc != 0
	n.ActivatedAt = platform.ParseTSPtr(activated)
	n.CreatedAt = platform.ParseTS(created)
	n.UpdatedAt = platform.ParseTS(updated)
	return n, nil
}

func scanNumbers(rows *sql.Rows, err error) ([]core.Number, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Number{}
	for rows.Next() {
		n, err := scanNumber(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func getNumber(ctx context.Context, q platform.Querier, id string) (core.Number, error) {
	n, err := scanNumber(q.QueryRowContext(ctx, `SELECT `+numberCols+` FROM numbers WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return n, core.Errorf(core.ErrNotFound, "numara bulunamadı")
	}
	return n, err
}

func insertNumber(ctx context.Context, q platform.Querier, n core.Number) error {
	_, err := q.ExecContext(ctx, `INSERT INTO numbers (id, entity_id, range_start, range_end, tn_len, tn_count, kind, use_case,
		call_reason, branding_id, status, carrier_confirmed, suspend_reason, activated_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		n.ID, n.EntityID, n.RangeStart, n.RangeEnd, len(n.RangeStart), n.Count, string(n.Kind), string(n.UseCase),
		n.CallReason, n.BrandingID, string(n.Status), platform.Bool(n.CarrierConfirmed), n.SuspendReason,
		platform.TSPtr(n.ActivatedAt), platform.TS(n.CreatedAt), platform.TS(n.UpdatedAt))
	return err
}

func updateNumberRow(ctx context.Context, q platform.Querier, n core.Number) error {
	_, err := q.ExecContext(ctx, `UPDATE numbers SET use_case = ?, call_reason = ?, branding_id = ?, status = ?,
		carrier_confirmed = ?, suspend_reason = ?, activated_at = ?, updated_at = ? WHERE id = ?`,
		string(n.UseCase), n.CallReason, n.BrandingID, string(n.Status), platform.Bool(n.CarrierConfirmed),
		n.SuspendReason, platform.TSPtr(n.ActivatedAt), platform.TS(n.UpdatedAt), n.ID)
	return err
}

// nearestNumber returns the non-released number of the same length with the
// greatest range_start <= key. Because non-released numbers never overlap,
// that row is the only one that can contain key (one index seek on
// numbers_lookup instead of a scan, also for misses).
func nearestNumber(ctx context.Context, q platform.Querier, key string) (core.Number, bool, error) {
	n, err := scanNumber(q.QueryRowContext(ctx, `SELECT `+numberCols+` FROM numbers
		WHERE tn_len = ? AND range_start <= ? AND status <> ? ORDER BY range_start DESC LIMIT 1`,
		len(key), key, string(core.NumberReleased)))
	if errors.Is(err, sql.ErrNoRows) {
		return n, false, nil
	}
	if err != nil {
		return n, false, err
	}
	return n, true, nil
}

// findNumber returns the non-released number or range containing tn.
func findNumber(ctx context.Context, q platform.Querier, tn string) (core.Number, bool, error) {
	n, ok, err := nearestNumber(ctx, q, tn)
	if err != nil || !ok || !n.Contains(tn) {
		return core.Number{}, false, err
	}
	return n, true, nil
}

// overlapping returns a non-released number overlapping [start, end] (same length), if any.
func overlapping(ctx context.Context, q platform.Querier, start, end string) (core.Number, bool, error) {
	n, ok, err := nearestNumber(ctx, q, end)
	if err != nil || !ok || n.RangeEnd < start {
		return core.Number{}, false, err
	}
	return n, true, nil
}

// ---------------------------------------------------------------- branding

const brandingCols = `id, entity_id, display_name, logo_url, call_reason, is_default, status, review_note,
	reviewed_by, reviewed_at, created_at, updated_at`

func scanBranding(sc scanner) (core.Branding, error) {
	var b core.Branding
	var def int
	var reviewed, created, updated string
	err := sc.Scan(&b.ID, &b.EntityID, &b.DisplayName, &b.LogoURL, &b.CallReason, &def, &b.Status, &b.ReviewNote,
		&b.ReviewedBy, &reviewed, &created, &updated)
	if err != nil {
		return b, err
	}
	b.IsDefault = def != 0
	b.ReviewedAt = platform.ParseTSPtr(reviewed)
	b.CreatedAt = platform.ParseTS(created)
	b.UpdatedAt = platform.ParseTS(updated)
	return b, nil
}

func scanBrandings(rows *sql.Rows, err error) ([]core.Branding, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Branding{}
	for rows.Next() {
		b, err := scanBranding(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func getBranding(ctx context.Context, q platform.Querier, id string) (core.Branding, error) {
	b, err := scanBranding(q.QueryRowContext(ctx, `SELECT `+brandingCols+` FROM branding WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return b, core.Errorf(core.ErrNotFound, "marka kaydı bulunamadı")
	}
	return b, err
}

func insertBranding(ctx context.Context, q platform.Querier, b core.Branding) error {
	_, err := q.ExecContext(ctx, `INSERT INTO branding (`+brandingCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		b.ID, b.EntityID, b.DisplayName, b.LogoURL, b.CallReason, platform.Bool(b.IsDefault), string(b.Status),
		b.ReviewNote, b.ReviewedBy, platform.TSPtr(b.ReviewedAt), platform.TS(b.CreatedAt), platform.TS(b.UpdatedAt))
	return err
}

func updateBrandingRow(ctx context.Context, q platform.Querier, b core.Branding) error {
	_, err := q.ExecContext(ctx, `UPDATE branding SET display_name = ?, logo_url = ?, call_reason = ?, is_default = ?,
		status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
		b.DisplayName, b.LogoURL, b.CallReason, platform.Bool(b.IsDefault), string(b.Status), b.ReviewNote,
		b.ReviewedBy, platform.TSPtr(b.ReviewedAt), platform.TS(b.UpdatedAt), b.ID)
	return err
}

// approvedBranding resolves the approved branding of a number: its own
// override when approved, else the entity's approved default (most recently
// reviewed first).
func approvedBranding(ctx context.Context, q platform.Querier, n core.Number) (core.Branding, bool, error) {
	if n.BrandingID != "" {
		b, err := scanBranding(q.QueryRowContext(ctx, `SELECT `+brandingCols+` FROM branding
			WHERE id = ? AND entity_id = ? AND status = ?`, n.BrandingID, n.EntityID, string(core.BrandingApproved)))
		if err == nil {
			return b, true, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return b, false, err
		}
	}
	b, err := scanBranding(q.QueryRowContext(ctx, `SELECT `+brandingCols+` FROM branding
		WHERE entity_id = ? AND is_default = 1 AND status = ? ORDER BY reviewed_at DESC, updated_at DESC LIMIT 1`,
		n.EntityID, string(core.BrandingApproved)))
	if errors.Is(err, sql.ErrNoRows) {
		return core.Branding{}, false, nil
	}
	if err != nil {
		return core.Branding{}, false, err
	}
	return b, true, nil
}

// countByStatus returns {status: n} for a table with a status column.
// table is always a package constant, never user input.
func countByStatus(ctx context.Context, q platform.Querier, table string, statuses ...string) (map[string]int64, error) {
	out := make(map[string]int64, len(statuses))
	for _, st := range statuses {
		out[st] = 0
	}
	rows, err := q.QueryContext(ctx, `SELECT status, COUNT(*) FROM `+table+` GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var st string
		var n int64
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		out[st] = n
	}
	return out, rows.Err()
}
