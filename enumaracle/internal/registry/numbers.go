package registry

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// MaxRangeSize is the largest range one number registration may cover.
const MaxRangeSize = 10_000

// NumberInput registers a single number ({tn}) or a range ({range_start, range_end}).
type NumberInput struct {
	TN         string       `json:"tn,omitempty"`
	RangeStart string       `json:"range_start,omitempty"`
	RangeEnd   string       `json:"range_end,omitempty"`
	UseCase    core.UseCase `json:"use_case"`
	CallReason string       `json:"call_reason"`
	BrandingID string       `json:"branding_id,omitempty"`
}

// NumberUpdate changes the descriptive fields of a number.
type NumberUpdate struct {
	UseCase    core.UseCase `json:"use_case"`
	CallReason string       `json:"call_reason"`
	BrandingID string       `json:"branding_id,omitempty"`
}

// NumberStatusInput is an operator status change.
type NumberStatusInput struct {
	Status           core.NumberStatus `json:"status"`
	Reason           string            `json:"reason,omitempty"`
	CarrierConfirmed *bool             `json:"carrier_confirmed,omitempty"`
}

// NumberFilter filters the admin number list.
type NumberFilter struct {
	Status   core.NumberStatus
	EntityID string
	Limit    int
}

var useCases = map[core.UseCase]bool{
	core.UseCustomerService: true, core.UseAppointment: true, core.UseDelivery: true, core.UseCollections: true,
	core.UseMarketing: true, core.UseSurvey: true, core.UseOTPCallback: true, core.UseEmergency: true, core.UseOther: true,
}

var numberStatusTR = map[core.NumberStatus]string{
	core.NumberPending:   "doğrulama bekliyor",
	core.NumberActive:    "aktif",
	core.NumberSuspended: "askıda",
	core.NumberReleased:  "serbest bırakıldı",
}

func (u *NumberUpdate) normalize(v *core.ValidationError) {
	u.CallReason = cleanText(u.CallReason)
	u.BrandingID = strings.TrimSpace(u.BrandingID)
	if !useCases[u.UseCase] {
		v.Add("use_case", "Kullanım amacı geçersiz; ör. customer_service, delivery, appointment_reminder")
	}
	if utf8.RuneCountInString(u.CallReason) > 64 {
		v.Add("call_reason", "Arama nedeni en fazla 64 karakter olabilir")
	} else if hasControl(u.CallReason) {
		v.Add("call_reason", "Arama nedeni geçersiz karakter içeriyor")
	}
}

// ParseRange normalizes a single number or a range and returns start, end and count.
func ParseRange(tn, start, end string) (string, string, int64, error) {
	tn, start, end = strings.TrimSpace(tn), strings.TrimSpace(start), strings.TrimSpace(end)
	switch {
	case tn != "" && (start != "" || end != ""):
		return "", "", 0, core.Invalid("tn", "Tek numara (tn) ya da aralık (range_start, range_end) gönderin; ikisi birden olmaz")
	case tn != "":
		n, err := core.NormalizeTN(tn)
		if err != nil {
			return "", "", 0, err
		}
		return n, n, 1, nil
	case start == "" && end == "":
		return "", "", 0, core.Invalid("tn", "Numara zorunludur")
	case start == "" || end == "":
		return "", "", 0, core.Invalid("range_end", "Aralık için başlangıç ve bitiş numarası birlikte gönderilmelidir")
	}
	v := &core.ValidationError{}
	s, err := core.NormalizeTN(start)
	if err != nil {
		v.Add("range_start", "Aralık başlangıcı tanınmadı")
	}
	e, err := core.NormalizeTN(end)
	if err != nil {
		v.Add("range_end", "Aralık bitişi tanınmadı")
	}
	if err := v.Err(); err != nil {
		return "", "", 0, err
	}
	if len(s) != len(e) {
		return "", "", 0, core.Invalid("range_end", "Aralığın başlangıç ve bitiş numaraları aynı uzunlukta olmalıdır")
	}
	if core.KindOf(s) != core.KindOf(e) {
		return "", "", 0, core.Invalid("range_end", "Aralığın başlangıç ve bitişi aynı numara türünde olmalıdır")
	}
	a, _ := strconv.ParseUint(core.Digits(s), 10, 64)
	b, _ := strconv.ParseUint(core.Digits(e), 10, 64)
	if b < a {
		return "", "", 0, core.Invalid("range_end", "Aralık bitişi başlangıçtan küçük olamaz")
	}
	count := b - a + 1
	if count > MaxRangeSize {
		return "", "", 0, core.Invalid("range_end", fmt.Sprintf("Bir aralık en fazla %d numara içerebilir", MaxRangeSize))
	}
	return s, e, int64(count), nil
}

// checkBranding verifies that brandingID (if any) belongs to the entity.
func checkBranding(ctx context.Context, q platform.Querier, entityID, brandingID string) error {
	if brandingID == "" {
		return nil
	}
	b, err := getBranding(ctx, q, brandingID)
	if err != nil || b.EntityID != entityID {
		return core.Invalid("branding_id", "Seçilen marka kaydı bu kuruluşa ait değil")
	}
	return nil
}

