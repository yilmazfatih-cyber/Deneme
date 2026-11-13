/**
 * Koruma bileşeni: guards.ts kararını uygular. Yönlendirmede gidilmek istenen adresi hatırlar
 * (giriş / profil seçiminden sonra açılır).
 */
import type { ReactElement, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { decideAccess } from './guards'
import { rememberNextPath, useSession } from './sessionStore'

export function Guard({ children }: { children: ReactNode }): ReactElement {
  const boot = useSession((s) => s.boot)
  const { pathname, search } = useLocation()
  const decision = decideAccess(boot, pathname, search)
  if (decision.kind === 'redirect') {
    if (decision.remember) rememberNextPath(decision.remember)
    return <Navigate to={decision.to} replace />
  }
  return <>{children}</>
}
