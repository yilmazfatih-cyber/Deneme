/**
 * Görev düzenleme ekranı (/task/<kimlik>): başlık, not, son tarih, öncelik, liste, tamamlandı; kaydet ve sil.
 * Yalnız DEĞİŞEN alanlar gönderilir (useWrite → update → diffPatch): başka cihazda değişen alanlar ezilmez.
 * Şema hatası alanın altında gösterilir (AppError.details → fieldErrors).
 *
 * KOPYALA-UYARLA: yeni bir varlığın ayrıntı/düzenleme ekranı için başlangıç noktası budur.
 */
import { TASK_PRIORITIES, type TaskPriority } from '@uygulama/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { t } from '../../i18n/index.ts'
import { useToday } from '../../lib/clock.tsx'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecord, useRecords, useWrite } from '../../lib/store/hooks.ts'
import {
  Banner,
  Button,
  Checkbox,
  ChoiceGroup,
  EmptyState,
  Loading,
  Screen,
  TextField,
  useToast,
} from '../../ui/index.ts'
import { DueField } from './DueField.tsx'
import { PRIORITY_LABELS } from './labels.ts'
import { sortLists, type Task, type TaskList } from './logic.ts'
import { useTaskActions } from './useTaskActions.ts'

export function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const task = useRecord('tasks', id)
  const lists = useRecords('lists')
  if (task === undefined || lists === undefined) {
    return (
      <Screen title={t('tasks.edit.title')}>
        <Loading label={t('common.loading')} />
      </Screen>
    )
  }
  if (task === null || task.deleted) {
    return (
      <Screen title={t('tasks.edit.title')}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('tasks.notFound.title')}
          message={t('tasks.notFound.message')}
          action={<Button label={t('tasks.backToList')} variant="secondary" onPress={() => router.back()} />}
        />
      </Screen>
    )
  }
  return <TaskForm key={task.id} task={task} lists={sortLists(lists.filter((list) => !list.deleted))} />
}

function TaskForm({ task, lists }: { task: Task; lists: TaskList[] }) {
  const { workspace } = useStore()
  const { update } = useWrite('tasks')
  const actions = useTaskActions()
  const toast = useToast()
  const today = useToday()
  const [title, setTitle] = useState(task.data.title)
  const [note, setNote] = useState(task.data.note)
  const [dueDate, setDueDate] = useState(task.data.dueDate)
  const [priority, setPriority] = useState<TaskPriority>(task.data.priority)
  const [listId, setListId] = useState(task.data.listId ?? 'none')
  const [done, setDone] = useState(task.data.done)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const readOnly = !workspace.canWrite

  const save = async () => {
    try {
      const changed = await update(task.id, {
        title,
        note,
        dueDate,
        priority,
        done,
        listId: listId === 'none' ? null : listId,
      })
      toast.show({ message: changed ? t('common.saved') : t('common.noChanges'), tone: 'success' })
      router.back()
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      if (Object.keys(fields).length === 0) toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  const footer = readOnly ? null : (
    <>
      <Button label={t('common.save')} icon="checkmark" onPress={() => void save()} />
      <Button
        label={t('tasks.delete', { title: task.data.title })}
        variant="danger"
        icon="trash-outline"
        onPress={() => {
          void actions.removeTask(task)
          router.back()
        }}
      />
    </>
  )

  return (
    <Screen title={t('tasks.edit.title')} footer={footer}>
      {readOnly ? <Banner tone="warn" message={t('workspace.viewerNotice')} /> : null}
      <TextField
        label={t('tasks.form.title')}
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        maxLength={200}
      />
      <Checkbox checked={done} label={t('tasks.form.done')} onChange={setDone} disabled={readOnly} showLabel />
      <DueField value={dueDate} today={today} onChange={setDueDate} error={errors.dueDate} />
      <ChoiceGroup
        label={t('tasks.form.priority')}
        value={priority}
        onChange={setPriority}
        options={TASK_PRIORITIES.map((value) => ({ value, label: t(PRIORITY_LABELS[value]) }))}
      />
      <ChoiceGroup
        label={t('tasks.form.list')}
        value={listId}
        onChange={setListId}
        options={[
          { value: 'none', label: t('tasks.noList') },
          ...lists.map((list) => ({ value: list.id, label: list.data.name })),
        ]}
      />
      <TextField
        label={t('tasks.form.note')}
        hint={t('tasks.form.noteHint')}
        value={note}
        onChangeText={setNote}
        error={errors.note}
        multiline
        maxLength={5000}
      />
    </Screen>
  )
}
