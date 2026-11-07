# Enumaracle build contract (v1)

Binding rules for every agent implementing a package. The shared code in
`internal/core` and `internal/platform` is already written, compiles and is
tested: **read it first** and do not modify it. If you believe it must change,
stop and report instead.

Module: `github.com/yilmazfatih-cyber/deneme/enumaracle`, Go 1.26.

## 1. Ownership

| Path | Owner | Notes |
| --- | --- | --- |
| `internal/core/`, `internal/platform/`, `internal/portal/embed.go`, `cmd/`, `go.mod`, `go.sum`, `Makefile`, `deploy/`, `Dockerfile` | lead | frozen for agents |
| `internal/registry/` | registry agent | entities (KYC/vetting), documents, numbers, branding, lookup, signup, demo seed. Migration `0100_registry.sql` |
| `internal/pki/`, `internal/passport/` | pki agent | keys, pilot STI-CA, TNAuthList certs, delegate certs, PASSporT shaken+rcd sign/verify. Migration `0300_pki.sql` |
| `internal/reputation/` | reputation agent | CDR ingest, feedback, scoring, labels, overrides. Migration `0400_reputation.sql` |
| `internal/enumdns/`, `internal/notify/` | dns agent | ENUM DNS server; webhooks + email outbox. Migration `0600_notify.sql` |
| `internal/auth/`, `internal/disputes/` | auth agent | users, sessions, API keys, audit endpoint; dispute tickets. Migrations `0700_auth.sql`, `0500_disputes.sql` |
| `web/` | portal agent | React 19 + Vite + TS portal; `npm run build` writes `internal/portal/dist/` |
| `docs/` (except this file and `proposals/`, `research/`) | docs agent | README.md (TR), ARCHITECTURE.md, API.md, openapi.yaml, KURULUM.md, SATIS.md, DEMO.md |

Write only inside your directories. **No new Go dependencies** (go.mod is frozen:
stdlib + miekg/dns, modernc sqlite, pgx, x/crypto, prometheus client, google/uuid).
A feature package imports only `core`, `platform` and allowed deps, never a sibling.

## 2. Package shape

Every feature package exposes exactly this (names fixed so `cmd` can wire it):

```go
package <pkg>

//go:embed migrations/*.sql
var Migrations embed.FS                       // omit for packages without tables (passport, enumdns)

type Deps struct {                            // fields beyond Base are core interfaces
    Base platform.Deps
    // e.g. Notifier core.Notifier; Directory core.EntityDirectory ...
}

func New(d Deps) (*Service, error)
func (s *Service) Mount(r *platform.Router)   // registers routes via r.Handle(method, path, scope, h)
func (s *Service) Start(ctx context.Context) error // background loops; return nil if none; must stop on ctx.Done()
```

Wiring order in `cmd/enumaracle` (cycles broken by setters):

1. `notify.New{Base}` → implements `core.Notifier`
2. `auth.New{Base}` → implements `core.Authenticator`, `core.Accounts`; also `auth.(*Service).Bootstrap(ctx)` creates the operator admin from config
3. `registry.New{Base, Notifier, Accounts}` → implements `core.LookupService`, `core.EntityDirectory`
4. `reputation.New{Base, Notifier, Directory}` → implements `core.ReputationReader`, `core.ReputationAdmin`
5. `registry.(*Service).SetReputation(core.ReputationReader)`
6. `pki.New{Base, Directory, Lookup, Notifier}`; `pki.(*Service).Init(ctx)` creates root, intermediate and the operator SP certificate if missing
7. `disputes.New{Base, Notifier, Directory, Reputation core.ReputationAdmin}`
8. `enumdns.New{Base, Lookup}`; `Start` listens on `Cfg.DNSAddr` (UDP+TCP), no `Mount`
9. Demo seed: `registry.(*Service).SeedDemo(ctx)` and `reputation.(*Service).SeedDemo(ctx)` when `Cfg.DemoData`

`core.LookupService.Lookup`, `core.EntityDirectory` and `core.ReputationReader` must
work when their optional dependencies are nil (e.g. lookup before `SetReputation`
returns Score -1, Label "unknown").

## 3. Data rules

