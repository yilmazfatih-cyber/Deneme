import type {
  BrandingStatus,
  CertKind,
  DisputeStatus,
  DocumentKind,
  EntityStatus,
  FeedbackKind,
  NumberStatus,
  ReputationLabel,
  RiskTier,
  Role,
  Scope,
  TNKind,
  UseCase,
  Verstat,
} from './types'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface StatusInfo {
  text: string
  tone: Tone
}

export const ENTITY_STATUS: Record<EntityStatus, StatusInfo> = {
  pending: { text: 'Başvuru bekliyor', tone: 'neutral' },
  in_review: { text: 'İncelemede', tone: 'info' },
  verified: { text: 'Doğrulandı', tone: 'success' },
  rejected: { text: 'Reddedildi', tone: 'danger' },
  suspended: { text: 'Askıya alındı', tone: 'warning' },
}

export const NUMBER_STATUS: Record<NumberStatus, StatusInfo> = {
  pending_verification: { text: 'Doğrulama bekliyor', tone: 'info' },
  active: { text: 'Etkin', tone: 'success' },
  suspended: { text: 'Askıda', tone: 'warning' },
  released: { text: 'Bırakıldı', tone: 'neutral' },
}

export const BRANDING_STATUS: Record<BrandingStatus, StatusInfo> = {
  draft: { text: 'Taslak', tone: 'neutral' },
  pending_review: { text: 'İnceleme bekliyor', tone: 'info' },
  approved: { text: 'Onaylandı', tone: 'success' },
  rejected: { text: 'Reddedildi', tone: 'danger' },
}

export const REPUTATION_LABEL: Record<ReputationLabel, StatusInfo> = {
  clean: { text: 'Temiz', tone: 'success' },
  watch: { text: 'İzlemede', tone: 'info' },
  suspect: { text: 'Şüpheli', tone: 'warning' },
  spam: { text: 'Spam', tone: 'danger' },
  unknown: { text: 'Veri yok', tone: 'neutral' },
}

export const DISPUTE_STATUS: Record<DisputeStatus, StatusInfo> = {
  open: { text: 'Açık', tone: 'info' },
  in_review: { text: 'İncelemede', tone: 'warning' },
  resolved: { text: 'Çözüldü', tone: 'success' },
  rejected: { text: 'Reddedildi', tone: 'danger' },
}

export const CERT_STATUS: Record<string, StatusInfo> = {
  active: { text: 'Geçerli', tone: 'success' },
  revoked: { text: 'İptal edildi', tone: 'danger' },
  retired: { text: 'Emekli', tone: 'neutral' },
  expired: { text: 'Süresi doldu', tone: 'warning' },
}

export const VERSTAT: Record<Verstat, StatusInfo> = {
  'TN-Validation-Passed': { text: 'Doğrulama başarılı', tone: 'success' },
  'TN-Validation-Failed': { text: 'Doğrulama başarısız', tone: 'danger' },
  'No-TN-Validation': { text: 'Doğrulama yapılamadı', tone: 'neutral' },
}

export const ROLE_TEXT: Record<Role, string> = {
  operator_admin: 'Operatör yöneticisi',
  operator_analyst: 'Operatör analisti',
  enterprise_owner: 'Kurum yöneticisi',
  enterprise_user: 'Kurum kullanıcısı',
}

export const SCOPE_TEXT: Record<Scope, string> = {
  'carrier:read': 'Taşıyıcı okuma',
  'carrier:write': 'Taşıyıcı yazma',
  'enterprise:read': 'Kurum okuma',
  'enterprise:write': 'Kurum yazma',
  'admin:read': 'Yönetim okuma',
  admin: 'Yönetim (tam)',
}

export const USE_CASE_TEXT: Record<UseCase, string> = {
  customer_service: 'Müşteri hizmetleri',
  appointment_reminder: 'Randevu hatırlatma',
  delivery: 'Teslimat',
  collections: 'Tahsilat',
  marketing: 'Pazarlama',
  survey: 'Anket',
  otp_callback: 'Doğrulama geri araması',
  emergency: 'Acil durum',
  other: 'Diğer',
}

