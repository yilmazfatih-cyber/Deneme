/**
 * Depo kapısı: oturum hazır olunca ekranlara veritabanını ve SEÇİLİ çalışma alanını verir (StoreProvider).
 *   hesapsız → alan `local` ("Bu cihaz")
 *   hesaplı  → üst verideki seçili alan; yoksa kişisel alan; alanlar henüz gelmediyse "hazırlanıyor" + "Şimdi eşitle"
 *
 * Genişletme: alan seçimine yeni bir kural (ör. son açılan alan) → `pickWorkspace`.
 */
import type { WorkspaceInfo } from '@uygulama/shared'
import { router } from 'expo-router'
import { useMemo, type ReactNode } from 'react'
import { t } from '../../i18n/index.ts'
import { useSession, useSyncStatus } from '../../lib/session/context.ts'
import { localWorkspace, StoreProvider, workspaceView } from '../../lib/store/context.tsx'
import { useMetaOf } from '../../lib/store/hooks.ts'
import type { LocalDb } from '../../lib/store/localDb.ts'
import { Banner, Button, EmptyState, Loading, Screen } from '../../ui/index.ts'

export function pickWorkspace(workspaces: readonly WorkspaceInfo[], currentId: string | null): WorkspaceInfo | null {
  return (
    workspaces.find((workspace) => workspace.id === currentId) ??
    workspaces.find((workspace) => workspace.kind === 'personal') ??
    workspaces[0] ??
    null
  )
}

export function StoreGate({ children }: { children: ReactNode }) {
  const { state } = useSession()
  if (state.status === 'loading') return <Loading label={t('common.loading')} />
  if (state.status === 'guest') return <GuestStore db={state.db}>{children}</GuestStore>
  return <AccountStore db={state.db}>{children}</AccountStore>
}

function GuestStore({ db, children }: { db: LocalDb; children: ReactNode }) {
  const value = useMemo(() => ({ db, workspace: localWorkspace(t('workspace.local')) }), [db])
  return <StoreProvider value={value}>{children}</StoreProvider>
}

function AccountStore({ db, children }: { db: LocalDb; children: ReactNode }) {
  const workspaces = useMetaOf(db, 'workspaces')
  const currentId = useMetaOf(db, 'currentWorkspaceId')
  const info = workspaces && currentId !== undefined ? pickWorkspace(workspaces, currentId) : undefined
  const value = useMemo(() => (info ? { db, workspace: workspaceView(info) } : null), [db, info])
  if (info === undefined) return <Loading label={t('common.loading')} />
  if (value === null) return <Preparing />
  return <StoreProvider value={value}>{children}</StoreProvider>
}

/** İlk eşitleme bitmeden alan bilgisi yoktur: ağ yoksa ne yapılacağını söyler. */
function Preparing() {
  const { state } = useSession()
  const status = useSyncStatus()
  const engine = state.status === 'account' ? state.engine : null
  return (
    <Screen title={t('workspace.preparing')}>
      <EmptyState icon="sync" title={t('workspace.preparing')} message={t('workspace.emptyMessage')} />
      {status.error ? <Banner tone="danger" message={status.error.message} /> : null}
      {state.status === 'account' && state.session.expired ? (
        <Banner
          tone="warn"
          message={t('account.expiredBanner')}
          action={<Button label={t('account.relogin')} onPress={() => router.push('/login')} />}
        />
      ) : (
        <Button
          label={t('sync.now')}
          icon="sync"
          busy={status.phase === 'syncing'}
          disabled={!engine}
          onPress={() => void engine?.syncNow()}
        />
      )}
    </Screen>
  )
}
