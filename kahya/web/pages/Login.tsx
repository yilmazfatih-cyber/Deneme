import { useState, type FormEvent } from 'react'
import { useAuth } from '../context.tsx'
import { api, useApi } from '../lib.ts'

export function Login() {
  const { refresh } = useAuth()
  const [mode, setMode] = useState<'personel' | 'sakin'>('personel')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<{ demoCode?: string; registered?: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const health = useApi<{ demo: boolean }>('/health')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'personel') {
        await api.post('/auth/login', { email, password })
        refresh()
      } else if (!sent) {
        const r = await api.post<{ demoCode?: string; registered?: boolean }>('/auth/otp', { phone })
        if (r.registered === false) setError('Bu numaraya kayıtlı bir sakin bulunamadı.')
        else setSent(r)
      } else {
        await api.post('/auth/otp/verify', { phone, code })
        refresh()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <div>
          <div className="brand" style={{ color: '#fff', padding: 0, marginBottom: 32 }}>
            <img src="/icon.svg" alt="" /> Kâhya
          </div>
          <h1>Site yönetiminin yapay zekâ ile çalışan ofisi</h1>
          <p style={{ opacity: 0.85, maxWidth: 520 }}>
            WhatsApp, SMS ve e-postayla gelen her mesajı sınıflandırır, arıza kaydı açar, ustayı önerir; aidatı tahakkuk
            ettirir, banka dekontunu daireyle eşler, gecikmeyi kanuna uygun hesaplar. Yöneticiniz yalnız onaylar.
          </p>
          <ul>
            <li>Kat Mülkiyeti Kanunu’na göre aidat dağıtımı, gecikme tazminatı ve genel kurul yeter sayıları</li>
            <li>KVKK: kişisel veriler yapay zekâya gitmeden maskelenir</li>
            <li>Sakin portalı: borç, kartla ödeme, talep takibi, 7/24 asistan</li>
          </ul>
        </div>
        <small style={{ opacity: 0.7 }}>© Kâhya · Türkiye için geliştirildi</small>
      </section>
      <section className="login-panel">
        <form className="card login-card stack" onSubmit={submit}>
          <h2>Giriş</h2>
          <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
            <button
              type="button"
              className={mode === 'personel' ? 'active' : ''}
              onClick={() => {
                setMode('personel')
                setError(null)
              }}
            >
              Yönetim personeli
            </button>
            <button
              type="button"
              className={mode === 'sakin' ? 'active' : ''}
              onClick={() => {
                setMode('sakin')
                setError(null)
              }}
            >
              Sakin
            </button>
          </div>
          {mode === 'personel' ? (
            <>
              <label className="field">
                E-posta
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Parola
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                Cep telefonu
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="05XX XXX XX XX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={Boolean(sent)}
                  required
                />
              </label>
              {sent && (
                <label className="field">
                  SMS ile gelen 6 haneli kod
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </label>
              )}
              {sent?.demoCode && (
                <div className="alert info">
                  Demo modu — giriş kodunuz: <b className="mono">{sent.demoCode}</b>
                </div>
              )}
            </>
          )}
          {error && <div className="alert bad">{error}</div>}
          <button className="btn primary block" disabled={busy}>
            {mode === 'sakin' && !sent ? 'Kod gönder' : 'Giriş yap'}
          </button>
          {mode === 'sakin' && sent && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setSent(null)
                setCode('')
              }}
            >
              Numarayı değiştir
            </button>
          )}
          {health.data?.demo && (
            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                Demo hesapları
              </summary>
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                Şirket yöneticisi: <span className="mono">elif@yildizyonetim.example</span>
                <br />
                Site yöneticisi: <span className="mono">murat@yildizyonetim.example</span>
                <br />
                Muhasebe: <span className="mono">deniz@yildizyonetim.example</span>
                <br />
                Parola: <span className="mono">Kahya!2026</span> · Sakin: <span className="mono">0532 111 22 33</span>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setMode('personel')
                      setEmail('elif@yildizyonetim.example')
                      setPassword('Kahya!2026')
                    }}
                  >
                    Yönetici olarak doldur
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setMode('sakin')
                      setPhone('0532 111 22 33')
                    }}
                  >
                    Sakin olarak doldur
                  </button>
                </div>
              </div>
            </details>
          )}
        </form>
      </section>
    </div>
  )
}
