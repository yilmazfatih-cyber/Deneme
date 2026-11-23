/**
 * Görevler ekranı (/tasks): hızlı ekleme, arama (Türkçe harf duyarsız), durum süzgeci, liste süzgeci (?liste=…),
 * tamamla, sil + geri al. Veri yerel veritabanından canlı okunur (useRecords): başka cihazdan gelen değişiklik
 * kendiliğinden görünür.
 *
 * KOPYALA-UYARLA: yeni bir varlığın liste ekranı için başlangıç noktası budur
 * (`npm run gen -- entity <ad>` bunun sadeleştirilmiş bir kopyasını üretir).
 */
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { useToday } from '../../lib/clock.tsx'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords } from '../../lib/store/hooks.ts'
import { Banner, Button, ChoiceGroup, EmptyState, Loading, Screen, SPACE, TextField } from '../../ui/index.ts'
import { STATUS_LABELS } from './labels.ts'
import {
  countByStatus,
  filterTasks,
  orderAtEnd,
  sortLists,
  sortTasks,
  TASK_STATUSES,
  type TaskStatus,
} from './logic.ts'
import { QuickAdd } from './QuickAdd.tsx'
import { TaskRow } from './TaskRow.tsx'
import { useTaskActions } from './useTaskActions.ts'

export function TasksScreen() {
  const { workspace } = useStore()
  const tasks = useRecords('tasks')
  const lists = useRecords('lists')
  const actions = useTaskActions()
  const today = useToday()
  const params = useLocalSearchParams<{ liste?: string }>()
  const [status, setStatus] = useState<TaskStatus>('open')
  const [query, setQuery] = useState('')

  const liveLists = useMemo(() => sortLists((lists ?? []).filter((item) => !item.deleted)), [lists])
  const listById = useMemo(() => new Map(liveLists.map((item) => [item.id, item])), [liveLists])
  const listFilter = params.liste && listById.has(params.liste) ? params.liste : 'all'
  const scoped = useMemo(
    () => filterTasks(tasks ?? [], { status: 'all', list: listFilter, query }, lists ?? []),
    [tasks, lists, listFilter, query],
  )
  const visible = useMemo(
    () => sortTasks(filterTasks(scoped, { status, list: 'all', query: '' }, lists ?? []), 'manual'),
    [scoped, status, lists],
  )
  const counts = countByStatus(scoped)
  const readOnly = !workspace.canWrite
  const filteredList = listFilter === 'all' ? null : (listById.get(listFilter) ?? null)

  if (tasks === undefined || lists === undefined) {
    return (
      <Screen title={t('tasks.title')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }

  const header = (
    <View style={styles.header}>
      {workspace.local ? null : (
        <Button
          label={t('workspace.switch', { name: workspace.name })}
          variant="ghost"
          icon="swap-horizontal"
          onPress={() => router.push('/workspaces')}
          style={styles.left}
        />
      )}
      {readOnly ? <Banner tone="warn" message={t('workspace.viewerNotice')} /> : null}
      {filteredList ? (
        <Button
          label={t('tasks.filter.clearList', { name: filteredList.data.name })}
          variant="secondary"
          icon="close"
          onPress={() => router.setParams({ liste: undefined })}
          style={styles.left}
        />
      ) : null}
      {readOnly ? null : <QuickAdd listId={filteredList?.id ?? null} order={orderAtEnd(tasks)} />}
      <TextField
        label={t('tasks.search.label')}
        placeholder={t('tasks.search.placeholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      <ChoiceGroup
        label={t('tasks.status.label')}
        value={status}
        onChange={setStatus}
        options={TASK_STATUSES.map((value) => ({
          value,
          label: t('tasks.status.withCount', { label: t(STATUS_LABELS[value]), count: counts[value] }),
        }))}
      />
    </View>
  )

  const hasAny = tasks.some((task) => !task.deleted)
  const empty = hasAny ? (
    <EmptyState
      icon="search"
      title={t('tasks.noMatch.title')}
      message={t('tasks.noMatch.message')}
      action={
        <Button
          label={t('tasks.noMatch.clear')}
          variant="secondary"
          onPress={() => {
            setQuery('')
            setStatus('all')
          }}
        />
      }
    />
  ) : (
    <EmptyState icon="checkbox-outline" title={t('tasks.empty.title')} message={t('tasks.empty.message')} />
  )

  return (
    <Screen title={t('tasks.title')} scroll={false}>
      <FlatList
        data={visible}
        keyExtractor={(task) => task.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            list={item.data.listId ? (listById.get(item.data.listId) ?? null) : null}
            today={today}
            readOnly={readOnly}
            onToggle={(task) => void actions.toggleDone(task)}
            onOpen={(task) => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
            onRemove={(task) => void actions.removeTask(task)}
          />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: SPACE.md, paddingBottom: SPACE.md },
  left: { alignSelf: 'flex-start' },
  list: { gap: SPACE.sm, paddingBottom: 120 },
})
