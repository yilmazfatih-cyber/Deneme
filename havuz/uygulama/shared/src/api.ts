/**
 * API sözleşmesi: kimlik, hesap, çalışma alanı ve yönetim uçlarının istek/yanıt şemaları ve adresleri.
 * Sunucu gelen gövdeyi bu şemalarla doğrular; istemci yanıtı bu şemalarla okur. Eşitleme şemaları: sync.ts.
 *
 * Genişletme: yeni uç nokta eklerken (1) şemasını buraya, (2) adresini API_PATHS'e, (3) işleyicisini
 * api/src/modules altına, (4) istemci çağrısını web/src/lib/api.ts'e ekleyin. Uçların dökümü: docs/API.md.
 */
import { z } from 'zod'
import { idSchema } from './ids.ts'

// ── Ortak sabitler ───────────────────────────────────────────────────────────────────────────────

/** NIST 800-63B çizgisi: uzunluk önemli, karakter türü zorunluluğu yok. */
export const PASSWORD_MIN = 10
/** Üst sınır, çok uzun girdiyle özet hesaplatıp sunucuyu yormayı (DoS) önler. */
export const PASSWORD_MAX = 128

export const ROLES = ['user', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const WORKSPACE_ROLES = ['owner', 'editor', 'viewer'] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const WORKSPACE_KINDS = ['personal', 'shared'] as const
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number]

/** Bu roller kayıt yazabilir; `viewer` yalnız okur. */
export function canWrite(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'editor'
}

/** İstemcinin hesapsız (yalnız bu cihazda) çalışırken kullandığı alan. Sunucuya hiç gönderilmez. */
export const LOCAL_WORKSPACE_ID = 'local'

/** Oturum çerezinin adı. Üretimde (HTTPS) `__Host-` önekiyle kullanılır. */
export const SESSION_COOKIE = 'sid'

export const HEADERS = {
  /** `token` gönderilirse giriş/kayıt yanıtı oturum belirtecini gövdede de döndürür (farklı alan adından kullanım). */
  authMode: 'X-Auth-Mode',
  /** İstemci sürümü: `web/0.1.0`. Günlüklerde sorun ayıklamaya yarar. */
  client: 'X-Client',
} as const

// ── Alan şemaları ────────────────────────────────────────────────────────────────────────────────

/**
 * E-posta küçük harfe çevrilir. Burada bilerek düz (İngilizce) küçültme kullanılır: e-posta adresleri ASCII'dir ve
 * Türkçe kuralla küçültmek "I" harfini "ı" yapıp adresi bozar.
 */
function normalizeEmail(value: string): string {
  // eslint-disable-next-line no-restricted-syntax -- e-posta ASCII'dir; Türkçe kural burada YANLIŞ olur
  return value.trim().toLowerCase()
}

export const emailSchema = z
  .string()
  .max(254, 'E-posta çok uzun.')
  .transform(normalizeEmail)
  .pipe(z.email('Geçerli bir e-posta yazın.'))