export const TN_KIND_TEXT: Record<TNKind, string> = {
  mobile: 'Mobil',
  geographic: 'Coğrafi (sabit)',
  non_geographic_850: '0850',
  toll_free: 'Ücretsiz (0800)',
  premium: 'Katma değerli (0900)',
  short_444: '444 kısa numara',
  international: 'Uluslararası',
  other: 'Diğer',
}

export const DOC_KIND_TEXT: Record<DocumentKind, string> = {
  tax_certificate: 'Vergi levhası',
  trade_registry: 'Ticaret sicil gazetesi',
  signature_circular: 'İmza sirküleri',
  authorization_letter: 'Yetki belgesi',
  number_allocation: 'Numara tahsis belgesi',
  other: 'Diğer belge',
}

export const DISPUTE_KIND_TEXT: Record<string, string> = {
  label: 'Etiket itirazı',
  suspension: 'Askıya alma itirazı',
  branding: 'Marka itirazı',
  lookup: 'Sorgu sonucu itirazı',
  other: 'Diğer',
}

export const FEEDBACK_KIND_TEXT: Record<FeedbackKind, string> = {
  label: 'Etiket',
  complaint: 'Şikâyet',
  block: 'Engelleme',
}

export const RISK_TEXT: Record<RiskTier, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

export const CERT_KIND_TEXT: Record<CertKind, string> = {
  root: 'Kök sertifika',
  intermediate: 'Ara sertifika',
  sp: 'Servis sağlayıcı (SP)',
  delegate: 'Yetki devri (delegate)',
}

export const CHECK_TEXT: Record<string, string> = {
  jws_parse: 'JWS ayrıştırma',
  alg: 'Algoritma (ES256)',
  ppt: 'PASSporT türü',
  x5u_fetch: 'Sertifika bulma (x5u)',
  signature: 'İmza',
  chain: 'Sertifika zinciri',
  not_expired: 'Süresi dolmamış',
  not_revoked: 'İptal edilmemiş',
  not_expired_revoked: 'Geçerlilik ve iptal',
  iat_fresh: 'Zaman damgası güncel (±60 sn)',
  orig_match: 'Arayan numara eşleşmesi',
  dest_match: 'Aranan numara eşleşmesi',
  tn_auth: 'Numara yetkisi (TNAuthList)',
  rcd: 'Zengin arama verisi (RCD)',
  rcd_identity: 'RCD Identity başlığı',
  rcdi: 'RCD bütünlük özeti (rcdi)',
}

export const EVENT_TEXT: Record<string, string> = {
  'entity.status_changed': 'Şirket durumu değişti',
  'number.status_changed': 'Numara durumu değişti',
  'branding.reviewed': 'Marka incelendi',
  'reputation.label_changed': 'İtibar etiketi değişti',
  'dispute.created': 'İtiraz açıldı',
  'dispute.updated': 'İtiraz güncellendi',
  'certificate.issued': 'Sertifika düzenlendi',
}

export const ATTEST_TEXT: Record<string, string> = {
  A: 'A — Tam doğrulama',
  B: 'B — Kısmi doğrulama',
  C: 'C — Ağ geçidi doğrulaması',
}

const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' })
const numFmt = new Intl.NumberFormat('tr-TR')

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

export function fmtNum(n?: number | null): string {
  return n === undefined || n === null ? '—' : numFmt.format(n)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${fmtNum(n)} B`
  if (n < 1024 * 1024) return `${numFmt.format(Math.round(n / 102.4) / 10)} KB`
  return `${numFmt.format(Math.round(n / 104857.6) / 10)} MB`
}

/** Formats a Turkish E.164 number for reading: +905321234567 → +90 532 123 45 67. */
export function fmtTN(tn?: string | null): string {
  if (!tn) return '—'
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(tn)
  if (m) return `+90 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  return tn
}

export function fmtRange(start: string, end: string): string {
  return start === end ? fmtTN(start) : `${fmtTN(start)} – ${fmtTN(end)}`
}

export function upperTR(s: string): string {
  return s.toLocaleUpperCase('tr-TR')
}

/** Up to two initials, uppercased with Turkish rules (i → İ). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p.charAt(0))
  return upperTR(letters.join(''))
}

export function runeLength(s: string): number {
  return [...s].length
}

/** Converts a datetime-local value to RFC 3339 (UTC). */
export function localToRFC3339(v: string): string {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Datetime-local value for now + days. */
export function localInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}