// RegisterNumber registers a number or range for the entity in status pending_verification.
func (s *Service) RegisterNumber(ctx context.Context, entityID string, in NumberInput) (core.Number, error) {
	start, end, count, rerr := ParseRange(in.TN, in.RangeStart, in.RangeEnd)
	upd := NumberUpdate{UseCase: in.UseCase, CallReason: in.CallReason, BrandingID: in.BrandingID}
	v := &core.ValidationError{}
	if rerr != nil {
		if ve, ok := rerr.(*core.ValidationError); ok {
			v.Fields = append(v.Fields, ve.Fields...)
		} else {
			return core.Number{}, rerr
		}
	}
	upd.normalize(v)
	if err := v.Err(); err != nil {
		return core.Number{}, err
	}
	now := s.now()
	n := core.Number{ID: core.NewID(), EntityID: entityID, RangeStart: start, RangeEnd: end, Count: count,
		Kind: core.KindOf(start), UseCase: upd.UseCase, CallReason: upd.CallReason, BrandingID: upd.BrandingID,
		Status: core.NumberPending, CreatedAt: now, UpdatedAt: now}
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		if s.db.Driver == "postgres" {
			// Serialize registrations so two concurrent overlapping ranges cannot both pass the check.
			if _, err := tx.ExecContext(ctx, `LOCK TABLE numbers IN SHARE ROW EXCLUSIVE MODE`); err != nil {
				return err
			}
		}
		e, err := getEntity(ctx, tx, entityID)
		if err != nil {
			return err
		}
		if e.Status == core.EntitySuspended {
			return core.Errorf(core.ErrState, "askıya alınmış kuruluş yeni numara kaydedemez")
		}
		if err := checkBranding(ctx, tx, entityID, n.BrandingID); err != nil {
			return err
		}
		if other, ok, err := overlapping(ctx, tx, start, end); err != nil {
			return err
		} else if ok {
			if other.EntityID == entityID {
				return core.Errorf(core.ErrConflict, "bu numara veya aralık kuruluşunuzun mevcut kaydıyla çakışıyor (%s – %s)", other.RangeStart, other.RangeEnd)
			}
			return core.Errorf(core.ErrConflict, "bu numara veya aralık başka bir kuruluş adına kayıtlı")
		}
		if err := insertNumber(ctx, tx, n); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "number.create", "number", n.ID, map[string]any{
			"entity_id": entityID, "range_start": start, "range_end": end, "count": count, "use_case": n.UseCase})
	})
	if err != nil {
		return core.Number{}, err
	}
	s.cache.invalidate()
	return n, nil
}

// ownNumber loads a number and checks that it belongs to entityID (404 otherwise).
func ownNumber(ctx context.Context, q platform.Querier, entityID, id string) (core.Number, error) {
	n, err := getNumber(ctx, q, id)
	if err != nil {
		return n, err
	}
	if n.EntityID != entityID {
		return core.Number{}, core.Errorf(core.ErrNotFound, "numara bulunamadı")
	}
	return n, nil
}

// UpdateNumber changes use case, call reason and branding of an entity's number.
func (s *Service) UpdateNumber(ctx context.Context, entityID, id string, in NumberUpdate) (core.Number, error) {
	v := &core.ValidationError{}
	in.normalize(v)
	if err := v.Err(); err != nil {
		return core.Number{}, err
	}
	var out core.Number
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		n, err := ownNumber(ctx, tx, entityID, id)
		if err != nil {
			return err
		}
		if n.Status == core.NumberReleased {
			return core.Errorf(core.ErrState, "serbest bırakılmış numara güncellenemez")
		}
		if err := checkBranding(ctx, tx, entityID, in.BrandingID); err != nil {
			return err
		}
		n.UseCase, n.CallReason, n.BrandingID, n.UpdatedAt = in.UseCase, in.CallReason, in.BrandingID, s.now()
		if err := updateNumberRow(ctx, tx, n); err != nil {
			return err
		}
		out = n
		return platform.Audit(ctx, tx, "number.update", "number", n.ID, in)
	})
	if err == nil {
		s.cache.invalidate()
	}
	return out, err
}

// ReleaseNumber gives a number back (status released). Releasing twice is a no-op.
func (s *Service) ReleaseNumber(ctx context.Context, entityID, id string) error {
	var n core.Number
	var from core.NumberStatus
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		var err error
		if n, err = ownNumber(ctx, tx, entityID, id); err != nil {
			return err
		}
		from = n.Status
		if from == core.NumberReleased {
			return nil
		}
		n.Status, n.UpdatedAt = core.NumberReleased, s.now()
		if err := updateNumberRow(ctx, tx, n); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "number.release", "number", n.ID, map[string]any{"from": from})
	})
	if err != nil || from == core.NumberReleased {
		return err
	}
	s.cache.invalidate()
	s.emitNumber(ctx, n, from, "")
	return nil
}

