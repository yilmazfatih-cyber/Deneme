# Enumaracle v1 — Technical Design Proposal (standards-first angle)

> Enumaracle is a single Go 1.24 binary (stdlib net/http, SQLite or PostgreSQL through one portable SQL subset) that gives a telecom operator a verified-caller platform: enterprise vetting with Turkish identifier checksums, an authoritative number registry with branding, a pilot STI-CA with TNAuthList (RFC 8226) and delegate certificates (RFC 9060), PASSporT sign/verify for shaken (RFC 8225/8588) and rcd (RFC 9795), explainable number reputation with a protective floor for verified identities, remediation tickets with HMAC webhooks, and a private ENUM tree (RFC 6116 NAPTR/TXT over UDP+TCP) for SBC integration at call time. The design splits into eleven packages with disjoint directories under enumaracle/internal, a frozen core package that holds every domain type and interface, and one migration file per feature package with a reserved numeric prefix so 8-10 agents can implement in parallel without touching each other's files. Cross-package dependencies flow only through core interfaces injected in cmd/enumaracle/main.go; no feature package imports another. Crypto is stdlib only (crypto/ecdsa P-256, hand-rolled JWS compact with the x5u header, encoding/asn1 for TNAuthList) and every certificate path is testable offline because the pilot CA, the x5u HTTP endpoint and the verifier all live in the same binary. Reputation uses rolling 24h/7d/30d aggregates and a weighted penalty formula producing a 0..100 score with a factor breakdown; verified entities get a floor of 60 and a review path instead of auto-labeling. The REST API has three surfaces (/v1/carrier, /v1/enterprise, /v1/admin) with scoped hashed API keys, argon2id cookie sessions, idempotency keys, RFC 9457 problem+json errors and an OpenAPI 3.1 document checked in. The React 19 portal is embedded with go:embed behind a committed placeholder so the Go build never depends on Node. The final section names the five most likely parallel-integration failure points (import cycles, migration collisions, SQL dialect drift, interface drift, embed/CI breakage) with concrete mitigations.

# Enumaracle v1 — Technical Design (standards-first)

Working name: **Enumaracle**. Category: Verified Caller Identity + Number Reputation + Branded Calling for telecom operators. Original implementation of open standards; no third-party proprietary code or branding.

Normative references: RFC 8224 (SIP Identity), RFC 8225 (PASSporT), RFC 8226 (STI certificates / TNAuthList), RFC 8588 (shaken PASSporT, attest/origid), RFC 9060 (delegate certificates), RFC 9795 (rcd PASSporT), RFC 7515 (JWS), RFC 7519 (JWT numeric dates), RFC 6116 (ENUM), RFC 3403 (NAPTR), RFC 9457 (problem details), OpenAPI 3.1, OWASP ASVS 4.0 L1/L2.

---

## 1. Package layout and ownership

All paths relative to `enumaracle/`. Each directory has exactly one owning agent. **No feature package imports another feature package**; they import only `internal/core` and `internal/platform/*`. Wiring happens in `cmd/enumaracle`.

| Path | Agent | Responsibility |
|---|---|---|
| `go.mod`, `go.sum`, `Makefile`, `Dockerfile`, `docker-compose.yml`, `deploy/k8s/*.yaml`, `.github/workflows/ci.yml` | A0 (lead) | Pre-created once. `go.mod` module `enumaracle`, Go 1.24, the 6 allowed deps only. Agents never run `go get`. |
| `cmd/enumaracle/` | A0 | `main.go`: parse config, open DB, run migrations (collected from every package), build keyring, construct services in dependency order, mount API + portal + metrics, start DNS, graceful shutdown. Also `cmd/enumaracle/cmd_*.go` subcommands: `serve`, `migrate`, `ca init`, `ca issue`, `admin create-user`, `apikey create`, `backup`. |
| `internal/core/` | A0 (**frozen after day 0**) | Domain types, enums, validation helpers (`core/trid` for VKN/MERSİS/TCKN, `core/e164` for Turkish normalization), error kinds, every repository and service interface, `Clock`, `IDGen`. Zero internal imports. Any change needs lead approval and is additive only. |
| `internal/platform/db/` | A1 | `Open(dsn)`, dialect detection (`sqlite`/`postgres`), `Rebind("?"→"$n")`, `Migrate([]Migration)`, `Tx` helper, `JSON`/`Time` scan helpers, in-memory SQLite factory for tests (`dbtest.New(t)`). |
| `internal/platform/config/` | A1 | Env + flags → `Config` struct; `Validate()`; prints effective config (secrets redacted). |
| `internal/platform/log/`, `platform/metrics/` | A1 | `slog` JSON handler with request id; Prometheus registry + shared histograms. |
| `internal/platform/httpx/` | A1 | problem+json writer, `Idempotency` middleware, token-bucket rate limiter, request id, recover, CORS (same-origin only), secure headers, JSON decode with size limit, pagination parsing. |
| `internal/platform/crypto/` | A1 | AES-256-GCM keyring (`Seal`/`Open` with key version prefix), master key from env/KMS stub, HMAC-SHA256 helpers, constant-time compare, secure random. |
| `internal/identity/` | A2 | Entities, documents metadata, vetting workflow, users, sessions (argon2id), API keys, audit trail, settings KV. Migration prefix **0100**. |
| `internal/numbers/` | A3 | Number and range registry, branding, status lifecycle, authoritative lookup, Turkish-aware normalization implementations over `core/e164`. Prefix **0200**. |
| `internal/pki/` | A4 | Pilot STI-CA: root, intermediate, SP certs with TNAuthList, delegate certs (RFC 9060), key records encrypted at rest, x5u HTTP serving of certificate chains, CRL, trust anchors. Prefix **0300**. |
| `internal/stir/` | A5 | PASSporT build/sign/verify (shaken + rcd + div-less), JWS compact ES256, Identity header parse/format, verification log. Prefix **0400**. |
| `internal/reputation/` | A6 | CDR batch ingest, label feedback ingest, rolling aggregates, scoring engine, label assignment, score history. Prefix **0500**. |
| `internal/disputes/` | A7 | Remediation tickets, comments, notifications (email stub), webhooks with HMAC + retry worker. Prefix **0600**. |
| `internal/enumdns/` | A8 | miekg/dns server (UDP+TCP), zone config, NAPTR/TXT/SOA/NS synthesis from `core.Lookup`, LRU cache with TTL, metrics. No migration. |
| `internal/api/` | A9 | HTTP mux composition, auth middleware (API key + session), handlers per surface, `openapi/openapi.yaml` (embedded, served at `/v1/openapi.yaml`), handler tests with `dbtest`. |
| `web/portal/` + `web/embed.go` | A10 | React 19 + Vite + TS portal; `web/dist/index.html` placeholder committed; `embed.go` exposes `web.FS`. |
| `docs/` | A11 | `README.md` (TR), `ARCHITECTURE.md` (EN), `API.md` (EN), `KURULUM.md`, `SATIS.md`, `DEMO.md`, `BACKUP.md`. |

Dependency direction (compile-time): `core ← platform ← {identity, numbers, pki, stir, reputation, disputes, enumdns} ← api ← cmd`. Cross-feature needs (e.g. numbers must know whether an entity is verified) are satisfied by **core interfaces injected at construction** (`numbers.New(db, entityReader core.EntityReader, …)`).

Migration collection: each feature package exports `func Migrations() []db.Migration` whose SQL is `//go:embed migrations/NNNN_name.sql`. `cmd` concatenates all, sorts by numeric prefix, and `db.Migrate` applies in order, recording in `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)`. Prefixes: identity 0100, numbers 0200, pki 0300, stir 0400, reputation 0500, disputes 0600. Each package owns **exactly one** file; later changes append statements to the same file during v1 (no second file without lead approval).

---

## 2. Domain model (`internal/core`)

