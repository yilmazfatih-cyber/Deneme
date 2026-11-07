package registry

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// EntityInput is the KYC body of signup, admin create and enterprise update.
type EntityInput struct {
	LegalName     string `json:"legal_name"`
	TradeName     string `json:"trade_name"`
	VKN           string `json:"vkn"`
	MERSIS        string `json:"mersis"`
	Sector        string `json:"sector"`
	Website       string `json:"website"`
	City          string `json:"city"`
	ContactName   string `json:"contact_name"`
	ContactEmail  string `json:"contact_email"`
	ContactPhone  string `json:"contact_phone"`
	IYSRegistered bool   `json:"iys_registered"`
}

// SignupInput is the public signup body.
type SignupInput struct {
	EntityInput
	Password string `json:"password"`
}

// SignupResult is the signup response.
type SignupResult struct {
	Entity core.Entity `json:"entity"`
	User   core.User   `json:"user"`
}

// DecisionInput is an operator vetting decision.
type DecisionInput struct {
	ToStatus core.EntityStatus `json:"to_status"`
	Note     string            `json:"note"`
	RiskTier string            `json:"risk_tier,omitempty"`
}

// DocumentInput is KYC document metadata.
type DocumentInput struct {
	Kind      core.DocumentKind `json:"kind"`
	FileName  string            `json:"file_name"`
	MimeType  string            `json:"mime_type"`
	SHA256    string            `json:"sha256"`
	SizeBytes int64             `json:"size_bytes"`
}

// EntityDetail is the admin view of one entity.
type EntityDetail struct {
	Entity    core.Entity            `json:"entity"`
	Documents []core.EntityDocument  `json:"documents"`
	Decisions []core.VettingDecision `json:"decisions"`
	Numbers   []core.Number          `json:"numbers"`
	Branding  []core.Branding        `json:"branding"`
}

// legalTransitions is the vetting state machine (contract §4, decision route).
var legalTransitions = map[core.EntityStatus][]core.EntityStatus{
	core.EntityPending:   {core.EntityInReview},
	core.EntityInReview:  {core.EntityVerified, core.EntityRejected},
	core.EntityVerified:  {core.EntitySuspended},
	core.EntitySuspended: {core.EntityVerified},
	core.EntityRejected:  {core.EntityInReview},
}

// CanTransition reports whether the vetting workflow allows from → to.
func CanTransition(from, to core.EntityStatus) bool {
	for _, t := range legalTransitions[from] {
		if t == to {
			return true
		}
	}
	return false
}

var statusTR = map[core.EntityStatus]string{
	core.EntityPending:   "başvuru bekliyor",
	core.EntityInReview:  "incelemede",
	core.EntityVerified:  "doğrulandı",
	core.EntityRejected:  "reddedildi",
	core.EntitySuspended: "askıya alındı",
}

func validEntityStatus(s core.EntityStatus) bool { _, ok := statusTR[s]; return ok }

// suspendedByEntity marks numbers suspended because their entity was suspended,
// so they can be reactivated automatically when the entity is reinstated.
const suspendedByEntity = "Kuruluş askıya alındı"

const maxNoteRunes = 1000

// ---------------------------------------------------------------- validation

var (
	spaceRE   = regexp.MustCompile(`[\s.\-]`)
	sha256RE  = regexp.MustCompile(`^[0-9a-f]{64}$`)
	riskTiers = map[string]bool{"low": true, "medium": true, "high": true}
)

func cleanText(s string) string { return strings.Join(strings.Fields(s), " ") }

