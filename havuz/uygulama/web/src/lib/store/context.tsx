/**
 * Depo bağlamı: bileşenlerin hangi veritabanına ve hangi çalışma alanına yazıp okuyacağı.
 * Uygulamada `app/Shell.tsx` sağlar; testlerde `<StoreProvider value={{ db, workspace }}>` ile sarın.
 *
 * Genişletme: bağlama yeni bir değer eklerseniz `StoreValue`'ya alan ekleyin ve Shell.tsx'te doldurun.
 */
import { createContext, use, type ReactNode } from 'react'
import { canWrite, LOCAL_WORKSPACE_ID, type WorkspaceKind, type WorkspaceRole } from '@uygulama/shared'
import type { AppDb } from './db.ts'

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
  readonly db: AppDb
  readonly workspace: CurrentWorkspace
}

const StoreContext = createContext<StoreValue | null>(null)
const DbContext = createContext<AppDb | null>(null)

export function StoreProvider({ value, children }: { value: StoreValue; children: ReactNode }) {
  return (
    <DbContext value={value.db}>
      <StoreContext value={value}>{children}</StoreContext>
    </DbContext>
  )
}

/** Yalnız veritabanı (alan henüz belli değilken de): üst çubuktaki eşitleme göstergesi gibi yerler için. */
export function DbProvider({ db, children }: { db: AppDb; children: ReactNode }) {
  return <DbContext value={db}>{children}</DbContext>
}

export function useStore(): StoreValue {
  const value = use(StoreContext)
  if (!value) throw new Error('useStore yalnız <StoreProvider> içinde kullanılabilir (app/Shell.tsx sağlar).')
  return value
}

export function useDb(): AppDb {
  const db = use(DbContext)
  if (!db)
    throw new Error('useDb yalnız <DbProvider> ya da <StoreProvider> içinde kullanılabilir (app/Shell.tsx sağlar).')
  return db
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
