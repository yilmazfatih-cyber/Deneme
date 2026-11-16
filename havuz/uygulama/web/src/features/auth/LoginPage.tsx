/**
 * Giriş (/giris?next=…). Başarılı girişte önce gerekiyorsa "kayıtları hesaba taşı" adımına, sonra `next`e gider.
 * Hatalı e-posta/şifre iletisi alanların üstünde, suçlamayan dille gösterilir.
 */
import { isAppError, loginRequestSchema } from '@uygulama/shared'
import { LogIn } from 'lucide-react'
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

export function LoginPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState(params.get('eposta') ?? '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const result = validate(loginRequestSchema, { email, password })
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstInvalid(formRef.current)
      return
    }
    setBusy(true)
    try {
      await session.login({ email, password })
      void navigate(await nextAfterLogin(next), { replace: true })
    } catch (error) {
      setBusy(false)
      const fields = fieldErrors(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else
        setFormError(
          isAppError(error) && error.code === 'invalid_credentials' ? t('auth.login.invalid') : errorMessage(error),
        )
    }
  }

  return (
    <AuthLayout title={t('auth.login.title')} description={t('auth.login.description')}>
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
        {formError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            {formError}
          </p>
        )}
        <TextField
          label={t('auth.field.email')}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        <TextField
          label={t('auth.field.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
        />
        <Button type="submit" icon={LogIn} loading={busy} block>
          {t('auth.login.submit')}
        </Button>
      </form>
      <nav aria-label={t('auth.otherOptions')} className="mt-6 flex flex-col gap-1 text-center">
        <Link
          to="/sifremi-unuttum"
          className="inline-flex min-h-12 items-center justify-center font-semibold text-accent-text hover:underline"
        >
          {t('auth.login.forgot')}
        </Link>
        <Link
          to={withNext('/kayit', next)}
          className="inline-flex min-h-12 items-center justify-center font-semibold text-accent-text hover:underline"
        >
          {t('auth.login.toRegister')}
        </Link>
        <ContinueWithoutAccount />
      </nav>
    </AuthLayout>
  )
}
