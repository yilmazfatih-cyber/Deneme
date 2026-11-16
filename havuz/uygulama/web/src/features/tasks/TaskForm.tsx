/**
 * Görev formu (yeni ve düzenleme). Doğrulama ortak şemayla yapılır (shared/src/entities/tasks.ts); iletiler
 * Türkçe olarak alanların altında görünür ve ilk hatalı alana odaklanılır.
 *
 * KOPYALA-UYARLA: yeni varlığın formu için: değerler → `toInput` → `schema.safeParse` → `fieldErrors`.
 */
import { taskEntity, TASK_PRIORITIES, issuesToDetails, type TaskInput, type TaskPriority } from '@uygulama/shared'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { t } from '../../i18n/index.ts'
import { useToday } from '../../lib/clock.tsx'
import { addDays } from '../../lib/date.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { Button, Checkbox, Field, Input, SelectField, TextAreaField, TextField } from '../../ui/index.ts'
import { PRIORITY_LABELS } from './labels.ts'
import type { TaskList } from './logic.ts'

export interface TaskFormValues {
  readonly title: string
  readonly note: string
  readonly listId: string
  readonly dueDate: string
  readonly priority: TaskPriority
  readonly done: boolean
}

export const EMPTY_TASK: TaskFormValues = {
  title: '',
  note: '',
  listId: '',
  dueDate: '',
  priority: 'normal',
  done: false,
}

export function toInput(values: TaskFormValues): TaskInput {
  return {
    title: values.title,
    note: values.note,
    listId: values.listId || null,
    dueDate: values.dueDate || null,
    priority: values.priority,
    done: values.done,
  }
}

export interface TaskFormProps {
  readonly initial: TaskFormValues
  readonly lists: readonly TaskList[]
  readonly mode: 'create' | 'edit'
  /** Kaydet: hata fırlatırsa (ör. sunucu doğrulaması) iletileri alanlara dağıtılır. */
  readonly onSubmit: (input: TaskInput) => Promise<void>
  readonly secondary?: ReactNode
}

export function TaskForm({ initial, lists, mode, onSubmit, secondary }: TaskFormProps) {
  const today = useToday()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest)
  }

  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = toInput(values)
    const parsed = taskEntity.schema.safeParse(input)
    if (!parsed.success) {
      setErrors(Object.fromEntries(issuesToDetails(parsed.error).map((issue) => [issue.path, issue.message])))
      focusFirstError()
      return
    }
    setBusy(true)
    try {
      await onSubmit(input)
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(Object.keys(fields).length > 0 ? fields : { title: errorMessage(error) })
      focusFirstError()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
      <TextField
        label={t('tasks.form.title')}
        value={values.title}
        onChange={(event) => set('title', event.target.value)}
        error={errors.title}
        required
        autoFocus={mode === 'create'}
        autoComplete="off"
      />
      <TextAreaField
        label={t('tasks.form.note')}
        hint={t('tasks.form.noteHint')}
        rows={4}
        value={values.note}
        onChange={(event) => set('note', event.target.value)}
        error={errors.note}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={t('tasks.form.list')}
          value={values.listId}
          onChange={(event) => set('listId', event.target.value)}
          error={errors.listId}
        >
          <option value="">{t('tasks.noList')}</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.data.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('tasks.form.priority')}
          value={values.priority}
          onChange={(event) => set('priority', event.target.value as TaskPriority)}
          error={errors.priority}
        >
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {t(PRIORITY_LABELS[priority])}
            </option>
          ))}
        </SelectField>
      </div>
      <Field label={t('tasks.form.dueDate')} hint={t('tasks.form.dueDateHint')} error={errors.dueDate}>
        {(control) => (
          <div className="flex flex-wrap gap-2">
            <Input
              {...control}
              type="date"
              value={values.dueDate}
              onChange={(event) => set('dueDate', event.target.value)}
              className="w-auto min-w-44 flex-1"
            />
            <Button variant="secondary" onClick={() => set('dueDate', today)}>
              {t('date.today')}
            </Button>
            <Button variant="secondary" onClick={() => set('dueDate', addDays(today, 1))}>
              {t('date.tomorrow')}
            </Button>
            {values.dueDate && (
              <Button variant="ghost" onClick={() => set('dueDate', '')}>
                {t('tasks.form.clearDate')}
              </Button>
            )}
          </div>
        )}
      </Field>
      {mode === 'edit' && (
        <Checkbox
          label={t('tasks.form.done')}
          checked={values.done}
          onChange={(event) => set('done', event.target.checked)}
        />
      )}
      <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-line pt-5">
        <div>{secondary}</div>
        <Button type="submit" loading={busy}>
          {mode === 'create' ? t('tasks.form.create') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}
