/**
 * TV oynatma ekranı. Dışa aktarım adı SABİT.
 *   TvWatch  /tv/izle/:viewableId   (?konum=<sn>&baslat=bastan&tctx=…)
 *
 * Oynatıcının TV kabuğunu (`<WatchPage chrome="tv" exitTo={…} />`) barındırır; oynatıcı tuşları kendisi dinler,
 * odak motoru bu sırada geri çekilir (TvApp → FocusRoot keyboardSuspended). `?konum` / `?baslat` adresle aynen
 * oynatıcıya geçer (WatchPage adresten okur). Bu ekranın eklediği:
 *   - çıkış hedefi (exit.ts): geldiği ekran (detay, Canlı TV, Rehber) · yansıtmada Ana Sayfa · zapta önceki plan
 *   - son kanal: kanal açıldıkça (zap dahil) Canlı TV / Rehber dönüşte o kanala odaklanır
 *   - film bitince detayına döner (dizide oynatıcının "sonraki bölüm" akışı)
 *   - yansıtmada "‹cihaz› gönderdi" künyesi: kabuğun bildirimi oynatıcının altında kalır (oynatıcı z-index 100),
 *     bu yüzden aynı bilgi bir kez, oynatıcının üstünde gösterilir (ikinci bir bildirim açılmaz)
 *   - "oynatılamıyor" sayfası 10 feet için büyütülür: oynatıcının px ölçülü alt sayfası (h2 18 px, p 14 px,
 *     yerel düğmeler, ←/→ çalışmaz) görünür kalmaz; aynı metin ve AYNI düğme işleyicileriyle (oynatıcının
 *     düğmelerine tıklanarak) TV düğmeli bir pencere çizilir
 */
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { useGql } from '../../api/hooks'
import { devbus } from '../../lib/devbus'
import { playerRemote, WatchPage } from '../../player'
import { FocusScope, remoteKeyFromKeyboard, useFocusEngine, useKeyInterceptor } from '../focus'
import { noteTunedChannel } from '../live/data'
import { canGoBack } from '../shell/history'
import { watchPath } from '../shell/routes'
import { TvButton, TvIcon } from '../ui'
import { castFromEvent, endedExit, matchCast, resolveExit, type CastRecord, type ExitPlan } from './exit'
import './watch.css'

/* ───────────── Modül durumu: yansıtma kaydı ve önceki izleme oturumu ───────────── */

let lastCast: CastRecord | null = null
// Kabuk CAST komutunu yönlendirmeden ÖNCE cihaz istemcisi devbus'a "komut ←" yayınlar.
devbus.subscribe((e) => {
  const rec = castFromEvent(e)
  if (rec) lastCast = rec
})

interface WatchSession {
  plan: ExitPlan
  originScreen: string | null
  sender: string | null
}

/** Kapanan izleme ekranının oturumu (zap / sonraki bölümde yeni ekran bunu sürdürür). */
let closed: { session: WatchSession; at: number } | null = null
const CONTINUE_MS = 2500

/* ───────────── İçerik bilgisi ───────────── */

interface WatchInfo {
  playbackMetadata: {
    viewableId: string
    title: string
    subtitle: string | null
    live: boolean
    video: { __typename: string; videoId: number; title: string; parentShow?: { videoId: number } | null } | null
    channel: { channelId: number; name: string; number: number } | null
    nextEpisode: { videoId: number } | null
    previousChannel: { channelId: number } | null
    nextChannel: { channelId: number } | null
  } | null
}

/* ───────────── "Oynatılamıyor" sayfasının TV hâli ───────────── */

interface SheetInfo {
  label: string | null
  title: string
  text: string
  retry: HTMLButtonElement | null
  back: HTMLButtonElement | null
}

/** Oynatıcının px ölçülü alt sayfasından metni ve düğmelerini okur. */
function readSheet(root: HTMLElement): SheetInfo | null {
  const wrap = root.querySelector<HTMLElement>('.kb-sheet-wrap')
  if (!wrap) return null
  return {
    label: wrap.querySelector('.kb-sheet-label')?.textContent ?? null,
    title: wrap.querySelector('h2')?.textContent ?? 'Oynatılamıyor',
    text: wrap.querySelector('p')?.textContent ?? '',
    retry: wrap.querySelector<HTMLButtonElement>('button.kb-btn-primary'),
    back: wrap.querySelector<HTMLButtonElement>('button.kb-btn-secondary'),
  }
}

interface TvWatchSheetProps {
  label: string | null
  title: string
  text: string
  onRetry: (() => void) | null
  onBack: () => void
  /** Kanalda ↑/↓ komşu kanala geçer (1 → sonraki, −1 → önceki) */
  onZap: ((dir: 1 | -1) => void) | null
}

