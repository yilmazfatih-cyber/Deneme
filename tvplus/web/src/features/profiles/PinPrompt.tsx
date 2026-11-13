/**
 * Kilitli profil için PIN ekranı (Netflix "Profil kilidi şu anda açık"): tam ekran, 4 kutu, yanlışta titreme +
 * sakin ileti, çok denemede bekleme süresi. Esc ya da ✕ kapatır. Doğru PIN'de oturum deposu profili açar ve yönlendirir.
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ProfileSummary } from '../../../../shared/types'
import { useSession } from '../../app'
import { Avatar, Logo, PinInput, RoundButton, Spinner, useBodyScrollLock, useEscape, useFocusTrap } from '../../ui'

export function PinPrompt({ profile, onCancel }: { profile: ProfileSummary; onCancel: () => void }): ReactElement {
  const switchProfile = useSession((s) => s.switchProfile)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [lockedFor, setLockedFor] = useState(0)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useBodyScrollLock(true)
  useEscape(true, onCancel)
  useFocusTrap(rootRef, true)

  // Bekleme süresi geri sayımı
  useEffect(() => {
    if (lockedFor <= 0) return
    const t = window.setTimeout(() => setLockedFor((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [lockedFor])
  useEffect(() => {
    if (lockedFor === 0 && error?.startsWith('Çok fazla')) setError(null)
  }, [lockedFor, error])

  // Açılınca PIN kutusuna odaklan (odak tuzağı önce kapsayıcıya odaklanır)
  useEffect(() => {
    rootRef.current?.querySelector<HTMLInputElement>('.ui-pin__input')?.focus()
  }, [lockedFor === 0])

  const submit = async (value: string) => {
    setBusy(true)
    const res = await switchProfile(profile.guid, value)
    setBusy(false)
    if (res.ok) return
    setPin('')
    setShake((n) => n + 1)
    setError(res.message)
    if (res.code === 'PIN_LOCKED') setLockedFor(res.retryAfterSec ?? 60)
  }

  const locked = lockedFor > 0
  return createPortal(
    <div ref={rootRef} className="pf-pin" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="pf-pin__head">
        <Logo height={28} />
        <RoundButton icon="close" label="Vazgeç" variant="solid" onClick={onCancel} />
      </header>
      <div className="pf-pin__body">
        <Avatar src={profile.avatarUrl} name={profile.name} size={72} />
        <p className="pf-pin__status">{profile.name} profilinde kilit açık.</p>
        <h1 className="pf-pin__title" id={titleId}>
          Bu profile girmek için PIN'ini gir.
        </h1>
        <PinInput
          key={shake}
          value={pin}
          onChange={(v) => {
            setPin(v)
            if (v) setError(null)
          }}
          onComplete={(v) => void submit(v)}
          error={!!error && !locked}
          disabled={busy || locked}
          autoFocus
        />
        <div className="pf-pin__note" role="alert">
          {busy ? (
            <Spinner size={24} label="Denetleniyor" />
          ) : locked ? (
            `Çok fazla deneme. ${lockedFor} sn sonra tekrar dene.`
          ) : (
            error
          )}
        </div>
        <p className="pf-pin__hint">PIN'ini mi unuttun? Hesap sahibi kilidi Profilleri Yönet'ten kaldırabilir.</p>
      </div>
    </div>,
    document.body,
  )
}