// SetNumberStatus is the operator action activating or suspending a number.
func (s *Service) SetNumberStatus(ctx context.Context, id string, in NumberStatusInput) (core.Number, error) {
	if in.Status != core.NumberActive && in.Status != core.NumberSuspended {
		return core.Number{}, core.Invalid("status", "Durum active veya suspended olmalıdır")
	}
	in.Reason = cleanText(in.Reason)
	if utf8.RuneCountInString(in.Reason) > 200 {
		return core.Number{}, core.Invalid("reason", "Gerekçe en fazla 200 karakter olabilir")
	}
	var n core.Number
	var from core.NumberStatus
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		var err error
		if n, err = getNumber(ctx, tx, id); err != nil {
			return err
		}
		from = n.Status
		if from == core.NumberReleased {
			return core.Errorf(core.ErrState, "serbest bırakılmış numaranın durumu değiştirilemez")
		}
		now := s.now()
		if in.Status == core.NumberActive {
			e, err := getEntity(ctx, tx, n.EntityID)
			if err != nil {
				return err
			}
			if e.Status != core.EntityVerified {
				return core.Errorf(core.ErrState, "numara yalnızca doğrulanmış kuruluş için etkinleştirilebilir (kuruluş durumu: %s)", statusTR[e.Status])
			}
			if from != core.NumberActive {
				n.ActivatedAt = &now
			}
			n.SuspendReason = ""
		} else {
			n.SuspendReason = in.Reason
			if n.SuspendReason == "" {
				n.SuspendReason = "Operatör tarafından askıya alındı"
			}
		}
		n.Status, n.UpdatedAt = in.Status, now
		if in.CarrierConfirmed != nil {
			n.CarrierConfirmed = *in.CarrierConfirmed
		}
		if err := updateNumberRow(ctx, tx, n); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "number.status", "number", n.ID, map[string]any{
			"from": from, "to": n.Status, "reason": in.Reason, "carrier_confirmed": n.CarrierConfirmed})
	})
	if err != nil {
		return core.Number{}, err
	}
	s.cache.invalidate()
	if from != n.Status {
		s.emitNumber(ctx, n, from, n.SuspendReason)
	}
	return n, nil
}

func (s *Service) emitNumber(ctx context.Context, n core.Number, from core.NumberStatus, reason string) {
	s.emit(ctx, core.EventNumberStatusChanged, n.EntityID, map[string]any{
		"number_id": n.ID, "range_start": n.RangeStart, "range_end": n.RangeEnd, "count": n.Count,
		"from": from, "to": n.Status, "reason": reason, "carrier_confirmed": n.CarrierConfirmed})
}

func (s *Service) numbersOf(ctx context.Context, entityID string, includeReleased bool) ([]core.Number, error) {
	q := `SELECT ` + numberCols + ` FROM numbers WHERE entity_id = ?`
	args := []any{entityID}
	if !includeReleased {
		q += ` AND status <> ?`
		args = append(args, string(core.NumberReleased))
	}
	return scanNumbers(s.db.QueryContext(ctx, q+` ORDER BY range_start, id`, args...))
}

// EntityNumbers lists all of an entity's numbers, released ones included (enterprise view).
func (s *Service) EntityNumbers(ctx context.Context, entityID string) ([]core.Number, error) {
	return s.numbersOf(ctx, entityID, true)
}

// ListNumbers returns numbers matching f (newest first) and the total match count.
func (s *Service) ListNumbers(ctx context.Context, f NumberFilter) ([]core.Number, int64, error) {
	where, args := ` WHERE 1 = 1`, []any{}
	if f.Status != "" {
		if _, ok := numberStatusTR[f.Status]; !ok {
			return nil, 0, core.Invalid("status", "Geçersiz numara durumu")
		}
		where += ` AND status = ?`
		args = append(args, string(f.Status))
	}
	if f.EntityID != "" {
		where += ` AND entity_id = ?`
		args = append(args, f.EntityID)
	}
	var total int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM numbers`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 100
	}
	items, err := scanNumbers(s.db.QueryContext(ctx, `SELECT `+numberCols+` FROM numbers`+where+
		` ORDER BY created_at DESC, id LIMIT ?`, append(args, limit)...))
	return items, total, err
}

// NumberOwner implements core.EntityDirectory.
func (s *Service) NumberOwner(ctx context.Context, tn string) (core.Number, core.Entity, error) {
	norm, err := core.NormalizeTN(tn)
	if err != nil {
		return core.Number{}, core.Entity{}, err
	}
	n, ok, err := findNumber(ctx, s.db, norm)
	if err != nil {
		return core.Number{}, core.Entity{}, err
	}
	if !ok {
		return core.Number{}, core.Entity{}, core.Errorf(core.ErrNotFound, "numara kayıtlı değil")
	}
	e, err := getEntity(ctx, s.db, n.EntityID)
	return n, e, err
}

// NumbersOf implements core.EntityDirectory (non-released numbers only).
func (s *Service) NumbersOf(ctx context.Context, entityID string) ([]core.Number, error) {
	return s.numbersOf(ctx, entityID, false)
}
