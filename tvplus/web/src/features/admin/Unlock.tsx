/**
 * Yönetici girişi: kod bir kez girilir, sunucu doğrular ve bu cihazı yönetici kipine alır.
 * Sayfanın bağlantısı hiçbir menüde yoktur (kip kapalıyken yönetici girişleri görünmez); adresi bilen açar.
 * Yanlış kodda hata alanın altında durur; art arda yanlış denemede sunucu bir süre bekletir.
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { unlockAdmin } from '../../app'
import { Button, Icon, TextField } from '../../ui'

/** Dönüş adresi yalnız uygulama içi bir yol olabilir. */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/yonetici')) return null
  return raw
}

export function AdminUnlock(): ReactElement {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedFor, setLockedFor] = useState(0)

  // Bekleme süresi geri sayar; bitince hata temizlenir.
  useEffect(() => {
    if (lockedFor <= 0) return
    const t = window.setTimeout(() => {
      setLockedFor((s) => {
        if (s <= 1) setError(null)
        return s - 1
      })
    }, 1000)
    return () => window.clearTimeout(t)
  }, [lockedFor])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || lockedFor > 0 || !code.trim()) return
    setBusy(true)
    setError(null)
    const res = await unlockAdmin(code)
    setBusy(false)
    if (res.ok) {
      const next = safeNext(params.get('sonra'))
      if (next) navigate(next, { replace: true })
      return
    }
    setError(res.message)
    if (res.code === 'LOCKED') setLockedFor(res.retryAfterSec ?? 60)
    if (res.code === 'INVALID') setCode('')
  }

  return (
    <div className="ad-unlock">
      <form className="ad-unlock__card" onSubmit={(e) => void onSubmit(e)} aria-labelledby="ad-unlock-h">
        <span className="ad-unlock__icon" aria-hidden="true">
          <Icon name="lock" size={28} />
        </span>
        <h1 id="ad-unlock-h" className="ad-unlock__title">
          Yönetici girişi
        </h1>
        <p className="ad-unlock__text">
          Bu bölüm yalnız yöneticiye açık. Kodu girince bu cihazda Yönetici Paneli, Stüdyo ve Kaputun altı görünür.
        </p>
        <TextField
          label="Yönetici kodu"
          value={code}
          onChange={setCode}
          type={show ? 'text' : 'password'}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="TVP-XXXX-XXXX-XXXX"
          error={
            error ? (lockedFor > 0 ? `Çok fazla yanlış deneme. ${lockedFor} sn sonra yeniden dene.` : error) : null
          }
          disabled={busy}
          autoFocus
        />
        <label className="ad-unlock__show">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Kodu göster
        </label>
        <Button type="submit" variant="play" block busy={busy} disabled={lockedFor > 0 || !code.trim()}>
          Aç
        </Button>
      </form>
    </div>
  )
}
