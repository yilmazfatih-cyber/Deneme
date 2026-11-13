import { useSyncExternalStore, type ReactNode } from 'react'
import { COOKIES } from '../../../../shared/constants'
import { onBootChange, peekBoot, sessionHeaders } from '../../api/session'
import { splitEsn } from '../model/esn'
import { fmtClock } from '../model/format'
import { Explainer, KV } from '../ui'

const COOKIE_ROWS: { name: string; netflix: string; purpose: string; flags: string[]; httpOnly: boolean }[] = [
  { name: COOKIES.SESSION, netflix: 'NetflixId', purpose: 'Oturum ve seçili profil (pg=…)', flags: ['HttpOnly', 'SameSite=Lax', '1 yıl'], httpOnly: true },
  { name: COOKIES.SECURE, netflix: 'SecureNetflixId', purpose: 'Oturum çerezinin imzası (MAC)', flags: ['HttpOnly', 'SameSite=Strict', '1 yıl'], httpOnly: true },
  { name: COOKIES.DEVICE, netflix: 'nfvdid', purpose: 'Sanal cihaz kimliği', flags: ['1 yıl'], httpOnly: false },
  { name: COOKIES.PROFILE_GATE, netflix: 'profilesNewSession', purpose: 'Profil seçim kapısının durumu', flags: ['oturum çerezi'], httpOnly: false },
]

const STATUS_TEXT: Record<string, string> = {
  ANONYMOUS: 'Giriş yapılmadı',
  CURRENT_MEMBER: 'Üye',
  FORMER_MEMBER: 'Eski üye',
}

function readableCookies(): Set<string> {
  try {
    return new Set(
      document.cookie
        .split(';')
        .map((c) => c.split('=')[0]?.trim() ?? '')
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

export function IdentityTab({ lastTraceId, lastTraceAt }: { lastTraceId: string | null; lastTraceAt: number | null }): ReactNode {
  const boot = useSyncExternalStore(onBootChange, peekBoot, peekBoot)
  const headers = sessionHeaders()
  const parts = splitEsn(boot?.esn)
  const visible = readableCookies()

  return (
    <div className="kp-tab">
      <Explainer netflix="Passport · ESN · NetflixId çerez zinciri">
        Sunucu seni çerezlerden tanır; profil kimliğini her istekte çerezden yeniden çözer. Tarayıcı ayrıca her isteğe cihaz seri
        numarasını (ESN) ve istemci başlıklarını ekler.
      </Explainer>

      {!boot ? (
        <p className="kp-empty">Açılış bağlamı henüz yüklenmedi.</p>
      ) : (
        <>
          <h3 className="kp-h">Hesap ve profil</h3>
          <KV
            rows={[
              ['Üyelik', `${STATUS_TEXT[boot.membershipStatus] ?? boot.membershipStatus} (${boot.membershipStatus})`],
              ['Hesap', boot.account ? <span className="kp-mono">{boot.account.accountId}</span> : '—'],
              ['Paket', boot.account ? [boot.account.planName, ...boot.account.products].join(' · ') : '—'],
              [
                'Etkin profil',
                boot.activeProfile ? (
                  <span>
                    {boot.activeProfile.name}
                    {boot.activeProfile.isKids ? ' (çocuk)' : ''}
                    <br />
                    <span className="kp-mono kp-dim kp-break">{boot.activeProfile.guid}</span>
                  </span>
                ) : (
                  'Seçilmedi — "Kim izliyor?" kapısı'
                ),
              ],
              ['Bölge', boot.region],
              ['Derleme', <span key="b" className="kp-mono">{boot.buildId}</span>],
            ]}
          />

          <h3 className="kp-h">Cihaz seri numarası (ESN)</h3>
          <p className="kp-mono kp-esn">{boot.esn}</p>
          {parts ? (
            <ol className="kp-esn-parts">
              {parts.map((p) => (
                <li key={p.label}>
                  <span className="kp-mono kp-esn-code">{p.code}</span>
                  <span className="kp-esn-label">{p.label}</span>
                  <span className="kp-dim kp-small">{p.meaning}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="kp-dim kp-small">Bu ESN beklenen biçimde değil (TVP · W · tarayıcı · platform · cihaz özeti).</p>
          )}
          <p className="kp-note">Netflix'te NFCDCH-MC-…: Netflix · Cadmium Chrome · Mac · cihaz özeti.</p>
        </>
      )}

      <h3 className="kp-h">Her istekte giden kimlik başlıkları</h3>
      <dl className="kp-headers">
        {Object.entries(headers).map(([k, v]) => (
          <div key={k}>
            <dt className="kp-mono">{k}</dt>
            <dd className="kp-mono kp-break">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="kp-dim kp-small">
        Son iz kimliği (x-b3-traceid):{' '}
        <span className="kp-mono">{lastTraceId ?? '—'}</span>
        {lastTraceAt ? ` · ${fmtClock(lastTraceAt)}` : ''}
      </p>

      <h3 className="kp-h">Çerez zinciri</h3>
      <ul className="kp-cookies">
        {COOKIE_ROWS.map((c) => (
          <li key={c.name}>
            <div className="kp-cookie-top">
              <span className="kp-mono kp-cookie-name">{c.name}</span>
              <span className="kp-dim kp-small">Netflix: {c.netflix}</span>
            </div>
            <div className="kp-small">{c.purpose}</div>
            <div className="kp-chips-static">
              {c.flags.map((f) => (
                <span key={f} className="kp-pill">
                  {f}
                </span>
              ))}
              <span className="kp-dim kp-small">
                {c.httpOnly ? 'JavaScript okuyamaz' : visible.has(c.name) ? 'bu sayfadan okunuyor' : 'şu an yok'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="kp-note">HttpOnly çerezleri JavaScript bilerek okuyamaz; böylece sayfaya sızan bir betik oturumu çalamaz.</p>
    </div>
  )
}