export const nameSchema = z.string().trim().min(1, 'Adınızı yazın.').max(80, 'Ad en çok 80 karakter olabilir.')

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Şifre en az ${PASSWORD_MIN} karakter olmalı.`)
  .max(PASSWORD_MAX, `Şifre en çok ${PASSWORD_MAX} karakter olabilir.`)

/** Var olan şifre girilirken uzunluk kuralı uygulanmaz (eski kuralla açılmış hesaplar girebilsin). */
export const currentPasswordSchema = z.string().min(1, 'Şifrenizi yazın.').max(PASSWORD_MAX)

export const tokenSchema = z.string().min(16).max(256)

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Alana bir ad verin.')
  .max(80, 'Ad en çok 80 karakter olabilir.')

// ── Nesneler ─────────────────────────────────────────────────────────────────────────────────────

export const userSchema = z.object({
  id: idSchema,
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
})
export type User = z.infer<typeof userSchema>

export const workspaceInfoSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(WORKSPACE_KINDS),
  /** İsteği yapan kullanıcının bu alandaki rolü. */
  role: z.enum(WORKSPACE_ROLES),
  /** Alanın son değişiklik numarası (eşitleme imleci bununla karşılaştırılır). */
  rev: z.number().int().nonnegative(),
  memberCount: z.number().int().positive(),
})
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>

export const memberSchema = z.object({
  userId: idSchema,
  name: z.string(),
  email: z.string(),
  role: z.enum(WORKSPACE_ROLES),
  joinedAt: z.iso.datetime(),
})
export type Member = z.infer<typeof memberSchema>

// ── Kimlik ───────────────────────────────────────────────────────────────────────────────────────

export const registerRequestSchema = z.object({ email: emailSchema, password: newPasswordSchema, name: nameSchema })
export type RegisterRequest = z.input<typeof registerRequestSchema>

export const loginRequestSchema = z.object({ email: emailSchema, password: currentPasswordSchema })
export type LoginRequest = z.input<typeof loginRequestSchema>

/** `token` yalnız istek `X-Auth-Mode: token` başlığıyla geldiyse dolar; yoksa oturum yalnız çerezdedir. */
export const authResponseSchema = z.object({ user: userSchema, token: z.string().optional() })
export type AuthResponse = z.infer<typeof authResponseSchema>

export const meResponseSchema = z.object({ user: userSchema })
export type MeResponse = z.infer<typeof meResponseSchema>

export const changePasswordRequestSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
})
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>

export const forgotPasswordRequestSchema = z.object({ email: emailSchema })
export type ForgotPasswordRequest = z.input<typeof forgotPasswordRequestSchema>

export const resetPasswordRequestSchema = z.object({ token: tokenSchema, newPassword: newPasswordSchema })
export type ResetPasswordRequest = z.input<typeof resetPasswordRequestSchema>

// ── Hesap ────────────────────────────────────────────────────────────────────────────────────────

export const updateProfileRequestSchema = z.object({ name: nameSchema })
export type UpdateProfileRequest = z.input<typeof updateProfileRequestSchema>

export const deleteAccountRequestSchema = z.object({ password: currentPasswordSchema })
export type DeleteAccountRequest = z.input<typeof deleteAccountRequestSchema>

// ── Çalışma alanları ─────────────────────────────────────────────────────────────────────────────

export const createWorkspaceRequestSchema = z.object({ name: workspaceNameSchema })
export type CreateWorkspaceRequest = z.input<typeof createWorkspaceRequestSchema>

export const updateWorkspaceRequestSchema = z.object({ name: workspaceNameSchema })
export type UpdateWorkspaceRequest = z.input<typeof updateWorkspaceRequestSchema>

export const workspaceResponseSchema = z.object({ workspace: workspaceInfoSchema })
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>

export const workspacesResponseSchema = z.object({ workspaces: z.array(workspaceInfoSchema) })
export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>

export const membersResponseSchema = z.object({ members: z.array(memberSchema) })
export type MembersResponse = z.infer<typeof membersResponseSchema>

export const updateMemberRequestSchema = z.object({ role: z.enum(WORKSPACE_ROLES) })
export type UpdateMemberRequest = z.input<typeof updateMemberRequestSchema>

export const memberResponseSchema = z.object({ member: memberSchema })
export type MemberResponse = z.infer<typeof memberResponseSchema>

/** Davetle `owner` verilmez; sahiplik yalnız üyeler arasında devredilir. */
export const INVITE_ROLES = ['editor', 'viewer'] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

export const createInviteRequestSchema = z.object({ role: z.enum(INVITE_ROLES) })
export type CreateInviteRequest = z.input<typeof createInviteRequestSchema>

export const inviteSchema = z.object({
  /** Bağlantıya konacak tek kullanımlık gizli değer. Yalnız oluşturulduğu anda döner; sunucu özetini saklar. */
  token: z.string(),
  role: z.enum(INVITE_ROLES),
  expiresAt: z.iso.datetime(),
})
export type Invite = z.infer<typeof inviteSchema>

export const inviteResponseSchema = z.object({ invite: inviteSchema })
export type InviteResponse = z.infer<typeof inviteResponseSchema>

export const invitePreviewSchema = z.object({
  workspaceName: z.string(),
  role: z.enum(INVITE_ROLES),
  invitedBy: z.string(),
  expiresAt: z.iso.datetime(),
})
export type InvitePreview = z.infer<typeof invitePreviewSchema>

export const acceptInviteRequestSchema = z.object({ token: tokenSchema })
export type AcceptInviteRequest = z.input<typeof acceptInviteRequestSchema>

// ── Anlık bildirim (SSE) ─────────────────────────────────────────────────────────────────────────

/**
 * `GET /api/events` akışındaki `poke` olayının verisi: "şu alan değişti, eşitle" dürtmesi.
 * `clientId`, değişikliği yapan cihazdır; o cihaz kendi dürtmesini yok sayar.
 */
export const pokeEventSchema = z.object({
  workspaceId: idSchema,
  rev: z.number().int().nonnegative(),
  clientId: idSchema.nullable(),
})
export type PokeEvent = z.infer<typeof pokeEventSchema>

// ── Sistem ve yönetim ────────────────────────────────────────────────────────────────────────────

export const healthResponseSchema = z.object({ ok: z.literal(true), version: z.string(), time: z.iso.datetime() })
export type HealthResponse = z.infer<typeof healthResponseSchema>

export const adminUserSchema = userSchema.extend({
  disabled: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
})
export type AdminUser = z.infer<typeof adminUserSchema>

export const adminUsersResponseSchema = z.object({ users: z.array(adminUserSchema), nextCursor: z.string().nullable() })
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>

export const adminUpdateUserRequestSchema = z
  .object({ disabled: z.boolean().optional(), role: z.enum(ROLES).optional() })
  .refine((value) => value.disabled !== undefined || value.role !== undefined, 'En az bir alan verin.')
export type AdminUpdateUserRequest = z.input<typeof adminUpdateUserRequestSchema>

export const adminUserResponseSchema = z.object({ user: adminUserSchema })
export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>

// ── Web yolları ──────────────────────────────────────────────────────────────────────────────────

/**
 * Sunucunun e-postalara koyduğu ve istemcinin paylaştığı bağlantıların web yolları.
 * Web uygulaması HashRouter kullanır; tam adres `webUrl` ile kurulur. İki taraf da yolu BURADAN okur.
 */
export const WEB_ROUTES = {
  resetPassword: '/sifre-sifirla',
  invite: '/davet',
} as const

/** `https://ornek.app` + `/davet` + `{ token }` → `https://ornek.app/#/davet?token=...` */
export function webUrl(appUrl: string, route: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString()
  return `${appUrl.replace(/\/+$/, '')}/#${route}${query ? `?${query}` : ''}`
}

