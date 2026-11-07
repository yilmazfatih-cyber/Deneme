// Mirrors internal/core/types.go (JSON field names are the Go json tags).
// Timestamps arrive as RFC 3339 strings.

export type ISODate = string

export type Attest = 'A' | 'B' | 'C'
export type Verstat = 'TN-Validation-Passed' | 'TN-Validation-Failed' | 'No-TN-Validation'

export type EntityStatus = 'pending' | 'in_review' | 'verified' | 'rejected' | 'suspended'
export type RiskTier = 'low' | 'medium' | 'high'

export interface Entity {
  id: string
  legal_name: string
  trade_name: string
  country: string
  vkn: string
  mersis: string
  sector: string
  website: string
  city: string
  contact_name: string
  contact_email: string
  contact_phone: string
  iys_registered: boolean
  status: EntityStatus
  risk_tier: RiskTier | ''
  reject_reason?: string
  submitted_at?: ISODate
  vetted_at?: ISODate
  vetted_by?: string
  created_at: ISODate
  updated_at: ISODate
}

export type DocumentKind =
  | 'tax_certificate'
  | 'trade_registry'
  | 'signature_circular'
  | 'authorization_letter'
  | 'number_allocation'
  | 'other'

export interface EntityDocument {
  id: string
  entity_id: string
  kind: DocumentKind
  file_name: string
  mime_type: string
  sha256: string
  size_bytes: number
  uploaded_by: string
  created_at: ISODate
}

export interface VettingDecision {
  id: string
  entity_id: string
  from_status: EntityStatus
  to_status: EntityStatus
  reviewer_id: string
  note: string
  created_at: ISODate
}

export type NumberStatus = 'pending_verification' | 'active' | 'suspended' | 'released'

export type UseCase =
  | 'customer_service'
  | 'appointment_reminder'
  | 'delivery'
  | 'collections'
  | 'marketing'
  | 'survey'
  | 'otp_callback'
  | 'emergency'
  | 'other'

export type TNKind =
  | 'mobile'
  | 'geographic'
  | 'non_geographic_850'
  | 'toll_free'
  | 'premium'
  | 'short_444'
  | 'international'
  | 'other'

export interface PhoneNumber {
  id: string
  entity_id: string
  range_start: string
  range_end: string
  count: number
  kind: TNKind
  use_case: UseCase
  call_reason: string
  branding_id?: string
  status: NumberStatus
  carrier_confirmed: boolean
  suspend_reason?: string
  activated_at?: ISODate
  created_at: ISODate
  updated_at: ISODate
}

export type BrandingStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

export interface Branding {
  id: string
  entity_id: string
  display_name: string
  logo_url: string
  call_reason: string
  is_default: boolean
  status: BrandingStatus
  review_note?: string
  reviewed_by?: string
  reviewed_at?: ISODate
  created_at: ISODate
  updated_at: ISODate
}

export type ReputationLabel = 'clean' | 'watch' | 'suspect' | 'spam' | 'unknown'

export interface LookupResult {
  tn: string
  found: boolean
  entity_id?: string
  entity_name?: string
  verified: boolean
  number_status?: NumberStatus
  attest?: Attest
  use_case?: UseCase
  display_name?: string
  logo_url?: string
  call_reason?: string
  score: number
  label: ReputationLabel
  ttl: number
  computed_at: ISODate
}

export type CertKind = 'root' | 'intermediate' | 'sp' | 'delegate'

export interface TNEntry {
  spc?: string
  start?: string
  count?: number
  tn?: string
}

export interface Certificate {
  id: string
  kind: CertKind
  entity_id?: string
  issuer_id?: string
  serial: string
  subject_cn: string
  spc?: string
  tn_auth_list?: TNEntry[]
  not_before: ISODate
  not_after: ISODate
  pem: string
  x5u: string
  status: 'active' | 'revoked' | string
  revoked_at?: ISODate
  revoke_reason?: string
  created_at: ISODate
}

export interface RCDClaims {
  nam: string
  icn?: string
  crn?: string
}

export interface SignRequest {
  orig_tn: string
  dest_tn: string
  attest?: Attest
  orig_id?: string
  with_rcd: boolean
}

export interface SignResult {
  identity: string
  passport: string
  rcd_identity?: string
  rcd_passport?: string
  cert_id: string
  x5u: string
  attest: Attest
  orig_id: string
  iat: number
}

export interface VerifyRequest {
  identity: string
  rcd_identity?: string
  from_tn: string
  to_tn: string
}

export interface VerifyCheck {
  name: string
  ok: boolean
  detail?: string
}

export interface VerifyResult {
  verstat: Verstat
  attest?: Attest
  orig_id?: string
  cert_id?: string
  reason?: string
  rcd?: RCDClaims
  rcd_verified: boolean
  checks: VerifyCheck[]
  iat?: number
}

export type FeedbackKind = 'label' | 'complaint' | 'block'

export interface LabelFeedback {
  id: string
  tn: string
  source_id: string
  source_name: string
  kind: FeedbackKind
  label?: ReputationLabel
  confidence: number
  reason: string
  created_at: ISODate
}