```go
package core

type ID = string            // uuid v4 text, generated in Go (google/uuid)
// All time.Time values are UTC; persisted as RFC3339Nano TEXT.

// ---------- identity ----------
type EntityStatus string
const (
    EntityPending   EntityStatus = "pending"
    EntityInReview  EntityStatus = "in_review"
    EntityVerified  EntityStatus = "verified"
    EntityRejected  EntityStatus = "rejected"
    EntitySuspended EntityStatus = "suspended"
)
// Allowed transitions (enforced in identity.VettingService):
// pending→in_review; in_review→verified|rejected; verified→suspended; suspended→verified; rejected→in_review

type Entity struct {
    ID           ID
    LegalName    string
    TradeName    string
    Country      string   // ISO 3166-1 alpha-2, default "TR"
    VKN          string   // 10 digits, checksum-validated when Country=="TR"
    MERSIS       string   // 16 digits
    TCKN         string   // optional, 11 digits, checksum
    Address      string
    ContactName  string
    ContactEmail string
    ContactPhone string   // E.164
    Status       EntityStatus
    RiskTier     int      // 0 unknown, 1 low, 2 medium, 3 high
    VettingNotes string
    VerifiedAt   *time.Time
    CreatedAt    time.Time
    UpdatedAt    time.Time
}

type DocumentKind string
const (
    DocTradeRegistry DocumentKind = "trade_registry"   // ticaret sicil gazetesi
    DocTaxPlate      DocumentKind = "tax_plate"        // vergi levhası
    DocSignature     DocumentKind = "signature_circular"
    DocLOA           DocumentKind = "letter_of_authorization"
    DocOther         DocumentKind = "other"
)
type Document struct {
    ID         ID
    EntityID   ID
    Kind       DocumentKind
    FileName   string
    MIME       string
    SizeBytes  int64
    SHA256     string      // hex; file itself stored outside (StorageRef) — v1 stores metadata only
    StorageRef string
    UploadedBy ID
    CreatedAt  time.Time
}

type VettingDecision struct {
    ID        ID
    EntityID  ID
    From, To  EntityStatus
    Reason    string
    DecidedBy ID
    CreatedAt time.Time
}

type UserRole string
const (
    RoleOperatorAdmin    UserRole = "operator_admin"
    RoleOperatorReviewer UserRole = "operator_reviewer"
    RoleEnterpriseAdmin  UserRole = "enterprise_admin"
    RoleEnterpriseUser   UserRole = "enterprise_user"
)
type User struct {
    ID           ID
    Email        string   // lower-cased, unique
    Name         string
    PasswordHash string   // argon2id PHC string
    Role         UserRole
    EntityID     *ID      // nil for operator roles
    Disabled     bool
    CreatedAt    time.Time
    UpdatedAt    time.Time
}
type Session struct {
    TokenHash string      // sha256(hex) of the cookie value; PK
    UserID    ID
    IP, UserAgent string
    CSRFToken string
    ExpiresAt time.Time
    CreatedAt time.Time
}

type Scope string
const (
    ScopeCarrierRead    Scope = "carrier:read"
    ScopeCarrierWrite   Scope = "carrier:write"
    ScopeEnterpriseRead Scope = "enterprise:read"
    ScopeEnterpriseWrite Scope = "enterprise:write"
    ScopeAdmin          Scope = "admin"
)
type APIKey struct {
    ID             ID
    Name           string
    Prefix         string    // first 8 chars of the key, shown in UI: "enk_live_XXXXXXXX"
    Hash           string    // sha256 hex of full key
    Scopes         []Scope
    EntityID       *ID       // enterprise keys are bound to an entity
    RateLimitPerMin int
    LastUsedAt     *time.Time
    ExpiresAt      *time.Time
    RevokedAt      *time.Time
    CreatedBy      ID
    CreatedAt      time.Time
}

type ActorType string
const (ActorUser ActorType = "user"; ActorAPIKey ActorType = "api_key"; ActorSystem ActorType = "system")
type AuditEvent struct {
    ID         ID
    At         time.Time
    ActorType  ActorType
    ActorID    string
    Action     string           // "entity.create", "vetting.decide", "number.activate", ...
    TargetType string
    TargetID   string
    Detail     json.RawMessage  // before/after or request summary
    IP         string
    RequestID  string
}

// ---------- numbers ----------
type NumberStatus string
const (
    NumberPendingVerification NumberStatus = "pending_verification"
    NumberActive              NumberStatus = "active"
    NumberSuspended           NumberStatus = "suspended"
    NumberReleased            NumberStatus = "released"
)
type UseCase string
const (
    UseCustomerService UseCase = "customer_service"
    UseAppointment     UseCase = "appointment_reminder"
    UseCollections     UseCase = "collections"
    UseSales           UseCase = "sales"
    UseSurvey          UseCase = "survey"
    UseOTP             UseCase = "otp"
    UseEmergency       UseCase = "emergency"
    UseOther           UseCase = "other"
)
type NumberKind string
const (NumberSingle NumberKind = "single"; NumberRange NumberKind = "range")

type Number struct {
    ID          ID
    EntityID    ID
    Kind        NumberKind
    E164        string   // single: "+905xxxxxxxxx"; range: start (inclusive)
    E164End     string   // range only, inclusive, same length as E164; "" for single
    Category    string   // "mobile"|"geographic"|"nongeo_850"|"short_444"|"premium"|"other"|"international"
    UseCase     UseCase
    CallReason  string   // free text, max 64 chars
    Status      NumberStatus
    BrandingID  *ID      // nil → entity default branding
    ProofRef    string   // LOA / operator assignment reference
    ActivatedAt *time.Time
    ReleasedAt  *time.Time
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type BrandingStatus string
const (BrandingDraft BrandingStatus = "draft"; BrandingPendingReview BrandingStatus = "pending_review"; BrandingApproved BrandingStatus = "approved"; BrandingRejected BrandingStatus = "rejected")
type Branding struct {
    ID          ID
    EntityID    ID
    Name        string         // internal label
    DisplayName string         // ≤ 32 chars, shown as caller name
    LogoURL     string         // https only; validated reachable at approval
    LogoSHA256  string         // for rcdi integrity (RFC 9795 §5.1)
    CallReason  string         // ≤ 64 chars
    IsDefault   bool
    Status      BrandingStatus
    ReviewedBy  *ID
    ReviewNote  string
    CreatedAt, UpdatedAt time.Time
}

// Authoritative answer for "who owns this number, are they verified, what to display"
type Lookup struct {
    E164          string
    Found         bool
    NumberID      *ID
    EntityID      *ID
    EntityName    string
    EntityStatus  EntityStatus
    NumberStatus  NumberStatus
    Verified      bool   // EntityVerified && NumberActive
    UseCase       UseCase
    DisplayName   string
    LogoURL       string
    CallReason    string
    Score         *int
    Label         ReputationLabel
    Verstat       Verstat  // what the ENUM tree will advertise (see §8)
    AsOf          time.Time
}

// ---------- pki ----------
type CertKind string
const (CertRoot CertKind = "root"; CertIntermediate CertKind = "intermediate"; CertSP CertKind = "sp"; CertDelegate CertKind = "delegate")
type CertStatus string
const (CertActive CertStatus = "active"; CertRevoked CertStatus = "revoked"; CertExpired CertStatus = "expired")

type TNEntry struct {           // RFC 8226 §9 TNAuthorizationList entry
    SPC        string   // Service Provider Code (OCN-like); "" if not an SPC entry
    TN         string   // single E.164 digits (no '+')
    RangeStart string   // TelephoneNumberRange.start (digits)
    RangeCount int      // TelephoneNumberRange.count (>0)
}
type KeyRecord struct {
    ID             ID
    Algorithm      string   // "ES256"
    PublicKeyPEM   string
    PrivateKeyEnc  string   // base64(keyring.Seal(PKCS8 DER)); format "v<ver>:<nonce>:<ct>"
    KeyringVersion int
    CreatedAt      time.Time
    RetiredAt      *time.Time
}
type Certificate struct {
    ID         ID
    Kind       CertKind
    Serial     string   // decimal big.Int
    SubjectCN  string
    IssuerID   *ID      // nil for root
    KeyID      ID
    EntityID   *ID      // delegate certs only
    SPC        string
    TNAuth     []TNEntry
    NotBefore  time.Time
    NotAfter   time.Time
    PEM        string   // leaf only
    ChainPEM   string   // leaf + intermediates (what x5u serves)
    X5U        string   // absolute URL
    Status     CertStatus
    RevokedAt  *time.Time
    RevokeReason string
    CreatedAt  time.Time
}

// ---------- stir ----------
type Attestation string
const (AttestA Attestation = "A"; AttestB Attestation = "B"; AttestC Attestation = "C")
type Verstat string
const (
    VerstatPassed Verstat = "TN-Validation-Passed"
    VerstatFailed Verstat = "TN-Validation-Failed"
    VerstatNone   Verstat = "No-TN-Validation"
)
type PassportHeader struct {
    Alg string `json:"alg"`           // "ES256"
    Ppt string `json:"ppt"`           // "shaken" | "rcd"
    Typ string `json:"typ"`           // "passport"
    X5U string `json:"x5u"`
}
type TNList struct {
    TN  []string `json:"tn,omitempty"`
    URI []string `json:"uri,omitempty"`
}
type RCDClaim struct {                 // RFC 9795 §5
    Nam string            `json:"nam,omitempty"`
    Jcd json.RawMessage   `json:"jcd,omitempty"`   // jCard array
    Jcl string            `json:"jcl,omitempty"`   // URL of jCard
    Icn string            `json:"icn,omitempty"`   // logo/icon URL
}
type PassportClaims struct {
    Attest Attestation        `json:"attest,omitempty"`
    Dest   TNList            `json:"dest"`
    Iat    int64             `json:"iat"`
    Orig   TNList            `json:"orig"`
    Origid string            `json:"origid,omitempty"`
    RCD    *RCDClaim         `json:"rcd,omitempty"`
    RCDI   map[string]string `json:"rcdi,omitempty"`  // "sha256-<base64url>" per RFC 9795 §7
    CRN    string            `json:"crn,omitempty"`   // call reason (RFC 9795 §4.1)
}
type SignRequest struct {
    OrigTN, DestTN string      // raw as received; normalized to digits-only E.164
    Attest         Attestation
    Origid         string      // if "" → uuid v4
    IncludeRCD     bool
    Iat            *time.Time  // test hook; default now
}
type SignResult struct {
    Shaken   string   // compact JWS
    RCD      string   // compact JWS or ""
    Identity []string // ready-to-use SIP Identity header values
    CertID   ID
    Origid   string
}
type VerifyRequest struct {
    Identity string       // full Identity header value, OR
    Passport string       // bare compact JWS
    OrigTN, DestTN string // from SIP From/P-Asserted-Identity and To
    ReceivedAt *time.Time
}
type VerifyResult struct {
    Verstat     Verstat
    Ppt         string
    Attest      Attestation
    Origid      string
    ReasonCode  int       // RFC 8224 §6.2.2: 403,428,436,437,438; 0 on success
    ReasonText  string
    CertID      *ID
    SPC         string
    TNAuthMatch bool
    RCD         *RCDClaim
    RCDIntegrity string   // "verified"|"failed"|"absent"
    Iat         time.Time
}

// ---------- reputation ----------
type Disposition string
const (DispAnswered Disposition = "answered"; DispNoAnswer Disposition = "no_answer"; DispBusy Disposition = "busy"; DispFailed Disposition = "failed"; DispBlocked Disposition = "blocked")
type CallEvent struct {
    ID          ID
    Source      string      // carrier/switch id
    CallID      string      // dedupe key with Source
    OrigTN      string
    DestTN      string
    StartedAt   time.Time
    DurationSec int
    Disposition Disposition
    Attest      Attestation // "" unknown
    Verstat     Verstat
    IngestedAt  time.Time
}
type ReputationLabel string
const (LabelClean ReputationLabel = "clean"; LabelWatch ReputationLabel = "watch"; LabelSuspect ReputationLabel = "suspect"; LabelSpam ReputationLabel = "spam"; LabelUnknown ReputationLabel = "unknown")
type LabelFeedback struct {
    ID         ID
    Source     string      // "turkcell", "hiya", "truecaller", "user_report" ...
    E164       string
    Label      ReputationLabel
    Confidence float64     // 0..1
    Complaints int
    Reason     string
    ObservedAt time.Time
    IngestedAt time.Time
}
type Window string
const (Win24h Window = "24h"; Win7d Window = "7d"; Win30d Window = "30d")
type NumberStats struct {
    E164          string
    Window        Window
    Calls         int64
    UniqueDest    int64
    Answered      int64
    ShortCalls    int64   // answered && duration < 6s
    TotalDuration int64
    Blocked       int64
    Complaints    int64
    ExtSpamVotes  float64 // Σ confidence of spam/suspect feedback
    ExtCleanVotes float64
    ComputedAt    time.Time
}
type Factor struct {
    Name         string  `json:"name"`
    Value        float64 `json:"value"`
    Weight       float64 `json:"weight"`
    Contribution float64 `json:"contribution"` // negative = penalty points
    Note         string  `json:"note"`
}
type Score struct {
    E164       string
    Score      int             // 0..100
    Label      ReputationLabel
    Factors    []Factor
    Verified   bool
    FloorApplied bool
    Version    string          // scoring formula version, "v1"
    ComputedAt time.Time
}
type ReputationSummary struct { Score int; Label ReputationLabel; ComputedAt time.Time }

// ---------- disputes ----------
type DisputeKind string
const (DisputeLabel DisputeKind = "label"; DisputeScore DisputeKind = "score"; DisputeBlock DisputeKind = "block"; DisputeBranding DisputeKind = "branding")
type DisputeStatus string
const (DisputeOpen DisputeStatus = "open"; DisputeInReview DisputeStatus = "in_review"; DisputeResolved DisputeStatus = "resolved"; DisputeRejected DisputeStatus = "rejected")
type Dispute struct {
    ID         ID
    EntityID   ID
    E164       string
    Kind       DisputeKind
    Status     DisputeStatus
    Summary    string
    Evidence   json.RawMessage
    OpenedBy   ID
    AssignedTo *ID
    Resolution string
    ResolvedBy *ID
    CreatedAt, UpdatedAt time.Time
    ClosedAt   *time.Time
}
type DisputeComment struct {
    ID, DisputeID, AuthorID ID
    Internal  bool   // operator-only note
    Body      string
    CreatedAt time.Time
}
type Webhook struct {
    ID        ID
    EntityID  *ID       // nil = operator-level subscription
    URL       string
    SecretEnc string    // keyring-sealed
    Events    []string  // "entity.status_changed","number.status_changed","reputation.label_changed","dispute.updated","verification.failed"
    Active    bool
    CreatedAt time.Time
}
type DeliveryStatus string
const (DeliveryPending DeliveryStatus = "pending"; DeliveryOK DeliveryStatus = "delivered"; DeliveryFailed DeliveryStatus = "failed")
type WebhookDelivery struct {
    ID        ID
    WebhookID ID
    Event     string
    Payload   json.RawMessage
    Attempt   int
    Status    DeliveryStatus
    NextAt    *time.Time
    LastCode  int
    LastError string
    CreatedAt, UpdatedAt time.Time
}
type Notification struct {   // in-app + email stub
    ID        ID
    UserID    ID
    Kind      string
    Title, Body string
    ReadAt    *time.Time
    CreatedAt time.Time
}

// ---------- errors ----------
type ErrKind string
const (ErrNotFound ErrKind = "not_found"; ErrConflict ErrKind = "conflict"; ErrValidation ErrKind = "validation"; ErrForbidden ErrKind = "forbidden"; ErrUnauthorized ErrKind = "unauthorized"; ErrRateLimited ErrKind = "rate_limited"; ErrInternal ErrKind = "internal")
type Error struct { Kind ErrKind; Msg string; Field string; Err error }
func (e *Error) Error() string; func (e *Error) Unwrap() error
func E(kind ErrKind, msg string) *Error
func KindOf(err error) ErrKind  // errors.As helper
```