// ── Adresler ─────────────────────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent

/** Uç nokta adresleri. İstemci adresleri elle yazmaz; buradan alır. Sunucudaki yollar bunlarla aynıdır. */
export const API_PATHS = {
  health: '/api/health',
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  logoutAll: '/api/auth/logout-all',
  me: '/api/auth/me',
  changePassword: '/api/auth/password/change',
  forgotPassword: '/api/auth/password/forgot',
  resetPassword: '/api/auth/password/reset',
  account: '/api/account',
  accountExport: '/api/account/export',
  workspaces: '/api/workspaces',
  workspace: (id: string) => `/api/workspaces/${enc(id)}`,
  members: (workspaceId: string) => `/api/workspaces/${enc(workspaceId)}/members`,
  member: (workspaceId: string, userId: string) => `/api/workspaces/${enc(workspaceId)}/members/${enc(userId)}`,
  invites: (workspaceId: string) => `/api/workspaces/${enc(workspaceId)}/invites`,
  invitePreview: (token: string) => `/api/invites/${enc(token)}`,
  acceptInvite: '/api/invites/accept',
  sync: '/api/sync',
  events: '/api/events',
  adminUsers: '/api/admin/users',
  adminUser: (id: string) => `/api/admin/users/${enc(id)}`,
  // YENİ ADRES BURAYA
} as const
