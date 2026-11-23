/**
 * Listeler ekranı (/lists): listeler (renk, ad, açık görev sayısı), yeni liste formu. Listeye dokununca o listenin
 * görevleri açılır (/tasks?liste=…); düzenle düğmesi liste ekranına (/list/<kimlik>) gider.
 *
 * KOPYALA-UYARLA: basit bir varlığın (ad + birkaç seçenek) liste + ekleme ekranı için örnektir.
 */
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords, useWrite } from '../../lib/store/hooks.ts'
import {
  AppText,
  Banner,
  Button,
  Card,
  EmptyState,
  Heading,
  IconButton,
  Loading,
  RADIUS,
  Screen,
  SPACE,
  TOUCH,
  useTheme,
  useToast,
} from '../../ui/index.ts'
import { orderAtEnd, sortLists } from '../tasks/logic.ts'
import { ListForm, type ListFormValues } from './ListForm.tsx'

const EMPTY_FORM: ListFormValues = { name: '', color: 'blue' }

export function ListsScreen() {
  const { workspace } = useStore()
  const lists = useRecords('lists')
  const tasks = useRecords('tasks')
  const { create } = useWrite('lists')
  const toast = useToast()
  const { colors } = useTheme()
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const live = useMemo(() => sortLists((lists ?? []).filter((list) => !list.deleted)), [lists])
  const openCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks ?? []) {
      if (task.deleted || task.data.done || task.data.listId === null) continue
      counts.set(task.data.listId, (counts.get(task.data.listId) ?? 0) + 1)
    }
    return counts
  }, [tasks])

  const add = async () => {
    try {
      await create({ ...form, order: orderAtEnd(live) })
      setForm(EMPTY_FORM)
      setErrors({})
      toast.show({ message: t('lists.created', { name: form.name.trim() }), tone: 'success' })
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0) toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  if (lists === undefined || tasks === undefined) {
    return (
      <Screen title={t('lists.title')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }

  return (
    <Screen title={t('lists.title')}>
      {workspace.canWrite ? (
        <Card>
          <Heading level={2}>{t('lists.new')}</Heading>
          <ListForm values={form} onChange={setForm} errors={errors} onSubmit={() => void add()} />
          <Button label={t('lists.create')} icon="add" onPress={() => void add()} />
        </Card>
      ) : (
        <Banner tone="warn" message={t('workspace.viewerNotice')} />
      )}
      {live.length === 0 ? (
        <EmptyState icon="list-outline" title={t('lists.empty.title')} message={t('lists.empty.message')} />
      ) : (
        <View style={styles.list}>
          {live.map((list) => (
            <View key={list.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityHint={t('lists.showTasksHint')}
                onPress={() => router.push({ pathname: '/tasks', params: { liste: list.id } })}
                style={styles.body}
              >
                <View style={[styles.dot, { backgroundColor: colors.list[list.data.color] }]} />
                <View style={styles.text}>
                  <AppText weight="medium">{list.data.name}</AppText>
                  <AppText size="small" tone="muted">
                    {t('lists.openCount', { count: openCount.get(list.id) ?? 0 })}
                  </AppText>
                </View>
              </Pressable>
              {workspace.canWrite ? (
                <IconButton
                  icon="chevron-forward"
                  label={t('lists.editNamed', { name: list.data.name })}
                  onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
                />
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADIUS.md, paddingLeft: SPACE.md },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: TOUCH + 8 },
  text: { flex: 1, paddingVertical: SPACE.sm },
  dot: { width: 14, height: 14, borderRadius: 7 },
})
