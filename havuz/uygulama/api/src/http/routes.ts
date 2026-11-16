/**
 * Sunucu yol kalıpları: shared/src/api.ts → API_PATHS adreslerinin Hono karşılığı (`:param` biçiminde).
 * `satisfies` sayesinde API_PATHS'e eklenen her adres burada da karşılık ister (yoksa tip denetimi kırılır);
 * kural testi (test/rules.test.ts) her adresin bu kalıpla eşleştiğini ve sunucuda bağlı olduğunu denetler.
 *
 * Genişletme: yeni uçta (1) API_PATHS'e adres, (2) buraya kalıp, (3) modülün routes.ts'ine işleyici,
 * (4) docs/API.md'ye başlık. Ayrıntı: TARIFLER.md → "Yeni uç nokta ekle".
 */
import type { API_PATHS } from '@uygulama/shared'

export const ROUTES = {
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
  workspace: '/api/workspaces/:workspaceId',
  members: '/api/workspaces/:workspaceId/members',
  member: '/api/workspaces/:workspaceId/members/:userId',
  invites: '/api/workspaces/:workspaceId/invites',
  invitePreview: '/api/invites/:token',
  acceptInvite: '/api/invites/accept',
  sync: '/api/sync',
  events: '/api/events',
  adminUsers: '/api/admin/users',
  adminUser: '/api/admin/users/:userId',
  adminMetrics: '/api/admin/metrics',
  // YENİ ADRES BURAYA (API_PATHS'teki adla aynı anahtar)
} as const satisfies Record<keyof typeof API_PATHS, string>

export type RouteName = keyof typeof ROUTES
