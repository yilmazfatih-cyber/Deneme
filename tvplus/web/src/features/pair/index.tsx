/**
 * TV'ye Bağlan (#/bagla?kod=KLMN-4821) — UX_SPEC §5 "QR ile giriş". Dışa aktarım adı SABİT: PairPage.
 * TV'nin QR kodu bu sayfayı açar (kod adresten gelir) ya da kod elle yazılır. Kod sorgulanır →
 * "‹TV adı› bu hesaba bağlanmak istiyor", profil seçimi, Onayla / Reddet → TV kendiliğinden açılır.
 * Kabuk bu sayfayı profil gerektirmeden açar; giriş yapılmamışsa önce giriş, sonra buraya dönülür.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ManagedProfile, TvLoginLookup } from '../../../../shared/devices'
import { useActiveProfile, useDocumentTitle } from '../../app'
import { deviceClient } from '../../devices/client'
import { checkCode, codeFromSearch, formatCode } from '../../devices/code'
import { CodeField } from '../../devices/CodeField'
import { Avatar, Button, cx, Icon, Spinner } from '../../ui'
import {
  CHOOSE_ON_TV,
  classifyPairError,
  countdownText,
  defaultProfile,
  PROBLEM_TEXT,
  profileForApprove,
  type PairProblem,
} from './pairState'
import './pair.css'

type View =
  | { kind: 'enter'; problem: PairProblem | null }
  | { kind: 'checking' }
  | { kind: 'confirm'; lookup: TvLoginLookup; profiles: ManagedProfile[] }
  | { kind: 'approved'; deviceName: string; deviceId: string; profileName: string | null }
  | { kind: 'denied'; deviceName: string }

export function PairPage(): ReactElement {
  useDocumentTitle("TV'ye Bağlan")
  const [params, setParams] = useSearchParams()
  const urlCode = codeFromSearch(`?${params.toString()}`)
  const [code, setCode] = useState(urlCode)
  const [view, setView] = useState<View>({ kind: 'enter', problem: null })
  /** Adresteki son işlenen kod: QR yeniden okutulunca (aynı sayfadayken) baştan başlanır. */
  const handled = useRef<string | null>(null)

  const lookup = async (clean: string) => {
    if (checkCode(clean).kind !== 'complete') return
    setView({ kind: 'checking' })
    try {
      const [l, profiles] = await Promise.all([
        deviceClient.lookupTvLogin(formatCode(clean)),
        deviceClient.listProfiles().then(
          (r) => r.profiles,
          () => [] as ManagedProfile[],
        ),
      ])
      setView({ kind: 'confirm', lookup: l, profiles })
    } catch (err) {
      const problem = classifyPairError(err)
      setView({ kind: 'enter', problem })
      // Sınır kısa sürede kalkar: düğme yarım dakika sonra yeniden açılır (metin yerinde kalır).
      if (problem === 'throttled')
        window.setTimeout(
          () =>
            setView((v) =>
              v.kind === 'enter' && v.problem === 'throttled' ? { kind: 'enter', problem: 'unknown' } : v,
            ),
          30_000,
        )
    }
  }

  // QR'dan gelen kod: kendiliğinden sorgula. Adres değişirse (yeni kod ya da kodsuz /bagla) baştan başla.
  useEffect(() => {
    if (handled.current === urlCode) return
    const first = handled.current === null
    handled.current = urlCode
    if (!first || urlCode) {
      setCode(urlCode)
      setView({ kind: 'enter', problem: null })
    }
    if (checkCode(urlCode).kind === 'complete') void lookup(urlCode)
  }, [urlCode])

  const restart = () => {
    setCode('')
    setView({ kind: 'enter', problem: null })
    handled.current = ''
    if (params.has('kod')) {
      const next = new URLSearchParams(params)
      next.delete('kod')
      setParams(next, { replace: true })
    }
  }

  return (
    <div className="pr-page">
      {view.kind === 'enter' ? (
        <EnterCode code={code} setCode={setCode} problem={view.problem} onSubmit={(c) => void lookup(c)} />
      ) : null}
      {view.kind === 'checking' ? (
        <div className="pr-center" aria-busy="true">
          <Spinner label="Kod denetleniyor" />
          <p className="pr-muted">Kod denetleniyor…</p>
        </div>
      ) : null}
      {view.kind === 'confirm' ? (
        <Confirm
          lookup={view.lookup}
          profiles={view.profiles}
          onApproved={(deviceId, profileName) =>
            setView({ kind: 'approved', deviceId, deviceName: view.lookup.deviceName, profileName })
          }
          onDenied={() => setView({ kind: 'denied', deviceName: view.lookup.deviceName })}
          onProblem={(problem) => setView({ kind: 'enter', problem })}
        />
      ) : null}
      {view.kind === 'approved' ? <Approved view={view} /> : null}
      {view.kind === 'denied' ? (
        <div className="pr-center">
          <span className="pr-badge">
            <Icon name="close" size={30} />
          </span>
          <h1 className="pr-title">Giriş reddedildi</h1>
          <p className="pr-muted">{view.deviceName} bu hesaba bağlanmadı. TV yeni bir kod gösterir.</p>
          <Button variant="secondary" onClick={restart}>
            Başka bir kod gir
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function EnterCode({
  code,
  setCode,
  problem,
  onSubmit,
}: {
  code: string
  setCode: (c: string) => void
  problem: PairProblem | null
  onSubmit: (c: string) => void
}): ReactElement {
  const complete = checkCode(code).kind === 'complete'
  const text = problem ? PROBLEM_TEXT[problem] : null
  return (
    <form
      className="pr-card"
      onSubmit={(e) => {
        e.preventDefault()
        if (complete) onSubmit(code)
      }}
    >
      <span className="pr-badge">
        <Icon name="tv" size={30} />
      </span>
      <h1 className="pr-title">TV'ye Bağlan</h1>
      <p className="pr-muted">TV ekranındaki 8 karakterlik kodu gir.</p>
      {text ? (
        <div className="pr-notice" role="status">
          <strong>{text.title}</strong>
          <span>{text.message}</span>
        </div>
      ) : null}
      <CodeField value={code} onChange={setCode} onSubmit={(c) => complete && onSubmit(c)} autoFocus />
      <Button type="submit" variant="play" size="lg" block disabled={!complete || problem === 'throttled'}>
        Devam
      </Button>
      <p className="pr-help">
        <Icon name="qr" size={18} />
        TV'deki QR kodu telefonunun kamerasıyla da okutabilirsin.
      </p>
    </form>
  )
}

function Confirm({
  lookup,
  profiles,
  onApproved,
  onDenied,
  onProblem,
}: {
  lookup: TvLoginLookup
  profiles: ManagedProfile[]
  onApproved: (deviceId: string, profileName: string | null) => void
  onDenied: () => void
  onProblem: (p: PairProblem) => void
}): ReactElement {
  const active = useActiveProfile()
  const [chosen, setChosen] = useState(() => defaultProfile(profiles, active?.guid ?? null))
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const expired = Date.parse(lookup.expiresAt) <= now
  useEffect(() => {
    if (expired && !busy) onProblem('expired')
  }, [expired, busy])

  const approve = async () => {
    setBusy('approve')
    try {
      const guid = profileForApprove(profiles, chosen)
      const res = await deviceClient.approveTvLogin(lookup.userCode, guid)
      onApproved(res.deviceId, profiles.find((p) => p.guid === guid)?.name ?? null)
    } catch (err) {
      setBusy(null)
      onProblem(classifyPairError(err))
    }
  }
  const deny = async () => {
    setBusy('deny')
    try {
      await deviceClient.denyTvLogin(lookup.userCode)
      onDenied()
    } catch (err) {
      setBusy(null)
      onProblem(classifyPairError(err))
    }
  }

  const left = countdownText(lookup.expiresAt, now)
  return (
    <section className="pr-card" aria-labelledby="pr-confirm-title">
      <span className="pr-badge pr-badge--accent">
        <Icon name={lookup.deviceKind === 'TV' ? 'tv' : 'laptop'} size={30} />
      </span>
      <h1 className="pr-title" id="pr-confirm-title">
        {lookup.deviceName} bu hesaba bağlanmak istiyor
      </h1>
      <p className="pr-muted">Bu cihazda oturum açılsın mı?</p>
      <dl className="pr-facts">
        <div>
          <dt>Cihaz</dt>
          <dd>{lookup.deviceName}</dd>
        </div>
        <div>
          <dt>Kod</dt>
          <dd className="pr-code">{lookup.userCode}</dd>
        </div>
        {left ? (
          <div>
            <dt>Geçerlilik</dt>
            <dd>{left}</dd>
          </div>
        ) : null}
      </dl>

      {profiles.length > 0 ? (
        <fieldset className="pr-profiles">
          <legend>TV'de hangi profil açılsın?</legend>
          <div className="pr-profiles__grid">
            {profiles.map((p) => (
              <ProfileChoice
                key={p.guid}
                selected={chosen === p.guid}
                onSelect={() => setChosen(p.guid)}
                label={p.name}
                note={p.isLocked ? "PIN TV'de sorulur" : null}
                avatar={<Avatar src={p.avatarUrl} name={p.name} size={56} />}
                locked={p.isLocked}
              />
            ))}
            <ProfileChoice
              selected={chosen === CHOOSE_ON_TV}
              onSelect={() => setChosen(CHOOSE_ON_TV)}
              label="TV'de seçerim"
              note={null}
              avatar={
                <span className="pr-tvchoice">
                  <Icon name="users" size={26} />
                </span>
              }
            />
          </div>
        </fieldset>
      ) : null}

      <div className="pr-actions">
        <Button
          variant="play"
          size="lg"
          block
          busy={busy === 'approve'}
          disabled={busy !== null}
          onClick={() => void approve()}
          data-pair="approve"
        >
          Onayla
        </Button>
        <Button
          variant="secondary"
          size="lg"
          block
          busy={busy === 'deny'}
          disabled={busy !== null}
          onClick={() => void deny()}
          data-pair="deny"
        >
          Reddet
        </Button>
      </div>
      <p className="pr-help">Bu isteği sen başlatmadıysan Reddet'e bas.</p>
    </section>
  )
}

function ProfileChoice({
  selected,
  onSelect,
  label,
  note,
  avatar,
  locked,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  note: string | null
  avatar: ReactElement
  locked?: boolean
}): ReactElement {
  return (
    <label className={cx('pr-profile', selected && 'is-selected')}>
      <input type="radio" name="pr-profile" checked={selected} onChange={onSelect} className="ui-sr-only" />
      <span className="pr-profile__avatar">
        {avatar}
        {locked ? (
          <span className="pr-profile__lock" aria-hidden="true">
            <Icon name="lock" size={14} />
          </span>
        ) : null}
      </span>
      <span className="pr-profile__name">{label}</span>
      {note ? <span className="pr-profile__note">{note}</span> : null}
    </label>
  )
}

function Approved({
  view,
}: {
  view: { deviceName: string; deviceId: string; profileName: string | null }
}): ReactElement {
  const navigate = useNavigate()
  const active = useActiveProfile()
  return (
    <section className="pr-card pr-card--done" aria-live="polite">
      <span className="pr-badge pr-badge--ok">
        <Icon name="check" size={32} />
      </span>
      <h1 className="pr-title">{view.deviceName} bağlandı</h1>
      <p className="pr-muted">
        {view.profileName
          ? `TV birazdan ${view.profileName} profiliyle açılır.`
          : "TV birazdan açılır; profilini TV'de seç."}
      </p>
      <div className="pr-actions">
        <Button
          variant="play"
          size="lg"
          icon="remote"
          block
          onClick={() => {
            deviceClient.setTarget(view.deviceId)
            navigate('/kumanda')
          }}
        >
          Kumandayı Aç
        </Button>
        <Button variant="secondary" size="lg" block onClick={() => navigate(active ? '/goz-at' : '/profiller')}>
          Ana Sayfa
        </Button>
      </div>
    </section>
  )
}
