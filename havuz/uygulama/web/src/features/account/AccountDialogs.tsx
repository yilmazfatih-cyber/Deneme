/**
 * Hesap pencereleri: şifre değiştir (eski + yeni) ve hesabı sil (şifreyle onay).
 * Doğrulama ortak şemalarla yapılır; sunucu hatası pencerenin içinde gösterilir.
 */
import { changePasswordRequestSchema, currentPasswordSchema, PASSWORD_MIN } from '@uygulama/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { fieldErrors } from '../../lib/errors.ts'
import { validate, type FieldErrors } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { ConfirmDialog, TextField, useToast } from '../../ui/index.ts'

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useSession()
  const toast = useToast()
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState<FieldErrors>({})

  const close = () => {
    setValues({ currentPassword: '', newPassword: '' })
    setErrors({})
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title={t('account.changePassword')}
      confirmLabel={t('common.save')}
      onConfirm={async () => {
        const result = validate(changePasswordRequestSchema, values)
        if (!result.ok) {
          setErrors(result.errors)
          throw new Error(t('common.fixFields'))
        }
        try {
          await api?.changePassword(result.data)
        } catch (error) {
          // Yanlış şu anki şifre (invalid_credentials) ya da zayıf yeni şifre: ileti ilgili alanın altına.
          setErrors(fieldErrors(error))
          throw error
        }
        toast.show({ message: t('account.passwordChanged'), tone: 'success' })
        setValues({ currentPassword: '', newPassword: '' })
      }}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('auth.field.currentPassword')}
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(event) => setValues((current) => ({ ...current, currentPassword: event.target.value }))}
          error={errors.currentPassword}
        />
        <TextField
          label={t('auth.field.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
          value={values.newPassword}
          onChange={(event) => setValues((current) => ({ ...current, newPassword: event.target.value }))}
          error={errors.newPassword}
        />
      </div>
    </ConfirmDialog>
  )
}

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setPassword('')
        setError(undefined)
        onClose()
      }}
      title={t('account.deleteTitle')}
      message={t('account.deleteMessage')}
      confirmLabel={t('account.delete')}
      tone="danger"
      confirmDisabled={password === ''}
      onConfirm={async () => {
        const result = validate(currentPasswordSchema, password)
        if (!result.ok) {
          setError(Object.values(result.errors)[0])
          throw new Error(t('common.fixFields'))
        }
        try {
          await session.deleteAccount(password)
        } catch (error) {
          setError(fieldErrors(error).password)
          throw error
        }
        void navigate('/', { replace: true })
      }}
    >
      <TextField
        label={t('auth.field.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          setError(undefined)
        }}
        error={error}
      />
    </ConfirmDialog>
  )
}