func hasControl(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

func requireText(v *core.ValidationError, field, val, label string, max int) {
	switch {
	case val == "":
		v.Add(field, label+" zorunludur")
	case utf8.RuneCountInString(val) > max:
		v.Add(field, fmt.Sprintf("%s en fazla %d karakter olabilir", label, max))
	case hasControl(val):
		v.Add(field, label+" geçersiz karakter içeriyor")
	}
}

// normalizeWebsite accepts "firma.com.tr" and returns "https://firma.com.tr".
func normalizeWebsite(s string) (string, bool) {
	if s == "" {
		return "", true
	}
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || !strings.Contains(u.Hostname(), ".") || len(s) > 255 {
		return "", false
	}
	return s, true
}

// normalize trims and canonicalizes the input in place and validates it.
func (in *EntityInput) normalize() error {
	v := &core.ValidationError{}
	in.LegalName = cleanText(in.LegalName)
	in.TradeName = cleanText(in.TradeName)
	in.Sector = cleanText(in.Sector)
	in.City = cleanText(in.City)
	in.ContactName = cleanText(in.ContactName)
	in.VKN = spaceRE.ReplaceAllString(in.VKN, "")
	in.MERSIS = spaceRE.ReplaceAllString(in.MERSIS, "")
	in.ContactEmail = strings.ToLower(strings.TrimSpace(in.ContactEmail))
	in.Website = strings.TrimSpace(in.Website)

	requireText(v, "legal_name", in.LegalName, "Ticari unvan", 200)
	requireText(v, "trade_name", in.TradeName, "Marka adı", 100)
	switch {
	case in.VKN == "":
		v.Add("vkn", "Vergi kimlik numarası zorunludur")
	case len(in.VKN) != 10 || strings.Trim(in.VKN, "0123456789") != "":
		v.Add("vkn", "Vergi kimlik numarası 10 haneden oluşmalıdır")
	case !core.ValidVKN(in.VKN):
		v.Add("vkn", "Vergi kimlik numarası doğrulanamadı; kontrol hanesi hatalı")
	}
	if in.MERSIS != "" && !core.ValidMERSIS(in.MERSIS) {
		v.Add("mersis", "MERSİS numarası 0 ile başlayan 16 haneden oluşmalıdır")
	}
	requireText(v, "sector", in.Sector, "Sektör", 100)
	if w, ok := normalizeWebsite(in.Website); ok {
		in.Website = w
	} else {
		v.Add("website", "Web sitesi geçerli bir adres olmalıdır (ör. https://firma.com.tr)")
	}
	requireText(v, "city", in.City, "Şehir", 60)
	requireText(v, "contact_name", in.ContactName, "Yetkili adı", 100)
	if in.ContactEmail == "" {
		v.Add("contact_email", "Yetkili e-posta adresi zorunludur")
	} else if a, err := mail.ParseAddress(in.ContactEmail); err != nil || a.Address != in.ContactEmail || len(in.ContactEmail) > 254 {
		v.Add("contact_email", "Geçerli bir e-posta adresi girin")
	}
	if strings.TrimSpace(in.ContactPhone) == "" {
		v.Add("contact_phone", "Yetkili telefon numarası zorunludur")
	} else if tn, err := core.NormalizeTN(in.ContactPhone); err != nil {
		v.Add("contact_phone", "Telefon numarası tanınmadı; ör. 0532 123 45 67")
	} else {
		in.ContactPhone = tn
	}
	return v.Err()
}

func (in DecisionInput) validate() error {
	v := &core.ValidationError{}
	switch in.ToStatus {
	case core.EntityInReview, core.EntityVerified, core.EntityRejected, core.EntitySuspended:
	default:
		v.Add("to_status", "Hedef durum in_review, verified, rejected veya suspended olmalıdır")
	}
	note := strings.TrimSpace(in.Note)
	if (in.ToStatus == core.EntityRejected || in.ToStatus == core.EntitySuspended) && note == "" {
		v.Add("note", "Ret ve askıya alma kararlarında gerekçe zorunludur")
	}
	if utf8.RuneCountInString(note) > maxNoteRunes {
		v.Add("note", fmt.Sprintf("Not en fazla %d karakter olabilir", maxNoteRunes))
	}
	if in.RiskTier != "" && !riskTiers[in.RiskTier] {
		v.Add("risk_tier", "Risk seviyesi low, medium veya high olmalıdır")
	}
	return v.Err()
}

var allowedMime = map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true}

const maxDocumentBytes = 20 << 20

