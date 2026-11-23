/**
 * Depo bağlamı: bileşenlerin hangi veritabanına ve hangi çalışma alanına yazıp okuyacağı.
 * Uygulamada `features/session/StoreGate.tsx` sağlar; testlerde `<StoreProvider value={{ db, workspace }}>` ile sarın.
 *
 * Genişletme: bağlama yeni bir değer eklerseniz `StoreValue`'ya alan ekleyin ve StoreGate.tsx'te doldurun.
 */
import { createContext, use, type ReactNode } from 'react'
import { canWrite, LOCAL_WORKSPACE_ID, type WorkspaceKind, type WorkspaceRole } from '@uygulama/shared'
import type { LocalDb } from './localDb.ts'

export interface CurrentWorkspace {
  readonly id: string
  readonly name: string
  readonly kind: WorkspaceKind
  readonly role: WorkspaceRole
  /** Bu alanda kayıt yazılabilir mi (izleyici rolünde `false`). */
  readonly canWrite: boolean
  /** Hesapsız alan: veri yalnız bu cihazda. */
  readonly local: boolean
}

export interface StoreValue {
  readonly db: LocalDb
  readonly workspace: CurrentWorkspace
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ value, children }: { value: StoreValue; children: ReactNode }) {
  return <StoreContext value={value}>{children}</StoreContext>
}

export function useStore(): StoreValue {
  const value = use(StoreContext)
  if (!value) throw new Error('useStore yalnız <StoreProvider> içinde kullanılabilir (features/session/StoreGate.tsx).')
  return value
}

/** Hesapsız kullanımın alanı. `name` arayüzde sözlükten gelir. */
export function localWorkspace(name: string): CurrentWorkspace {
  return { id: LOCAL_WORKSPACE_ID, name, kind: 'personal', role: 'owner', canWrite: true, local: true }
}

export function workspaceView(info: {
  id: string
  name: string
  kind: WorkspaceKind
  role: WorkspaceRole
}): CurrentWorkspace {
  return { id: info.id, name: info.name, kind: info.kind, role: info.role, canWrite: canWrite(info.role), local: false }
}
