# Enumaracle — Technical Design Proposal (operator network & operations angle)

> Enumaracle is a single Go 1.24 binary (stdlib net/http, miekg/dns, modernc sqlite / pgx) that gives a telecom operator a verified-caller-identity, number-reputation and branded-calling platform. The design splits the monorepo at enumaracle/ into eleven packages with disjoint directories, disjoint URL-prefix ownership and one reserved migration prefix each, so 8–10 agents can implement in parallel against a frozen internal/core contract (types, enums, store/service interfaces, errors) that is written and merged first. The call-time hot path (REST lookup and ENUM/DNS NAPTR+TXT) never touches the database: a lock-free in-memory snapshot of numbers, ranges, branding and scores is refreshed incrementally from the store every second, giving sub-millisecond p99 for both HTTP and UDP lookups. STIR/SHAKEN is implemented by hand on crypto/ecdsa and encoding/asn1: PASSporT shaken and rcd (RFC 8225/8588/9795), a pilot STI-CA (root + intermediate), SP certificates with TNAuthList (RFC 8226) and delegate certificates for enterprises (RFC 9060), with all private keys AES-256-GCM encrypted under a master key from env/KMS stub. Reputation ingests CDR batches (millions/day) through a batching writer into hourly rollups, scores numbers with an explainable 0–100 penalty model, floors verified identities, and routes them to a separate review path with disputes, webhooks (HMAC) and an email stub. The same portable SQL subset runs on SQLite (pilot) and PostgreSQL (production) with '?' placeholders rebound at runtime, embedded migrations, Prometheus metrics, JSON logs, health endpoints and graceful shutdown. A React 19 + Vite Turkish portal is embedded via go:embed with a committed placeholder so the Go build never breaks. The document closes with the five most likely parallel-integration failure points (dependency drift, migration/schema collisions, core interface churn, mux pattern conflicts, SQL dialect leaks) and concrete mitigations such as a route registry test against openapi.yaml and a dual-dialect migration test.

# Enumaracle — Technical Design Proposal

Angle: telecom network/operations. Call-time lookups < 5 ms (target p99 < 1 ms, no DB on the hot path), SBC/softswitch integration via ENUM and REST, millions of CDR events/day, single binary, SQLite pilot → PostgreSQL production with no code change.

Conventions used everywhere (frozen in `internal/core`):
- IDs: UUIDv7 strings generated in Go (`core.NewID()` via `github.com/google/uuid`). Timestamps: TEXT RFC3339 UTC with microseconds (`core.Now()` → `2026-11-02T10:11:12.123456Z`), lexicographically sortable.
- Telephone numbers stored as E.164 **without** `+` in `tn` columns (`905321234567`); API accepts any Turkish form and echoes `+905321234567`.
- JSON: snake_case; pagination `?limit=&cursor=` → `{"items":[],"next_cursor":""}`; errors are `application/problem+json`.
- SQL: portable subset only (TEXT, BIGINT, REAL, BOOLEAN, TEXT JSON). `?` placeholders; `db.Rebind` converts to `$n` for Postgres. `INSERT … ON CONFLICT … DO UPDATE` and `CREATE INDEX IF NOT EXISTS` are allowed (both engines). No `AUTOINCREMENT`, no `SERIAL`, no `NOW()`, no `ILIKE`, no `RETURNING`.

---

## 1. Package layout and ownership

```
enumaracle/
├── go.mod go.sum                      (A0, frozen; nobody adds deps)
├── Makefile Dockerfile docker-compose.yml .dockerignore
├── cmd/enumaracle/main.go             (A0) wiring only
├── internal/core/                     (A0) shared contract: types, enums, interfaces, errors, ids, tn normalization
├── internal/platform/                 (A0) config, logging, metrics, db open/migrate, router, middleware, problem+json, idempotency, jobs
│   └── migrations/0001_platform.sql
├── internal/identity/                 (A1) entity KYC/vetting, TR identifiers, documents   migrations/0100_identity.sql
├── internal/registry/                 (A2) numbers, ranges, branding, lookup snapshot        migrations/0200_registry.sql
├── internal/pki/                      (A3) keys, CA, certs, TNAuthList, delegate certs       migrations/0300_pki.sql
├── internal/passport/                 (A3) pure PASSporT/JWS/RCD sign+verify (no DB)
├── internal/reputation/               (A4) event ingest, rollups, scoring, labels            migrations/0400_reputation.sql
├── internal/disputes/                 (A5) remediation tickets, comments                     migrations/0500_disputes.sql
├── internal/notify/                   (A5) webhooks + email stub + delivery worker           migrations/0600_notify.sql
├── internal/auth/                     (A6) users, sessions, api keys, settings/audit HTTP    migrations/0700_auth.sql
├── internal/enumdns/                  (A7) DNS server (NAPTR/TXT) over lookup snapshot
├── internal/portal/                   (A8) embed.go + dist/index.html placeholder (committed)
├── portal/                            (A8) React 19 + Vite + TS source
├── docs/                              (A9) README.md(TR) ARCHITECTURE.md API.md openapi.yaml KURULUM.md SATIS.md DEMO.md
├── deploy/k8s/                        (A0) manifests
└── testdata/                          (shared fixtures: sample CDR csv, certs produced by pki test helper)
```

Responsibilities (one paragraph each):

- **core** — Only types, enums, interfaces, sentinel errors, `NewID/Now`, `NormalizeTN` (Turkish-aware) and validators for VKN/TCKN/MERSİS. No I/O, no imports of other internal packages. Written first by A0, reviewed by all agents, then frozen; changes after freeze require A0 and bump `core.ContractVersion`.
- **platform** — `Config` (env+flags), `slog` JSON logger, Prometheus registry, `DB` wrapper (open sqlite/pg, `Rebind`, tx helper, single-writer pool for sqlite), migration runner (`schema_migrations`), `Router` (wraps `http.ServeMux`, records method/path/scope for the OpenAPI conformance test), middleware (request id, recover, auth → `core.Principal`, scope check, rate limit, idempotency, CSRF, problem+json), `Jobs` scheduler, HTTP server with graceful shutdown. Owns `audit_log`, `settings`, `idempotency_keys`.
- **identity** — Entity lifecycle `pending → in_review → verified | rejected | suspended` (+ reinstate), document metadata, decisions with audit, TR identifier validation, HTTP handlers for `/v1/enterprise/entity*`, `/v1/admin/vetting*`, `/v1/admin/entities*`.
- **registry** — Numbers and ranges, status lifecycle, use case, branding with approval, the **LookupService** in-memory snapshot (authoritative "who owns, verified?, what to display"), HTTP for `/v1/enterprise/numbers*`, `/v1/enterprise/branding*`, `/v1/carrier/lookup*`, `/v1/admin/numbers*`, `/v1/admin/branding*`, `/v1/admin/enum*`.
- **pki** — Key generation (P-256), AES-GCM key custody, pilot STI-CA root+intermediate, SP certs with TNAuthList, delegate certs (RFC 9060) for verified entities, cert serving (`/certs/*`), chain building, revocation list, HTTP for `/v1/admin/pki*`, `/v1/enterprise/certificates*`.
- **passport** — Compact JWS by hand (ES256 r||s), `shaken` and `rcd` PASSporT build/parse/verify, canonical JSON, Identity header format/parse, verification policy (iat window, orig/dest match, chain to roots, TNAuthList coverage) producing `verstat`. Exposed via `core.SigningService`/`core.VerificationService`; HTTP for `/v1/carrier/verify`, `/v1/carrier/sign`, `/v1/enterprise/rcd/sign`.
- **reputation** — CDR batch ingest (buffered writer), hourly rollups, label/complaint feedback, scoring job, explainable scores, overrides, HTTP for `/v1/carrier/events`, `/v1/carrier/labels`, `/v1/carrier/reputation*`, `/v1/enterprise/reputation*`, `/v1/admin/reputation*`.
- **disputes** — Ticket workflow `open → in_review → resolved | rejected`, comments (internal/external), notifications via `core.Notifier`, HTTP for `/v1/enterprise/disputes*`, `/v1/admin/disputes*`.
- **notify** — Webhook subscriptions, HMAC-signed deliveries with retry worker, email stub (logs + stores), HTTP for `/v1/enterprise/webhooks*`, `/v1/admin/webhooks*`.
- **auth** — Users (argon2id), cookie sessions + CSRF, API keys (hashed, scoped, rate limit params), implements `core.Authenticator`; HTTP for `/auth/*`, `/v1/admin/apikeys*`, `/v1/enterprise/apikeys*`, `/v1/admin/users*`, `/v1/admin/settings*`, `/v1/admin/audit`.
- **enumdns** — miekg/dns UDP+TCP server, zone from config, NAPTR/TXT/SOA/NS synthesis from `core.LookupService`, negative caching, metrics, HTTP-less.
- **portal** / **docs** — React build embedded; sales/ops docs and OpenAPI.

Ownership boundaries for parallel agents: an agent writes only inside its directories, its one migration file, its own test files, and its own `testdata/<pkg>/`. Cross-package use goes through `core` interfaces only (never import a sibling feature package). `cmd/enumaracle/main.go` is edited only by A0 and contains one `Mount(...)` call per package added at integration time. Each feature package exports exactly:

```go
func New(deps Deps) *Service                     // Deps is a struct of core interfaces + *platform.DB
func (s *Service) Mount(r *platform.Router)      // registers routes under the prefixes it owns
func (s *Service) Start(ctx context.Context) error // background jobs, may be no-op
var Migrations embed.FS                           // embeds migrations/*.sql
```

---

## 2. Domain model (`internal/core/types.go`)