/** TV ölçüsünde "oynatılamıyor" penceresi: TV düğmeleri, Geri çıkar, kanalda ↑/↓ kanal değiştirir. */
function TvWatchSheet({ label, title, text, onRetry, onBack, onZap }: TvWatchSheetProps): ReactElement {
  const engine = useFocusEngine()
  // Oynatıcı takılı sayılabildiği için motorun klavye dinleyicisi beklemede olabilir: tuşlar burada motora verilir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const key = remoteKeyFromKeyboard(e)
      if (!key) return
      e.preventDefault()
      e.stopPropagation()
      engine.dispatchKey(key)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [engine])
  useKeyInterceptor((key) => {
    if (key === 'BACK') {
      onBack()
      return true
    }
    if (onZap && (key === 'UP' || key === 'CHANNEL_UP')) {
      onZap(1)
      return true
    }
    if (onZap && (key === 'DOWN' || key === 'CHANNEL_DOWN')) {
      onZap(-1)
      return true
    }
    return false
  }, 100)
  useLayoutEffect(() => {
    engine.focusScope('izle-hata')
  }, [engine])
  return (
    <div className="tvw-sheet" role="dialog" aria-modal="true" aria-labelledby="tvw-sheet-title">
      <FocusScope id="izle-hata" trap modal defaultFocus={onRetry ? 'izle-hata:tekrar' : 'izle-hata:geri'}>
        <div className="tvw-sheet__box">
          {label && <p className="tvw-sheet__label">{label}</p>}
          <h1 className="tvw-sheet__title" id="tvw-sheet-title">
            {title}
          </h1>
          <p className="tvw-sheet__text">{text}</p>
          <div className="tvw-sheet__actions">
            {onRetry && <TvButton id="izle-hata:tekrar" label="Tekrar dene" icon="restart" onPress={onRetry} />}
            <TvButton id="izle-hata:geri" label="Geri dön" icon="back" onPress={onBack} />
          </div>
          {onZap && (
            <p className="tvw-sheet__hint">
              <TvIcon name="chevronUp" size={1.3} />
              <TvIcon name="chevronDown" size={1.3} /> Kanal değiştir
            </p>
          )}
        </div>
      </FocusScope>
    </div>
  )
}

/* ───────────── Oynatıcı çökerse ───────────── */

interface BoundaryProps {
  onError: (error: Error) => void
  children: ReactNode
}

/**
 * Oynatıcının çizimde fırlattığı hata tüm uygulamayı kapatmasın (ör. YouTube gömmesi hazır olmadan
 * `getVolume` çağrısı): hata yakalanır, ekran TV penceresine döner.
 */
class PlayerBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/* ───────────── Ekran ───────────── */