func (in *DocumentInput) normalize() error {
	v := &core.ValidationError{}
	in.FileName = strings.TrimSpace(in.FileName)
	in.MimeType = strings.ToLower(strings.TrimSpace(in.MimeType))
	in.SHA256 = strings.ToLower(strings.TrimSpace(in.SHA256))
	switch in.Kind {
	case core.DocTaxCertificate, core.DocTradeRegistry, core.DocSignatureCircular,
		core.DocAuthorizationLetter, core.DocNumberAllocation, core.DocOther:
	default:
		v.Add("kind", "Belge türü geçersiz")
	}
	if in.FileName == "" {
		v.Add("file_name", "Dosya adı zorunludur")
	} else if utf8.RuneCountInString(in.FileName) > 255 || hasControl(in.FileName) || strings.ContainsAny(in.FileName, `/\`) {
		v.Add("file_name", "Dosya adı geçersiz")
	}
	if !allowedMime[in.MimeType] {
		v.Add("mime_type", "Yalnızca PDF, JPEG veya PNG belgeler kabul edilir")
	}
	if !sha256RE.MatchString(in.SHA256) {
		v.Add("sha256", "SHA-256 özeti 64 karakterlik onaltılık metin olmalıdır")
	}
	if in.SizeBytes <= 0 || in.SizeBytes > maxDocumentBytes {
		v.Add("size_bytes", "Dosya boyutu 1 bayt ile 20 MB arasında olmalıdır")
	}
	return v.Err()
}

// ---------------------------------------------------------------- operations

func (in EntityInput) apply(e *core.Entity) {
	e.LegalName, e.TradeName, e.VKN, e.MERSIS = in.LegalName, in.TradeName, in.VKN, in.MERSIS
	e.Sector, e.Website, e.City = in.Sector, in.Website, in.City
	e.ContactName, e.ContactEmail, e.ContactPhone = in.ContactName, in.ContactEmail, in.ContactPhone
	e.IYSRegistered = in.IYSRegistered
}

// CreateEntity registers a new entity in status pending (admin create and signup).
func (s *Service) CreateEntity(ctx context.Context, in EntityInput) (core.Entity, error) {
	return s.createEntity(ctx, in, "entity.create")
}

func (s *Service) createEntity(ctx context.Context, in EntityInput, action string) (core.Entity, error) {
	if err := in.normalize(); err != nil {
		return core.Entity{}, err
	}
	now := s.now()
	e := core.Entity{ID: core.NewID(), Country: "TR", Status: core.EntityPending, RiskTier: "medium",
		CreatedAt: now, UpdatedAt: now}
	in.apply(&e)
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		if taken, err := vknTaken(ctx, tx, e.VKN, ""); err != nil {
			return err
		} else if taken {
			return errDuplicateVKN
		}
		if err := insertEntity(ctx, tx, e); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, action, "entity", e.ID, map[string]any{"legal_name": e.LegalName, "vkn": e.VKN})
	})
	if err != nil {
		return core.Entity{}, err
	}
	return e, nil
}

// Signup creates a pending entity and its enterprise_owner user.
func (s *Service) Signup(ctx context.Context, in SignupInput) (SignupResult, error) {
	if s.accounts == nil {
		return SignupResult{}, errors.New("registry: signup unavailable, accounts service not configured")
	}
	verr := &core.ValidationError{}
	if err := in.EntityInput.normalize(); err != nil {
		var ve *core.ValidationError
		if !errors.As(err, &ve) {
			return SignupResult{}, err
		}
		verr.Fields = append(verr.Fields, ve.Fields...)
	}
	if utf8.RuneCountInString(in.Password) < 10 {
		verr.Add("password", "Parola en az 10 karakter olmalıdır")
	} else if len(in.Password) > 256 {
		verr.Add("password", "Parola en fazla 256 karakter olabilir")
	}
	if err := verr.Err(); err != nil {
		return SignupResult{}, err
	}
	e, err := s.createEntity(ctx, in.EntityInput, "entity.signup")
	if err != nil {
		return SignupResult{}, err
	}
	u, err := s.accounts.CreateUser(ctx, core.NewUser{Email: e.ContactEmail, Name: e.ContactName,
		Password: in.Password, Role: core.RoleEnterpriseOwner, EntityID: e.ID})
	if err != nil {
		// Compensate: the user could not be created (e.g. e-mail already registered),
		// so the entity must not linger without an owner.
		if derr := s.db.InTx(ctx, func(tx *platform.Tx) error {
			if _, err := tx.ExecContext(ctx, `DELETE FROM entities WHERE id = ?`, e.ID); err != nil {
				return err
			}
			return platform.Audit(ctx, tx, "entity.signup_rollback", "entity", e.ID, map[string]any{"reason": err.Error()})
		}); derr != nil {
			s.log.Error("registry: signup rollback failed", "entity_id", e.ID, "err", derr)
		}
		return SignupResult{}, err
	}
	return SignupResult{Entity: e, User: u}, nil
}

// GetEntity implements core.EntityDirectory.
func (s *Service) GetEntity(ctx context.Context, id string) (core.Entity, error) {
	return getEntity(ctx, s.db, id)
}

// UpdateEntity changes KYC fields; allowed only while pending or rejected.
func (s *Service) UpdateEntity(ctx context.Context, id string, in EntityInput) (core.Entity, error) {
	if err := in.normalize(); err != nil {
		return core.Entity{}, err
	}
	var out core.Entity
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		e, err := getEntity(ctx, tx, id)
		if err != nil {
			return err
		}
		if e.Status != core.EntityPending && e.Status != core.EntityRejected {
			return core.Errorf(core.ErrState, "kuruluş bilgileri yalnızca başvuru bekliyor veya reddedildi durumunda değiştirilebilir (şu an: %s)", statusTR[e.Status])
		}
		if taken, err := vknTaken(ctx, tx, in.VKN, e.ID); err != nil {
			return err
		} else if taken {
			return errDuplicateVKN
		}
		in.apply(&e)
		e.UpdatedAt = s.now()
		if err := updateEntityRow(ctx, tx, e); err != nil {
			return err
		}
		out = e
		return platform.Audit(ctx, tx, "entity.update", "entity", e.ID, in)
	})
	if err == nil {
		s.cache.invalidate()
	}
	return out, err
}

type numberChange struct {
	n    core.Number
	from core.NumberStatus
}

// Transition moves an entity through the vetting workflow. When onlyEntity is
// non-empty the entity must have that id (enterprise submit). Suspending an
// entity suspends its active numbers; reinstating it reactivates the numbers
// that were suspended because of the entity suspension.
func (s *Service) Transition(ctx context.Context, id string, in DecisionInput) (core.Entity, error) {
	if err := in.validate(); err != nil {
		return core.Entity{}, err
	}
	in.Note = strings.TrimSpace(in.Note)
	p := core.PrincipalFrom(ctx)
	var from core.EntityStatus
	var out core.Entity
	var changed []numberChange
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		e, err := getEntity(ctx, tx, id)
		if err != nil {
			return err
		}
		from = e.Status
		if !CanTransition(from, in.ToStatus) {
			return core.Errorf(core.ErrState, "kuruluş durumu %q iken %q durumuna geçilemez", statusTR[from], statusTR[in.ToStatus])
		}
		now := s.now()
		e.Status, e.UpdatedAt = in.ToStatus, now
		if in.RiskTier != "" {
			e.RiskTier = in.RiskTier
		}
		switch in.ToStatus {
		case core.EntityInReview:
			e.SubmittedAt, e.RejectReason = &now, ""
		case core.EntityVerified:
			e.VettedAt, e.VettedBy, e.RejectReason = &now, p.ID, ""
		case core.EntityRejected:
			e.VettedAt, e.VettedBy, e.RejectReason = &now, p.ID, in.Note
		case core.EntitySuspended:
			e.RejectReason = in.Note
		}
		if err := updateEntityRow(ctx, tx, e); err != nil {
			return err
		}
		if err := insertDecision(ctx, tx, core.VettingDecision{ID: core.NewID(), EntityID: e.ID, FromStatus: from,
			ToStatus: in.ToStatus, ReviewerID: p.ID, Note: in.Note, CreatedAt: now}); err != nil {
			return err
		}
		if err := platform.Audit(ctx, tx, "entity.status", "entity", e.ID, map[string]any{
			"from": from, "to": in.ToStatus, "note": in.Note, "risk_tier": e.RiskTier}); err != nil {
			return err
		}
		switch {
		case in.ToStatus == core.EntitySuspended:
			changed, err = s.cascadeNumbers(ctx, tx, e.ID, core.NumberActive, core.NumberSuspended, "", now)
		case from == core.EntitySuspended && in.ToStatus == core.EntityVerified:
			changed, err = s.cascadeNumbers(ctx, tx, e.ID, core.NumberSuspended, core.NumberActive, suspendedByEntity, now)
		}
		out = e
		return err
	})
	if err != nil {
		return core.Entity{}, err
	}
	s.cache.invalidate()
	s.emit(ctx, core.EventEntityStatusChanged, out.ID, map[string]any{
		"entity_id": out.ID, "legal_name": out.LegalName, "from": from, "to": out.Status, "note": in.Note})
	for _, c := range changed {
		s.emitNumber(ctx, c.n, c.from, c.n.SuspendReason)
	}
	return out, nil
}

// cascadeNumbers moves the entity's numbers in status from to status to.
// When onlyReason is set, only numbers with that suspend reason are moved.
func (s *Service) cascadeNumbers(ctx context.Context, tx *platform.Tx, entityID string, from, to core.NumberStatus, onlyReason string, now time.Time) ([]numberChange, error) {
	q := `SELECT ` + numberCols + ` FROM numbers WHERE entity_id = ? AND status = ?`
	args := []any{entityID, string(from)}
	if onlyReason != "" {
		q += ` AND suspend_reason = ?`
		args = append(args, onlyReason)
	}
	nums, err := scanNumbers(tx.QueryContext(ctx, q, args...))
	if err != nil {
		return nil, err
	}
	out := make([]numberChange, 0, len(nums))
	for _, n := range nums {
		n.Status, n.UpdatedAt = to, now
		if to == core.NumberSuspended {
			n.SuspendReason = suspendedByEntity
		} else {
			n.SuspendReason = ""
			n.ActivatedAt = &now
		}
		if err := updateNumberRow(ctx, tx, n); err != nil {
			return nil, err
		}
		if err := platform.Audit(ctx, tx, "number.status", "number", n.ID, map[string]any{
			"from": from, "to": to, "reason": suspendedByEntity, "cascade": true}); err != nil {
			return nil, err
		}
		out = append(out, numberChange{n: n, from: from})
	}
	return out, nil
}

// Submit sends the entity to review (pending/rejected → in_review).
func (s *Service) Submit(ctx context.Context, entityID string) (core.Entity, error) {
	return s.Transition(ctx, entityID, DecisionInput{ToStatus: core.EntityInReview, Note: "Başvuru incelemeye gönderildi"})
}

// AddDocument stores KYC document metadata.
func (s *Service) AddDocument(ctx context.Context, entityID string, in DocumentInput) (core.EntityDocument, error) {
	if err := in.normalize(); err != nil {
		return core.EntityDocument{}, err
	}
	d := core.EntityDocument{ID: core.NewID(), EntityID: entityID, Kind: in.Kind, FileName: in.FileName,
		MimeType: in.MimeType, SHA256: in.SHA256, SizeBytes: in.SizeBytes,
		UploadedBy: core.PrincipalFrom(ctx).ID, CreatedAt: s.now()}
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := getEntity(ctx, tx, entityID); err != nil {
			return err
		}
		if err := insertDocument(ctx, tx, d); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "entity.document_add", "entity", entityID, map[string]any{
			"document_id": d.ID, "kind": d.Kind, "file_name": d.FileName, "sha256": d.SHA256})
	})
	if err != nil {
		return core.EntityDocument{}, err
	}
	return d, nil
}

// Documents lists an entity's KYC documents.
func (s *Service) Documents(ctx context.Context, entityID string) ([]core.EntityDocument, error) {
	return listDocuments(ctx, s.db, entityID)
}

// EntityFilter filters the admin entity list.
type EntityFilter struct {
	Status core.EntityStatus
	Query  string
	Limit  int
}

// ListEntities returns entities matching f (newest first) and the total match count.
func (s *Service) ListEntities(ctx context.Context, f EntityFilter) ([]core.Entity, int64, error) {
	where, args := ` WHERE 1 = 1`, []any{}
	if f.Status != "" {
		if !validEntityStatus(f.Status) {
			return nil, 0, core.Invalid("status", "Geçersiz kuruluş durumu")
		}
		where += ` AND status = ?`
		args = append(args, string(f.Status))
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		// Match the raw text and its lower-case form: SQLite's LOWER() folds ASCII only,
		// so "Ş"/"İ" must also match as typed.
		raw := "%" + escapeLike(q) + "%"
		low := "%" + escapeLike(strings.ToLower(q)) + "%"
		conds := []string{}
		for _, col := range []string{"legal_name", "trade_name", "vkn", "contact_email"} {
			conds = append(conds, col+` LIKE ? ESCAPE '\'`, `LOWER(`+col+`) LIKE ? ESCAPE '\'`)
			args = append(args, raw, low)
		}
		where += ` AND (` + strings.Join(conds, " OR ") + `)`
	}
	var total int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM entities`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	items, err := scanEntities(s.db.QueryContext(ctx, `SELECT `+entityCols+` FROM entities`+where+
		` ORDER BY created_at DESC, id LIMIT ?`, append(args, limit)...))
	return items, total, err
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// EntityDetail returns everything the operator needs to vet an entity.
func (s *Service) EntityDetail(ctx context.Context, id string) (EntityDetail, error) {
	var d EntityDetail
	var err error
	if d.Entity, err = getEntity(ctx, s.db, id); err != nil {
		return d, err
	}
	if d.Documents, err = listDocuments(ctx, s.db, id); err != nil {
		return d, err
	}
	if d.Decisions, err = listDecisions(ctx, s.db, id); err != nil {
		return d, err
	}
	if d.Numbers, err = s.numbersOf(ctx, id, true); err != nil {
		return d, err
	}
	d.Branding, err = s.brandingOf(ctx, id)
	return d, err
}
