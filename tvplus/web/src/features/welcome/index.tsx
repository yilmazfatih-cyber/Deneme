/**
 * Karşılama (anonim ziyaretçi). Kimlik formu yok: tek birincil eylem demo hesabını açar (POST /api/login),
 * ardından profil kapısına gidilir.
 */
import type { ReactElement } from 'react'
import { useSession } from '../../app/sessionStore'
import { Button } from '../../design'
import './welcome.css'

export function WelcomePage(): ReactElement {
  const login = useSession((s) => s.login)
  const busy = useSession((s) => s.busy)
  return (
    <main className="tvp-welcome">
      <div className="tvp-welcome__col">
        <img className="tvp-welcome__logo" src="/brand/logo.png" alt="TV+" />
        <h1 className="cn-screen-title">Canlı TV ve film, tek evde</h1>
        <p className="cn-body">Bu, Netflix web uygulamasının mekanikleriyle sıfırdan kurulmuş bir TV+ denemesidir.</p>
        <Button className="tvp-welcome__cta" onClick={() => void login()} busy={busy}>
          Demo hesabıyla devam et
        </Button>
        <p className="cn-meta tvp-welcome__note">Gerçek hesap, ödeme ya da kişisel veri kullanılmaz.</p>
      </div>
    </main>
  )
}