export function TvWatch(): ReactElement {
  const params = useParams()
  const viewableId = decodeURIComponent(params.viewableId ?? '')
  const navigate = useNavigate()
  const navType = useNavigationType()
  // Gelinen ekran: bu ilk çizimde eski ekran henüz DOM'dadır (TvScreen `data-screen` taşır).
  const [origin] = useState(() =>
    typeof document === 'undefined'
      ? null
      : (document.querySelector('.tv-root [data-screen]')?.getAttribute('data-screen') ?? null),
  )
  const [session, setSession] = useState<WatchSession | null>(null)
  const sessionRef = useRef<WatchSession | null>(null)

  // Plan, kabuğun geçmiş izleyicisi bu geçişi kaydettikten sonra (etkide) kurulur.
  useEffect(() => {
    const now = Date.now()
    const cast = matchCast(lastCast, viewableId, now)
    const prev = !cast && closed && now - closed.at < CONTINUE_MS && navType === 'REPLACE' ? closed.session : null
    const plan = resolveExit({
      viewableId,
      cast: !!cast,
      continued: prev?.plan ?? null,
      originScreen: origin,
      canGoBack: canGoBack(),
    })
    const s: WatchSession = {
      plan,
      originScreen: prev ? prev.originScreen : origin,
      sender: cast?.from ?? null,
    }
    sessionRef.current = s
    setSession(s)
    devbus.emit('player', 'TV izleme: çıkış hedefi', {
      viewableId,
      exit: plan.kind === 'path' ? plan.path : 'geçmiş',
      origin: s.originScreen,
      cast: cast?.from ?? null,
      continued: !!prev,
    })
    return () => {
      closed = { session: s, at: Date.now() }
    }
  }, [viewableId])

  // Son kanal (zap da dahil): Canlı TV ve Rehber dönüşte buna odaklanır.
  useEffect(() => {
    const m = /^Channel:(\d+)$/.exec(viewableId)
    if (m) noteTunedChannel(Number(m[1]))
  }, [viewableId])

  const info = useGql<WatchInfo, { viewableId: string }>('TvWatchInfo', { viewableId }, { ttlMs: 300_000 })
  const meta = info.data?.playbackMetadata ?? null

  // Film bitince detayına.
  const endedRef = useRef(false)
  useEffect(() => {
    endedRef.current = false
    const check = (): void => {
      const s = playerRemote.getState()
      const sess = sessionRef.current
      if (!s || s.state !== 'ended' || s.viewableId !== viewableId || endedRef.current || !sess) return
      const video = meta?.video ?? null
      const target = endedExit({
        typename: video?.__typename ?? null,
        videoId: video?.videoId ?? null,
        plan: sess.plan,
        originScreen: sess.originScreen,
      })
      if (!target) return
      endedRef.current = true
      devbus.emit('player', 'TV izleme: bitti → detay', { viewableId, target: target.kind === 'path' ? target.path : 'geçmiş' })
      if (target.kind === 'history') navigate(-1)
      else navigate(target.path, { replace: true })
    }
    check()
    return playerRemote.subscribe(check)
  }, [viewableId, meta, navigate])

  // Yansıtma künyesi: birkaç saniye.
  const [senderVisible, setSenderVisible] = useState(false)
  useEffect(() => {
    if (!session?.sender) return
    setSenderVisible(true)
    const t = window.setTimeout(() => setSenderVisible(false), 5000)
    return () => window.clearTimeout(t)
  }, [session?.sender])

  // "Oynatılamıyor" sayfasını izle.
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [sheet, setSheet] = useState<SheetInfo | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const sync = (): void => {
      const next = readSheet(host)
      setSheet((cur) => {
        if (!next) return null
        if (cur && cur.title === next.title && cur.text === next.text && cur.retry === next.retry) return cur
        return next
      })
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(host, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [session !== null])

  const exitTo = session?.plan.kind === 'path' ? session.plan.path : undefined
  const title = meta?.channel ? `${meta.channel.number} · ${meta.channel.name}` : (meta?.title ?? '')

  /* Oynatıcı çöktüyse: çıkış, yeniden deneme ve kanal değiştirme bu ekrandan. */
  const [crash, setCrash] = useState<{ viewableId: string; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const crashed = crash?.viewableId === viewableId && crash.attempt === attempt
  const exit = useCallback(() => {
    const plan = sessionRef.current?.plan
    if (plan?.kind === 'path') navigate(plan.path)
    else navigate(-1)
  }, [navigate])
  const zapTo = (dir: 1 | -1): void => {
    const ch = dir === 1 ? meta?.nextChannel : meta?.previousChannel
    if (!ch) return
    devbus.emit('player', 'TV izleme: kanal değiştir (pencere)', { from: viewableId, to: `Channel:${ch.channelId}` })
    navigate(watchPath(`Channel:${ch.channelId}`), { replace: true })
  }
  const canZap = viewableId.startsWith('Channel:') && !!(meta?.nextChannel || meta?.previousChannel)

  return (
    <div className="tvw" ref={hostRef} data-viewable={viewableId}>
      {session ? (
        <PlayerBoundary
          key={`${viewableId}|${attempt}`}
          onError={(error) => {
            devbus.emit('player', 'TV izleme: oynatıcı çöktü', { viewableId, error: error.message }, { ok: false })
            setCrash({ viewableId, attempt })
          }}
        >
          <WatchPage chrome="tv" exitTo={exitTo} />
        </PlayerBoundary>
      ) : (
        <div className="tvw-wait" aria-busy="true" />
      )}
      {crashed ? (
        <TvWatchSheet
          label={title || null}
          title="Yayın şu an açılamıyor"
          text="Oynatıcı bu yayını başlatamadı. Tekrar deneyebilir ya da başka bir kanala geçebilirsin."
          onRetry={() => setAttempt((n) => n + 1)}
          onBack={exit}
          onZap={canZap ? zapTo : null}
        />
      ) : sheet ? (
        <TvWatchSheet
          label={sheet.label}
          title={sheet.title}
          text={sheet.text}
          onRetry={sheet.retry ? () => sheet.retry?.click() : null}
          onBack={() => (sheet.back ? sheet.back.click() : exit())}
          onZap={canZap ? zapTo : null}
        />
      ) : null}
      {senderVisible && session?.sender && (
        <div className="tvw-sender" role="status">
          <TvIcon name="phone" size={1.8} />
          <span>
            <strong>{session.sender}</strong> gönderdi{title ? ` · ${title}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
