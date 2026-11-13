/**
 * Yol korumaları — saf karar işlevleri (birim testi: guards.test.ts). Bileşen tarafı: Guards.tsx.
 *
 *   herkese açık          /vitrin (cihaz vitrini), /_ui (galeri; /_ui/kabuk hariç)
 *   yalnız anonim         /karsilama (üye girişliyse içeri yönlenir)
 *   üye yeter             /profiller, /profiller/yonet, /bagla (TV'yi onaylamak için profil gerekmez)
 *   üye + profil          geri kalan her şey
 * Anonim → /karsilama, profilsiz üye → /profiller. Gidilmek istenen adres hatırlanır ve giriş / profil seçiminden
 * sonra oraya dönülür (ör. QR'dan açılan /bagla?kod=…).
 */
import type { BootContext } from '../../../shared/types'

export type Access = 'public' | 'anonymous' | 'member' | 'profile'

export type GuardDecision = { kind: 'allow' } | { kind: 'redirect'; to: string; remember: string | null }

type SessionLike = Pick<BootContext, 'membershipStatus' | 'activeProfile'> | null

export const HOME_PATH = '/goz-at'
export const WELCOME_PATH = '/karsilama'
export const PROFILES_PATH = '/profiller'

export function accessOf(pathname: string): Access {
  if (pathname === '/vitrin' || pathname.startsWith('/vitrin/')) return 'public'
  if (pathname === '/_ui' || (pathname.startsWith('/_ui/') && pathname !== '/_ui/kabuk')) return 'public'
  if (pathname === WELCOME_PATH) return 'anonymous'
  if (pathname === PROFILES_PATH || pathname.startsWith(`${PROFILES_PATH}/`)) return 'member'
  if (pathname === '/bagla') return 'member'
  return 'profile'
}

const isMember = (s: SessionLike) => s?.membershipStatus === 'CURRENT_MEMBER'

/** Sonradan dönülecek adres mi (kök ve ana sayfa zaten varsayılan hedef). */
function returnable(pathname: string, search: string): string | null {
  if (pathname === '/' || pathname === HOME_PATH) return null
  return pathname + search
}

export function decideAccess(session: SessionLike, pathname: string, search = ''): GuardDecision {
  const access = accessOf(pathname)
  if (access === 'public') return { kind: 'allow' }
  if (access === 'anonymous') {
    if (!isMember(session)) return { kind: 'allow' }
    return { kind: 'redirect', to: session?.activeProfile ? HOME_PATH : PROFILES_PATH, remember: null }
  }
  if (!isMember(session)) return { kind: 'redirect', to: WELCOME_PATH, remember: returnable(pathname, search) }
  if (access === 'member' || session?.activeProfile) return { kind: 'allow' }
  return { kind: 'redirect', to: PROFILES_PATH, remember: returnable(pathname, search) }
}

/**
 * Girişten sonra: hatırlanan adres yalnız üyelik isteyen bir yolsa (ör. /bagla) doğrudan oraya,
 * değilse profil seçiliyse hatırlanan adrese ya da ana sayfaya, seçili değilse profil kapısına.
 */
export function afterLoginTarget(session: SessionLike, next: string | null): string {
  if (next && accessOf(pathOf(next)) === 'member') return next
  if (session?.activeProfile) return next ?? HOME_PATH
  return PROFILES_PATH
}

/** Profil seçildikten sonra: hatırlanan adres ya da ana sayfa (profil sayfalarına geri dönülmez). */
export function afterProfileTarget(next: string | null): string {
  if (!next) return HOME_PATH
  const path = pathOf(next)
  const access = accessOf(path)
  if (path.startsWith(PROFILES_PATH) || access === 'anonymous' || access === 'public') return HOME_PATH
  return next
}

const pathOf = (href: string) => href.split('?')[0] ?? href
