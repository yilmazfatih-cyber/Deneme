/**
 * Hızlı ekleme satırı: başlığı yaz, Enter'a bas. Seçili liste varsa görev o listeye eklenir.
 * Doğrulama iletisi şemadan gelir ve kutunun altında görünür. Ayrıntılı ekleme için "Yeni görev" formu vardır.
 */
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { useWrite } from '../../lib/store/hooks.ts'
import { Button, Field, Input } from '../../ui/index.ts'

export interface QuickAddProps {
  readonly listId: string | null
  readonly order: number
  readonly disabled: boolean
}

export function QuickAdd({ listId, order, disabled }: QuickAddProps) {
  const { create } = useWrite('tasks')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await create({ title, listId, order })
      setTitle('')
      setError(undefined)
    } catch (reason) {
      setError(fieldErrors(reason).title ?? errorMessage(reason))
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex items-start gap-2" noValidate>
      <Field label={t('tasks.quickAdd.label')} hideLabel error={error} className="flex-1">
        {(control) => (
          <Input
            {...control}
            value={title}
            disabled={disabled}
            placeholder={t('tasks.quickAdd.placeholder')}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => {
              setTitle(event.target.value)
              if (error) setError(undefined)
            }}
          />
        )}
      </Field>
      <Button type="submit" icon={Plus} disabled={disabled}>
        <span className="sr-only sm:not-sr-only">{t('common.add')}</span>
      </Button>
    </form>
  )
}