- SQL uses `?` placeholders only; `platform.DB` rebinds for PostgreSQL. Portable types:
  `TEXT` (ids = `core.NewID()`, timestamps via `platform.TS`/`ParseTS`, JSON),
  `INTEGER`/`BIGINT`, `REAL`, booleans as `INTEGER` 0/1 (`platform.Bool`). No `AUTOINCREMENT`,
  no `RETURNING`, no triggers, no `ON CONFLICT` (do read-then-write in `InTx`, or catch
  `platform.IsUniqueViolation`). Each statement in a migration ends with `;` at end of line.
- Phone numbers are stored normalized E.164 (`core.NormalizeTN`). Every handler normalizes input.
- Every state-changing admin/enterprise action writes `platform.Audit(ctx, tx, action, targetKind, targetID, detail)`.
- Errors: return `core` sentinels (`core.Errorf(core.ErrNotFound, ...)`, `core.Invalid(field, msgTR)`,
  `&core.ValidationError{}`); the router renders RFC 9457 problem+json. Field messages in Turkish.
- Enterprise endpoints act on `core.PrincipalFrom(ctx).EntityID` only; a missing entity id → 403.
  Operator principals never get enterprise data through enterprise endpoints.
- JSON field names are snake_case exactly as the `core` struct tags. List responses are
  `{"items": [...]}` (plus optional `"total"`); single objects are returned bare.
- Tests: `go test ./internal/<pkg>/...` using `platform.NewTestDeps(ctx, <pkg>.Migrations)` and
  `httptest` with `platform.NewRouter` + `platform.StaticAuth` for HTTP. No network, no Docker.

## 4. HTTP API (complete v1 route table)

Scopes: `carrier:read`, `carrier:write`, `enterprise:read`, `enterprise:write`, `admin:read`, `admin`
(`admin` implies `admin:read`). Portal users get scopes from `core.RoleScopes`; API keys carry explicit scopes.
Unsafe methods from cookie sessions need header `X-CSRF-Token` (router enforces).

### auth (auth agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| POST | /auth/login | public | `{email,password}` → `{user: User, csrf_token}`; sets cookie `enm_session` (HttpOnly, SameSite=Lax, Secure per config, 12h). 401 on bad credentials; 5 failures/15 min per email+IP → 429 |
| POST | /auth/logout | public | → 204, clears cookie and deletes session |
| GET | /auth/me | public | → `{user: User, csrf_token, scopes: []}` or 401 |
| GET | /v1/admin/users | admin:read | → `{items: [User]}` |
| POST | /v1/admin/users | admin | `{email,name,password,role,entity_id?}` → User (201). Password ≥ 10 chars |
| POST | /v1/admin/users/{id}/active | admin | `{active: bool}` → User |
| GET | /v1/admin/apikeys | admin:read | → `{items: [APIKey]}` |
| POST | /v1/admin/apikeys | admin | `{name, owner_kind: operator\|entity, owner_id?, scopes: [], rate_rps?, expires_at?}` → `{api_key: APIKey, secret}` (201, secret shown once, format `enm_<prefix8>_<32 random base32>`) |
| DELETE | /v1/admin/apikeys/{id} | admin | revoke → 204 |
| GET | /v1/enterprise/apikeys | enterprise:read | own entity keys |
| POST | /v1/enterprise/apikeys | enterprise:write | `{name, scopes}` (only enterprise:* allowed) → `{api_key, secret}` |
| DELETE | /v1/enterprise/apikeys/{id} | enterprise:write | own key only → 204 |
| GET | /v1/admin/audit | admin:read | `?target_kind=&target_id=&limit=` → `{items: [AuditEvent]}` |