```go
package core

type Attest string
const ( AttestA Attest = "A"; AttestB Attest = "B"; AttestC Attest = "C" )

type Verstat string
const (
	VerstatPassed Verstat = "TN-Validation-Passed"
	VerstatFailed Verstat = "TN-Validation-Failed"
	VerstatNone   Verstat = "No-TN-Validation"
)

// ---- identity ----
type EntityStatus string
const (
	EntityPending   EntityStatus = "pending"
	EntityInReview  EntityStatus = "in_review"
	EntityVerified  EntityStatus = "verified"
	EntityRejected  EntityStatus = "rejected"
	EntitySuspended EntityStatus = "suspended"
)
type Entity struct {
	ID, LegalName, TradeName string
	Country      string // ISO 3166-1 alpha-2, "TR"
	VKN          string // 10 digits, checksum validated (TR)
	MERSIS       string // 16 digits (TR)
	TCKNEnc      []byte // optional, AES-GCM encrypted; never returned in APIs, only tckn_present bool
	TCKNHash     string // sha256 for dedup
	Sector, Website, AddressLine, City, PostalCode string
	ContactName, ContactEmail, ContactPhone string
	Status       EntityStatus
	RiskTier     string // low|medium|high (set by reviewer)
	SubmittedAt, VettedAt, VettedBy, RejectReason string
	CreatedAt, UpdatedAt string
}
type DocumentKind string
const ( DocTaxCertificate DocumentKind = "tax_certificate"; DocTradeRegistry DocumentKind = "trade_registry"
	DocSignatureCircular DocumentKind = "signature_circular"; DocAuthorizationLetter DocumentKind = "authorization_letter"; DocOther DocumentKind = "other" )
type EntityDocument struct {
	ID, EntityID string; Kind DocumentKind
	FileName, MimeType, Sha256, StorageRef string; SizeBytes int64
	UploadedBy, CreatedAt string
}
type VettingDecision struct {
	ID, EntityID string; FromStatus, ToStatus EntityStatus
	ReviewerID, Note, CreatedAt string
}

// ---- registry ----
type NumberStatus string
const (
	NumberPending   NumberStatus = "pending_verification"
	NumberActive    NumberStatus = "active"
	NumberSuspended NumberStatus = "suspended"
	NumberReleased  NumberStatus = "released"
)
type UseCase string
const ( UseCustomerService UseCase = "customer_service"; UseAppointment UseCase = "appointment_reminder"; UseDelivery UseCase = "delivery"
	UseCollections UseCase = "collections"; UseMarketing UseCase = "marketing"; UseSurvey UseCase = "survey"; UseOTPCallback UseCase = "otp_callback"
	UseEmergency UseCase = "emergency"; UseOther UseCase = "other" )
type Number struct {
	ID, EntityID string
	RangeStart   string // E.164 digits; single number => RangeStart==RangeEnd
	RangeEnd     string
	Count        int64
	Kind         string // mobile|geographic|non_geographic_850|short_444|intl|other
	UseCase      UseCase
	CallReason   string
	Status       NumberStatus
	Source       string // self_declared|carrier_confirmed
	Attest       Attest // A if carrier_confirmed+verified entity, else B
	BrandingID   string // optional override, else entity default branding
	SuspendReason, ActivatedAt, SuspendedAt, ReleasedAt string
	CreatedAt, UpdatedAt string
}
type BrandingStatus string
const ( BrandingDraft BrandingStatus = "draft"; BrandingApproved BrandingStatus = "approved"; BrandingRejected BrandingStatus = "rejected" )
type Branding struct {
	ID, EntityID string
	DisplayName  string // <= 32 chars (CNAM-friendly), Turkish letters allowed
	LogoURL      string // https, <= 512
	CallReason   string // <= 64
	IsDefault    bool
	Status       BrandingStatus
	ReviewNote, ReviewedBy, ReviewedAt, CreatedAt, UpdatedAt string
}
type LookupResult struct {
	TN           string `json:"tn"`           // +90…
	Found        bool   `json:"found"`
	EntityID     string `json:"entity_id,omitempty"`
	EntityName   string `json:"entity_name,omitempty"`
	Verified     bool   `json:"verified"`
	NumberStatus NumberStatus `json:"number_status,omitempty"`
	Attest       Attest `json:"attest,omitempty"`
	UseCase      UseCase `json:"use_case,omitempty"`
	DisplayName  string `json:"display_name,omitempty"`
	LogoURL      string `json:"logo_url,omitempty"`
	CallReason   string `json:"call_reason,omitempty"`
	Score        int    `json:"score"`       // 0..100, 100 when unknown? no: -1 unknown
	Label        ReputationLabel `json:"label"`
	Verstat      Verstat `json:"verstat"`
	TTLSeconds   int    `json:"ttl"`
	SnapshotAt   string `json:"snapshot_at"`
}

// ---- pki / passport ----
type KeyKind string
const ( KeyCARoot KeyKind = "ca_root"; KeyCAIntermediate KeyKind = "ca_intermediate"; KeySP KeyKind = "sp"; KeyDelegate KeyKind = "delegate" )
type Key struct {
	ID string; Kind KeyKind; Alg string // "ES256"
	PublicPEM string; PrivateEnc []byte // nonce||ciphertext, AES-256-GCM, AAD=ID
	Status    string // active|retired|compromised
	CreatedAt, RetiredAt string
}
type CertKind string
const ( CertRoot CertKind = "root"; CertIntermediate CertKind = "intermediate"; CertSP CertKind = "sp"; CertDelegate CertKind = "delegate" )
type TNEntry struct { SPC string `json:"spc,omitempty"`; Start string `json:"start,omitempty"`; Count int64 `json:"count,omitempty"`; TN string `json:"tn,omitempty"` }
type Certificate struct {
	ID, KeyID string; Kind CertKind
	EntityID     string // delegate only
	IssuerCertID string
	SerialHex, SubjectCN, SPC string
	TNAuthList   []TNEntry
	NotBefore, NotAfter string
	PEM, ChainPEM string // leaf; leaf+intermediates
	URL          string // x5u
	Status       string // active|revoked|expired
	RevokedAt, RevokeReason, CreatedAt string
}
type SignRequest struct {
	OrigTN, DestTN string; Attest Attest; OrigID string // empty => uuid per call
	WithRCD bool; RCD *RCDClaims
}
type RCDClaims struct { Nam string `json:"nam"`; Jcl string `json:"jcl,omitempty"`; Crn string `json:"crn,omitempty"` }
type SignResult struct {
	Identity string // full SIP Identity header value
	Passport string // compact JWS
	RCDIdentity, RCDPassport string
	CertID, X5U string; Attest Attest; OrigID string; IAT int64
}
type VerifyRequest struct { Identity string; FromTN, ToTN string; Date string }
type VerifyCheck struct { Name string `json:"name"`; OK bool `json:"ok"`; Detail string `json:"detail,omitempty"` }
type VerifyResult struct {
	Verstat Verstat; Attest Attest; OrigID, SPC, CertID, Reason string
	RCD *RCDClaims; RCDVerified bool; Checks []VerifyCheck; IAT int64
}

// ---- reputation ----
type ReputationLabel string
const ( LabelClean ReputationLabel = "clean"; LabelWatch ReputationLabel = "watch"; LabelSuspect ReputationLabel = "suspect"; LabelSpam ReputationLabel = "spam"; LabelUnknown ReputationLabel = "unknown" )
type CallEvent struct {
	ID, BatchID, SourceID string // SourceID = api key id of the reporting carrier
	OrigTN, DestTN string
	StartedAt     string
	Disposition   string // answered|no_answer|busy|rejected|failed|blocked
	DurationSec   int64
	Verstat       Verstat // as observed by the carrier, optional
}
type HourlyStat struct {
	TN, HourStart string
	Calls, Answered, Short, Failed int64; DurationSec int64
	UniqueDests int64 // exact within flushed batch, merged additively (documented approximation)
	Complaints int64
}
type FeedbackKind string
const ( FeedbackLabel FeedbackKind = "label"; FeedbackComplaint FeedbackKind = "complaint"; FeedbackBlock FeedbackKind = "block" )
type LabelFeedback struct {
	ID, TN, SourceID, SourceName string; Kind FeedbackKind
	Label ReputationLabel; Confidence float64; Reason string
	ReportedAt, ExpiresAt, CreatedAt string
}
type Factor struct {
	Code string `json:"code"`; Value float64 `json:"value"`; Threshold float64 `json:"threshold"`
	Penalty int `json:"penalty"`; MaxPenalty int `json:"max_penalty"`
	TextTR string `json:"text_tr"`; TextEN string `json:"text_en"`
}
type Score struct {
	TN string; Score, RawScore int; Label ReputationLabel
	Floored bool; OverrideLabel ReputationLabel; OverrideUntil string
	Factors []Factor; Version string; ComputedAt string
	Calls24h, Calls7d int64
}
type ScoreOverride struct { TN, Label string; Reason, SetBy, Until, CreatedAt string }

// ---- disputes ----
type DisputeStatus string
const ( DisputeOpen DisputeStatus = "open"; DisputeInReview DisputeStatus = "in_review"; DisputeResolved DisputeStatus = "resolved"; DisputeRejected DisputeStatus = "rejected" )
type Dispute struct {
	ID, EntityID, TN string
	Kind   string // label|suspension|branding|lookup|other
	Status DisputeStatus
	Title, Description, Resolution string
	OpenedBy, AssignedTo, ResolvedBy, ResolvedAt string
	CreatedAt, UpdatedAt string
}
type DisputeComment struct { ID, DisputeID, AuthorID, AuthorRole, Body string; Internal bool; CreatedAt string }

// ---- notify ----
type Webhook struct {
	ID, OwnerKind, OwnerID string // entity|operator
	URL string; SecretEnc []byte; Events []string; Active bool; CreatedAt, UpdatedAt string
}
type WebhookDelivery struct {
	ID, WebhookID, EventType, PayloadJSON string; Attempt int
	Status string // pending|delivered|failed|dead
	NextAt, LastCode, LastError, CreatedAt, DeliveredAt string
}
type Event struct { Type string `json:"type"`; ID string `json:"id"`; At string `json:"at"`; EntityID string `json:"entity_id,omitempty"`; Data any `json:"data"` }

// ---- auth ----
type Role string
const ( RoleOperatorAdmin Role = "operator_admin"; RoleOperatorAnalyst Role = "operator_analyst"; RoleEnterpriseOwner Role = "enterprise_owner"; RoleEnterpriseUser Role = "enterprise_user" )
type Scope string
const ( ScopeCarrierRead Scope = "carrier:read"; ScopeCarrierWrite Scope = "carrier:write"; ScopeEnterpriseRead Scope = "enterprise:read"; ScopeEnterpriseWrite Scope = "enterprise:write"; ScopeAdmin Scope = "admin"; ScopeSession Scope = "session" )
type User struct { ID, Email, PasswordHash, Name string; Role Role; EntityID string; Active bool; Locale, LastLoginAt, CreatedAt, UpdatedAt string }
type Session struct { IDHash, UserID, CSRFToken, IP, UserAgent, ExpiresAt, CreatedAt string }
type APIKey struct {
	ID, Prefix, SecretHash, Name, OwnerKind, OwnerID string // owner: operator|entity
	Scopes []Scope; RateRPS, RateBurst int
	ExpiresAt, LastUsedAt, RevokedAt, CreatedAt string
}
type Principal struct {
	Kind string // user|apikey|system|anonymous
	ID string; Role Role; EntityID string; Scopes []Scope; KeyID, SessionCSRF string
}
type AuditEvent struct {
	ID, At, ActorKind, ActorID, Action, TargetKind, TargetID, IP, RequestID string
	BeforeJSON, AfterJSON string
}
type Setting struct { Key, ValueJSON, UpdatedBy, UpdatedAt string }
```

