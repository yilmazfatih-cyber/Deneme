/**
 * Kayıt (/kayit?next=…): ad, e-posta, şifre. Kurallar ortak şemadan gelir (en az 10 karakter vb.).
 * E-posta zaten kayıtlıysa giriş sayfasına yönlendiren bir bağlantı gösterilir.
 */
import { isAppError, PASSWORD_MIN, registerRequestSchema } from '@uygulama/shared'
import { UserPlus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'
import { focusFirstInvalid, validate, type FieldErrors } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { Button, TextField } from '../../ui/index.ts'
import { nextAfterLogin, safeNext, withNext } from './afterLogin.ts'
import { AuthLayout } from './AuthLayout.tsx'
import { ContinueWithoutAccount } from './ContinueWithoutAccount.tsx'

export function RegisterPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const set = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    setEmailTaken(false)
    const result = validate(registerRequestSchema, values)
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstInvalid(formRef.current)
      return
    }
    setBusy(true)
    try {
      await session.register(values)
      void navigate(await nextAfterLogin(next), { replace: true })
    } catch (error) {
      setBusy(false)
      const fields = fieldErrors(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else if (isAppError(error) && error.code === 'email_taken') setEmailTaken(true)
      else setFormError(errorMessage(error))
    }
  }

  return (
    <AuthLayout title={t('auth.register.title')} description={t('auth.register.description')}>
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
        {formError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            {formError}
          </p>
        )}
        {emailTaken && (
          <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 font-medium text-warn">
            {t('auth.register.emailTaken')}{' '}
            <Link to={`/giris?eposta=${encodeURIComponent(values.email)}`} className="underline">
              {t('auth.register.toLogin')}
            </Link>
          </p>
        )}
        <TextField
          label={t('auth.field.name')}
          autoComplete="name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          error={errors.name || undefined}
          required
        />
        <TextField
          label={t('auth.field.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.email}
          onChange={(event) => set('email', event.target.value)}
          error={errors.email || undefined}
          required
        />
        <TextField
          label={t('auth.field.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
          value={values.password}
          onChange={(event) => set('password', event.target.value)}
          error={errors.password || undefined}
          required
        />
        <Button type="submit" icon={UserPlus} loading={busy} block>
          {t('auth.register.submit')}
        </Button>
      </form>
      <nav aria-label={t('auth.otherOptions')} className="mt-6 flex flex-col gap-1 text-center">
        <Link
          to={withNext('/giris', next)}
          className="inline-flex min-h-12 items-center justify-center font-semibold text-accent-text hover:underline"
        >
          {t('auth.register.toLogin')}
        </Link>
        <ContinueWithoutAccount />
      </nav>
    </AuthLayout>
  )
}
