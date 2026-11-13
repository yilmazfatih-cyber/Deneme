/**
 * Koruma bileşeni: guards.ts kararını uygular. Yönlendirmede gidilmek istenen adresi hatırlar
 * (giriş / profil seçiminden sonra açılır).
 */
import type { ReactElement, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { accessOf, decideAccess } from './guards'
import { peekLoginTarget, rememberNextPath, useSession } from './sessionStore'

export function Guard({ children }: { children: ReactNode }): ReactElement {
  const boot = useSession((s) => s.boot)
  const { pathname, search } = useLocation()
  const decision = decideAccess(boot, pathname, search)
  if (decision.kind === 'redirect') {
    if (decision.remember) rememberNextPath(decision.remember)
    // Giriş az önce yapıldıysa karşılama sayfasından, girişin seçtiği hedefe çıkılır (ör. QR'dan açılan /bagla?kod=…).
    const to = accessOf(pathname) === 'anonymous' ? (peekLoginTarget() ?? decision.to) : decision.to
    return <Navigate to={to} replace />
  }
  return <>{children}</>
}