### registry (registry agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| POST | /v1/signup | public | `{legal_name, trade_name, vkn, mersis?, sector, website?, city, contact_name, contact_email, contact_phone, password}` → `{entity: Entity, user: User}` (201). Creates entity `pending` + `enterprise_owner` user via `core.Accounts`. VKN checksum, MERSİS format, duplicate VKN → 409 |
| GET | /v1/enterprise/entity | enterprise:read | → Entity |
| PUT | /v1/enterprise/entity | enterprise:write | same fields as signup minus password; only in `pending`/`rejected` → Entity |
| POST | /v1/enterprise/entity/submit | enterprise:write | `pending`/`rejected` → `in_review` → Entity |
| GET | /v1/enterprise/entity/documents | enterprise:read | → `{items: [EntityDocument]}` |
| POST | /v1/enterprise/entity/documents | enterprise:write | `{kind, file_name, mime_type, sha256, size_bytes}` → EntityDocument (201) |
| GET | /v1/enterprise/numbers | enterprise:read | → `{items: [Number]}` |
| POST | /v1/enterprise/numbers | enterprise:write | `{tn}` or `{range_start, range_end}` + `{use_case, call_reason, branding_id?}` → Number `pending_verification` (201). Range ≤ 10 000, same length, no overlap with any non-released number → 409 |
| PUT | /v1/enterprise/numbers/{id} | enterprise:write | `{use_case, call_reason, branding_id?}` → Number |
| DELETE | /v1/enterprise/numbers/{id} | enterprise:write | → status `released` (204) |
| GET | /v1/enterprise/branding | enterprise:read | → `{items: [Branding]}` |
| POST | /v1/enterprise/branding | enterprise:write | `{display_name, logo_url?, call_reason?, is_default}` → Branding `pending_review` (201). display_name ≤ 32 runes, logo https ≤ 512, call_reason ≤ 64 |
| PUT | /v1/enterprise/branding/{id} | enterprise:write | same body → back to `pending_review` |
| GET | /v1/admin/entities | admin:read | `?status=&q=&limit=` → `{items: [Entity], total}` |
| POST | /v1/admin/entities | admin | signup fields minus password → Entity (201) |
| GET | /v1/admin/entities/{id} | admin:read | → `{entity, documents, decisions, numbers, branding}` |
| POST | /v1/admin/entities/{id}/decision | admin | `{to_status: in_review\|verified\|rejected\|suspended, note, risk_tier?}` → Entity. Legal: pending→in_review; in_review→verified\|rejected; verified→suspended; suspended→verified; rejected→in_review. Else 409. Suspending an entity suspends its active numbers. Emits `entity.status_changed` |
| GET | /v1/admin/numbers | admin:read | `?status=&entity_id=&limit=` → `{items: [Number], total}` |
| POST | /v1/admin/numbers/{id}/status | admin | `{status: active\|suspended, reason?, carrier_confirmed?}` → Number. `active` requires entity `verified`. Emits `number.status_changed` |
| GET | /v1/admin/branding | admin:read | `?status=` → `{items: [Branding]}` |
| POST | /v1/admin/branding/{id}/review | admin | `{status: approved\|rejected, note}` → Branding. Emits `branding.reviewed` |
| GET | /v1/admin/stats | admin:read | → `{entities: {status: n}, numbers: {status: n}, branding: {status: n}}` |
| GET | /v1/carrier/lookup/{tn} | carrier:read | → LookupResult |
| POST | /v1/carrier/lookup | carrier:read | `{tns: [≤100]}` → `{items: [LookupResult]}` |

Lookup rules: `Verified` = entity `verified` AND number `active`. `Attest` = `A` when verified and
`carrier_confirmed`, `B` when verified only, `C` otherwise (empty when not found). Branding fields only
from **approved** branding (number override, else entity default) and only when verified. Score/Label from
`ReputationReader` (no data → -1/`unknown`). `TTLSeconds` = `Cfg.LookupTTL` seconds (min 1). Results are
cached in memory for `Cfg.LookupTTL` (0 = no cache); writes invalidate the cache.

### pki + passport (pki agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| GET | /certs/{file} | public | `{cert_id}.pem` → PEM chain (leaf + intermediate), `application/x-pem-file`. This is the x5u target: `Cfg.PublicBaseURL + "/certs/" + id + ".pem"` |
| GET | /v1/admin/pki/certificates | admin:read | → `{items: [Certificate]}` (no private material) |
| POST | /v1/admin/pki/certificates/{id}/revoke | admin | `{reason}` → Certificate |
| POST | /v1/admin/pki/rotate-sp | admin | issue a new operator SP cert, retire old → Certificate |
| GET | /v1/enterprise/certificates | enterprise:read | → `{items: [Certificate]}` |
| POST | /v1/enterprise/certificates | enterprise:write | issue RFC 9060 delegate cert with TNAuthList = entity's **active** numbers; entity must be verified → Certificate (201). Emits `certificate.issued` |
| POST | /v1/carrier/sign | carrier:write | SignRequest → SignResult. Signs with operator SP cert. Attest from lookup when empty. `with_rcd` adds an rcd PASSporT from approved branding (nam, icn, crn) |
| POST | /v1/carrier/verify | carrier:read | VerifyRequest → VerifyResult |
| POST | /v1/enterprise/rcd/sign | enterprise:write | `{orig_tn, dest_tn}` → SignResult, signed with the entity's delegate cert; orig_tn must be covered by its TNAuthList |