Validation helpers in `core/trid`: `ValidVKN(s) bool` (10 digits; standard VKN mod-10 algorithm: for i=0..8, d=(digit+(9-i)) mod 10, q = d==0?0:(d·2^(9-i)) mod 9, q==0→9 when d≠0; check = (10 − Σq mod 10) mod 10), `ValidMERSIS(s) bool` (16 digits), `ValidTCKN(s) bool` (11 digits, first≠0, d10 = ((Σodd·7) − Σeven) mod 10, d11 = Σfirst10 mod 10). `core/e164`: `NormalizeTR(raw string) (e164 string, category string, err error)` handling `0xxx`, `+90`, `90`, `5xx` mobile, `850` non-geographic, `444xxxx` short corporate (stored as `+90444xxxx` with category `short_444`, never padded), `0800/0900`, and international `+<cc>`; output always `+` + digits.

---

## 3. Database schema (portable subset)

Rules: `TEXT` PK uuids; `BIGINT` integers (SQLite treats as INTEGER); `REAL`; `BOOLEAN` (SQLite: 0/1 — write Go `bool` directly, both drivers accept); JSON as `TEXT`; timestamps `TEXT` RFC3339Nano UTC (lexicographically sortable). No `SERIAL`, no `ON CONFLICT DO UPDATE` with dialect-specific syntax (use `INSERT … ON CONFLICT(x) DO UPDATE SET …` which both support), no `RETURNING`, no `ILIKE` (use `LOWER(col) LIKE`), no `NOW()` (Go sets times). Migrations are plain SQL statements separated by `;\n`.

### 0100_identity.sql (A2)
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'TR', vkn TEXT NOT NULL DEFAULT '', mersis TEXT NOT NULL DEFAULT '',
  tckn TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL, risk_tier BIGINT NOT NULL DEFAULT 0, vetting_notes TEXT NOT NULL DEFAULT '',
  verified_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX ux_entities_vkn ON entities(country, vkn) WHERE vkn <> '';
CREATE INDEX ix_entities_status ON entities(status, created_at);
CREATE TABLE entity_documents (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), kind TEXT NOT NULL,
  file_name TEXT NOT NULL, mime TEXT NOT NULL, size_bytes BIGINT NOT NULL, sha256 TEXT NOT NULL,
  storage_ref TEXT NOT NULL DEFAULT '', uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_docs_entity ON entity_documents(entity_id);
CREATE TABLE vetting_decisions (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), from_status TEXT NOT NULL,
  to_status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', decided_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_vetting_entity ON vetting_decisions(entity_id, created_at);
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL,
  role TEXT NOT NULL, entity_id TEXT REFERENCES entities(id), disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '', csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_sessions_user ON sessions(user_id); CREATE INDEX ix_sessions_exp ON sessions(expires_at);
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL, entity_id TEXT REFERENCES entities(id), rate_limit_per_min BIGINT NOT NULL DEFAULT 600,
  last_used_at TEXT, expires_at TEXT, revoked_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_api_keys_entity ON api_keys(entity_id);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', ip TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '');
CREATE INDEX ix_audit_target ON audit_events(target_type, target_id, at); CREATE INDEX ix_audit_at ON audit_events(at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL, actor_id TEXT NOT NULL, request_hash TEXT NOT NULL, status_code BIGINT NOT NULL,
  response_body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (actor_id, key));
```

### 0200_numbers.sql (A3)
```sql
CREATE TABLE numbers (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), kind TEXT NOT NULL,
  e164 TEXT NOT NULL, e164_end TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, use_case TEXT NOT NULL,
  call_reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, branding_id TEXT, proof_ref TEXT NOT NULL DEFAULT '',
  activated_at TEXT, released_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX ux_numbers_active ON numbers(e164, e164_end) WHERE status <> 'released';
CREATE INDEX ix_numbers_entity ON numbers(entity_id, status);
CREATE INDEX ix_numbers_range ON numbers(e164, e164_end);
CREATE TABLE brandings (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), name TEXT NOT NULL,
  display_name TEXT NOT NULL, logo_url TEXT NOT NULL DEFAULT '', logo_sha256 TEXT NOT NULL DEFAULT '',
  call_reason TEXT NOT NULL DEFAULT '', is_default BOOLEAN NOT NULL DEFAULT FALSE, status TEXT NOT NULL,
  reviewed_by TEXT, review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX ix_brandings_entity ON brandings(entity_id, status);
