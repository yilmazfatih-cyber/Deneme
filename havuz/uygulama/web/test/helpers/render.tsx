/**
 * Ekran testleri için çizim yardımcıları.
 *   renderApp({ path: '/gorevler' })                 bütün uygulama (hesapsız kip, API yok)
 *   renderApp({ path: '/giris', api })               sahte API ile (bkz. fakeApi.ts)
 *   renderWithStore(<Bileşen />, { canWrite: false }) tek bileşen, verilen veritabanı/alanla
 * Her testten önce `resetBrowserData()` çağrılır: IndexedDB ve localStorage boşalır.
 */
import { render, type RenderResult } from '@testing-library/react'
import Dexie from 'dexie'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { AppProviders, AppRoutes } from '../../src/app/App.tsx'
import type { ApiClient } from '../../src/lib/api.ts'
import { ClockProvider } from '../../src/lib/clock.tsx'
import { closeSessionDb } from '../../src/lib/session/store.ts'
import { localWorkspace, StoreProvider, type CurrentWorkspace } from '../../src/lib/store/context.tsx'
import { closeAllDbs, type AppDb } from '../../src/lib/store/db.ts'
import { ToastProvider } from '../../src/ui/index.ts'
import { freshDb } from './sync.ts'

/** Testlerin sabit saati: 16 Kasım 2026 Pazartesi 09:00 (yerel). */
export const TEST_NOW = new Date(2026, 10, 16, 9, 0, 0)
export const testClock = { now: () => new Date(TEST_NOW) }

export async function resetBrowserData(): Promise<void> {
  closeAllDbs()
  closeSessionDb()
  localStorage.clear()
  for (const info of await indexedDB.databases()) if (info.name) await Dexie.delete(info.name)
}

export function renderApp(options: { path?: string; api?: ApiClient | null } = {}): RenderResult {
  return render(
    <ClockProvider clock={testClock}>
      <AppProviders api={options.api ?? null}>
        <MemoryRouter initialEntries={[options.path ?? '/gorevler']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>
    </ClockProvider>,
  )
}

export function renderWithStore(
  element: ReactElement,
  options: { db?: AppDb; workspace?: Partial<CurrentWorkspace>; path?: string } = {},
): RenderResult & { db: AppDb } {
  const db = options.db ?? freshDb()
  const workspace = { ...localWorkspace('Bu cihaz'), ...options.workspace }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ClockProvider clock={testClock}>
      <ToastProvider>
        <MemoryRouter initialEntries={[options.path ?? '/']}>
          <StoreProvider value={{ db, workspace }}>{children}</StoreProvider>
        </MemoryRouter>
      </ToastProvider>
    </ClockProvider>
  )
  return Object.assign(render(element, { wrapper }), { db })
}
