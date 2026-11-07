import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { homePath, isOperatorRole, useAuth } from '../auth'
import { Logo } from '../components/Layout'
import { TextField, fe } from '../components/Fields'
import { ErrorBox, Notice } from '../components/Feedback'
import { useAction } from '../hooks'
import { ApiError } from '../api'

export function LoginPage() {
  const { user, loading, login, expired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string; signedUp?: string } | null
  const [email, setEmail] = useState(state?.signedUp ?? '')
  const [password, setPassword] = useState('')
  const action = useAction()

  if (!loading && user) return <Navigate to={homePath(user)} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const u = await action.run(async () => {
      try {
        return await login(email.trim(), password)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) throw new Error('E-posta veya parola hatalı.', { cause: err })
        throw err
      }
    })
    if (!u) return
    const from = state?.from
    const area = isOperatorRole(u.role) ? '/operator' : '/kurum'
    navigate(from && from.startsWith(area) ? from : homePath(u), { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Logo />
        <h1>Giriş yap</h1>
        <p className="muted">Doğrulanmış arayan kimliği ve numara itibarı portalı</p>
        {expired ? <Notice tone="warning" title="Oturumunuz sona erdi">Devam etmek için yeniden giriş yapın.</Notice> : null}
        <form onSubmit={onSubmit} noValidate>
          <TextField
            label="E-posta"
            type="email"
            autoComplete="username"
            required
            value={email}
            onValue={setEmail}
            error={fe(action.fields, 'email')}
          />
          <TextField
            label="Parola"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onValue={setPassword}
            error={fe(action.fields, 'password')}
          />
          <ErrorBox message={action.error} />
          <button type="submit" className="btn btn-primary btn-block" disabled={action.pending || !email || !password}>
            {action.pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
        <p className="auth-switch">
          Kurumunuz henüz kayıtlı değil mi? <Link to="/kayit">Kurumsal kayıt oluşturun</Link>
        </p>
      </div>
    </div>
  )
}
