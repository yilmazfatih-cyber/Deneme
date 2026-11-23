/**
 * Alan değiştirici (/workspaces): üyesi olunan çalışma alanları (kişisel + paylaşımlı) ve rolünüz; birini seçince
 * görevler ve listeler o alandan gösterilir. Liste son eşitlemeden gelir (meta → workspaces); alan açma, davet ve üye
 * yönetimi bu temelde YOK (web uygulamasında var; bkz. README → Sınırlar).
 *
 * Genişletme: alan açmak için API'de `POST /api/workspaces` var: ApiClient'a yöntem + burada form.
 */
import type { WorkspaceInfo, WorkspaceRole } from '@uygulama/shared'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { t, type MessageKey } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { useMetaOf } from '../../lib/store/hooks.ts'
import type { LocalDb } from '../../lib/store/localDb.ts'
import { setMeta } from '../../lib/store/meta.ts'
import { useStore } from '../../lib/store/context.tsx'
import { AppText, Banner, ChoiceGroup, EmptyState, Screen, SPACE } from '../../ui/index.ts'

const ROLE_LABELS: Record<WorkspaceRole, MessageKey> = {
  owner: 'workspace.role.owner',
  editor: 'workspace.role.editor',
  viewer: 'workspace.role.viewer',
}

function label(workspace: WorkspaceInfo): string {
  const kind = workspace.kind === 'personal' ? t('workspace.kind.personal') : t('workspace.kind.shared')
  return t('workspace.option', { name: workspace.name, kind, role: t(ROLE_LABELS[workspace.role]) })
}

export function WorkspacesScreen() {
  const { state } = useSession()
  if (state.status !== 'account') {
    return (
      <Screen title={t('workspace.title')}>
        <Banner tone="info" message={t('workspace.localHint')} />
      </Screen>
    )
  }
  return <WorkspacePicker db={state.db} />
}

function WorkspacePicker({ db }: { db: LocalDb }) {
  const { workspace } = useStore()
  const workspaces = useMetaOf(db, 'workspaces') ?? []
  const choose = async (id: string) => {
    await db.write((sql) => setMeta(sql, 'currentWorkspaceId', id))
    router.back()
  }
  return (
    <Screen title={t('workspace.title')}>
      <AppText tone="muted">{t('workspace.description')}</AppText>
      {workspaces.length === 0 ? (
        <EmptyState icon="people-outline" title={t('workspace.emptyTitle')} message={t('workspace.emptyMessage')} />
      ) : (
        <View style={styles.list}>
          <ChoiceGroup
            label={t('workspace.choose')}
            value={workspace.id}
            onChange={(id) => void choose(id)}
            options={workspaces.map((item) => ({ value: item.id, label: label(item) }))}
          />
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({ list: { gap: SPACE.sm } })