PASSporT rules: header `{"alg":"ES256","ppt":"shaken"|"rcd","typ":"passport","x5u":...}`; payload claims
in lexicographic order with no whitespace (RFC 8225 §9): `attest`, `dest: {"tn":[..]}`, `iat`, `orig: {"tn":..}`,
`origid` (shaken); `rcd` adds `rcd: {nam, icn?, crn?}` and `rcdi` (RFC 9795 integrity digest over icn content is
out of scope; set `rcdi` only for `nam`/`crn` JSON pointers using sha256). TNs in passports are digits without `+`.
Identity header: `<jws>;info=<x5u>;alg=ES256;ppt=shaken`. Signatures ES256 as raw r||s (64 bytes) base64url.
Verify checks, each reported in `checks`: jws_parse, alg, ppt, x5u_fetch (local cert store lookup by URL; never
fetch remote URLs in v1), signature, chain (to the pilot root), not_expired/not_revoked, iat_fresh (±60 s),
orig_match, dest_match, tn_auth (TNAuthList of the signing cert covers orig via SPC (operator SP cert) or TN
range (delegate)). All pass → `TN-Validation-Passed`; signature or chain failure → `TN-Validation-Failed`;
unparseable/absent → `No-TN-Validation`. TNAuthList is the X.509 extension OID 1.3.6.1.5.5.7.1.26 encoded
per RFC 8226 ASN.1 (ServiceProviderCode [0] IA5String, TelephoneNumberRange [1] SEQUENCE{start IA5String,
count INTEGER}, TelephoneNumber [2] IA5String), implemented with encoding/asn1. Private keys P-256, sealed
with `Base.Sealer` (AAD = key id), never returned.

### reputation (reputation agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| POST | /v1/carrier/events | carrier:write | `{events: [{orig_tn, dest_tn, started_at RFC3339, disposition, duration_sec, verstat?}]}` (≤ 5000) or `text/csv` with the same header row → `{accepted, rejected, errors: [{index, message}]}` |
| POST | /v1/carrier/labels | carrier:write | `{tn, kind: label\|complaint\|block, label?, confidence?, reason?, source_name?}` → LabelFeedback (201) |
| GET | /v1/carrier/reputation/{tn} | carrier:read | → Score (404 when no data) |
| GET | /v1/enterprise/reputation | enterprise:read | → `{items: [Score]}` for the entity's numbers (single numbers; ranges aggregated per number that has events) |
| GET | /v1/enterprise/reputation/{tn} | enterprise:read | own numbers only → Score |
| GET | /v1/admin/reputation | admin:read | `?label=&limit=` → `{items: [Score]}` worst first |
| GET | /v1/admin/reputation/{tn} | admin:read | → `{score: Score, feedback: [LabelFeedback], daily: [{day, calls, answered, short, complaints}]}` (last 14 days) |
| POST | /v1/admin/reputation/{tn}/override | admin | `{label, reason, until RFC3339}` → Score |
| DELETE | /v1/admin/reputation/{tn}/override | admin | → Score |
| POST | /v1/admin/reputation/recompute | admin | → `{scored: n}` |
| GET | /v1/admin/reputation-stats | admin:read | → `{labels: {label: n}, events_24h, feedback_7d}` |

Scoring (version `r1`), windows 24 h and 7 d from stored events: start at 100 and subtract capped penalties,
each a `Factor` with Turkish and English text: volume spike (24 h vs 7 d daily mean, max 15), unique destination
ratio over 7 d with ≥ 50 calls (max 20), answer rate below 30 % (max 20), short calls (< 6 s answered) ratio (max 15),
complaints per 1000 calls and blocks (max 20), third-party labels weighted by confidence and recency (max 25),
verstat failed ratio (max 10). Labels: ≥ 70 clean, 50–69 watch, 30–49 suspect, < 30 spam. Verified identity
(lookup `Verified`) → protective floor 50 unless complaints/blocks penalty is maxed (`floored: true`). Operator
override wins until it expires. Label changes emit `reputation.label_changed` with the owning entity id.
Scores are recomputed every `Cfg.ScoreInterval` for numbers with new events/feedback, and on demand.