CREATE TABLE number_status_history (
  id TEXT PRIMARY KEY, number_id TEXT NOT NULL REFERENCES numbers(id), from_status TEXT NOT NULL,
  to_status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_nsh_number ON number_status_history(number_id, created_at);
```
Range lookup query (portable): `SELECT … FROM numbers WHERE status='active' AND ((kind='single' AND e164=?) OR (kind='range' AND e164<=? AND e164_end>=? AND LENGTH(e164)=LENGTH(?))) ORDER BY kind LIMIT 1` (single beats range; same-length string comparison is numeric-correct for equal-length digit strings).

### 0300_pki.sql (A4)
```sql
CREATE TABLE pki_keys (
  id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, public_key_pem TEXT NOT NULL, private_key_enc TEXT NOT NULL,
  keyring_version BIGINT NOT NULL, created_at TEXT NOT NULL, retired_at TEXT);
CREATE TABLE pki_certificates (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, serial TEXT NOT NULL UNIQUE, subject_cn TEXT NOT NULL,
  issuer_id TEXT, key_id TEXT NOT NULL REFERENCES pki_keys(id), entity_id TEXT, spc TEXT NOT NULL DEFAULT '',
  tn_auth TEXT NOT NULL DEFAULT '[]', not_before TEXT NOT NULL, not_after TEXT NOT NULL, pem TEXT NOT NULL,
  chain_pem TEXT NOT NULL, x5u TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, revoked_at TEXT,
  revoke_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE INDEX ix_certs_kind_status ON pki_certificates(kind, status, not_after);
CREATE INDEX ix_certs_entity ON pki_certificates(entity_id);
CREATE TABLE pki_trust_anchors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, pem TEXT NOT NULL, fingerprint_sha256 TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TEXT NOT NULL);
```

### 0400_stir.sql (A5)
```sql
CREATE TABLE verification_log (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, orig_tn TEXT NOT NULL, dest_tn TEXT NOT NULL, ppt TEXT NOT NULL DEFAULT '',
  attest TEXT NOT NULL DEFAULT '', origid TEXT NOT NULL DEFAULT '', verstat TEXT NOT NULL, reason_code BIGINT NOT NULL DEFAULT 0,
  reason_text TEXT NOT NULL DEFAULT '', cert_id TEXT, x5u TEXT NOT NULL DEFAULT '', spc TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '', latency_ms BIGINT NOT NULL DEFAULT 0);
CREATE INDEX ix_vlog_at ON verification_log(at); CREATE INDEX ix_vlog_orig ON verification_log(orig_tn, at);
CREATE TABLE signing_log (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, orig_tn TEXT NOT NULL, dest_tn TEXT NOT NULL, attest TEXT NOT NULL,
  origid TEXT NOT NULL, cert_id TEXT NOT NULL, rcd BOOLEAN NOT NULL DEFAULT FALSE, api_key_id TEXT NOT NULL DEFAULT '');
CREATE INDEX ix_slog_at ON signing_log(at);
```

### 0500_reputation.sql (A6)
```sql
CREATE TABLE call_events (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, call_id TEXT NOT NULL, orig_tn TEXT NOT NULL, dest_tn TEXT NOT NULL,
  started_at TEXT NOT NULL, duration_sec BIGINT NOT NULL DEFAULT 0, disposition TEXT NOT NULL,
  attest TEXT NOT NULL DEFAULT '', verstat TEXT NOT NULL DEFAULT '', ingested_at TEXT NOT NULL);
CREATE UNIQUE INDEX ux_call_events_dedupe ON call_events(source, call_id);
CREATE INDEX ix_call_events_orig ON call_events(orig_tn, started_at);
CREATE INDEX ix_call_events_started ON call_events(started_at);
CREATE TABLE label_feedback (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, e164 TEXT NOT NULL, label TEXT NOT NULL, confidence REAL NOT NULL,
  complaints BIGINT NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', observed_at TEXT NOT NULL, ingested_at TEXT NOT NULL);
CREATE INDEX ix_label_feedback_e164 ON label_feedback(e164, observed_at);
CREATE TABLE number_stats (
  e164 TEXT NOT NULL, win TEXT NOT NULL, calls BIGINT NOT NULL, unique_dest BIGINT NOT NULL, answered BIGINT NOT NULL,
  short_calls BIGINT NOT NULL, total_duration BIGINT NOT NULL, blocked BIGINT NOT NULL, complaints BIGINT NOT NULL,
  ext_spam_votes REAL NOT NULL, ext_clean_votes REAL NOT NULL, computed_at TEXT NOT NULL, PRIMARY KEY (e164, win));
CREATE TABLE scores (
  e164 TEXT PRIMARY KEY, score BIGINT NOT NULL, label TEXT NOT NULL, factors TEXT NOT NULL, verified BOOLEAN NOT NULL,
  floor_applied BOOLEAN NOT NULL, version TEXT NOT NULL, computed_at TEXT NOT NULL);
CREATE INDEX ix_scores_label ON scores(label, score);
CREATE TABLE score_history (
  id TEXT PRIMARY KEY, e164 TEXT NOT NULL, score BIGINT NOT NULL, label TEXT NOT NULL, prev_label TEXT NOT NULL,
  factors TEXT NOT NULL, computed_at TEXT NOT NULL);
CREATE INDEX ix_score_history_e164 ON score_history(e164, computed_at);
CREATE TABLE label_overrides (
  e164 TEXT PRIMARY KEY, label TEXT NOT NULL, reason TEXT NOT NULL, set_by TEXT NOT NULL, expires_at TEXT, created_at TEXT NOT NULL);
```

### 0600_disputes.sql (A7)
```sql
CREATE TABLE disputes (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, e164 TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  summary TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '{}', opened_by TEXT NOT NULL, assigned_to TEXT,
  resolution TEXT NOT NULL DEFAULT '', resolved_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT);
CREATE INDEX ix_disputes_entity ON disputes(entity_id, status); CREATE INDEX ix_disputes_status ON disputes(status, created_at);
CREATE TABLE dispute_comments (
  id TEXT PRIMARY KEY, dispute_id TEXT NOT NULL REFERENCES disputes(id), author_id TEXT NOT NULL,
  internal BOOLEAN NOT NULL DEFAULT FALSE, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX ix_dc_dispute ON dispute_comments(dispute_id, created_at);
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY, entity_id TEXT, url TEXT NOT NULL, secret_enc TEXT NOT NULL, events TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TEXT NOT NULL);
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL REFERENCES webhooks(id), event TEXT NOT NULL, payload TEXT NOT NULL,
  attempt BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL, next_at TEXT, last_code BIGINT NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX ix_wd_due ON webhook_deliveries(status, next_at);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX ix_notif_user ON notifications(user_id, read_at, created_at);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY, event TEXT NOT NULL, entity_id TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL,
  dispatched_at TEXT);
CREATE INDEX ix_outbox_pending ON outbox(dispatched_at, created_at);
```
Cross-package event flow: any package that needs to notify writes a row to `outbox` **through `core.EventSink`** (implemented in disputes); disputes' worker fans out to webhooks + notifications. No package calls another's HTTP client.

---

## 4. Interfaces (all in `internal/core/ports.go`)

```go
// Platform-level
type Clock interface{ Now() time.Time }
type IDGen interface{ New() ID }
type Sealer interface {                // platform/crypto keyring
    Seal(plaintext []byte) (string, int, error)   // ciphertext text, key version
    Open(ciphertext string) ([]byte, error)
}
type Page struct{ Limit int; Cursor string }       // cursor = base64(created_at|id)
type PageResult[T any] struct{ Items []T; NextCursor string }

// Events (implemented by disputes; consumed by everyone)
type Event struct{ Name string; EntityID *ID; Payload any }
type EventSink interface{ Emit(ctx context.Context, ev Event) error }

// Audit (implemented by identity; injected everywhere)
type Auditor interface{ Record(ctx context.Context, ev AuditEvent) error }

// ----- identity -----
type EntityFilter struct{ Status []EntityStatus; Query string; RiskTier *int }
type EntityStore interface {
    Create(ctx context.Context, e *Entity) error
    Get(ctx context.Context, id ID) (*Entity, error)
    Update(ctx context.Context, e *Entity) error
    List(ctx context.Context, f EntityFilter, p Page) (PageResult[Entity], error)
    AddDocument(ctx context.Context, d *Document) error
    ListDocuments(ctx context.Context, entityID ID) ([]Document, error)
    AddDecision(ctx context.Context, d *VettingDecision) error
    ListDecisions(ctx context.Context, entityID ID) ([]VettingDecision, error)
}
type EntityReader interface {           // minimal view for other packages
    Get(ctx context.Context, id ID) (*Entity, error)
    IsVerified(ctx context.Context, id ID) (bool, error)
}
type VettingService interface {
    Register(ctx context.Context, in RegisterEntityInput, actor Actor) (*Entity, error)
    Submit(ctx context.Context, entityID ID, actor Actor) error               // pending → in_review
    Decide(ctx context.Context, entityID ID, to EntityStatus, reason string, actor Actor) error
    Queue(ctx context.Context, p Page) (PageResult[Entity], error)             // in_review, oldest first
}
type UserStore interface {
    Create(ctx context.Context, u *User) error
    GetByEmail(ctx context.Context, email string) (*User, error)
    Get(ctx context.Context, id ID) (*User, error)
    Update(ctx context.Context, u *User) error
    ListByEntity(ctx context.Context, entityID ID) ([]User, error)
}
type SessionStore interface {
    Create(ctx context.Context, s *Session) error
    Get(ctx context.Context, tokenHash string) (*Session, error)
    Delete(ctx context.Context, tokenHash string) error
    DeleteExpired(ctx context.Context, before time.Time) (int64, error)
}
type AuthService interface {
    Login(ctx context.Context, email, password, ip, ua string) (token string, s *Session, u *User, err error)
    Logout(ctx context.Context, token string) error
    Authenticate(ctx context.Context, token string) (*User, *Session, error)
    SetPassword(ctx context.Context, userID ID, newPassword string) error
}
type APIKeyStore interface {
    Create(ctx context.Context, k *APIKey) error
    GetByHash(ctx context.Context, hash string) (*APIKey, error)
    List(ctx context.Context, entityID *ID) ([]APIKey, error)
    Revoke(ctx context.Context, id ID, at time.Time) error
    TouchLastUsed(ctx context.Context, id ID, at time.Time) error
}
type APIKeyService interface {
    Issue(ctx context.Context, name string, scopes []Scope, entityID *ID, rate int, actor Actor) (plaintext string, k *APIKey, err error)
    Authenticate(ctx context.Context, plaintext string) (*APIKey, error)
}
type AuditStore interface {
    Append(ctx context.Context, ev *AuditEvent) error
    List(ctx context.Context, targetType, targetID string, p Page) (PageResult[AuditEvent], error)
}
type SettingsStore interface {
    Get(ctx context.Context, key string) (string, bool, error)
    Set(ctx context.Context, key, value string) error
    All(ctx context.Context) (map[string]string, error)
}
type Actor struct{ Type ActorType; ID string; EntityID *ID; Role UserRole; Scopes []Scope; IP, RequestID string }

// ----- numbers -----
type NumberFilter struct{ EntityID *ID; Status []NumberStatus; Query string }
type NumberStore interface {
    Create(ctx context.Context, n *Number) error
    Get(ctx context.Context, id ID) (*Number, error)
    Update(ctx context.Context, n *Number) error
    List(ctx context.Context, f NumberFilter, p Page) (PageResult[Number], error)
    FindCovering(ctx context.Context, e164 string) (*Number, error)   // active single or range
    AddHistory(ctx context.Context, numberID ID, from, to NumberStatus, reason, actor string) error
}
type BrandingStore interface {
    Create(ctx context.Context, b *Branding) error
    Get(ctx context.Context, id ID) (*Branding, error)
    Update(ctx context.Context, b *Branding) error
    ListByEntity(ctx context.Context, entityID ID) ([]Branding, error)
    Default(ctx context.Context, entityID ID) (*Branding, error)
}
type NumberService interface {
    Register(ctx context.Context, in RegisterNumberInput, actor Actor) (*Number, error)
    Transition(ctx context.Context, id ID, to NumberStatus, reason string, actor Actor) error
    SetBranding(ctx context.Context, numberID ID, brandingID *ID, actor Actor) error
}
type BrandingService interface {
    Create(ctx context.Context, in BrandingInput, actor Actor) (*Branding, error)
    Submit(ctx context.Context, id ID, actor Actor) error
    Review(ctx context.Context, id ID, approve bool, note string, actor Actor) error
}
type Normalizer interface{ Normalize(raw string) (e164, category string, err error) }
type LookupService interface {         // the single authoritative read used by API, ENUM, STIR, reputation
    Lookup(ctx context.Context, rawTN string) (*Lookup, error)
}
type ReputationReader interface{ Summary(ctx context.Context, e164 string) (*ReputationSummary, error) } // implemented by reputation, injected into numbers.LookupService

// ----- pki -----
type KeyStore interface {
    Create(ctx context.Context, k *KeyRecord) error
    Get(ctx context.Context, id ID) (*KeyRecord, error)
}
type CertStore interface {
    Create(ctx context.Context, c *Certificate) error
    Get(ctx context.Context, id ID) (*Certificate, error)
    GetBySerial(ctx context.Context, serial string) (*Certificate, error)
    List(ctx context.Context, kind CertKind, status CertStatus, entityID *ID) ([]Certificate, error)
    SetStatus(ctx context.Context, id ID, s CertStatus, at time.Time, reason string) error
    ActiveSigning(ctx context.Context, entityID *ID) (*Certificate, error)  // SP cert when nil, delegate when set
}
type TrustStore interface {
    Add(ctx context.Context, name, pem string) (*x509.Certificate, error)
    Pool(ctx context.Context) (*x509.CertPool, []*x509.Certificate, error)
}
type CAService interface {
    InitRoot(ctx context.Context, cn string, years int) (*Certificate, error)
    IssueIntermediate(ctx context.Context, cn string, years int) (*Certificate, error)
    IssueSP(ctx context.Context, cn, spc string, days int) (*Certificate, error)
    IssueDelegate(ctx context.Context, entityID ID, cn string, tns []TNEntry, days int) (*Certificate, error)
    Revoke(ctx context.Context, certID ID, reason string) error
    CRL(ctx context.Context) ([]byte, error)                      // DER, signed by intermediate
    Chain(ctx context.Context, certID ID) (pem []byte, err error)  // what x5u serves
}
type Signer interface {               // used by stir
    Sign(ctx context.Context, cert *Certificate, signingInput []byte) (sig []byte, err error) // raw r||s 64 bytes
}
type CertResolver interface {         // used by stir verify
    Fetch(ctx context.Context, x5u string) ([]*x509.Certificate, error)  // cached; same-host short-circuit to CertStore
}

// ----- stir -----
type SigningService interface {
    Sign(ctx context.Context, req SignRequest, actor Actor) (*SignResult, error)
}
type VerificationService interface {
    Verify(ctx context.Context, req VerifyRequest) (*VerifyResult, error)
}
type VerificationLog interface{ Append(ctx context.Context, r *VerifyResult, req VerifyRequest, source string, latency time.Duration) error }

// ----- reputation -----
type CallEventStore interface {
    InsertBatch(ctx context.Context, evs []CallEvent) (inserted int, err error)   // ignores duplicates
    Aggregate(ctx context.Context, e164 string, from, to time.Time) (*NumberStats, error)
    DistinctOrigSince(ctx context.Context, since time.Time) ([]string, error)
}
type LabelFeedbackStore interface {
    InsertBatch(ctx context.Context, fs []LabelFeedback) (int, error)
    Sum(ctx context.Context, e164 string, from, to time.Time) (spam, clean float64, complaints int64, err error)
}
type ScoreStore interface {
    Upsert(ctx context.Context, s *Score) error
    Get(ctx context.Context, e164 string) (*Score, error)
    History(ctx context.Context, e164 string, p Page) (PageResult[Score], error)
    ListByLabel(ctx context.Context, l ReputationLabel, p Page) (PageResult[Score], error)
    SetOverride(ctx context.Context, e164 string, l ReputationLabel, reason, by string, expires *time.Time) error
    ClearOverride(ctx context.Context, e164 string) error
}
type ReputationService interface {
    IngestCalls(ctx context.Context, evs []CallEvent) (int, error)
    IngestLabels(ctx context.Context, fs []LabelFeedback) (int, error)
    Recompute(ctx context.Context, e164 string) (*Score, error)
    RecomputeAll(ctx context.Context, since time.Time) (int, error)   // cron-ish worker entry
    Explain(ctx context.Context, e164 string) (*Score, *NumberStats, *NumberStats, *NumberStats, error) // 24h,7d,30d
}

// ----- disputes -----
type DisputeStore interface {
    Create(ctx context.Context, d *Dispute) error
    Get(ctx context.Context, id ID) (*Dispute, error)
    Update(ctx context.Context, d *Dispute) error
    List(ctx context.Context, entityID *ID, status []DisputeStatus, p Page) (PageResult[Dispute], error)
    AddComment(ctx context.Context, c *DisputeComment) error
    Comments(ctx context.Context, disputeID ID, includeInternal bool) ([]DisputeComment, error)
}
type DisputeService interface {
    Open(ctx context.Context, in OpenDisputeInput, actor Actor) (*Dispute, error)
    Comment(ctx context.Context, id ID, body string, internal bool, actor Actor) error
    Assign(ctx context.Context, id ID, reviewer ID, actor Actor) error
    Resolve(ctx context.Context, id ID, accepted bool, resolution string, actor Actor) error
}
type WebhookStore interface {
    Create(ctx context.Context, w *Webhook) error
    List(ctx context.Context, entityID *ID) ([]Webhook, error)
    Delete(ctx context.Context, id ID) error
    Enqueue(ctx context.Context, d *WebhookDelivery) error
    Due(ctx context.Context, now time.Time, limit int) ([]WebhookDelivery, error)
    MarkAttempt(ctx context.Context, d *WebhookDelivery) error
}
type NotificationStore interface {
    Create(ctx context.Context, n *Notification) error
    ListForUser(ctx context.Context, userID ID, unreadOnly bool, p Page) (PageResult[Notification], error)
    MarkRead(ctx context.Context, id ID, at time.Time) error
}
type Mailer interface{ Send(ctx context.Context, to, subject, body string) error }  // stub logs; SMTP later
```

Service constructors (one per package, signatures fixed on day 0 so `cmd` can be written immediately):

```go
identity.New(db *db.DB, sealer core.Sealer, clk core.Clock, ids core.IDGen, sink core.EventSink) *identity.Module
   // Module exposes: Entities EntityStore; Vetting VettingService; Users UserStore; Sessions SessionStore; Auth AuthService; Keys APIKeyService; KeyStore APIKeyStore; Audit AuditStore; Auditor core.Auditor; Settings SettingsStore; Migrations() []db.Migration
numbers.New(db, entities core.EntityReader, rep core.ReputationReader /*may be nil-safe*/, auditor core.Auditor, sink core.EventSink, clk, ids) *numbers.Module  // Numbers, Brandings, Service, BrandingSvc, Lookup, Normalizer
pki.New(db, sealer core.Sealer, cfg pki.Config{BaseURL string}, clk, ids) *pki.Module  // CA, Keys, Certs, Trust, Signer, Resolver, HTTPHandler() http.Handler (/pki/certs/{id}.pem, /pki/crl.der)
stir.New(db, certs core.CertStore, signer core.Signer, resolver core.CertResolver, trust core.TrustStore, lookup core.LookupService, brand core.BrandingStore, cfg stir.Config{IatSkew time.Duration /*60s*/, Origid func() string}, clk) *stir.Module  // Signing, Verification, Log
reputation.New(db, entities core.EntityReader, numbers core.NumberStore, sink core.EventSink, cfg reputation.Config, clk, ids) *reputation.Module  // Service, Scores (ScoreStore), Reader (core.ReputationReader), Worker(ctx)
disputes.New(db, sealer core.Sealer, users core.UserStore, mailer core.Mailer, cfg disputes.Config, clk, ids) *disputes.Module  // Service, Store, Webhooks, Notifications, Sink (core.EventSink), Worker(ctx)
enumdns.New(lookup core.LookupService, cfg enumdns.Config, reg prometheus.Registerer) *enumdns.Server  // ListenAndServe(ctx)
api.New(deps api.Deps) http.Handler   // Deps is a struct with every interface above + web.FS + openapi bytes
```

Construction order in `main`: platform → identity → disputes (needs users; provides Sink) → pki → reputation (needs entities, numbers store → so numbers before reputation; reputation.Reader is injected into numbers lazily via `numbers.Module.SetReputation(reader)` to break the cycle) → numbers → stir → enumdns → api.

---

## 5. HTTP API route table (v1)

Conventions: JSON only; `Content-Type: application/json`; errors `application/problem+json` (RFC 9457) with `type` URN `urn:enumaracle:problem:<kind>`, `title`, `status`, `detail`, `instance` (request id), optional `errors[]{field,message}`. Lists return `{items:[…], next_cursor}`. Writes accept `Idempotency-Key` (required on `/v1/carrier/events`, optional elsewhere; replay returns stored response, mismatch → 422). Auth: `Authorization: Bearer enk_live_…` for API keys; `Cookie: enum_session=…` + `X-CSRF-Token` for portal. Rate limit headers `RateLimit-Limit/Remaining/Reset`. Base path `/v1`.

Scopes: **C-R** carrier:read, **C-W** carrier:write, **E-R/E-W** enterprise read/write (entity-bound), **ADM** admin (API key scope `admin` or session role operator_*), **SESS** any logged-in user. Enterprise session users act as E-R/E-W for their own entity only.

| Method | Path | Surface | Auth | Request → Response |
|---|---|---|---|---|
| GET | `/healthz` | ops | none | 200 `{"status":"ok"}` |
| GET | `/readyz` | ops | none | DB ping + signing cert present → 200/503 |
| GET | `/metrics` | ops | none (bind separately or allowlist) | Prometheus text |
| GET | `/v1/openapi.yaml` | ops | none | embedded OpenAPI 3.1 |
| GET | `/pki/certs/{id}.pem` | pki | none | PEM chain (x5u target); `Cache-Control: max-age=3600`, ETag |
| GET | `/pki/crl.der` | pki | none | DER CRL |
| GET | `/pki/roots.pem` | pki | none | trust anchors |
| **Carrier** | | | | |
| GET | `/v1/carrier/lookup/{tn}` | carrier | C-R | → `core.Lookup` JSON |
| POST | `/v1/carrier/lookup:batch` | carrier | C-R | `{tns:[≤500]}` → `{items:[Lookup]}` |
| POST | `/v1/carrier/verify` | carrier | C-R | `VerifyRequest` → `VerifyResult` |
| POST | `/v1/carrier/sign` | carrier | C-W | `SignRequest` (operator-level: Attest A/B/C) → `SignResult` |
| POST | `/v1/carrier/events` | carrier | C-W | `{events:[CallEvent ≤10 000]}` → 202 `{accepted,duplicates}` |
| POST | `/v1/carrier/labels` | carrier | C-W | `{labels:[LabelFeedback ≤10 000]}` → 202 |
| GET | `/v1/carrier/reputation/{tn}` | carrier | C-R | → `Score` + summary |
| GET | `/v1/carrier/branding/{tn}` | carrier | C-R | terminating-side branded calling → `{display_name,logo_url,call_reason,verified,entity_name,as_of}` |
| GET | `/v1/carrier/numbers/changes?since=` | carrier | C-R | delta feed for SBC caches → `{items:[{e164,e164_end,status,verified,changed_at}]}` |
| **Enterprise** | | | | |
| POST | `/v1/enterprise/entities` | ent | E-W or public with `ENUM_SELF_REGISTER=true` | `RegisterEntityInput` → 201 `Entity` |
| GET | `/v1/enterprise/entity` | ent | E-R | own entity |
| PATCH | `/v1/enterprise/entity` | ent | E-W | contact/address fields (not identifiers after verification) |
| POST | `/v1/enterprise/entity/documents` | ent | E-W | `Document` metadata → 201 |
| GET | `/v1/enterprise/entity/documents` | ent | E-R | list |
| POST | `/v1/enterprise/entity:submit` | ent | E-W | pending→in_review |
| GET | `/v1/enterprise/entity/decisions` | ent | E-R | vetting history |
| GET | `/v1/enterprise/numbers` | ent | E-R | `?status=&q=&cursor=` |
| POST | `/v1/enterprise/numbers` | ent | E-W | `RegisterNumberInput{number|range_start+range_end, use_case, call_reason, proof_ref, branding_id}` → 201 (`pending_verification`) |
| GET | `/v1/enterprise/numbers/{id}` | ent | E-R | |
| PATCH | `/v1/enterprise/numbers/{id}` | ent | E-W | use_case, call_reason, branding_id |
| POST | `/v1/enterprise/numbers/{id}:release` | ent | E-W | → released |
| POST | `/v1/enterprise/numbers:normalize` | ent | E-R | `{raw}` → `{e164,category}` (helper) |
| GET | `/v1/enterprise/brandings` | ent | E-R | |
| POST | `/v1/enterprise/brandings` | ent | E-W | `BrandingInput` → 201 draft |
| PATCH | `/v1/enterprise/brandings/{id}` | ent | E-W | drafts/rejected only |
| POST | `/v1/enterprise/brandings/{id}:submit` | ent | E-W | → pending_review |
| GET | `/v1/enterprise/reputation` | ent | E-R | scores for all own numbers |
| GET | `/v1/enterprise/reputation/{tn}` | ent | E-R | `Explain` output (score, factors, 3 windows, history) |
| POST | `/v1/enterprise/sign` | ent | E-W | `SignRequest` — only own active numbers, delegate cert, attest forced to A |
| GET | `/v1/enterprise/certificates` | ent | E-R | own delegate certs |
| POST | `/v1/enterprise/certificates` | ent | E-W | request delegate cert for own active numbers → 201 |
| GET | `/v1/enterprise/disputes` | ent | E-R | |
| POST | `/v1/enterprise/disputes` | ent | E-W | `OpenDisputeInput{e164,kind,summary,evidence}` → 201 |
| GET | `/v1/enterprise/disputes/{id}` | ent | E-R | with non-internal comments |
| POST | `/v1/enterprise/disputes/{id}/comments` | ent | E-W | `{body}` |
| GET/POST/DELETE | `/v1/enterprise/webhooks[/{id}]` | ent | E-R/E-W | `{url,events}` → secret returned once |
| GET/POST/DELETE | `/v1/enterprise/api-keys[/{id}]` | ent | SESS enterprise_admin | issue enterprise-scoped keys |
| GET/POST | `/v1/enterprise/users[/{id}:disable]` | ent | SESS enterprise_admin | manage own users |
| **Admin** | | | | |
| GET | `/v1/admin/vetting/queue` | admin | ADM | in_review entities |
| GET | `/v1/admin/entities` | admin | ADM | filter status/q |
| GET | `/v1/admin/entities/{id}` | admin | ADM | entity + docs + decisions + numbers count |
| POST | `/v1/admin/entities/{id}:decide` | admin | ADM | `{to:"verified"|"rejected"|"suspended", reason}` |
| PATCH | `/v1/admin/entities/{id}` | admin | ADM | risk_tier, vetting_notes |
| GET | `/v1/admin/numbers` | admin | ADM | all numbers, filter |
| POST | `/v1/admin/numbers/{id}:transition` | admin | ADM | `{to,reason}` (activate/suspend) |
| GET | `/v1/admin/brandings?status=pending_review` | admin | ADM | review queue |
| POST | `/v1/admin/brandings/{id}:review` | admin | ADM | `{approve:bool,note}` |
| GET | `/v1/admin/disputes` | admin | ADM | all, filter status |
| POST | `/v1/admin/disputes/{id}:assign` | admin | ADM | `{reviewer_id}` |
| POST | `/v1/admin/disputes/{id}/comments` | admin | ADM | `{body,internal}` |
| POST | `/v1/admin/disputes/{id}:resolve` | admin | ADM | `{accepted:bool,resolution}` |
| GET | `/v1/admin/reputation?label=` | admin | ADM | numbers by label |
| POST | `/v1/admin/reputation/{tn}:override` | admin | ADM | `{label,reason,expires_at}` |
| DELETE | `/v1/admin/reputation/{tn}/override` | admin | ADM | |
| POST | `/v1/admin/reputation/{tn}:recompute` | admin | ADM | |
| GET | `/v1/admin/certificates` | admin | ADM | all certs |
| POST | `/v1/admin/certificates/sp` | admin | ADM | `{cn,spc,days}` |
| POST | `/v1/admin/certificates/delegate` | admin | ADM | `{entity_id,cn,tns:[TNEntry],days}` |
| POST | `/v1/admin/certificates/{id}:revoke` | admin | ADM | `{reason}` |
| POST | `/v1/admin/trust-anchors` | admin | ADM | `{name,pem}` |
| GET/POST/DELETE | `/v1/admin/api-keys[/{id}]` | admin | ADM | issue any scope |
| GET/POST/PATCH | `/v1/admin/users[/{id}]` | admin | ADM | create operator/enterprise users, reset password, disable |
| GET/PUT | `/v1/admin/settings` | admin | ADM | thresholds, zone name, floors (see §7) |
| GET | `/v1/admin/audit?target_type=&target_id=` | admin | ADM | |
| GET | `/v1/admin/verifications?since=&verstat=` | admin | ADM | verification log |
| GET | `/v1/admin/stats` | admin | ADM | dashboard counters |
| GET/POST/DELETE | `/v1/admin/webhooks[/{id}]` | admin | ADM | operator-level subscriptions |
| **Session** | | | | |
| POST | `/v1/auth/login` | both | none (rate-limited 10/min/IP) | `{email,password}` → sets `enum_session` cookie (HttpOnly, Secure, SameSite=Strict), returns `{user,csrf_token}` |
| POST | `/v1/auth/logout` | both | SESS | |
| GET | `/v1/auth/me` | both | SESS | user + role + entity |
| POST | `/v1/auth/password` | both | SESS | `{current,new}` |
| GET | `/v1/me/notifications` · POST `…/{id}:read` | both | SESS | |
| GET | `/` , `/app/*` | portal | none | embedded SPA (`index.html` fallback) |

Webhook payload: `{"id":"…","event":"dispute.updated","occurred_at":"…","data":{…}}`, headers `X-Enum-Signature: t=<unix>,v1=<hex hmac-sha256(secret, t + "." + body)>`, `X-Enum-Event`, `X-Enum-Delivery`. Retries 1m, 5m, 30m, 2h, 12h then failed.

---

## 6. STIR/SHAKEN and certificate design

### 6.1 Key storage
- All private keys are ECDSA P-256 generated with `crypto/ecdsa` + `crypto/rand`, marshalled PKCS#8 DER, sealed with AES-256-GCM via `platform/crypto.Keyring`. Master key: `ENUM_MASTER_KEY` (base64, 32 bytes) or `ENUM_MASTER_KEY_FILE`; `ENUM_KMS=stub` is the only v1 provider (interface `KMS{ Wrap, Unwrap }` so a cloud KMS can be added). Sealed format `v<ver>:<nonce b64>:<ct b64>`; AAD = key record id. Rotation: `enumaracle keys rewrap --new-master` re-seals all rows (keyring keeps old versions for reads).
- Private keys never leave `pki`. `stir` calls `core.Signer.Sign(cert, signingInput)` and gets raw `r||s`.

### 6.2 Pilot STI-CA (RFC 8226)
- `enumaracle ca init --cn "Enumaracle Pilot STI Root" --years 10` → self-signed root (basicConstraints CA, pathLen 1, keyUsage certSign|crlSign). `ca issue intermediate --years 5` (pathLen 0).
- **SP certificate**: EE cert, keyUsage digitalSignature, extKeyUsage none, **TNAuthList extension** OID `1.3.6.1.5.5.7.1.26` (non-critical) containing `spc` (OID choice [0] IA5String) and, optionally, TN ranges. Subject CN = `SHAKEN <SPC>`, O = operator, C = TR. Validity ≤ 90 days by default (configurable); `enumaracle ca rotate-sp` issues a new one and keeps the old one active until expiry so in-flight PASSporTs still verify.
- ASN.1 (hand-built with `encoding/asn1`):
```go
// TNAuthorizationList ::= SEQUENCE SIZE (1..MAX) OF TNEntry
// TNEntry ::= CHOICE { spc [0] ServiceProviderCode, range [1] TelephoneNumberRange, one [2] TelephoneNumber }
// ServiceProviderCode ::= IA5String ; TelephoneNumber ::= IA5String(SIZE(1..15))
// TelephoneNumberRange ::= SEQUENCE { start TelephoneNumber, count INTEGER (2..MAX) }
var oidTNAuthList = asn1.ObjectIdentifier{1,3,6,1,5,5,7,1,26}
func MarshalTNAuthList(entries []core.TNEntry) ([]byte, error)   // builds RawValues with Class=ContextSpecific, Tag 0/1/2
func ParseTNAuthList(ext []byte) ([]core.TNEntry, error)
func TNAuthCovers(entries []core.TNEntry, tnDigits string, spcOfSigner string) bool // range: start ≤ tn < start+count (same length)
```
- **Delegate certificates (RFC 9060)**: issued by the operator's intermediate to a verified enterprise; TNAuthList contains **only** the enterprise's active numbers/ranges (never an SPC); Subject CN = `<entity legal name> (delegate)`, SAN absent; validity ≤ 1 year. Issuance precondition: entity `verified` and every requested TN entry is covered by an `active` number owned by that entity (checked against `core.NumberStore.FindCovering`). On number release/suspension, `numbers` emits `number.status_changed`; an admin revokes the delegate cert (v1: manual, with a dashboard warning; cert status `revoked` → CRL regenerated).
- x5u: `{BaseURL}/pki/certs/{id}.pem` serving leaf + intermediate (root excluded, per RFC 8226 §4). ETag = sha256 of PEM.
- Revocation: CRL signed by the intermediate (`x509.CreateRevocationList`); verifier checks CRL for own-CA certs (in-process), and `CertStore.Status` for the same cert id.

### 6.3 Signing flow (`stir.SigningService`)
1. Normalize `orig`, `dest` → digits only (strip `+`; keep as-is for `444…`), validate.
2. Pick certificate: enterprise actor → active delegate cert for `actor.EntityID` whose TNAuthList covers `orig` (else 403 `delegate_not_covering`); operator actor → active SP cert. Attestation: enterprise is forced to `A`; operator may pass A/B/C. A/B additionally require `Lookup(orig).Verified` unless `allow_unverified_attest_b=true` setting.
3. Build header `{"alg":"ES256","ppt":"shaken","typ":"passport","x5u":"…"}` and claims `{attest,dest:{tn:[…]},iat,orig:{tn:"…"},origid}`. Per RFC 8225 §4: `orig.tn` is a **string**, `dest.tn` an **array**; claims serialized with keys lexicographically ordered (`encoding/json` of a struct with fields declared in alphabetical order, no whitespace). `origid` = uuid v4 (RFC 8588 §4) unless supplied.
4. JWS compact: `b64url(header) + "." + b64url(payload)`, signature = ECDSA P-256 over SHA-256 of that input, encoded as **raw R||S (64 bytes)**, not DER (RFC 7518 §3.4). Low-S normalization not required; test vectors verify with `ecdsa.Verify` on r,s.
5. If `IncludeRCD`: second PASSporT with `ppt=rcd`, claims `{dest,iat,orig,rcd:{nam, icn? , jcd?}, crn?, rcdi?}` per RFC 9795. `rcd.nam` = approved `Branding.DisplayName`; `icn` = `LogoURL`; `crn` = `CallReason`. `rcdi` included when `icn` present: `{"/icn":"sha256-<b64url(sha256(logo bytes))>"}` using the `LogoSHA256` captured at approval. RCD PASSporT must be signed with a cert whose TNAuthList covers `orig` (same cert as shaken in v1).
6. Identity header values (RFC 8224 §4): `<jws>;info=<x5u>;alg=ES256;ppt=shaken` and `…;ppt=rcd`.

### 6.4 Verification flow (`stir.VerificationService`) → `verstat`
```
parse Identity (jws, info, alg, ppt)        → malformed: 436 Bad Identity Info
alg must be ES256, ppt ∈ {shaken, rcd}      → else 437 Unsupported Credential
header.x5u must equal info param (if both)  → else 436
fetch chain via CertResolver (cache 1h; 5s timeout; https only; max 64KB) → fail: 436
leaf: parse, verify chain to TrustStore pool with x509.VerifyOptions{CurrentTime: ReceivedAt, KeyUsages: ExtKeyUsageAny}; CRL/status check → fail: 437
leaf must carry TNAuthList                 → else 437
signature over signingInput with leaf pubkey (raw r||s) → fail: 438 Invalid Identity Header
iat within ±IatSkew (60s) of ReceivedAt     → stale: 403 Stale Date
claims.orig.tn canonical == From/PAI digits; dest.tn contains To digits (compare after Turkish normalization) → mismatch: 438
TNAuthList covers orig (SPC entry: signer SPC == configured SPC map for that TN prefix, OR range/one covers tn) → else 438 (TN-Validation-Failed)
ppt=rcd: additionally verify rcdi digests if icn present (fetch logo, sha256) → mismatch: RCDIntegrity="failed", verstat Failed
```
Result mapping: all checks pass → `TN-Validation-Passed`; any failure after a syntactically valid PASSporT → `TN-Validation-Failed` with ReasonCode; no Identity header / unsupported → `No-TN-Validation`. Every verification is appended to `verification_log` (async channel, dropped on backpressure with a metric).

### 6.5 Testability without external CAs
- `pki` tests spin the whole chain in-memory (SQLite): root → intermediate → SP + delegate; assert TNAuthList DER against hard-coded hex vectors; round-trip parse; `x509.Verify` chain.
- `stir` tests use `httptest.Server` as x5u host and `CertResolver` configured to that host; golden PASSporT built with a fixed key and fixed `iat`, re-verified; negative vectors for each reason code; RCD vector with `rcdi`.
- `api` tests run `/v1/carrier/sign` then `/v1/carrier/verify` end-to-end against in-memory DB.

---

## 7. Reputation scoring

**Inputs** (per `orig_tn`): call events (CDR batches), label feedback, verification log outcome for the number's own calls, entity/number status. **Windows**: 24h, 7d, 30d recomputed by `reputation.Worker` every `ENUM_REP_INTERVAL` (default 5m) for numbers with activity since last run, and on demand via `Recompute`.

**Features** (computed from `NumberStats` 7d unless noted):
| name | definition |
|---|---|
| `volume_24h` | calls in 24h |
| `volume_7d` | calls in 7d |
| `unique_dest_ratio` | unique_dest / calls (7d), 0 if calls<20 |
| `answer_rate` | answered / calls (7d) |
| `short_call_ratio` | short_calls / answered (7d) |
| `avg_duration` | total_duration / answered seconds |
| `block_rate` | blocked / calls (7d) |
| `complaints_30d` | Σ complaints in 30d |
| `ext_spam` | Σ confidence of spam/suspect feedback (30d), decayed by `0.5^(age_days/14)` |
| `ext_clean` | same for clean feedback |
| `verified` | lookup.Verified |
| `attest_a_ratio` | share of own calls with attest A (7d) |

**Formula (v1)** — start at 100, subtract penalties, add bonuses, clamp to [0,100]. Each term is a `Factor{Name, Value, Weight, Contribution, Note}`; `Contribution` is what was actually subtracted/added, so the sum of contributions reconciles exactly to the score (explainability by construction).

```
penalty_volume      = w_vol(15)  · s(volume_24h, 500, 5000)            // s(x, lo, hi) = clamp((x-lo)/(hi-lo),0,1)
penalty_uniq        = w_uniq(15) · s(unique_dest_ratio, 0.70, 0.97)    // only if calls_7d ≥ 50
penalty_answer      = w_ans(10)  · s(1 - answer_rate, 0.60, 0.90)       // only if calls_7d ≥ 50
penalty_short       = w_short(15)· s(short_call_ratio, 0.30, 0.70)      // only if answered ≥ 20
penalty_block       = w_block(10)· s(block_rate, 0.05, 0.30)
penalty_complaints  = w_cmp(20)  · s(complaints_30d, 2, 25)
penalty_ext         = w_ext(25)  · s(ext_spam - ext_clean, 0.5, 5)
bonus_attest        = +5 · attest_a_ratio                                // only verified
score_raw = 100 - Σ penalties + bonuses
```
Insufficient data (calls_7d < 20 and no feedback): score 70, label `unknown`.

**Thresholds** (settings keys `rep.threshold.*`, defaults): `clean ≥ 70`, `watch 50..69`, `suspect 30..49`, `spam < 30`. Hysteresis: a label only changes if the new score crosses the boundary by ≥ 3 points or stays across it in two consecutive computations (prevents flapping).

**Protection for verified identities**: if `Lookup.Verified` then (a) `floor = rep.verified_floor` (default 60) → score = max(score, floor), `FloorApplied=true`, Factor `verified_floor` shows the raised amount; (b) label can never be auto-set to `spam`; worst automatic label is `suspect`; (c) crossing into `suspect` automatically opens a `Dispute{Kind: label, Status: in_review, OpenedBy: system}` assigned to the review queue and emits `reputation.review_required` instead of `reputation.label_changed`; the operator decides (override or dismiss). Unverified numbers follow thresholds directly. Admin `label_overrides` take precedence over computed labels (with expiry).

**Explain output** (`GET /v1/enterprise/reputation/{tn}`):
```json
{"e164":"+908502221234","score":64,"label":"watch","verified":true,"floor_applied":false,"version":"v1",
 "factors":[{"name":"short_call_ratio","value":0.52,"weight":15,"contribution":-8.3,"note":"52% of answered calls shorter than 6s"},
            {"name":"ext_spam","value":1.2,"weight":25,"contribution":-3.9,"note":"2 carrier spam labels in last 30 days (decayed)"},…],
 "windows":{"24h":{…NumberStats},"7d":{…},"30d":{…}},
 "history":[{"computed_at":"…","score":71,"label":"clean"},…],
 "override":null}
```
Every ingested batch is deduplicated on `(source, call_id)`; `started_at` older than 90 days is rejected; a daily job deletes `call_events` older than `ENUM_REP_RETENTION_DAYS` (default 90) and keeps `score_history` 365 days (KVKK minimization).

---

## 8. ENUM / DNS design (RFC 6116)

- Server: `miekg/dns` on `ENUM_DNS_ADDR` (default `:5353`), UDP and TCP, EDNS0 UDP size 1232, truncation → TCP retry handled by client. Zone `ENUM_DNS_ZONE` (default `e164.enum.example.`; operator sets e.g. `e164.turktelekom.enum.`). Authoritative only, no recursion, no AXFR (REFUSED), rate-limit per source IP (`ENUM_DNS_RPS`, default 2000) → responses dropped with metric.
- Name mapping (RFC 6116 §3.1): `+908502221234` → `4.3.2.1.2.2.2.0.5.8.0.9.e164.turktelekom.enum.` (`+` stripped, digits reversed, dot-separated). The server parses the owner name, re-assembles digits, prepends `+`, and calls `core.LookupService.Lookup`. Short `444xxxx` numbers appear as `+90444xxxx` reversed.
- Records returned for a found number:
```
; NAPTR order pref flags service regexp replacement
$ORIGIN e164.turktelekom.enum.
4.3.2.1.2.2.2.0.5.8.0.9  300 IN NAPTR 10 100 "u" "E2U+sip" "!^.*$!sip:+908502221234@sip.turktelekom.com.tr;verstat=TN-Validation-Passed!" .
4.3.2.1.2.2.2.0.5.8.0.9  300 IN NAPTR 20 100 "u" "E2U+rcd" "!^.*$!https://enum.turktelekom.com.tr/v1/carrier/branding/+908502221234!" .
4.3.2.1.2.2.2.0.5.8.0.9  300 IN TXT   "v=enum1;ver=1;st=active;ent=verified;nm=Acme Bank;rs=Randevu hatirlatma;sc=78;lb=clean;at=2026-11-02T10:00:00Z"
```
  - `verstat` in the SIP URI user-part parameter mirrors the value the operator should treat as **registry-asserted** (`TN-Validation-Passed` if `Verified`, `No-TN-Validation` otherwise; never `Failed` from the registry — failure is only a per-call verification outcome). The E2U+rcd NAPTR (RFC 9795 §11 registers `E2U+rcd`? no — we use a private-use service field documented as such; configurable off) points at the branding JSON.
  - TXT is a compact `;`-separated key=value summary (≤ 255 bytes per string; split automatically); keys documented in API.md; values percent-encoded for `;` and `"`. Operators who only speak NAPTR ignore it.
  - Not found: `NXDOMAIN` with SOA in authority (negative TTL `ENUM_DNS_NEG_TTL` default 60s). Found but `suspended`/`released`: NOERROR with TXT only (`st=suspended`) and **no** NAPTR, so SBCs fall back to plain routing without a verified flag.
  - SOA/NS at apex synthesized from config; `ANY` answered with HINFO (RFC 8482).
- TTLs: positive `ENUM_DNS_TTL` (300s) for active, 60s for pending/suspended; negative 60s. Internal LRU cache (`ENUM_DNS_CACHE_SIZE` 100k entries) keyed by E.164, invalidated by `number.status_changed` / `branding.reviewed` / `reputation.label_changed` events received through an in-process `Invalidate(e164)` hook that `cmd` wires to the EventSink fan-out (cache TTL bounds staleness in any case).
- Metrics: `enum_dns_queries_total{proto,rcode}`, `enum_dns_cache_hits_total`, `enum_dns_lookup_seconds`.
- **SBC integration**: Kamailio `enum.so`: `enum_query("e164.turktelekom.enum.")` then read `$avp(verstat)` from the regexp result or parse `$ru` parameter; OpenSIPS `enum` module similarly; Oracle SBC: configure an ENUM config with the zone and a `lookup` policy; the `verstat` parameter is passed to the terminating UE in `P-Asserted-Identity` (`;verstat=`) as done in SHAKEN deployments. Branded display: SBC/IMS AS calls `/v1/carrier/branding/{tn}` (HTTP, cached by `Cache-Control`) or reads the TXT `nm`/`rs` fields and sets `From` display-name / `Call-Info` with `purpose=jcard`.

---

## 9. Portal information architecture (`web/portal`, Turkish UI)

Stack: React 19, Vite, TypeScript strict, React Router (hash-free, SPA fallback served by Go), plain CSS modules, hand-drawn SVG charts (`<Sparkline>`, `<Bars>`, `<Donut>`), `fetch` wrapper that attaches `X-CSRF-Token` and maps problem+json to toasts. i18n: `src/i18n/tr.ts` only (EN later). Routes under `/app`.

Roles: `operator_admin` (everything), `operator_reviewer` (vetting, brandings, disputes; no api keys/settings/users), `enterprise_admin`, `enterprise_user` (read-only except disputes).

| Area | Page | Role | Key flow |
|---|---|---|---|
| Giriş | `/app/giris` | all | email + şifre → session; 429 on brute force |
| Operatör › Gösterge | `/app/op` | op | counters: bekleyen doğrulama, açık itirazlar, 24s doğrulama Passed/Failed oranı, etiket dağılımı (donut), günlük çağrı hacmi (sparkline) |
| Operatör › Doğrulama kuyruğu | `/app/op/dogrulama`, `/app/op/dogrulama/:id` | op | list in_review → detail: entity fields, VKN/MERSİS check marks, documents, previous decisions, **Onayla / Reddet / Askıya al** with reason (required) |
| Operatör › Numaralar | `/app/op/numaralar` | op | search, filter, activate pending numbers (proof_ref shown), suspend |
| Operatör › Marka onayı | `/app/op/marka` | op | pending brandings with logo preview, approve/reject |
| Operatör › İtirazlar | `/app/op/itirazlar/:id?` | op | queue, assign, internal notes, resolve/reject; shows Explain panel inline |
| Operatör › İtibar | `/app/op/itibar` | op | numbers by label; override with expiry; recompute |
| Operatör › Sertifikalar | `/app/op/sertifika` | op_admin | SP/delegate certs, expiry warnings, issue delegate wizard (pick entity → numbers → days), revoke |
| Operatör › API anahtarları | `/app/op/anahtarlar` | op_admin | issue (shown once), scopes, revoke |
| Operatör › Kullanıcılar | `/app/op/kullanicilar` | op_admin | create operator / enterprise users |
| Operatör › Ayarlar | `/app/op/ayarlar` | op_admin | thresholds, floor, zone, iat skew, self-register toggle |
| Operatör › Denetim | `/app/op/denetim` | op_admin | audit search |
| Kurum › Özet | `/app/kurum` | ent | entity status banner (pending/in_review/verified…), numbers count, score sparkline |
| Kurum › Kuruluş | `/app/kurum/kurulus` | ent | identifiers, documents metadata, **Doğrulamaya gönder** |
| Kurum › Numaralar | `/app/kurum/numaralar` | ent | add single/range (live normalize preview), use case, release |
| Kurum › Marka | `/app/kurum/marka` | ent | brandings CRUD, submit; preview card "nasıl görünecek" |
| Kurum › İtibar | `/app/kurum/itibar/:tn?` | ent | per-number score, factors table with notes, 3 windows, history chart |
| Kurum › İtirazlar | `/app/kurum/itirazlar/:id?` | ent | open from reputation page, comment thread |
| Kurum › Entegrasyon | `/app/kurum/entegrasyon` | ent_admin | API keys, webhooks (secret once), delegate certificate request, sample sign call |
| Hesap | `/app/hesap` | all | password, notifications |

Every destructive action requires a reason + confirm dialog; nothing is deleted, only status-transitioned (audit trail). Build: `npm ci && npm run build` → `web/dist/`; `web/embed.go`: `//go:embed all:dist` `var FS embed.FS`; committed `web/dist/index.html` placeholder ("Portal henüz derlenmedi") keeps `go build` green; `.gitattributes` marks `web/dist/**` as generated.

---

## 10. Build / run

**Makefile targets**: `build` (CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(git describe)"), `test` (`go test ./... -race -count=1`), `test-pg` (runs integration tests when `ENUM_TEST_PG_DSN` set, else skip), `lint` (`go vet`, `gofmt -l`), `portal` (npm build), `all` (portal + build), `run` (dev with SQLite), `ca-init`, `seed` (demo data: 3 entities, 12 numbers, 10k CDRs), `openapi-lint` (stdlib YAML round-trip + route/operation cross-check test in `api`), `docker`, `release`.

**Config** (env, flag overrides with same name lower-kebab):
| Var | Default | Meaning |
|---|---|---|
| `ENUM_HTTP_ADDR` | `:8080` | API + portal |
| `ENUM_METRICS_ADDR` | `:9090` | Prometheus (separate listener) |
| `ENUM_DNS_ADDR` / `ENUM_DNS_ZONE` / `ENUM_DNS_TTL` / `ENUM_DNS_NEG_TTL` / `ENUM_DNS_RPS` / `ENUM_DNS_CACHE_SIZE` | `:5353` / `e164.enum.example.` / 300 / 60 / 2000 / 100000 | ENUM |
| `ENUM_DNS_SIP_DOMAIN` | `sip.example.com` | host part of NAPTR SIP URI |
| `ENUM_DB_DSN` | `file:enumaracle.db?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)` | `postgres://…` switches dialect |
| `ENUM_MASTER_KEY` / `ENUM_MASTER_KEY_FILE` | required | 32-byte base64 |
| `ENUM_BASE_URL` | `http://localhost:8080` | used in x5u, webhooks, emails |
| `ENUM_SPC` | `TR-EXAMPLE` | operator SPC placed in SP certs |
| `ENUM_IAT_SKEW` | `60s` | RFC 8224 freshness |
| `ENUM_SESSION_TTL` | `12h` | |
| `ENUM_SELF_REGISTER` | `false` | public enterprise registration |
| `ENUM_REP_INTERVAL` / `ENUM_REP_RETENTION_DAYS` | `5m` / `90` | |
| `ENUM_SMTP_URL` | `` | empty → log stub |
| `ENUM_LOG_LEVEL` / `ENUM_LOG_FORMAT` | `info` / `json` | |
| `ENUM_ADMIN_EMAIL` / `ENUM_ADMIN_PASSWORD` | `` | bootstrap first operator_admin on empty DB |

**Dockerfile**: stage 1 `node:22-alpine` builds portal; stage 2 `golang:1.24-alpine` copies `web/dist` and builds static binary; stage 3 `gcr.io/distroless/static` runs as non-root, exposes 8080, 9090, 5353/udp+tcp, volume `/data`. **docker-compose**: `enumaracle` + `postgres:16` + optional `prometheus`; profile `sqlite` runs alone. **k8s** (`deploy/k8s/`): Namespace, Secret (master key, DSN), ConfigMap (env), Deployment (2 replicas, readiness `/readyz`, liveness `/healthz`, `terminationGracePeriodSeconds: 30`), Service (ClusterIP 8080/9090), Service `LoadBalancer` for DNS 53 UDP/TCP → 5353, Ingress for API/portal with TLS, ServiceMonitor. Workers (reputation, webhook dispatcher) use a DB lease (`settings` row `lease.<name>` with expiry) so only one replica runs each. Backup (`docs/BACKUP.md`): SQLite `sqlite3 .backup` via `enumaracle backup --out` (uses `VACUUM INTO`), Postgres `pg_dump`; master key stored separately; restore procedure + `enumaracle keys verify`.

Graceful shutdown: SIGTERM → stop accepting (HTTP `Shutdown` 25s, DNS `ShutdownContext`), drain workers, close DB.

---

## 11. Risks and the 5 most likely parallel-integration failures

| # | Failure point | Why it happens | Mitigation (built into this design) |
|---|---|---|---|
| 1 | **Import cycles / interface drift** between feature packages (numbers↔reputation, stir↔pki, disputes↔identity) | Agents reach for each other's concrete types | `core` holds every type and interface and is frozen on day 0; feature packages may import only `core` and `platform`; `go vet` + a `tests/depcheck_test.go` that parses import graphs with `go/build` and fails on any `internal/<feature>` → `internal/<other feature>` edge. Constructor signatures listed in §4 are fixed; `cmd/main.go` is written by A0 on day 0 against stubs (`core` provides `nop` implementations for every interface) so the binary compiles before any feature lands. |
| 2 | **Migration collisions and non-portable SQL** (two agents editing one file; `RETURNING`, `SERIAL`, `NOW()`, `ILIKE`, boolean literals) | SQLite accepts things Postgres rejects and vice versa | One migration file per package with reserved prefix; `platform/db` runs a `TestPortableSQL` that scans all embedded migrations and every `.go` file for a denylist regex; the integration test matrix runs each package's store tests on SQLite always and on Postgres when `ENUM_TEST_PG_DSN` is set in CI (a Postgres service container in GitHub Actions; no Docker needed locally). Placeholders only `?`, rebinding centralised. |
| 3 | **Route/handler/openapi mismatch and auth scope mistakes** | A9 writes handlers while A2 defines scopes; agents document routes they never wired | `api` has `TestRoutesMatchOpenAPI`: walks the OpenAPI document and asserts every `method+path` is registered in the mux (and vice versa), and that every operation declares exactly one of the security schemes; `TestScopeMatrix` hits each route with each key scope and expects 200/403 per the §5 table encoded as a Go map. |
| 4 | **Crypto interop errors** (DER vs raw ECDSA signature, claim key ordering, `orig.tn` string vs `dest.tn` array, base64url padding, TNAuthList tagging) | Subtle RFC details, no external verifier available | Golden vectors checked into `internal/stir/testdata` generated once with a known key and verified independently in the test with `ecdsa.Verify` on decoded r,s; TNAuthList DER hex vectors in `pki/testdata` cross-checked with `openssl asn1parse` output committed as a comment; strict JSON encoder (struct fields in lexical order, `SetEscapeHTML(false)`); verification tests include a negative case for each RFC 8224 reason code. |
| 5 | **Embed and build breakage** (missing `web/dist`, Node unavailable, agents editing `go.mod`) | Portal build is slow/optional; a tempting `go get` | Committed `web/dist/index.html` placeholder plus `//go:embed all:dist`; CI job "go-only" builds without Node; `go.mod`/`go.sum` are protected by a CI step `git diff --exit-code go.mod go.sum` and `go mod verify`; `-mod=readonly` in Makefile. |

Other risks: (6) worker duplication across replicas → DB lease; (7) reputation worker cost on large CDR tables → indexes on `(orig_tn, started_at)`, windowed aggregates only for numbers with recent activity; (8) ENUM UDP amplification → rate limit, no ANY expansion, small TXT; (9) legal: branding names and logos must not impersonate others → branding review step is mandatory, display names checked against other verified entities' names (case-insensitive Turkish fold); (10) key compromise → master key rotation command, short-lived SP certs, CRL, audit of every signing call via `signing_log`.

Definition of done per package: `go test ./internal/<pkg>/...` green on SQLite; store tests tagged for Postgres; exported constructor matches §4; migration file prefix reserved; handlers (if any) covered by `api` scope matrix; no new deps; `gofmt`/`go vet` clean.

