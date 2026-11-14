/**
 * Karşılama (#/karsilama) — Netflix'in giriş öncesi sayfası düzeninde: tam genişlik koyu vitrin (yalnız CSS ile
 * kurulmuş afiş kolajı + karartma, stok fotoğraf yok), büyük başlık, tek cümle, TEK birincil düğme
 * "Demo hesabıyla devam et", gerçek hesap / ödeme / kişisel bilgi olmadığına dair sakin not ve "TV'de mi izliyorsun?"
 * ipucu (QR ile girişin nasıl çalıştığı aynı sayfada anlatılır). Dışa aktarım adı SABİT: WelcomePage.
 */
import { useRef, type CSSProperties, type ReactElement } from 'react'
import { useDocumentTitle, useSession } from '../../app'
import { Button, Icon, Logo, type IconName } from '../../ui'
import './welcome.css'

/** Kolaj karoları: koyu, doygun degradeler (afiş izlenimi; görsel yok). */
const TILE_TONES = [
  ['#3b1d4a', '#0f0a1a'],
  ['#1e3a5f', '#0a1220'],
  ['#5a2a12', '#1a0d06'],
  ['#14463a', '#06140f'],
  ['#4a1c24', '#150709'],
  ['#2d2d55', '#0b0b1c'],
  ['#5b4a12', '#1a1505'],
  ['#203f4f', '#08141a'],
] as const

const REASONS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'tv', title: "TV'nde izle", text: 'Akıllı TV, oyun konsolu ya da tarayıcı. Kumandayla rahatça gez.' },
  { icon: 'remote', title: 'Telefonun kumanda olur', text: "Telefonla ara, yön tuşlarıyla gez, TV'ye yansıt." },
  { icon: 'live', title: 'Canlı TV ve Rehber', text: 'Kanalları canlı izle, kaçırdığını baştan başlat.' },
  { icon: 'users', title: 'Herkese bir profil', text: 'Çocuk profili ve kilitli profillerle herkesin listesi ayrı.' },
]

const TV_STEPS = [
  "TV'de TV+'ı aç ve “Telefonunla giriş yap”ı seç.",
  'Telefonunun kamerasıyla ekrandaki QR kodu okut.',
  'Telefonda “Onayla”ya dokun. TV kendiliğinden açılır.',
]

export function WelcomePage(): ReactElement {
  useDocumentTitle('Hoş geldin')
  const login = useSession((s) => s.login)
  const busy = useSession((s) => s.busy)
  const tvRef = useRef<HTMLElement>(null)

  return (
    <div className="wl-page">
      <section className="wl-hero">
        <div className="wl-collage" aria-hidden="true">
          {Array.from({ length: 48 }, (_, i) => {
            const [a, b] = TILE_TONES[(i * 5 + Math.floor(i / 8)) % TILE_TONES.length]!
            return (
              <span
                key={i}
                className="wl-collage__tile"
                style={{ '--a': a, '--b': b, '--d': `${(i % 7) * 0.4}s` } as CSSProperties}
              />
            )
          })}
        </div>
        <div className="wl-hero__shade" aria-hidden="true" />
        <header className="wl-head">
          <Logo height={40} />
        </header>
        <div className="wl-hero__content">
          <h1 className="wl-title">Filmler, diziler ve canlı TV tek yerde</h1>
          <p className="wl-lead">Telefonda, bilgisayarda ve TV'de kaldığın yerden izle.</p>
          <Button variant="accent" size="lg" className="wl-cta" busy={busy} onClick={() => void login()}>
            Demo hesabıyla devam et
            <Icon name="chevronRight" size={24} strokeWidth={2.6} />
          </Button>
          <p className="wl-note">Gerçek hesap, ödeme ya da kişisel bilgi istenmez.</p>
          <button
            type="button"
            className="wl-tvhint"
            onClick={() => tvRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <Icon name="tv" size={20} />
            <span>TV'de mi izliyorsun? QR ile giriş nasıl çalışır</span>
            <Icon name="chevronDown" size={18} />
          </button>
        </div>
        <div className="wl-arc" aria-hidden="true" />
      </section>

      <section className="wl-section" aria-labelledby="wl-reasons">
        <h2 className="wl-section__title" id="wl-reasons">
          Neler var?
        </h2>
        <ul className="wl-reasons">
          {REASONS.map((r) => (
            <li key={r.title} className="wl-reason">
              <h3>{r.title}</h3>
              <p>{r.text}</p>
              <Icon name={r.icon} size={48} strokeWidth={1.6} className="wl-reason__icon" />
            </li>
          ))}
        </ul>
      </section>

      <section className="wl-section wl-tv" id="tv-girisi" ref={tvRef} aria-labelledby="wl-tv-title">
        <h2 className="wl-section__title" id="wl-tv-title">
          TV'de mi izliyorsun?
        </h2>
        <p className="wl-tv__lead">TV'de şifre yazmazsın. Telefonunla giriş yaparsın.</p>
        <ol className="wl-steps">
          {TV_STEPS.map((s, i) => (
            <li key={s} className="wl-step">
              <span className="wl-step__num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="wl-tv__note">Kod 10 dakika geçerlidir ve bir kez kullanılır.</p>
      </section>

      <footer className="wl-footer">
        <p>TV+ öğretici bir prototiptir; gerçek TV+ hizmeti değildir. Veriler bu cihazda ve demo sunucusunda kalır.</p>
      </footer>
    </div>
  )
}
