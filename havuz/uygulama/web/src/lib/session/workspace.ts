/**
 * Geçerli çalışma alanı: hesapsız kipte `local`; hesaplı kipte kullanıcının seçtiği (yoksa kişisel) alan.
 * Alan listesi son eşitlemedeki hâliyle üst veriden okunur (çevrimdışıyken de görünür).
 *
 * Genişletme: alan seçimine ek kural gerekiyorsa `pickWorkspace` içine yazın (testi: test/session/workspace.test.ts).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import type { WorkspaceInfo } from '@uygulama/shared'
import { t } from '../../i18n/index.ts'
import { localWorkspace, workspaceView, type CurrentWorkspace } from '../store/context.tsx'
import type { AppDb } from '../store/db.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import type { SessionState } from './context.ts'

/** Seçili kimlik listede yoksa kişisel alan, o da yoksa ilk alan. Liste boşsa `null`. */
export function pickWorkspace(workspaces: readonly WorkspaceInfo[], selectedId: string | null): WorkspaceInfo | null {
  return (
    workspaces.find((workspace) => workspace.id === selectedId) ??
    workspaces.find((workspace) => workspace.kind === 'personal') ??
    workspaces[0] ??
    null
  )
}

export interface WorkspaceState {
  /** Yüklenirken `undefined`; hesaplı kipte henüz alan bilinmiyorsa (ilk eşitleme sürüyor) `null`. */
  readonly current: CurrentWorkspace | null | undefined
  readonly workspaces: readonly WorkspaceInfo[]
}

export function useWorkspaceState(state: SessionState): WorkspaceState {
  const db = state.status === 'loading' ? null : state.db
  const account = state.status === 'account'
  const data = useLiveQuery(async () => {
    if (!db || !account) return null
    const [workspaces, selected] = await Promise.all([getMeta(db, 'workspaces'), getMeta(db, 'currentWorkspaceId')])
    return { workspaces, selected }
  }, [db, account])
  if (state.status === 'loading') return { current: undefined, workspaces: [] }
  if (state.status === 'guest') return { current: localWorkspace(t('workspace.local')), workspaces: [] }
  if (data === undefined) return { current: undefined, workspaces: [] }
  const workspaces = data?.workspaces ?? []
  const picked = pickWorkspace(workspaces, data?.selected ?? null)
  return { current: picked ? workspaceView(picked) : null, workspaces }
}

export async function selectWorkspace(db: AppDb, workspaceId: string): Promise<void> {
  await setMeta(db, 'currentWorkspaceId', workspaceId)
}
