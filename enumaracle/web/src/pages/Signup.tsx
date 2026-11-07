import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { homePath, useAuth } from '../auth'
import { Logo } from '../components/Layout'
import { TextField, CheckField, fe } from '../components/Fields'
import { ErrorBox, Notice } from '../components/Feedback'
import { EMPTY_ENTITY, EntityFields, cleanEntityInput } from '../components/EntityForm'
import { useAction } from '../hooks'
import type { EntityInput } from '../types'

export function SignupPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<EntityInput>(EMPTY_ENTITY)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [consent, setConsent] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const action = useAction()

  if (!loading && user) return <Navigate to={homePath(user)} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (password.length < 10) errs.password = 'Parola en az 10 karakter olmalı.'
    if (password !== password2) errs.password2 = 'Parolalar eşleşmiyor.'
    if (!/^\d{10}$/.test(form.vkn.replace(/\s/g, ''))) errs.vkn = 'VKN 10 haneli olmalı.'
    const mersis = (form.mersis ?? '').replace(/\s/g, '')
    if (mersis && !/^\d{16}$/.test(mersis)) errs.mersis = 'MERSİS numarası 16 haneli olmalı.'
    setLocalErrors(errs)
    if (Object.keys(errs).length > 0) return
    const body = cleanEntityInput(form)
    const created = await action.run(() => api.signup({ ...body, password }))
    if (!created) return
    try {
      const u = await login(body.contact_email, password)
      navigate(homePath(u), { replace: true })
    } catch (err) {
      // Account exists; let the user sign in manually.
      navigate('/giris', { replace: true, state: { signedUp: body.contact_email, error: err instanceof ApiError ? err.message : '' } })
    }
  }

  const fields = { ...action.fields, ...localErrors }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-wide">
        <Logo />
        <h1>Kurumsal kayıt</h1>
        <p className="muted">
          Şirketinizi kaydedin; operatör incelemesinden sonra numaralarınız aboneye “doğrulanmış arayan” olarak, markanız ve
          arama nedeninizle görünür.
        </p>
        <ol className="steps" aria-label="Süreç adımları">
          <li className="current">Kayıt</li>
          <li>Belgeler ve numaralar</li>
          <li>Operatör incelemesi</li>
          <li>Markalı arama</li>
        </ol>
        <form onSubmit={onSubmit} noValidate>
          <EntityFields value={form} onChange={setForm} fields={fields} />
          <fieldset className="form-section">
            <legend>Portal hesabı</legend>
            <p className="muted small">Giriş için yetkili kişinin e-posta adresi kullanılır.</p>
            <div className="grid-2">
              <TextField
                label="Parola"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onValue={setPassword}
                error={fe(fields, 'password')}
                hint="En az 10 karakter"
              />
              <TextField
                label="Parola (tekrar)"
                type="password"
                autoComplete="new-password"
                required
                value={password2}
                onValue={setPassword2}
                error={fe(fields, 'password2')}
              />
            </div>
            <CheckField
              label="Verdiğim bilgilerin doğru olduğunu ve KVKK aydınlatma metnini okuduğumu onaylıyorum."
              checked={consent}
              onChecked={setConsent}
            />
          </fieldset>
          {Object.keys(action.fields).length > 0 ? (
            <Notice tone="danger" title="Bazı alanlar hatalı">
              İşaretli alanları düzeltip yeniden gönderin.
            </Notice>
          ) : (
            <ErrorBox message={action.error} />
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={action.pending || !consent}>
            {action.pending ? 'Kaydediliyor…' : 'Kaydı tamamla'}
          </button>
        </form>
        <p className="auth-switch">
          Hesabınız var mı? <Link to="/giris">Giriş yapın</Link>
        </p>
      </div>
    </div>
  )
}
