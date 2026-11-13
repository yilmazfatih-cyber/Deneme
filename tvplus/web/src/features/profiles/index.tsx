/**
 * Profil kapısı "Kim izliyor?" (Netflix profilesNewSession karşılığı). Profil seçilince
 * POST /api/profiles/switch → önbellekler boşalır → son kullanılan moda gidilir.
 */
import { useState, type ReactElement } from 'react'
import { useSession } from '../../app/sessionStore'
import { Avatar, TextButton } from '../../design'
import './profiles.css'

export function ProfileGatePage(): ReactElement {
  const boot = useSession((s) => s.boot)
  const busy = useSession((s) => s.busy)
  const switchProfile = useSession((s) => s.switchProfile)
  const logout = useSession((s) => s.logout)
  const [chosen, setChosen] = useState<string | null>(null)
  const profiles = boot?.profiles ?? []

  return (
    <main className="tvp-gate">
      <img className="tvp-gate__logo" src="/brand/logo.png" alt="TV+" />
      <h1 className="cn-screen-title">Kim izliyor?</h1>
      <ul className="tvp-gate__list">
        {profiles.map((p) => (
          <li key={p.guid}>
            <button
              type="button"
              className="tvp-gate__profile"
              disabled={busy}
              aria-busy={busy && chosen === p.guid}
              aria-current={boot?.activeProfile?.guid === p.guid ? 'true' : undefined}
              onClick={() => {
                setChosen(p.guid)
                void switchProfile(p.guid)
              }}
            >
              <Avatar src={p.avatarUrl} name={p.name} size={96} className="tvp-gate__avatar" />
              <span className="tvp-gate__name">{p.name}</span>
              {p.isKids && <span className="tvp-gate__kids">Çocuk</span>}
            </button>
          </li>
        ))}
      </ul>
      <TextButton onClick={() => void logout()} disabled={busy}>
        Çıkış
      </TextButton>
    </main>
  )
}
