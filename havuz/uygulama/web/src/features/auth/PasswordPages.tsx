/**
 * Şifremi unuttum (/sifremi-unuttum) ve şifre sıfırlama (/sifre-sifirla?token=… — e-postadaki bağlantı).
 * "Unuttum" yanıtı, hesabın var olup olmadığını SÖYLEMEZ (aynı ileti her durumda gösterilir).
 */
import { emailSchema, newPasswordSchema, PASSWORD_MIN } from '@uygulama/shared'
import { KeyRound, MailCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { focusFirstInvalid, validate, type FieldErrors } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { Button, TextField, useToast } from '../../ui/index.ts'
import { AuthLayout } from './AuthLayout.tsx'

const linkClass = 'inline-flex min-h-12 items-center justify-center font-semibold text-accent-text hover:underline'

export function ForgotPasswordPage() {
  const { api } = useSession()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate(z.object({ email: emailSchema }), { email })
    if (!result.ok) return setError(result.errors.email)
    setBusy(true)
    try {
      await api?.forgotPassword(result.data.email)
      setSent(true)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  if (sent)
    return (
      <AuthLayout title={t('auth.forgot.sentTitle')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <MailCheck aria-hidden size={40} className="text-accent-text" />
          <p role="status">{t('auth.forgot.sent')}</p>
          <Link to="/giris" className={linkClass}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthLayout>
    )

  return (
    <AuthLayout title={t('auth.forgot.title')} description={t('auth.forgot.description')}>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
        <TextField
          label={t('auth.field.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setError(undefined)
          }}
          error={error}
          required
        />
        <Button type="submit" loading={busy} block>
          {t('auth.forgot.submit')}
        </Button>
      </form>
      <div className="mt-6 text-center">
        <Link to="/giris" className={linkClass}>
          {t('auth.backToLogin')}
        </Link>
      </div>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { api } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [values, setValues] = useState({ password: '', repeat: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const result = validate(
      z
        .object({ password: newPasswordSchema, repeat: z.string() })
        .refine((value) => value.password === value.repeat, { message: t('auth.reset.mismatch'), path: ['repeat'] }),
      values,
    )
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstInvalid(formRef.current)
      return
    }
    setBusy(true)
    try {
      await api?.resetPassword(token, values.password)
      toast.show({ message: t('auth.reset.done'), tone: 'success' })
      void navigate('/giris', { replace: true })
    } catch (error) {
      setBusy(false)
      const fields = fieldErrors(error)
      if (fields.newPassword) setErrors({ password: fields.newPassword })
      else setFormError(errorMessage(error))
    }
  }

  if (!token)
    return (
      <AuthLayout title={t('auth.reset.title')}>
        <p role="alert" className="mb-4">
          {t('auth.reset.noToken')}
        </p>
        <Link to="/sifremi-unuttum" className={linkClass}>
          {t('auth.reset.requestNew')}
        </Link>
      </AuthLayout>
    )

  return (
    <AuthLayout title={t('auth.reset.title')} description={t('auth.reset.description')}>
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
        {formError && (
          <div role="alert" className="flex flex-col gap-1 rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            <span>{formError}</span>
            <Link to="/sifremi-unuttum" className="underline">
              {t('auth.reset.requestNew')}
            </Link>
          </div>
        )}
        <TextField
          label={t('auth.field.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
          value={values.password}
          onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
          error={errors.password}
          required
        />
        <TextField
          label={t('auth.field.repeatPassword')}
          type="password"
          autoComplete="new-password"
          value={values.repeat}
          onChange={(event) => setValues((current) => ({ ...current, repeat: event.target.value }))}
          error={errors.repeat}
          required
        />
        <Button type="submit" icon={KeyRound} loading={busy} block>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