Sentinel errors (`core/errors.go`): `ErrNotFound, ErrConflict, ErrInvalid (wraps field errors), ErrForbidden, ErrUnauthorized, ErrState (illegal transition), ErrRateLimited`. `platform` maps them to 404/409/422/403/401/409/429 problem+json.

---

## 3. Database schema

All tables: `CREATE TABLE IF NOT EXISTS`. `BOOLEAN` written as `0/1` from Go (`sql.NullBool` works on both). JSON in TEXT.

**0001_platform.sql** (platform)
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_kind TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  target_kind TEXT, target_id TEXT, ip TEXT, request_id TEXT, before_json TEXT, after_json TEXT);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS ix_audit_target ON audit_log(target_kind, target_id, at);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL, principal_id TEXT NOT NULL, request_hash TEXT NOT NULL,
  status_code BIGINT, response_body TEXT, created_at TEXT NOT NULL, PRIMARY KEY (key, principal_id));
CREATE INDEX IF NOT EXISTS ix_idem_created ON idempotency_keys(created_at);
```

**0100_identity.sql** (identity)
```sql
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, legal_name TEXT NOT NULL, trade_name TEXT, country TEXT NOT NULL,
  vkn TEXT, mersis TEXT, tckn_enc TEXT, tckn_hash TEXT, sector TEXT, website TEXT,
  address_line TEXT, city TEXT, postal_code TEXT, contact_name TEXT, contact_email TEXT NOT NULL, contact_phone TEXT,
  status TEXT NOT NULL, risk_tier TEXT, submitted_at TEXT, vetted_at TEXT, vetted_by TEXT, reject_reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entities_vkn ON entities(country, vkn);
