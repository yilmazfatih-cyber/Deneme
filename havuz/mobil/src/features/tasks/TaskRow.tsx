/**
 * Görev satırı: onay kutusu (tamamla), başlık + liste + son tarih (dokununca düzenleme ekranı), sil düğmesi.
 * Her denetimin ekran okuyucu adı görevin başlığını içerir ("“Süt al” görevini sil").
 *
 * Genişletme: satırda yeni bir bilgi (ör. öncelik rozeti) → `Meta` içine ekleyin; dokunma hedefleri ≥ 48 dp kalsın.
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { t } from '../../i18n/index.ts'
import { dueState, formatDay } from '../../lib/date.ts'
import { AppText, Checkbox, IconButton, RADIUS, SPACE, useTheme } from '../../ui/index.ts'
import type { Task, TaskList } from './logic.ts'

export interface TaskRowProps {
  readonly task: Task
  /** Görevin (hâlâ var olan) listesi; listesizse `null`. */
  readonly list: TaskList | null
  readonly today: string
  readonly readOnly: boolean
  readonly onToggle: (task: Task) => void
  readonly onOpen: (task: Task) => void
  readonly onRemove: (task: Task) => void
}

export function TaskRow({ task, list, today, readOnly, onToggle, onOpen, onRemove }: TaskRowProps) {
  const { colors } = useTheme()
  const { title, done, dueDate } = task.data
  const state = dueDate ? dueState(dueDate, today) : null
  const dueText = dueDate
    ? state === 'overdue' && !done
      ? t('tasks.due.overdue', { date: formatDay(dueDate, today) })
      : formatDay(dueDate, today)
    : null
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Checkbox
        checked={done}
        label={done ? t('tasks.markOpen', { title }) : t('tasks.markDone', { title })}
        onChange={() => onToggle(task)}
        disabled={readOnly}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tasks.open', { title })}
        onPress={() => onOpen(task)}
        style={styles.body}
      >
        <AppText tone={done ? 'muted' : 'ink'} style={done ? styles.done : null} numberOfLines={3}>
          {title}
        </AppText>
        {list || dueText ? (
          <View style={styles.meta}>
            {list ? (
              <View style={styles.metaItem}>
                <View style={[styles.dot, { backgroundColor: colors.list[list.data.color] }]} />
                <AppText size="small" tone="muted">
                  {list.data.name}
                </AppText>
              </View>
            ) : null}
            {dueText ? (
              <AppText size="small" weight="medium" tone={state === 'overdue' && !done ? 'danger' : 'muted'}>
                {dueText}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </Pressable>
      {readOnly ? null : (
        <IconButton icon="trash-outline" label={t('tasks.delete', { title })} onPress={() => onRemove(task)} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACE.xs,
    minHeight: 56,
  },
  body: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: SPACE.xs, gap: 2 },
  done: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.md, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