export interface Factor {
  code: string
  value: number
  threshold: number
  penalty: number
  max_penalty: number
  text_tr: string
  text_en: string
}

export interface Score {
  tn: string
  score: number
  raw_score: number
  label: ReputationLabel
  floored: boolean
  override_label?: ReputationLabel
  override_until?: ISODate
  factors: Factor[] | null
  calls_24h: number
  calls_7d: number
  version: string
  computed_at: ISODate
}

export interface DailyStat {
  day: string
  calls: number
  answered: number
  short: number
  complaints: number
  blocks?: number
}

export interface ReputationDetail {
  score: Score
  feedback: LabelFeedback[] | null
  daily: DailyStat[] | null
}

export interface ReputationStats {
  labels: Partial<Record<ReputationLabel, number>>
  events_24h: number
  feedback_7d: number
}

export type DisputeStatus = 'open' | 'in_review' | 'resolved' | 'rejected'
export type DisputeKind = 'label' | 'suspension' | 'branding' | 'lookup' | 'other'

export interface Dispute {
  id: string
  entity_id: string
  tn: string
  kind: DisputeKind | string
  status: DisputeStatus
  title: string
  description: string
  resolution?: string
  opened_by: string
  resolved_by?: string
  resolved_at?: ISODate
  created_at: ISODate
  updated_at: ISODate
}

export type Role = 'operator_admin' | 'operator_analyst' | 'enterprise_owner' | 'enterprise_user'
export type Scope =
  | 'carrier:read'
  | 'carrier:write'
  | 'enterprise:read'
  | 'enterprise:write'
  | 'admin:read'
  | 'admin'

export interface DisputeComment {
  id: string
  dispute_id: string
  author_id: string
  author_role: Role
  body: string
  internal: boolean
  created_at: ISODate
}

export interface DisputeThread {
  dispute: Dispute
  comments: DisputeComment[] | null
}

export interface User {
  id: string
  email: string
  name: string
  role: Role
  entity_id?: string
  active: boolean
  last_login_at?: ISODate
  created_at: ISODate
}

export interface APIKey {
  id: string
  prefix: string
  name: string
  owner_kind: 'operator' | 'entity'
  owner_id?: string
  scopes: Scope[]
  rate_rps: number
  expires_at?: ISODate
  last_used_at?: ISODate
  revoked_at?: ISODate
  created_at: ISODate
}

export interface CreatedAPIKey {
  api_key: APIKey
  secret: string
}

export interface AuditEvent {
  id: string
  at: ISODate
  actor_kind: string
  actor_id: string
  action: string
  target_kind: string
  target_id: string
  request_id: string
  ip: string
  detail: string
}

// Webhook and delivery shapes mirror internal/notify.
export interface Webhook {
  id: string
  owner_kind: 'operator' | 'entity' | string
  entity_id?: string
  url: string
  /** Empty = all events. */
  events: string[] | null
  active: boolean
  created_at: ISODate
  updated_at?: ISODate
}

export interface CreatedWebhook {
  webhook: Webhook
  secret: string
}

/** Delivery status: pending | delivered | failed (retry scheduled at next_at) | dead. */
export interface Delivery {
  id: string
  webhook_id: string
  event_id: string
  event_type: string
  status: 'pending' | 'delivered' | 'failed' | 'dead' | string
  attempt: number
  next_at?: ISODate
  last_code: number
  last_error?: string
  delivered_at?: ISODate
  created_at: ISODate
  updated_at?: ISODate
}

export interface OutboxEmail {
  id: string
  to: string
  subject: string
  body: string
  created_at: ISODate
}

export type CountMap = Partial<Record<string, number>>

export interface AdminStats {
  entities: CountMap
  numbers: CountMap
  branding: CountMap
}

export interface EntityDetail {
  entity: Entity
  documents: EntityDocument[] | null
  decisions: VettingDecision[] | null
  numbers: PhoneNumber[] | null
  branding: Branding[] | null
}

export interface Session {
  user: User
  csrf_token: string
  scopes?: Scope[]
}

export interface ListResponse<T> {
  items: T[] | null
  total?: number
}

export interface SignupRequest {
  legal_name: string
  trade_name: string
  vkn: string
  mersis?: string
  sector: string
  website?: string
  city: string
  contact_name: string
  contact_email: string
  contact_phone: string
  iys_registered?: boolean
  password: string
}

export type EntityInput = Omit<SignupRequest, 'password'>

export const ROLE_SCOPES: Record<Role, Scope[]> = {
  operator_admin: ['admin', 'admin:read', 'carrier:read', 'carrier:write'],
  operator_analyst: ['admin:read', 'carrier:read'],
  enterprise_owner: ['enterprise:read', 'enterprise:write'],
  enterprise_user: ['enterprise:read'],
}

export const WEBHOOK_EVENTS = [
  'entity.status_changed',
  'number.status_changed',
  'branding.reviewed',
  'reputation.label_changed',
  'dispute.created',
  'dispute.updated',
  'certificate.issued',
] as const
