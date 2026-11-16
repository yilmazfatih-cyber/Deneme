/**
 * Liste ekleme / düzenleme penceresi: ad + renk. Renk seçimi yerel radyo düğmeleriyle (klavyeyle oklarla seçilir).
 */
import { LIST_COLORS, listEntity, issuesToDetails, type ListColor } from '@uygulama/shared'
import { Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { Button, Dialog, TextField } from '../../ui/index.ts'
import { COLOR_LABELS, COLOR_VARS } from './labels.ts'

export interface ListDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly initial: { name: string; color: ListColor }
  readonly mode: 'create' | 'edit'
  readonly onSubmit: (values: { name: string; color: ListColor }) => Promise<void>
}

export function ListDialog({ open, onClose, initial, mode, onSubmit }: ListDialogProps) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState<ListColor>(initial.color)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = listEntity.schema.safeParse({ name, color })
    if (!parsed.success) {
      setError(issuesToDetails(parsed.error)[0]?.message)
      return
    }
    setBusy(true)
    try {
      await onSubmit({ name, color })
      onClose()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('lists.new') : t('lists.edit')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="liste-formu" loading={busy}>
            {mode === 'create' ? t('common.add') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id="liste-formu" onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
        <TextField
          label={t('lists.form.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
          error={error}
          autoFocus
          autoComplete="off"
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('lists.form.color')}</legend>
          <div className="flex flex-wrap gap-2">
            {LIST_COLORS.map((value) => (
              <label
                key={value}
                className="relative flex size-12 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
                style={{ background: COLOR_VARS[value] }}
              >
                <input
                  type="radio"
                  name="renk"
                  value={value}
                  checked={color === value}
                  onChange={() => setColor(value)}
                  className="sr-only"
                />
                <span className="sr-only">{t(COLOR_LABELS[value])}</span>
                {color === value && <Check aria-hidden size={22} strokeWidth={3} className="text-white" />}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