### disputes (auth agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| GET | /v1/enterprise/disputes | enterprise:read | → `{items: [Dispute]}` |
| POST | /v1/enterprise/disputes | enterprise:write | `{tn, kind, title, description}`; tn must belong to the entity (via Directory) → Dispute (201). Emits `dispute.created` |
| GET | /v1/enterprise/disputes/{id} | enterprise:read | → `{dispute, comments: [non-internal]}` |
| POST | /v1/enterprise/disputes/{id}/comments | enterprise:write | `{body}` → DisputeComment (201) |
| GET | /v1/admin/disputes | admin:read | `?status=` → `{items: [Dispute]}` |
| GET | /v1/admin/disputes/{id} | admin:read | → `{dispute, comments: [all]}` |
| POST | /v1/admin/disputes/{id}/status | admin | `{status: in_review\|resolved\|rejected, resolution?, clear_label?: bool}`; `clear_label` on a resolved label dispute sets override `clean` for 30 days via `core.ReputationAdmin` → Dispute. Emits `dispute.updated` |
| POST | /v1/admin/disputes/{id}/comments | admin | `{body, internal}` → DisputeComment (201) |

### notify (dns agent)
| Method | Path | Scope | Request → Response |
| --- | --- | --- | --- |
| GET | /v1/enterprise/webhooks | enterprise:read | → `{items: [Webhook]}` (no secret) |
| POST | /v1/enterprise/webhooks | enterprise:write | `{url (https, or http://localhost for tests), events: []}` → `{webhook, secret}` (201) |
| DELETE | /v1/enterprise/webhooks/{id} | enterprise:write | → 204 |
| GET | /v1/enterprise/webhooks/{id}/deliveries | enterprise:read | → `{items: [Delivery]}` |
| GET | /v1/admin/webhooks | admin:read | → `{items: [Webhook]}` |
| POST | /v1/admin/webhooks | admin | operator-owned webhook receiving all events → `{webhook, secret}` |
| DELETE | /v1/admin/webhooks/{id} | admin | → 204 |
| GET | /v1/admin/outbox | admin:read | email outbox → `{items: [{id, to, subject, body, created_at}]}` |

Webhook delivery: POST JSON `core.Event`; headers `X-Enumaracle-Event`, `X-Enumaracle-Delivery`,
`X-Enumaracle-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`; 5 s timeout; retries with
backoff 1 m, 5 m, 30 m, 2 h, 6 h then `dead`. Secrets sealed. `Notify` only inserts rows; a worker started by
`Start` delivers. Also writes an email outbox row to the entity contact email (lookup via a narrow
setter `notify.(*Service).SetEmails(func(ctx context.Context, entityID string) (string, error))`, called by cmd after registry exists; nil = skip email).

### ENUM DNS (dns agent)
Zone `Cfg.ENUMZone`. Query name = reversed digits of the E.164 number, dot-separated, + zone
(`+905321234567` → `7.6.5.4.3.2.1.2.3.5.0.9.e164.enumaracle.local.`).
- `NAPTR`: `100 10 "u" "E2U+sip" "!^.*$!sip:+905321234567@<SIPDomain>;user=phone;verstat=<verstat>!" .`
  where verstat = `TN-Validation-Passed` when lookup Verified, else `No-TN-Validation`.
- `TXT`: one string ≤ 255 bytes: `v=enm1;verified=1;attest=A;score=87;label=clean;name=<display name, percent-encoded>;reason=<call reason, percent-encoded>`.
- `ANY` returns both. Unknown number with no reputation → NXDOMAIN with SOA in authority. Known reputation only → TXT only.
- Zone apex `SOA` and `NS` (ns1.<zone>). Other zones → REFUSED. TTL = `Cfg.LookupTTL` seconds (min 1).
- UDP and TCP on `Cfg.DNSAddr`; Prometheus counters `enumaracle_dns_queries_total{qtype,rcode}` and latency histogram.

## 5. Self-check before reporting done

```sh
cd enumaracle
gofmt -l ./internal/<pkg>          # must print nothing
go vet ./internal/<pkg>/...
go test ./internal/<pkg>/...
```
Do not run `go mod tidy`. Do not touch other packages even if `go build ./...` shows their errors.