CREATE INDEX IF NOT EXISTS ix_entities_status ON entities(status, submitted_at);
CREATE TABLE IF NOT EXISTS entity_documents (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, kind TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT,
  sha256 TEXT NOT NULL, size_bytes BIGINT NOT NULL, storage_ref TEXT, uploaded_by TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_docs_entity ON entity_documents(entity_id);
CREATE TABLE IF NOT EXISTS vetting_decisions (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL,
  reviewer_id TEXT, note TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_vet_entity ON vetting_decisions(entity_id, created_at);
```
`tckn_enc` stored base64 TEXT (BLOB is not in the portable subset).

**0200_registry.sql** (registry)
```sql
CREATE TABLE IF NOT EXISTS numbers (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, range_start TEXT NOT NULL, range_end TEXT NOT NULL, count BIGINT NOT NULL,
  kind TEXT NOT NULL, use_case TEXT NOT NULL, call_reason TEXT, status TEXT NOT NULL, source TEXT NOT NULL, attest TEXT NOT NULL,
  branding_id TEXT, suspend_reason TEXT, activated_at TEXT, suspended_at TEXT, released_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_numbers_entity ON numbers(entity_id, status);
CREATE INDEX IF NOT EXISTS ix_numbers_start ON numbers(range_start);
CREATE INDEX IF NOT EXISTS ix_numbers_updated ON numbers(updated_at);
CREATE TABLE IF NOT EXISTS branding (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, display_name TEXT NOT NULL, logo_url TEXT, call_reason TEXT,
  is_default BOOLEAN NOT NULL, status TEXT NOT NULL, review_note TEXT, reviewed_by TEXT, reviewed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_branding_entity ON branding(entity_id, status);
CREATE INDEX IF NOT EXISTS ix_branding_updated ON branding(updated_at);
```
Overlap check (no two non-released rows whose ranges intersect) is done in Go inside the write transaction (`SELECT … WHERE range_start <= ? AND range_end >= ? AND status <> 'released'`), not by constraint.

**0300_pki.sql** (pki)
```sql
CREATE TABLE IF NOT EXISTS pki_keys (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, alg TEXT NOT NULL, public_pem TEXT NOT NULL, private_enc TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, retired_at TEXT);
CREATE TABLE IF NOT EXISTS pki_certificates (
  id TEXT PRIMARY KEY, key_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT, issuer_cert_id TEXT,
  serial_hex TEXT NOT NULL, subject_cn TEXT NOT NULL, spc TEXT, tn_auth_list_json TEXT NOT NULL,
  not_before TEXT NOT NULL, not_after TEXT NOT NULL, pem TEXT NOT NULL, chain_pem TEXT NOT NULL, url TEXT NOT NULL,
  status TEXT NOT NULL, revoked_at TEXT, revoke_reason TEXT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cert_serial ON pki_certificates(issuer_cert_id, serial_hex);
CREATE INDEX IF NOT EXISTS ix_cert_entity ON pki_certificates(entity_id, status);
CREATE INDEX IF NOT EXISTS ix_cert_kind ON pki_certificates(kind, status);
CREATE TABLE IF NOT EXISTS pki_trusted_roots (id TEXT PRIMARY KEY, name TEXT NOT NULL, pem TEXT NOT NULL, added_by TEXT, created_at TEXT NOT NULL);
```

**0400_reputation.sql** (reputation)
```sql
CREATE TABLE IF NOT EXISTS call_events (
  id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, source_id TEXT NOT NULL, orig_tn TEXT NOT NULL, dest_tn TEXT NOT NULL,
  started_at TEXT NOT NULL, disposition TEXT NOT NULL, duration_sec BIGINT NOT NULL, verstat TEXT);
CREATE INDEX IF NOT EXISTS ix_events_orig ON call_events(orig_tn, started_at);
CREATE INDEX IF NOT EXISTS ix_events_started ON call_events(started_at);
CREATE TABLE IF NOT EXISTS number_hourly_stats (
  tn TEXT NOT NULL, hour_start TEXT NOT NULL, calls BIGINT NOT NULL, answered BIGINT NOT NULL, short_calls BIGINT NOT NULL,
  failed BIGINT NOT NULL, duration_sec BIGINT NOT NULL, unique_dests BIGINT NOT NULL, complaints BIGINT NOT NULL,
  PRIMARY KEY (tn, hour_start));
CREATE INDEX IF NOT EXISTS ix_hourly_hour ON number_hourly_stats(hour_start);
CREATE TABLE IF NOT EXISTS label_feedback (
  id TEXT PRIMARY KEY, tn TEXT NOT NULL, source_id TEXT NOT NULL, source_name TEXT, kind TEXT NOT NULL, label TEXT,
  confidence REAL, reason TEXT, reported_at TEXT NOT NULL, expires_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_feedback_tn ON label_feedback(tn, reported_at);
CREATE TABLE IF NOT EXISTS scores (
  tn TEXT PRIMARY KEY, score BIGINT NOT NULL, raw_score BIGINT NOT NULL, label TEXT NOT NULL, floored BOOLEAN NOT NULL,
  override_label TEXT, override_until TEXT, factors_json TEXT NOT NULL, version TEXT NOT NULL,
  calls_24h BIGINT NOT NULL, calls_7d BIGINT NOT NULL, computed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_scores_computed ON scores(computed_at);
CREATE INDEX IF NOT EXISTS ix_scores_label ON scores(label);
CREATE TABLE IF NOT EXISTS score_history (
  tn TEXT NOT NULL, day TEXT NOT NULL, score BIGINT NOT NULL, label TEXT NOT NULL, factors_json TEXT NOT NULL, PRIMARY KEY (tn, day));
CREATE TABLE IF NOT EXISTS score_overrides (
  tn TEXT PRIMARY KEY, label TEXT NOT NULL, reason TEXT NOT NULL, set_by TEXT NOT NULL, until_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reputation_dirty (tn TEXT PRIMARY KEY, touched_at TEXT NOT NULL);
```

**0500_disputes.sql** (disputes)
```sql
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, tn TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, resolution TEXT, opened_by TEXT NOT NULL, assigned_to TEXT, resolved_by TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_disputes_entity ON disputes(entity_id, status);
CREATE INDEX IF NOT EXISTS ix_disputes_status ON disputes(status, created_at);
CREATE TABLE IF NOT EXISTS dispute_comments (
  id TEXT PRIMARY KEY, dispute_id TEXT NOT NULL, author_id TEXT NOT NULL, author_role TEXT NOT NULL, body TEXT NOT NULL,
  internal BOOLEAN NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_dcomments ON dispute_comments(dispute_id, created_at);
```

**0600_notify.sql** (notify)
```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, url TEXT NOT NULL, secret_enc TEXT NOT NULL,
  events_json TEXT NOT NULL, active BOOLEAN NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_webhooks_owner ON webhooks(owner_kind, owner_id);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL, attempt BIGINT NOT NULL,
  status TEXT NOT NULL, next_at TEXT, last_code BIGINT, last_error TEXT, created_at TEXT NOT NULL, delivered_at TEXT);
CREATE INDEX IF NOT EXISTS ix_deliveries_due ON webhook_deliveries(status, next_at);
CREATE INDEX IF NOT EXISTS ix_deliveries_hook ON webhook_deliveries(webhook_id, created_at);
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT);
```

**0700_auth.sql** (auth)
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL, name TEXT, role TEXT NOT NULL, entity_id TEXT,
  active BOOLEAN NOT NULL, locale TEXT NOT NULL, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_entity ON users(entity_id);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, csrf_token TEXT NOT NULL, ip TEXT, user_agent TEXT,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sessions_exp ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, prefix TEXT NOT NULL, secret_hash TEXT NOT NULL, name TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL, rate_rps BIGINT NOT NULL, rate_burst BIGINT NOT NULL, expires_at TEXT, last_used_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_apikeys_prefix ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS ix_apikeys_owner ON api_keys(owner_kind, owner_id);
```

No cross-package foreign keys (each package owns its tables; referential integrity enforced in services). Migration runner applies files sorted by numeric prefix, each in one transaction, recording `version` = file name. SQLite opened with `_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)`, write pool `MaxOpenConns=1`, read pool `MaxOpenConns=8` (`platform.DB` exposes `Read` and `Write` `*sql.DB`; on Postgres both point to one pool with `MaxOpenConns=ENA_DB_MAX_CONNS`).

---

## 4. Interfaces (`internal/core/interfaces.go`)

```go
package core

type Querier interface { // satisfied by *sql.DB and *sql.Tx after Rebind; provided by platform.DB
	ExecContext(ctx context.Context, q string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, q string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, q string, args ...any) *sql.Row
}
type Page struct { Limit int; Cursor string }
type Auditor interface { Record(ctx context.Context, e AuditEvent) error }
type Notifier interface { Emit(ctx context.Context, ev Event) error } // fan-out to webhooks/email; implemented by notify
type Crypter interface { Seal(id string, plain []byte) ([]byte, error); Open(id string, sealed []byte) ([]byte, error) } // platform, AES-GCM master key

// identity
type EntityStore interface {
	Create(ctx context.Context, e *Entity) error
	Get(ctx context.Context, id string) (*Entity, error)
	Update(ctx context.Context, e *Entity) error
	List(ctx context.Context, f EntityFilter, p Page) ([]Entity, string, error)
	AddDocument(ctx context.Context, d *EntityDocument) error
	ListDocuments(ctx context.Context, entityID string) ([]EntityDocument, error)
	DeleteDocument(ctx context.Context, entityID, docID string) error
	AddDecision(ctx context.Context, d *VettingDecision) error
	ListDecisions(ctx context.Context, entityID string) ([]VettingDecision, error)
}
type EntityFilter struct { Status []EntityStatus; Query string; Country string }
type IdentityService interface {
	Register(ctx context.Context, p Principal, in EntityInput) (*Entity, error)
	Get(ctx context.Context, id string) (*Entity, error)
	Update(ctx context.Context, p Principal, id string, in EntityInput) (*Entity, error)
	Submit(ctx context.Context, p Principal, id string) (*Entity, error)
	Decide(ctx context.Context, p Principal, id string, action VettingAction, note, riskTier string) (*Entity, error)
	IsVerified(ctx context.Context, id string) (bool, error)
	Summary(ctx context.Context, id string) (EntitySummary, error)
	VerifiedSince(ctx context.Context, since string) ([]EntitySummary, error) // for lookup snapshot refresh
}
type VettingAction string
const ( VetStartReview VettingAction = "start_review"; VetVerify VettingAction = "verify"; VetReject VettingAction = "reject"; VetSuspend VettingAction = "suspend"; VetReinstate VettingAction = "reinstate" )
type EntitySummary struct { ID, LegalName, TradeName string; Status EntityStatus; UpdatedAt string }

// registry
type NumberStore interface {
	Create(ctx context.Context, n *Number) error
	Get(ctx context.Context, id string) (*Number, error)
	Update(ctx context.Context, n *Number) error
	List(ctx context.Context, f NumberFilter, p Page) ([]Number, string, error)
	Overlapping(ctx context.Context, start, end string) ([]Number, error)
	ChangedSince(ctx context.Context, since string, limit int) ([]Number, error)
	BrandingCreate(ctx context.Context, b *Branding) error
	BrandingGet(ctx context.Context, id string) (*Branding, error)
	BrandingUpdate(ctx context.Context, b *Branding) error
	BrandingList(ctx context.Context, f BrandingFilter, p Page) ([]Branding, string, error)
	BrandingChangedSince(ctx context.Context, since string, limit int) ([]Branding, error)
}
type NumberFilter struct { EntityID string; Status []NumberStatus; TN string; Query string }
type BrandingFilter struct { EntityID string; Status []BrandingStatus }
type RegistryService interface {
	AddNumber(ctx context.Context, p Principal, in NumberInput) (*Number, error)
	ImportCSV(ctx context.Context, p Principal, r io.Reader) (ImportReport, error)
	UpdateNumber(ctx context.Context, p Principal, id string, in NumberInput) (*Number, error)
	SetStatus(ctx context.Context, p Principal, id string, st NumberStatus, reason string) (*Number, error)
	Confirm(ctx context.Context, p Principal, id string) (*Number, error) // carrier_confirmed → attest A
	OwnerOf(ctx context.Context, tn string) (*Number, error)               // DB-backed, admin/pki use
	UpsertBranding(ctx context.Context, p Principal, in BrandingInput) (*Branding, error)
	DecideBranding(ctx context.Context, p Principal, id string, approve bool, note string) (*Branding, error)
}
type LookupService interface { // HOT PATH: memory only, never errors on miss
	Lookup(tn string) LookupResult
	Stats() LookupStats
	Refresh(ctx context.Context) error
}
type LookupStats struct { Numbers, Ranges, Entities, Brandings, Scores int; SnapshotAt string; RefreshMillis int64 }
type ScoreFeed interface { ScoresChangedSince(ctx context.Context, since string, limit int) ([]Score, error) } // reputation → registry snapshot

// pki / passport
type KeyStore interface {
	SaveKey(ctx context.Context, k *Key) error; GetKey(ctx context.Context, id string) (*Key, error)
	ListKeys(ctx context.Context, kind KeyKind) ([]Key, error)
	SaveCert(ctx context.Context, c *Certificate) error; GetCert(ctx context.Context, id string) (*Certificate, error)
	ListCerts(ctx context.Context, f CertFilter, p Page) ([]Certificate, string, error)
	TrustedRoots(ctx context.Context) ([]string, error); AddTrustedRoot(ctx context.Context, name, pem string) error
}
type CertFilter struct { Kind []CertKind; EntityID string; Status []string }
type PKIService interface {
	InitCA(ctx context.Context, p Principal, cn string, years int) (root, inter *Certificate, err error)
	IssueSP(ctx context.Context, p Principal, spc string, tnl []TNEntry, days int) (*Certificate, error)
	IssueDelegate(ctx context.Context, p Principal, entityID string, csrPEM string, days int) (*Certificate, error) // csrPEM "" => hosted key
	Revoke(ctx context.Context, p Principal, certID, reason string) error
	ActiveSigner(ctx context.Context, kind CertKind, entityID string) (*Certificate, *ecdsa.PrivateKey, error)
	CertPool(ctx context.Context) (*x509.CertPool, error) // configured trusted roots (own root + imported)
	Resolve(ctx context.Context, x5u string) ([]*x509.Certificate, error) // local URL → DB, else HTTP fetch with cache+allowlist
}
type SigningService interface { Sign(ctx context.Context, req SignRequest) (*SignResult, error) }
type VerificationService interface { Verify(ctx context.Context, req VerifyRequest) (*VerifyResult, error) }

// reputation
type EventStore interface {
	InsertEvents(ctx context.Context, evs []CallEvent) error              // multi-row insert, <=500 rows/stmt
	UpsertHourly(ctx context.Context, rows []HourlyStat) error            // additive ON CONFLICT
	HourlyRange(ctx context.Context, tn, from, to string) ([]HourlyStat, error)
	InsertFeedback(ctx context.Context, fb []LabelFeedback) error
	ActiveFeedback(ctx context.Context, tn, now string) ([]LabelFeedback, error)
	SaveScore(ctx context.Context, s *Score) error; GetScore(ctx context.Context, tn string) (*Score, error)
	ListScores(ctx context.Context, f ScoreFilter, p Page) ([]Score, string, error)
	History(ctx context.Context, tn string, days int) ([]Score, error)
	SetOverride(ctx context.Context, o *ScoreOverride) error; GetOverride(ctx context.Context, tn string) (*ScoreOverride, error)
	MarkDirty(ctx context.Context, tns []string) error; PopDirty(ctx context.Context, limit int) ([]string, error)
	DeleteEventsBefore(ctx context.Context, before string, limit int) (int64, error)
}
type ScoreFilter struct { TNs []string; Label []ReputationLabel; EntityID string }
type ReputationService interface {
	IngestEvents(ctx context.Context, p Principal, batchID string, evs []CallEvent) (IngestReport, error)
	IngestFeedback(ctx context.Context, p Principal, fb []LabelFeedback) (IngestReport, error)
	Score(ctx context.Context, tn string) (*Score, error)
	Compute(ctx context.Context, tn string) (*Score, error)
	Override(ctx context.Context, p Principal, tn string, label ReputationLabel, reason, until string) (*Score, error)
}
type IngestReport struct { Accepted, Rejected int; Errors []FieldError }
type VerifiedLookup interface { IsVerifiedOwner(tn string) (entityID string, verified bool) } // registry snapshot, used by scoring floor

// disputes
type DisputeStore interface {
	Create(ctx context.Context, d *Dispute) error; Get(ctx context.Context, id string) (*Dispute, error)
	Update(ctx context.Context, d *Dispute) error; List(ctx context.Context, f DisputeFilter, p Page) ([]Dispute, string, error)
	AddComment(ctx context.Context, c *DisputeComment) error; Comments(ctx context.Context, id string, includeInternal bool) ([]DisputeComment, error)
}
type DisputeFilter struct { EntityID string; Status []DisputeStatus; AssignedTo, TN string }
type DisputeService interface {
	Open(ctx context.Context, p Principal, in DisputeInput) (*Dispute, error)
	Comment(ctx context.Context, p Principal, id, body string, internal bool) (*DisputeComment, error)
	Assign(ctx context.Context, p Principal, id, userID string) (*Dispute, error)
	Resolve(ctx context.Context, p Principal, id string, st DisputeStatus, resolution string) (*Dispute, error)
	OpenSystem(ctx context.Context, entityID, tn, kind, title, desc string) (*Dispute, error) // auto "verified_review"
}

// notify
type WebhookStore interface {
	Create(ctx context.Context, w *Webhook) error; Get(ctx context.Context, id string) (*Webhook, error)
	Update(ctx context.Context, w *Webhook) error; ListByOwner(ctx context.Context, kind, id string) ([]Webhook, error)
	ListForEvent(ctx context.Context, eventType, entityID string) ([]Webhook, error)
	Enqueue(ctx context.Context, d []WebhookDelivery) error; Due(ctx context.Context, now string, limit int) ([]WebhookDelivery, error)
	UpdateDelivery(ctx context.Context, d *WebhookDelivery) error; Deliveries(ctx context.Context, hookID string, p Page) ([]WebhookDelivery, string, error)
	EnqueueEmail(ctx context.Context, to, subject, body string) error
}

// auth
type AuthStore interface {
	CreateUser(ctx context.Context, u *User) error; GetUser(ctx context.Context, id string) (*User, error)
	GetUserByEmail(ctx context.Context, email string) (*User, error); UpdateUser(ctx context.Context, u *User) error
	ListUsers(ctx context.Context, f UserFilter, p Page) ([]User, string, error)
	CreateSession(ctx context.Context, s *Session) error; GetSession(ctx context.Context, idHash string) (*Session, error)
	DeleteSession(ctx context.Context, idHash string) error; DeleteExpiredSessions(ctx context.Context, now string) error
	CreateKey(ctx context.Context, k *APIKey) error; GetKeyByPrefix(ctx context.Context, prefix string) (*APIKey, error)
	ListKeys(ctx context.Context, ownerKind, ownerID string) ([]APIKey, error); RevokeKey(ctx context.Context, id string) error
	TouchKey(ctx context.Context, id, at string) error
}
type Authenticator interface { // used by platform middleware
	FromAPIKey(ctx context.Context, raw string) (Principal, *RateSpec, error)
	FromSession(ctx context.Context, cookie string) (Principal, error)
}
type RateSpec struct { KeyID string; RPS, Burst int }
```

Input structs (`EntityInput`, `NumberInput`, `BrandingInput`, `DisputeInput`, `FieldError`) live in `core/inputs.go` with `Validate() error` methods. `core/tn.go` provides `NormalizeTN(raw, defaultCC string) (digits string, kind string, err error)` handling `0532…`, `+90…`, `90…`, `532…` (10-digit mobile), `0850…`/`850…`, `444xxxx` (returned as `90444xxxx` with kind `short_444` and Attest-capable), `00` international prefix, and `ValidVKN`, `ValidTCKN`, `ValidMERSIS`.

---

## 5. HTTP API route table (v1, complete)

Auth column: `key:<scope>` = API key with scope; `session:<role>` = portal cookie; `any-auth` = either. Enterprise routes are scoped to `Principal.EntityID` (API keys owned by an entity carry it). All write routes accept `Idempotency-Key`. Owner column = package.

| Method | Path | Surface | Auth | Request → Response | Owner |
|---|---|---|---|---|---|
| GET | /healthz | ops | none | → `{"status":"ok"}` | platform |
| GET | /readyz | ops | none | DB ping + snapshot loaded → 200/503 | platform |
| GET | /metrics | ops | none (separate port `ENA_METRICS_ADDR`) | Prometheus text | platform |
| GET | /openapi.yaml | docs | none | embedded `docs/openapi.yaml` | platform |
| GET | /certs/{id}.pem | x5u | none | leaf+chain PEM, `Cache-Control: max-age=3600` | pki |
| GET | /certs/ca.pem | x5u | none | root PEM | pki |
| GET | /certs/crl.json | x5u | none | `{"revoked":[serial…]}` | pki |
| POST | /auth/login | portal | none (rate limited by IP) | `{email,password}` → `{user, csrf_token}` + Set-Cookie `ena_session` | auth |
| POST | /auth/logout | portal | session | → 204 | auth |
| GET | /auth/me | portal | session | → `{user, entity_id, role}` | auth |
| POST | /auth/password | portal | session | `{current,new}` → 204 | auth |
| GET | /v1/carrier/lookup/{tn} | carrier | key:carrier:read | → `LookupResult` (hot path, from snapshot) | registry |
| POST | /v1/carrier/lookup | carrier | key:carrier:read | `{tns:[≤100]}` → `{items:[LookupResult]}` | registry |
| POST | /v1/carrier/verify | carrier | key:carrier:read | `{identity, from, to, date?}` → `VerifyResult` | passport |
| POST | /v1/carrier/sign | carrier | key:carrier:write | `SignRequest` → `SignResult` (operator originating side) | passport |
| GET | /v1/carrier/certs | carrier | key:carrier:read | → active SP certs + roots | pki |
| POST | /v1/carrier/events | carrier | key:carrier:write | `{batch_id, events:[≤10000 CallEvent]}` (JSON or `text/csv`) → `IngestReport` 202 | reputation |
| POST | /v1/carrier/labels | carrier | key:carrier:write | `{items:[LabelFeedback ≤1000]}` → `IngestReport` | reputation |
| GET | /v1/carrier/reputation/{tn} | carrier | key:carrier:read | → `Score` with factors | reputation |
| POST | /v1/enterprise/entity | enterprise | session:enterprise_owner (no entity yet) | `EntityInput` → `Entity` 201 | identity |
| GET | /v1/enterprise/entity | enterprise | any-auth enterprise | → `Entity` (tckn masked) | identity |
| PATCH | /v1/enterprise/entity | enterprise | any-auth enterprise:write | `EntityInput` partial → `Entity` (only in pending/rejected) | identity |
| POST | /v1/enterprise/entity/submit | enterprise | enterprise:write | → `Entity` (pending→in_review) | identity |
| GET | /v1/enterprise/entity/history | enterprise | enterprise:read | → `[VettingDecision]` | identity |
| GET/POST | /v1/enterprise/entity/documents | enterprise | enterprise:read / write | POST multipart or `{kind,file_name,sha256,size_bytes,mime_type}` → `EntityDocument` | identity |
| DELETE | /v1/enterprise/entity/documents/{id} | enterprise | enterprise:write | → 204 | identity |
| GET/POST | /v1/enterprise/numbers | enterprise | enterprise:read / write | list (`?status=`) / `NumberInput{tn|range_start,range_end,use_case,call_reason,branding_id}` → `Number` 201 | registry |
| POST | /v1/enterprise/numbers/import | enterprise | enterprise:write | `text/csv` (tn,use_case,call_reason) → `ImportReport` | registry |
| GET/PATCH | /v1/enterprise/numbers/{id} | enterprise | read / write | → `Number` | registry |
| POST | /v1/enterprise/numbers/{id}/release | enterprise | enterprise:write | → `Number` (status released) | registry |
| GET/POST | /v1/enterprise/branding | enterprise | read / write | → `[Branding]` / `BrandingInput` → `Branding` (status draft→ submitted for approval) | registry |
| GET/PUT/DELETE | /v1/enterprise/branding/{id} | enterprise | read / write | → `Branding` / 204 | registry |
| GET | /v1/enterprise/reputation | enterprise | enterprise:read | → `[{number, score, label}]` for own numbers | reputation |
| GET | /v1/enterprise/reputation/{tn} | enterprise | enterprise:read | → `Score` (own number only) | reputation |
| GET | /v1/enterprise/reputation/{tn}/history | enterprise | enterprise:read | `?days=30` → `[Score]` | reputation |
| GET/POST | /v1/enterprise/disputes | enterprise | read / write | `DisputeInput{tn,kind,title,description}` → `Dispute` 201 | disputes |
| GET | /v1/enterprise/disputes/{id} | enterprise | enterprise:read | → `Dispute` + external comments | disputes |
| POST | /v1/enterprise/disputes/{id}/comments | enterprise | enterprise:write | `{body}` → `DisputeComment` | disputes |
| GET/POST | /v1/enterprise/webhooks | enterprise | read / write | `{url, events[], secret?}` → `Webhook` (secret shown once) | notify |
| DELETE | /v1/enterprise/webhooks/{id} | enterprise | enterprise:write | → 204 | notify |
| POST | /v1/enterprise/webhooks/{id}/test | enterprise | enterprise:write | → `WebhookDelivery` | notify |
| GET | /v1/enterprise/webhooks/{id}/deliveries | enterprise | enterprise:read | → page | notify |
| GET/POST | /v1/enterprise/apikeys | enterprise | session:enterprise_owner | `{name, scopes⊆enterprise:*}` → key shown once | auth |
| DELETE | /v1/enterprise/apikeys/{id} | enterprise | session:enterprise_owner | → 204 | auth |
| GET/POST | /v1/enterprise/certificates | enterprise | read / write (entity verified) | `{csr_pem?, days}` → delegate `Certificate` | pki |
| POST | /v1/enterprise/rcd/sign | enterprise | enterprise:write | `{orig, dest, number_id?}` → `SignResult` with rcd PASSporT (delegate cert) | passport |
| GET | /v1/enterprise/dashboard | enterprise | enterprise:read | → counts: numbers by status, score distribution, open disputes, 7d calls | registry |
| GET | /v1/admin/dashboard | admin | session:operator_* | → vetting queue size, numbers, verstat ratios 24h, label distribution, dns qps | registry |
| GET | /v1/admin/vetting | admin | session:operator_* | `?status=in_review` → `[Entity]` | identity |
| GET | /v1/admin/entities | admin | session:operator_* | `?q=&status=` → page | identity |
| GET | /v1/admin/entities/{id} | admin | session:operator_* | → `Entity` + documents + decisions | identity |
| POST | /v1/admin/entities/{id}/decision | admin | session:operator_admin | `{action, note, risk_tier?}` → `Entity` | identity |
| GET | /v1/admin/numbers | admin | session:operator_* | `?q=&entity_id=&status=` → page | registry |
| POST | /v1/admin/numbers/{id}/status | admin | session:operator_admin | `{status, reason}` → `Number` | registry |
| POST | /v1/admin/numbers/{id}/confirm | admin | session:operator_admin | → `Number` (carrier_confirmed, attest A) | registry |
| GET | /v1/admin/branding | admin | session:operator_* | `?status=draft` queue | registry |
| POST | /v1/admin/branding/{id}/decision | admin | session:operator_admin | `{approve, note}` → `Branding` | registry |
| GET | /v1/admin/enum/status | admin | session:operator_* | → `LookupStats` + DNS counters | registry |
| POST | /v1/admin/enum/reload | admin | session:operator_admin | → `LookupStats` (full snapshot rebuild) | registry |
| POST | /v1/admin/pki/ca/init | admin | session:operator_admin | `{cn, years}` → root+intermediate | pki |
| GET | /v1/admin/pki/keys | admin | session:operator_* | → `[Key]` (public only) | pki |
| GET/POST | /v1/admin/pki/certificates | admin | operator_* / operator_admin | `{kind:"sp", spc, tn_auth_list[], days}` → `Certificate` | pki |
| GET | /v1/admin/pki/certificates/{id} | admin | session:operator_* | → `Certificate` | pki |
| POST | /v1/admin/pki/certificates/{id}/revoke | admin | session:operator_admin | `{reason}` → 204 | pki |
| GET/POST | /v1/admin/pki/roots | admin | operator_* / operator_admin | `{name, pem}` → trusted root | pki |
| GET | /v1/admin/reputation | admin | session:operator_* | `?label=&q=` → page of `Score` | reputation |
| GET | /v1/admin/reputation/{tn} | admin | session:operator_* | → `Score` + hourly stats 7d + feedback | reputation |
| POST | /v1/admin/reputation/{tn}/override | admin | session:operator_admin | `{label, reason, until}` → `Score` | reputation |
| POST | /v1/admin/reputation/{tn}/recompute | admin | session:operator_admin | → `Score` | reputation |
| GET | /v1/admin/disputes | admin | session:operator_* | `?status=&assigned_to=` → page | disputes |
| GET | /v1/admin/disputes/{id} | admin | session:operator_* | → `Dispute` + all comments | disputes |
| POST | /v1/admin/disputes/{id}/assign | admin | session:operator_admin | `{user_id}` → `Dispute` | disputes |
| POST | /v1/admin/disputes/{id}/comments | admin | session:operator_* | `{body, internal}` → comment | disputes |
| POST | /v1/admin/disputes/{id}/resolve | admin | session:operator_admin | `{status: resolved|rejected, resolution, apply_override?}` → `Dispute` | disputes |
| GET/POST | /v1/admin/webhooks | admin | session:operator_admin | operator-level hooks (vetting.submitted, dispute.opened…) | notify |
| DELETE | /v1/admin/webhooks/{id} | admin | session:operator_admin | → 204 | notify |
| GET/POST | /v1/admin/apikeys | admin | session:operator_admin | `{name, owner_kind, owner_id, scopes, rate_rps, rate_burst, expires_at}` → key shown once | auth |
| DELETE | /v1/admin/apikeys/{id} | admin | session:operator_admin | → 204 (revoke) | auth |
| GET/POST | /v1/admin/users | admin | session:operator_admin | `{email, name, role, entity_id?, password}` → `User` | auth |
| PATCH | /v1/admin/users/{id} | admin | session:operator_admin | `{active, role, name}` → `User` | auth |
| GET/PUT | /v1/admin/settings | admin | operator_* / operator_admin | `{key: value}` map (score thresholds, iat window, ttl…) | auth |
| GET | /v1/admin/audit | admin | session:operator_* | `?target_kind=&target_id=&from=&to=` → page | auth |

Event types emitted via `core.Notifier`: `entity.submitted, entity.verified, entity.rejected, entity.suspended, number.activated, number.suspended, number.released, branding.approved, branding.rejected, score.label_changed, dispute.opened, dispute.commented, dispute.resolved, certificate.issued, certificate.revoked`.

Problem+json shape: `{"type":"https://enumaracle.dev/problems/<code>","title":"…","status":422,"detail":"…","instance":"/v1/…","code":"validation_failed","request_id":"…","errors":[{"field":"vkn","message":"geçersiz kontrol basamağı"}]}`.

---

## 6. STIR/SHAKEN and certificate design

**Key custody.** P-256 keys generated with `ecdsa.GenerateKey`. Private key marshalled PKCS#8, sealed by `platform.Crypter`: AES-256-GCM, 12-byte random nonce, AAD = key id, stored as base64 `nonce||ct`. Master key from `ENA_MASTER_KEY` (base64 32 bytes) or `ENA_MASTER_KEY_FILE`; `ENA_KMS=stub` hook interface `MasterKeyProvider` so a real KMS envelope can be plugged later. Decrypted keys live only in an LRU in-process cache (max 64, TTL 10 min). Rotation: new key + new cert, old cert stays active until `not_after` so in-flight x5u references still verify.

**Pilot STI-CA.** `InitCA` creates root (CA:TRUE, pathlen 1, 10y) and intermediate (CA:TRUE, pathlen 0, 5y), both with `KeyUsage CertSign|CRLSign`. SP certs: 90 days, `KeyUsage DigitalSignature`, `ExtKeyUsage` none, TNAuthList extension OID `1.3.6.1.5.5.7.1.26` (non-critical) encoded with `encoding/asn1`:

```go
// TNAuthorizationList ::= SEQUENCE SIZE (1..MAX) OF TNEntry
// TNEntry ::= CHOICE { spc [0] ServiceProviderCode(IA5String), range [1] TelephoneNumberRange, one [2] TelephoneNumber(IA5String) }
// TelephoneNumberRange ::= SEQUENCE { start TelephoneNumber, count INTEGER }
func encodeTNAuthList(entries []core.TNEntry) ([]byte, error) // builds []asn1.RawValue with Class=2 (context), Tag 0/1/2
func parseTNAuthList(ext []byte) ([]core.TNEntry, error)
```
Serial = 20 random bytes; subject `CN=<spc> SHAKEN, O=<operator>, C=TR`. Certs served at `ENA_PUBLIC_URL/certs/{id}.pem` (that URL is the `x5u`). Operator can also import other roots (`/v1/admin/pki/roots`) to verify calls signed by other carriers / a future national STI-PA.

**Delegate certificates (RFC 9060).** Issued by the operator intermediate to a verified entity; TNAuthList = the entity's active, carrier-confirmed numbers/ranges at issue time; 30-day validity; auto-reissue job nightly if ranges changed or < 7 days left. Two custody modes: enterprise supplies a CSR (its own key; server only signs) or "hosted" (key generated and sealed server-side, used by `/v1/enterprise/rcd/sign`). The SP certificate chain contains the intermediate so verifiers reach the configured root.

**Signing flow (`passport.Sign`).**
1. Normalise orig/dest; look up orig in `LookupService`: verified owner + `carrier_confirmed` → `A`; verified owner self-declared or request overrides → `B`; unknown → `C` (operator may still sign C for calls it originates).
2. Header (keys sorted): `{"alg":"ES256","ppt":"shaken","typ":"passport","x5u":"https://…/certs/<id>.pem"}`; payload `{"attest":"A","dest":{"tn":["905…"]},"iat":1730540000,"orig":{"tn":"905…"},"origid":"<uuid>"}`. JSON is produced by a canonical encoder (`passport/canon.go`) that emits members in lexicographic order with no whitespace (RFC 8225 §9 / RFC 8588).
3. Signature: `ecdsa.Sign` over SHA-256 of `b64url(header).b64url(payload)`, serialized as fixed 64-byte `R||S`, base64url without padding.
4. Identity header: `<jws>;info=<x5u>;alg=ES256;ppt=shaken`.
5. RCD (optional, second PASSporT): `ppt":"rcd"`, claims `rcd:{"nam":"Akbank","jcl":"https://…/card.vcf"}`, `crn` (call reason) and `rcdi` integrity: for each `rcd` member a `sha256-<b64url(digest of canonical JSON of that value)>` as RFC 9795 §4.2 (`"rcdi":{"/":"sha256-…","/nam":"sha256-…"}`); when signed with a delegate cert, `attest` is `A` only if TNAuthList covers orig. Identity header `…;ppt=rcd`.

**Verification flow (`passport.Verify`).** Checks recorded individually in `VerifyResult.Checks`:
`parse_identity` → `header_valid` (alg ES256, ppt shaken|rcd, typ passport) → `x5u_allowed` (host in `ENA_X5U_ALLOWED_HOSTS` or own public URL) → `chain_valid` (`x509.Verify` with `Roots=CertPool`, `KeyUsages=[ExtKeyUsageAny]`, time = iat, not revoked) → `signature_valid` → `iat_fresh` (|now−iat| ≤ `ENA_IAT_WINDOW_SEC`, default 60; SIP Date honored if given) → `orig_match`/`dest_match` (normalised From/To ∈ claims) → `tnauth_covers_orig` (SPC entries accepted when `attest` is A/B/C and SP cert; TN/range entries must cover orig for delegate) → `rcd_integrity`. Result: all pass → `TN-Validation-Passed` + attest; signature/chain/iat/match fail → `TN-Validation-Failed`; no Identity header or unknown ppt → `No-TN-Validation`. Cert fetch cache: 1000 entries, TTL = min(cert remaining, 1h), negative TTL 60 s; timeout 500 ms, 1 MB cap. Metrics: `enumaracle_verify_total{verstat,attest,reason}` and `enumaracle_sign_total{attest}`; histogram `enumaracle_verify_seconds`.

**Test helper.** `pki/pkitest` exposes `NewTestCA(t)` producing in-memory root/intermediate/SP/delegate so passport, enumdns and API tests do not depend on DB state.

---

## 7. Reputation scoring design

**Ingest path (millions/day).** `POST /v1/carrier/events` validates each row, normalises TNs, assigns the event to a dirty set, and pushes to a bounded channel (`ENA_INGEST_BUFFER`, default 50k). One writer goroutine drains in batches of 1000 per transaction: multi-row `INSERT INTO call_events` (chunks of 500 → 4000 bound params, under both engines' limits) and additive `INSERT INTO number_hourly_stats … ON CONFLICT(tn,hour_start) DO UPDATE SET calls=calls+excluded.calls, …` with rollups pre-aggregated in memory per `(tn, hour)`. Short call = answered and `duration_sec < 6`. `unique_dests` = distinct `dest_tn` within the flushed batch (documented approximation; exact enough at hourly granularity for anomaly use). Back-pressure: when the channel is > 90 % full the endpoint returns 429 with `Retry-After`. Raw events retained `ENA_EVENT_RETENTION_DAYS` (7), deleted in 10k chunks by a nightly job; hourly rollups retained 90 days; `score_history` 400 days. Prometheus: `enumaracle_events_ingested_total`, `enumaracle_ingest_queue_depth`, `enumaracle_ingest_flush_seconds`.

**Windows.** W1 = last 24 h, W7 = last 7 days, W30 = last 30 days (baseline) from `number_hourly_stats`. Minimum evidence: if `calls_7d < 20` the score is `unknown` (score 100 with label `unknown`, no penalties except external labels).

**Features (W1 unless noted).** `vol_spike = calls_24h / max(1, avg daily calls W30)`, `unique_ratio = unique_dests/calls` (W7), `answer_rate = answered/calls` (W7), `short_ratio = short/answered` (W7), `avg_dur = duration_sec/answered` (W7), `complaint_rate = complaints per 1000 calls` (W7, from `label_feedback kind=complaint` and hourly `complaints`), `ext_spam = Σ confidence of active third-party labels spam/suspect`, `ext_clean` likewise for clean, `fail_rate = failed/calls` (W7).

**Formula (version `v1`).** `raw = 100 − Σ penalty_i`, each penalty a capped linear ramp between a soft threshold and a hard threshold:

| Code | Trigger ramp | Max penalty |
|---|---|---|
| `volume_spike` | 3× → 10× baseline (and calls_24h ≥ 200) | 15 |
| `unique_destinations` | 0.80 → 0.97 (calls_7d ≥ 200) | 20 |
| `low_answer_rate` | 0.35 → 0.10 | 15 |
| `short_calls` | 0.40 → 0.80 | 20 |
| `short_avg_duration` | 20 s → 5 s | 10 |
| `complaints` | 0.5 → 5 per 1000 | 30 |
| `external_labels` | Σ confidence 0.3 → 1.5 (per-source max 1.0, max 3 sources) | 25 |
| `high_failure_rate` | 0.30 → 0.70 | 10 |
| `external_clean` (bonus) | Σ confidence ≥ 0.5 | +5 (cap at 100) |

Thresholds editable in `settings` (`reputation.thresholds`); defaults compiled in. Labels: `clean ≥ 70`, `watch 50–69`, `suspect 30–49`, `spam < 30`.

**Verified protection.** If the TN belongs to a verified entity's active number (`VerifiedLookup`): `score = max(raw, 60)` (`floored=true`), label can never become `suspect/spam` automatically; when `raw < 50` the service calls `DisputeService.OpenSystem(entity, tn, "verified_review", …)` once per 7 days and emits `score.label_changed` with `review_required=true`. Operator admins can still set an override `spam` (with reason, until) which bypasses the floor; overrides are the only way a verified number is labelled spam. Non-verified numbers go to the normal thresholds. Unknown numbers (no owner) start from the same formula but have no floor.

**Scheduling.** Job every `ENA_SCORE_INTERVAL` (5 min) pops up to 20k dirty TNs and recomputes; nightly full pass over TNs with activity in W30 plus snapshot into `score_history`. Each save marks the row `computed_at` so the registry snapshot picks it up via `ScoreFeed.ScoresChangedSince`.

**Explainability output** (`Score.factors`):
```json
{"tn":"+905321234567","score":62,"raw_score":41,"label":"watch","floored":true,"version":"v1",
 "factors":[
  {"code":"unique_destinations","value":0.94,"threshold":0.80,"penalty":16,"max_penalty":20,
   "text_tr":"7 günde aramaların %94'ü farklı numaralara gitti (eşik %80).","text_en":"94% of calls in 7 days went to distinct destinations (threshold 80%)."},
  {"code":"short_calls","value":0.61,"threshold":0.40,"penalty":11,"max_penalty":20,"text_tr":"Cevaplanan aramaların %61'i 6 saniyeden kısa.","text_en":"61% of answered calls shorter than 6 s."},
  {"code":"complaints","value":3.2,"threshold":0.5,"penalty":18,"max_penalty":30,"text_tr":"1000 aramada 3,2 şikâyet.","text_en":"3.2 complaints per 1000 calls."},
  {"code":"verified_floor","value":60,"threshold":60,"penalty":-19,"max_penalty":0,"text_tr":"Doğrulanmış kurum: puan 60'ın altına düşürülmez; inceleme kaydı açıldı.","text_en":"Verified entity: floor 60 applied; review ticket opened."}],
 "calls_24h":1840,"calls_7d":11212,"computed_at":"2026-11-02T10:05:00Z"}
```

---

## 8. ENUM / DNS design

**Zone.** `ENA_ENUM_ZONE` default `e164.operator.enum.` (any FQDN; `e164.arpa` style private tree). Name for +90 532 123 45 67: `7.6.5.4.3.2.1.2.3.5.0.9.e164.operator.enum.` Apex serves `SOA` (serial = snapshot unix time, refresh 300, retry 60, expire 86400, minimum 60) and `NS ns1.<zone>`; `ANY`, `AXFR/IXFR` refused; everything else `REFUSED` outside the zone; EDNS0 with 1232-byte UDP size; TC bit set and TCP fallback for oversize.

**Records** for a found, active, verified number:
```
7.6.5...0.9.e164.operator.enum. 300 IN NAPTR 10 100 "u" "E2U+sip" "!^.*$!sip:+905321234567@sip.operator.tr;verstat=TN-Validation-Passed!" .
7.6.5...0.9.e164.operator.enum. 300 IN NAPTR 20 100 "u" "E2U+rcd" "!^.*$!https://ena.operator.tr/rcd/905321234567.json!" .
7.6.5...0.9.e164.operator.enum. 300 IN TXT "v=ena1;s=active;ver=1;a=A;l=clean;sc=87;uc=customer_service;n=Akbank;r=Randevu hatirlatma;e=01JC…"
```
TXT fields: `v` version, `s` number status, `ver` verified owner (0/1), `a` attest level that signing would use, `l` label, `sc` score, `uc` use case, `n` display name (ASCII-folded ≤ 32, UTF-8 also in a second string if `ENA_ENUM_UTF8=1`), `r` call reason, `e` entity id. Total TXT ≤ 255 bytes per string. `sip.operator.tr` is `ENA_ENUM_SIP_DOMAIN`; the regexp keeps the dialled TN so SBCs can route unchanged and read `verstat`. Suspended number → NAPTR with `verstat=TN-Validation-Failed` and `s=suspended`; unknown → `NXDOMAIN` with SOA (negative TTL 60). Score-only known numbers (no owner, has score) → TXT only, `NODATA` for NAPTR.

**TTLs.** `ENA_ENUM_TTL_ACTIVE=300`, `ENA_ENUM_TTL_SUSPENDED=60`, `ENA_ENUM_TTL_NEGATIVE=60`. Lookups never hit the DB: `enumdns` calls `LookupService.Lookup` on the same snapshot as REST. Snapshot: `atomic.Pointer[snapshot]` holding `map[string]*entry` (single numbers, digits key), a sorted `[]rangeEntry` searched by binary search on `start ≤ tn ≤ end`, `map[entityID]entitySummary`, `map[brandingID]Branding`, `map[tn]scoreLite`. Refresh goroutine every `ENA_LOOKUP_REFRESH_MS=1000` pulls `ChangedSince(watermark)` from numbers, branding, entities, scores and copy-on-writes a new snapshot (incremental; full rebuild on start and on `/v1/admin/enum/reload`). Memory ≈ 200 B per number → 1 M numbers ≈ 200 MB; ranges collapse large allocations. Expected p99 < 0.5 ms for UDP answer. Metrics: `enumaracle_dns_queries_total{qtype,rcode}`, `enumaracle_dns_seconds`, `enumaracle_lookup_snapshot_age_seconds`, `enumaracle_lookup_entries`.

**Server.** Two `dns.Server` (udp, tcp) on `ENA_DNS_ADDR` (default `:5353`; `:53` in containers via capability), handler pure function + per-query context deadline 50 ms, no allocation of the zone name per query (precomputed suffix). Optional source ACL `ENA_DNS_ALLOW_CIDRS`.

**SBC integration (documented in KURULUM.md with snippets).**
- Kamailio: `modparam("enum","domain_suffix","e164.operator.enum.")`, in route: `if (enum_query("e164.operator.enum.","sip")) { … $rU contains verstat=… }` or `dns_query` + `$dns(...)` for TXT; typical: query before routing, set `$avp(verstat)` and insert `P-Asserted-Identity`/`verstat` tel URI param into the forwarded INVITE; display name from TXT `n=`.
- OpenSIPS: `enum_query("e164.operator.enum.")` plus `dns_cache`.
- Oracle/Ribbon SBC: ENUM config object pointing to the Enumaracle host, `enum-type naptr`, lookup on ingress; branding via the REST `/v1/carrier/lookup` from the SBC's HTTP client or via a sidecar (REST latency target < 5 ms, served from the same snapshot with HTTP keep-alive).
- Verification of inbound Identity headers: SBC posts to `/v1/carrier/verify` (JSON) or, for high volume, runs the `enumaracle verify` subcommand as a local sidecar on the SBC host (same binary, `--mode=verify-only`, read-only DB access to certs or x5u fetch only).

---

## 9. Portal information architecture

Roles: `operator_admin` (full), `operator_analyst` (read-only + comments), `enterprise_owner` (manage entity, numbers, keys, users of its entity), `enterprise_user` (read + disputes). UI language Turkish (`portal/src/i18n/tr.ts`), with an English dictionary skeleton. Routing: React Router-free hand-rolled hash router (no extra deps); fetch wrapper injects `X-CSRF-Token`; charts are hand-drawn SVG components (`Sparkline`, `Bars`, `Donut`).

Operator pages (`/#/admin/…`): **Gösterge paneli** (vetting queue size, verstat ratios 24 h, label distribution, DNS QPS, ingest lag); **Doğrulama kuyruğu** (list → detail: identifiers with checksum badge, documents, decision form start_review/verify/reject/suspend with note and risk tier, history); **Kurumlar** (search, detail with numbers and certificates); **Numaralar** (search, status change, confirm, range view); **Marka onayı** (draft queue, preview card "how the phone will show it", approve/reject); **İtibar** (search TN, factor breakdown, 30-day sparkline, feedback list, override form, recompute); **İtirazlar** (queue, assign, internal/external comments, resolve with optional override); **Sertifikalar** (CA init wizard, SP certs with TNAuthList view, delegate certs, revoke, trusted roots); **API anahtarları**; **Kullanıcılar**; **Ayarlar** (thresholds, iat window, TTLs, ENUM zone info read-only); **Denetim kaydı**.

Enterprise pages (`/#/…`): **Başlangıç** (status stepper pending → in_review → verified); **Kurum** (form, documents upload metadata, submit); **Numaralar** (table with status chips, add single/range, CSV import with preview, release); **Marka** (display name/logo/call reason editor with live phone-screen preview, default toggle, approval state); **İtibar** (list of numbers with score+label, detail with factors in Turkish, history chart); **İtirazlar** (open form from a number, thread); **Webhook'lar** (create, events, deliveries log, test); **API anahtarları**; **Sertifika** (request delegate, download chain, CSR upload).

Key flows: (1) Kayıt → belge → gönder → operatör inceler → verified → numaralar ekle → marka onayı → `lookup` returns branding + attest A after carrier confirm. (2) Düşük puan → verified floor → system dispute → analyst reviews factors → resolve with override or coaching note → webhook notifies enterprise. (3) Operator onboards a carrier API key with `carrier:*` scopes, carrier posts CDR batches, dashboard shows ingest and label drift.

---

## 10. Build / run

**Makefile targets.** `make build` (`CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$(git describe)" -o bin/enumaracle ./cmd/enumaracle`), `make test` (`go test ./... -race -count=1`), `make test-pg` (runs the same store tests against `ENA_TEST_PG_DSN` when set), `make lint` (`go vet ./...`, `gofmt -l`), `make portal` (`cd portal && npm ci && npm run build` → copies `portal/dist/*` into `internal/portal/dist/`), `make run` (sqlite dev with `ENA_DEV=1`), `make migrate`, `make seed` (demo operator, two entities, numbers, CDR sample, CA init), `make openapi-check` (go test that diffs router registry vs `docs/openapi.yaml`), `make docker`, `make demo` (seed + run + prints curl/dig commands).

**Subcommands** (`enumaracle <cmd>`): `serve` (default), `migrate`, `seed`, `admin create-user --email --role`, `apikey create`, `ca init`, `verify --identity --from --to`, `backup` (sqlite: `VACUUM INTO`; pg: prints `pg_dump` command), `version`.

**Config (env, flags override with same names lower-kebab).**

| Variable | Default | Meaning |
|---|---|---|
| ENA_HTTP_ADDR | :8080 | API + portal |
| ENA_METRICS_ADDR | :9090 | /metrics |
| ENA_DNS_ADDR | :5353 | ENUM UDP+TCP |
| ENA_DB_DRIVER | sqlite | `sqlite` or `postgres` |
| ENA_DB_DSN | file:data/enumaracle.db | sqlite path or `postgres://…` |
| ENA_DB_MAX_CONNS | 16 | postgres pool |
| ENA_MASTER_KEY / ENA_MASTER_KEY_FILE | required | base64 32-byte AES key |
| ENA_PUBLIC_URL | http://localhost:8080 | x5u base, webhook links |
| ENA_ENUM_ZONE | e164.operator.enum. | DNS zone |
| ENA_ENUM_SIP_DOMAIN | sip.operator.tr | NAPTR target host |
| ENA_ENUM_TTL_ACTIVE / SUSPENDED / NEGATIVE | 300/60/60 | TTLs |
| ENA_DNS_ALLOW_CIDRS | (all) | source ACL |
| ENA_LOOKUP_REFRESH_MS | 1000 | snapshot refresh |
| ENA_IAT_WINDOW_SEC | 60 | PASSporT freshness |
| ENA_X5U_ALLOWED_HOSTS | (own host) | comma list |
| ENA_SCORE_INTERVAL | 5m | scoring job |
| ENA_EVENT_RETENTION_DAYS | 7 | raw CDR retention |
| ENA_INGEST_BUFFER | 50000 | events channel |
| ENA_SESSION_TTL | 12h | portal sessions |
| ENA_RATE_DEFAULT_RPS / BURST | 50 / 200 | api key defaults |
| ENA_WEBHOOK_WORKERS | 4 | delivery workers |
| ENA_LOG_LEVEL / ENA_LOG_FORMAT | info / json | slog |
| ENA_ADMIN_BOOTSTRAP_EMAIL / PASSWORD | — | creates first operator_admin on empty DB |
| ENA_DEV | 0 | permissive CORS for Vite dev server on :5173 |
| ENA_SECURE_COOKIES | 1 | Secure flag |

**Dockerfile** (multi-stage): `node:22-alpine` builds portal → `golang:1.24-alpine` builds binary with portal dist copied in → `gcr.io/distroless/static`, `USER 65532`, `EXPOSE 8080 9090 5353/udp 5353/tcp`, `ENTRYPOINT ["/enumaracle","serve"]`, volume `/data`. **docker-compose**: `enumaracle` (sqlite volume) profile `pilot`; `enumaracle` + `postgres:16` profile `prod`, healthcheck `wget -q -O- http://localhost:8080/readyz`. **Kubernetes** (`deploy/k8s/`): Namespace, Secret (`ENA_MASTER_KEY`, DSN), ConfigMap, Deployment (2 replicas, readiness `/readyz`, liveness `/healthz`, resources 500m/1Gi), Service ClusterIP for HTTP, Service `LoadBalancer`/`NodePort` UDP+TCP 53 → 5353 for ENUM (`externalTrafficPolicy: Local` for latency), ServiceMonitor, HPA on CPU, PodDisruptionBudget, optional CronJob for `backup`. Multi-replica note: ingest buffer and rate limits are per-pod; scoring job uses a `settings`-table lease (`jobs.scoring.lease`) so only one pod runs it.

**Embed.** `internal/portal/embed.go`:
```go
//go:embed dist
var dist embed.FS
func Handler() http.Handler // serves dist with SPA fallback to index.html, Cache-Control immutable for /assets/*
```
`internal/portal/dist/index.html` is committed (placeholder "Enumaracle portal build not included"); `dist/assets/` is gitignored; `make portal` overwrites. `main.go` mounts `/` last; `/v1/`, `/auth/`, `/certs/`, `/healthz`, `/readyz`, `/openapi.yaml` are registered before, so the mux's longest-pattern rule routes correctly.

**Upgrade path SQLite → PostgreSQL.** `enumaracle migrate --to postgres://…` copies tables in dependency-free order using the store interfaces' `ChangedSince`/`List` (same portable types), then switch `ENA_DB_DRIVER`. Backup: sqlite `VACUUM INTO` nightly; Postgres `pg_dump -Fc`; keys are useless without `ENA_MASTER_KEY`, which is backed up separately (documented in KURULUM.md).

---

## 11. Risks and the 5 most likely parallel-integration failure points

1. **Dependency / go.mod drift.** An agent runs `go get` or imports an unapproved module; `go.sum` changes conflict and builds break for everyone. *Mitigation:* `go.mod`/`go.sum` committed by A0 with all six deps pre-pulled (`go mod download`, `go mod vendor` optional); `make lint` includes `scripts/checkdeps.sh` diffing `go list -m all` against an allowlist; CI step fails on any `go.mod` change not authored by A0.

2. **Schema collisions and cross-package SQL.** Two packages touching the same table, a package writing a second migration file, or SQLite-only syntax (`AUTOINCREMENT`, `datetime('now')`, `||` on non-text, `INSERT OR REPLACE`). *Mitigation:* one migration per package with reserved prefix; table-name prefix check test in `platform/migrate_test.go` (each file may only create tables listed in its package's manifest); `platform/dialect_test.go` runs every embedded migration on SQLite **and** on a Postgres DSN when `ENA_TEST_PG_DSN` is set, plus a static grep test rejecting the forbidden tokens; stores only reference their own tables; cross-package data flows through `core` interfaces (`ScoreFeed`, `VerifiedLookup`, `ChangedSince`).

3. **Core contract churn.** Someone "just adds a field" to `core` mid-sprint and every other agent's compile breaks or semantics diverge (e.g. TN with vs. without `+`). *Mitigation:* `core` is written first, reviewed in one round, then frozen with `ContractVersion`; additive changes only via A0 pull request touching `core` alone; `core/tn_test.go` and `core/ids_test.go` pin the formats; all packages depend on `core` only and are tested with in-package fakes (`core/coretest` provides `FakeLookup`, `FakeNotifier`, `FakeAuditor`, `FakeAuthenticator`) so nobody blocks on a sibling.

4. **Route registration conflicts.** Go 1.22 `ServeMux` panics at startup on overlapping patterns (`/v1/admin/entities/{id}` vs `/v1/admin/entities/{id}/decision` is fine, but two packages registering `GET /v1/admin/dashboard` or one using `/v1/enterprise/{rest...}` kills the process). *Mitigation:* prefix ownership table in §1 is authoritative; `platform.Router.Handle` records `(method, pattern, scope, owner)` and `cmd/enumaracle/routes_test.go` boots all `Mount` functions on a fresh mux (catching panics), asserts each pattern's owner matches the table and that every route exists in `docs/openapi.yaml` (and vice versa). Wildcards `{rest...}` are forbidden outside the portal handler.

5. **Hot-path assumptions drift (snapshot vs. DB).** Reputation writes scores but the registry snapshot never sees them (watermark on the wrong column), DNS answers stale data, or an agent calls a DB-backed method from the DNS handler and the <5 ms budget is lost. *Mitigation:* `LookupService` is memory-only by contract (no `ctx`, no `error`); each `ChangedSince` method is backed by an index on `updated_at`/`computed_at` and covered by a store test that updates a row and asserts it is returned; `enumdns` tests use `coretest.FakeLookup`; an integration test in `cmd/enumaracle` (sqlite) adds a number via API, waits one refresh, and asserts both `/v1/carrier/lookup` and a real UDP query return it; a benchmark gate `BenchmarkLookup` must stay < 2 µs/op and `BenchmarkDNSQuery` < 50 µs/op.

Further risks and handling: **SQLite single writer under CDR load** (writer pool of one with WAL; ingest batches; pilot sizing documented at ~2–3 M events/day on NVMe; Postgres for more). **Clock skew on SBCs** causing `iat` failures (configurable window, SIP Date fallback, metric `verify_fail_reason="iat"` to spot it). **x5u SSRF** (host allowlist, no redirects, size/time caps). **KVKK** (TCKN encrypted, never logged, masked in APIs; audit of every read of entity detail; retention jobs). **Branding abuse** (approval queue, display-name denylist of bank/government terms unless entity sector matches, logo URL must be HTTPS and ≤ 256 KB verified by HEAD at approval). **Portal build missing** (placeholder committed; Go tests never depend on `dist/assets`). **Test flakiness from shared SQLite files** (each test opens `file::memory:?cache=shared&_pragma=…` with a unique name via `t.Name()`). **Multi-replica rate limiting** (per-pod token buckets documented; pilot runs one replica; Postgres-backed limiter is on the roadmap, not v1).

Agent assignment summary: A0 core+platform+cmd+deploy (first, then integrator), A1 identity, A2 registry (incl. lookup snapshot), A3 pki+passport, A4 reputation, A5 disputes+notify, A6 auth, A7 enumdns, A8 portal, A9 docs+openapi+seed data. Integration order after freeze: A0 wires packages as they land; `make test` and `make openapi-check` must be green before each wiring commit.
