// Package core is the shared contract of Enumaracle: domain types, enums,
// sentinel errors and the interfaces through which feature packages talk to
// each other. It performs no I/O and imports no other internal package.
package core

import "time"

// ContractVersion is bumped whenever a type or interface in this package changes.
const ContractVersion = "1.0.0"

// ---------------------------------------------------------------- STIR/SHAKEN

type Attest string

const (
	AttestA Attest = "A"
	AttestB Attest = "B"
	AttestC Attest = "C"
)

type Verstat string

const (
	VerstatPassed Verstat = "TN-Validation-Passed"
	VerstatFailed Verstat = "TN-Validation-Failed"
	VerstatNone   Verstat = "No-TN-Validation"
)

// ---------------------------------------------------------------- identity

type EntityStatus string

const (
	EntityPending   EntityStatus = "pending"
	EntityInReview  EntityStatus = "in_review"
	EntityVerified  EntityStatus = "verified"
	EntityRejected  EntityStatus = "rejected"
	EntitySuspended EntityStatus = "suspended"
)

// Entity is a business that originates calls and is vetted (KYC) by the operator.
type Entity struct {
	ID            string       `json:"id"`
	LegalName     string       `json:"legal_name"`
	TradeName     string       `json:"trade_name"`
	Country       string       `json:"country"` // ISO 3166-1 alpha-2
	VKN           string       `json:"vkn"`     // TR tax number, 10 digits, checksum
	MERSIS        string       `json:"mersis"`  // TR MERSİS number, 16 digits
	Sector        string       `json:"sector"`
	Website       string       `json:"website"`
	City          string       `json:"city"`
	ContactName   string       `json:"contact_name"`
	ContactEmail  string       `json:"contact_email"`
	ContactPhone  string       `json:"contact_phone"`
	IYSRegistered bool         `json:"iys_registered"` // declared İYS (6563) registration
	Status        EntityStatus `json:"status"`
	RiskTier      string       `json:"risk_tier"` // low|medium|high
	RejectReason  string       `json:"reject_reason,omitempty"`
	SubmittedAt   *time.Time   `json:"submitted_at,omitempty"`
	VettedAt      *time.Time   `json:"vetted_at,omitempty"`
	VettedBy      string       `json:"vetted_by,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

type DocumentKind string

const (
	DocTaxCertificate      DocumentKind = "tax_certificate"
	DocTradeRegistry       DocumentKind = "trade_registry"
	DocSignatureCircular   DocumentKind = "signature_circular"
	DocAuthorizationLetter DocumentKind = "authorization_letter"
	DocNumberAllocation    DocumentKind = "number_allocation"
	DocOther               DocumentKind = "other"
)

// EntityDocument is metadata of a KYC document; file storage is out of scope for v1.
type EntityDocument struct {
	ID         string       `json:"id"`
	EntityID   string       `json:"entity_id"`
	Kind       DocumentKind `json:"kind"`
	FileName   string       `json:"file_name"`
	MimeType   string       `json:"mime_type"`
	SHA256     string       `json:"sha256"`
	SizeBytes  int64        `json:"size_bytes"`
	UploadedBy string       `json:"uploaded_by"`
	CreatedAt  time.Time    `json:"created_at"`
}

type VettingDecision struct {
	ID         string       `json:"id"`
	EntityID   string       `json:"entity_id"`
	FromStatus EntityStatus `json:"from_status"`
	ToStatus   EntityStatus `json:"to_status"`
	ReviewerID string       `json:"reviewer_id"`
	Note       string       `json:"note"`
	CreatedAt  time.Time    `json:"created_at"`
}

// ---------------------------------------------------------------- registry

type NumberStatus string

const (
	NumberPending   NumberStatus = "pending_verification"
	NumberActive    NumberStatus = "active"
	NumberSuspended NumberStatus = "suspended"
	NumberReleased  NumberStatus = "released"
)

type UseCase string

const (
	UseCustomerService UseCase = "customer_service"
	UseAppointment     UseCase = "appointment_reminder"
	UseDelivery        UseCase = "delivery"
	UseCollections     UseCase = "collections"
	UseMarketing       UseCase = "marketing"
	UseSurvey          UseCase = "survey"
	UseOTPCallback     UseCase = "otp_callback"
	UseEmergency       UseCase = "emergency"
	UseOther           UseCase = "other"
)

// Number is a single E.164 number (RangeStart == RangeEnd) or a contiguous range.
type Number struct {
	ID               string       `json:"id"`
	EntityID         string       `json:"entity_id"`
	RangeStart       string       `json:"range_start"` // E.164 with leading '+'
	RangeEnd         string       `json:"range_end"`
	Count            int64        `json:"count"`
	Kind             TNKind       `json:"kind"`
	UseCase          UseCase      `json:"use_case"`
	CallReason       string       `json:"call_reason"`
	BrandingID       string       `json:"branding_id,omitempty"`
	Status           NumberStatus `json:"status"`
	CarrierConfirmed bool         `json:"carrier_confirmed"` // operator confirmed allocation
	SuspendReason    string       `json:"suspend_reason,omitempty"`
	ActivatedAt      *time.Time   `json:"activated_at,omitempty"`
	CreatedAt        time.Time    `json:"created_at"`
	UpdatedAt        time.Time    `json:"updated_at"`
}

// Contains reports whether the normalized E.164 tn lies inside the number range.
func (n Number) Contains(tn string) bool {
	return len(tn) == len(n.RangeStart) && tn >= n.RangeStart && tn <= n.RangeEnd
}

type BrandingStatus string

const (
	BrandingDraft    BrandingStatus = "draft"
	BrandingPending  BrandingStatus = "pending_review"
	BrandingApproved BrandingStatus = "approved"
	BrandingRejected BrandingStatus = "rejected"
)

type Branding struct {
	ID          string         `json:"id"`
	EntityID    string         `json:"entity_id"`
	DisplayName string         `json:"display_name"` // <= 32 runes
	LogoURL     string         `json:"logo_url"`     // https, <= 512
	CallReason  string         `json:"call_reason"`  // <= 64 runes
	IsDefault   bool           `json:"is_default"`
	Status      BrandingStatus `json:"status"`
	ReviewNote  string         `json:"review_note,omitempty"`
	ReviewedBy  string         `json:"reviewed_by,omitempty"`
	ReviewedAt  *time.Time     `json:"reviewed_at,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// LookupResult is the authoritative call-time answer for a calling number.
type LookupResult struct {
	TN           string          `json:"tn"`
	Found        bool            `json:"found"` // number registered by some entity
	EntityID     string          `json:"entity_id,omitempty"`
	EntityName   string          `json:"entity_name,omitempty"`
	Verified     bool            `json:"verified"` // entity verified AND number active
	NumberStatus NumberStatus    `json:"number_status,omitempty"`
	Attest       Attest          `json:"attest,omitempty"` // attestation the operator would sign with
	UseCase      UseCase         `json:"use_case,omitempty"`
	DisplayName  string          `json:"display_name,omitempty"` // only approved branding
	LogoURL      string          `json:"logo_url,omitempty"`
	CallReason   string          `json:"call_reason,omitempty"`
	Score        int             `json:"score"` // 0..100, -1 = no data
	Label        ReputationLabel `json:"label"`
	TTLSeconds   int             `json:"ttl"`
	ComputedAt   time.Time       `json:"computed_at"`
}

// ---------------------------------------------------------------- pki / passport

type CertKind string

const (
	CertRoot         CertKind = "root"
	CertIntermediate CertKind = "intermediate"
	CertSP           CertKind = "sp"
	CertDelegate     CertKind = "delegate"
)

// TNEntry is one element of an RFC 8226 TNAuthList.
type TNEntry struct {
	SPC   string `json:"spc,omitempty"`
	Start string `json:"start,omitempty"` // TelephoneNumberRange start (digits, no '+')
	Count int64  `json:"count,omitempty"`
	TN    string `json:"tn,omitempty"` // single telephone number (digits, no '+')
}

type Certificate struct {
	ID           string     `json:"id"`
	Kind         CertKind   `json:"kind"`
	EntityID     string     `json:"entity_id,omitempty"` // delegate certificates only
	IssuerID     string     `json:"issuer_id,omitempty"`
	SerialHex    string     `json:"serial"`
	SubjectCN    string     `json:"subject_cn"`
	SPC          string     `json:"spc,omitempty"`
	TNAuthList   []TNEntry  `json:"tn_auth_list,omitempty"`
	NotBefore    time.Time  `json:"not_before"`
	NotAfter     time.Time  `json:"not_after"`
	PEM          string     `json:"pem"`
	X5U          string     `json:"x5u"`
	Status       string     `json:"status"` // active|revoked
	RevokedAt    *time.Time `json:"revoked_at,omitempty"`
	RevokeReason string     `json:"revoke_reason,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// RCDClaims is the RFC 9795 "rcd" claim subset Enumaracle signs.
type RCDClaims struct {
	Nam string `json:"nam"`
	Icn string `json:"icn,omitempty"` // logo URL
	Crn string `json:"crn,omitempty"` // call reason (RFC 9796)
}

type SignRequest struct {
	OrigTN  string `json:"orig_tn"`
	DestTN  string `json:"dest_tn"`
	Attest  Attest `json:"attest,omitempty"`  // empty = derived from lookup
	OrigID  string `json:"orig_id,omitempty"` // empty = new UUID
	WithRCD bool   `json:"with_rcd"`
}

type SignResult struct {
	Identity    string `json:"identity"` // SIP Identity header value (shaken)
	Passport    string `json:"passport"` // compact JWS (shaken)
	RCDIdentity string `json:"rcd_identity,omitempty"`
	RCDPassport string `json:"rcd_passport,omitempty"`
	CertID      string `json:"cert_id"`
	X5U         string `json:"x5u"`
	Attest      Attest `json:"attest"`
	OrigID      string `json:"orig_id"`
	IAT         int64  `json:"iat"`
}

type VerifyRequest struct {
	Identity    string `json:"identity"`               // shaken Identity header value or compact JWS
	RCDIdentity string `json:"rcd_identity,omitempty"` // optional rcd Identity header
	FromTN      string `json:"from_tn"`
	ToTN        string `json:"to_tn"`
}

type VerifyCheck struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}

type VerifyResult struct {
	Verstat     Verstat       `json:"verstat"`
	Attest      Attest        `json:"attest,omitempty"`
	OrigID      string        `json:"orig_id,omitempty"`
	CertID      string        `json:"cert_id,omitempty"`
	Reason      string        `json:"reason,omitempty"`
	RCD         *RCDClaims    `json:"rcd,omitempty"`
	RCDVerified bool          `json:"rcd_verified"`
	Checks      []VerifyCheck `json:"checks"`
	IAT         int64         `json:"iat,omitempty"`
}

// ---------------------------------------------------------------- reputation

type ReputationLabel string

const (
	LabelClean   ReputationLabel = "clean"
	LabelWatch   ReputationLabel = "watch"
	LabelSuspect ReputationLabel = "suspect"
	LabelSpam    ReputationLabel = "spam"
	LabelUnknown ReputationLabel = "unknown"
)

type CallEvent struct {
	ID          string    `json:"id"`
	SourceID    string    `json:"source_id"` // reporting carrier (API key owner)
	OrigTN      string    `json:"orig_tn"`
	DestTN      string    `json:"dest_tn"`
	StartedAt   time.Time `json:"started_at"`
	Disposition string    `json:"disposition"` // answered|no_answer|busy|rejected|failed|blocked
	DurationSec int64     `json:"duration_sec"`
	Verstat     Verstat   `json:"verstat,omitempty"`
}

type FeedbackKind string

const (
	FeedbackLabel     FeedbackKind = "label"     // third-party analytics label
	FeedbackComplaint FeedbackKind = "complaint" // subscriber complaint
	FeedbackBlock     FeedbackKind = "block"     // subscriber blocked the number
)

type LabelFeedback struct {
	ID         string          `json:"id"`
	TN         string          `json:"tn"`
	SourceID   string          `json:"source_id"`
	SourceName string          `json:"source_name"`
	Kind       FeedbackKind    `json:"kind"`
	Label      ReputationLabel `json:"label,omitempty"`
	Confidence float64         `json:"confidence"`
	Reason     string          `json:"reason"`
	CreatedAt  time.Time       `json:"created_at"`
}

// Factor explains one contribution to a score.
type Factor struct {
	Code       string  `json:"code"`
	Value      float64 `json:"value"`
	Threshold  float64 `json:"threshold"`
	Penalty    int     `json:"penalty"`
	MaxPenalty int     `json:"max_penalty"`
	TextTR     string  `json:"text_tr"`
	TextEN     string  `json:"text_en"`
}

type Score struct {
	TN            string          `json:"tn"`
	Score         int             `json:"score"`     // final 0..100 (100 = best)
	RawScore      int             `json:"raw_score"` // before floor/override
	Label         ReputationLabel `json:"label"`
	Floored       bool            `json:"floored"` // verified-identity protective floor applied
	OverrideLabel ReputationLabel `json:"override_label,omitempty"`
	OverrideUntil *time.Time      `json:"override_until,omitempty"`
	Factors       []Factor        `json:"factors"`
	Calls24h      int64           `json:"calls_24h"`
	Calls7d       int64           `json:"calls_7d"`
	Version       string          `json:"version"`
	ComputedAt    time.Time       `json:"computed_at"`
}

// ---------------------------------------------------------------- disputes

type DisputeStatus string

const (
	DisputeOpen     DisputeStatus = "open"
	DisputeInReview DisputeStatus = "in_review"
	DisputeResolved DisputeStatus = "resolved"
	DisputeRejected DisputeStatus = "rejected"
)

type Dispute struct {
	ID          string        `json:"id"`
	EntityID    string        `json:"entity_id"`
	TN          string        `json:"tn"`
	Kind        string        `json:"kind"` // label|suspension|branding|lookup|other
	Status      DisputeStatus `json:"status"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Resolution  string        `json:"resolution,omitempty"`
	OpenedBy    string        `json:"opened_by"`
	ResolvedBy  string        `json:"resolved_by,omitempty"`
	ResolvedAt  *time.Time    `json:"resolved_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
}

type DisputeComment struct {
	ID         string    `json:"id"`
	DisputeID  string    `json:"dispute_id"`
	AuthorID   string    `json:"author_id"`
	AuthorRole Role      `json:"author_role"`
	Body       string    `json:"body"`
	Internal   bool      `json:"internal"` // operator-only note
	CreatedAt  time.Time `json:"created_at"`
}

// ---------------------------------------------------------------- notify

// Event types published through Notifier.
const (
	EventEntityStatusChanged = "entity.status_changed"
	EventNumberStatusChanged = "number.status_changed"
	EventBrandingReviewed    = "branding.reviewed"
	EventReputationLabel     = "reputation.label_changed"
	EventDisputeCreated      = "dispute.created"
	EventDisputeUpdated      = "dispute.updated"
	EventCertificateIssued   = "certificate.issued"
)

type Event struct {
	ID       string    `json:"id"`
	Type     string    `json:"type"`
	At       time.Time `json:"at"`
	EntityID string    `json:"entity_id,omitempty"` // empty = operator-only event
	Data     any       `json:"data"`
}

// ---------------------------------------------------------------- auth

type Role string

const (
	RoleOperatorAdmin   Role = "operator_admin"
	RoleOperatorAnalyst Role = "operator_analyst"
	RoleEnterpriseOwner Role = "enterprise_owner"
	RoleEnterpriseUser  Role = "enterprise_user"
)

type Scope string

const (
	ScopeCarrierRead     Scope = "carrier:read"
	ScopeCarrierWrite    Scope = "carrier:write"
	ScopeEnterpriseRead  Scope = "enterprise:read"
	ScopeEnterpriseWrite Scope = "enterprise:write"
	ScopeAdminRead       Scope = "admin:read"
	ScopeAdmin           Scope = "admin"
)

// RoleScopes is the fixed role -> scope mapping for portal users.
var RoleScopes = map[Role][]Scope{
	RoleOperatorAdmin:   {ScopeAdmin, ScopeAdminRead, ScopeCarrierRead, ScopeCarrierWrite},
	RoleOperatorAnalyst: {ScopeAdminRead, ScopeCarrierRead},
	RoleEnterpriseOwner: {ScopeEnterpriseRead, ScopeEnterpriseWrite},
	RoleEnterpriseUser:  {ScopeEnterpriseRead},
}

type User struct {
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	Role        Role       `json:"role"`
	EntityID    string     `json:"entity_id,omitempty"`
	Active      bool       `json:"active"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// NewUser is the input of Accounts.CreateUser.
type NewUser struct {
	Email    string
	Name     string
	Password string
	Role     Role
	EntityID string
}

type APIKey struct {
	ID         string     `json:"id"`
	Prefix     string     `json:"prefix"` // first chars of the secret, shown in UI
	Name       string     `json:"name"`
	OwnerKind  string     `json:"owner_kind"` // operator|entity
	OwnerID    string     `json:"owner_id,omitempty"`
	Scopes     []Scope    `json:"scopes"`
	RateRPS    int        `json:"rate_rps"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Principal is the authenticated caller of a request.
type Principal struct {
	Kind     string  `json:"kind"` // user|apikey|system|anonymous
	ID       string  `json:"id"`   // user id or api key id
	Name     string  `json:"name"`
	Role     Role    `json:"role,omitempty"`
	EntityID string  `json:"entity_id,omitempty"`
	Scopes   []Scope `json:"scopes"`
	CSRF     string  `json:"-"` // session CSRF token (users only)
}

func (p Principal) Has(s Scope) bool {
	for _, x := range p.Scopes {
		if x == s || (x == ScopeAdmin && s == ScopeAdminRead) {
			return true
		}
	}
	return false
}

// IsOperator reports whether the principal acts for the operator rather than an enterprise.
func (p Principal) IsOperator() bool { return p.Has(ScopeAdminRead) || p.Has(ScopeCarrierRead) }

var SystemPrincipal = Principal{Kind: "system", ID: "system", Name: "system", Scopes: []Scope{ScopeAdmin}}

type AuditEvent struct {
	ID         string    `json:"id"`
	At         time.Time `json:"at"`
	ActorKind  string    `json:"actor_kind"`
	ActorID    string    `json:"actor_id"`
	Action     string    `json:"action"`
	TargetKind string    `json:"target_kind"`
	TargetID   string    `json:"target_id"`
	RequestID  string    `json:"request_id"`
	IP         string    `json:"ip"`
	Detail     string    `json:"detail"` // JSON
}
