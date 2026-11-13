/**
 * Cihaz vitrini (#/vitrin) — UX_SPEC §5. Dışa aktarım adı SABİT: ShowcasePage. Kabuksuz ve korumasız çizilir.
 * TV (16:9), Web (16:10) ve Telefon (9:19.5) yan yana; her biri bu uygulamanın ayrı sanal cihazı (?vd=) ve ekran
 * biçimi (?cihaz=) olarak çalışan bir iframe. Üstte kısa rehber ve demoyu çerçeveler + API üzerinden yürüten
 * senaryo düğmeleri (scenarios.ts).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useDocumentTitle } from '../../app'
import { cx, Icon, Logo, Spinner, Switch, type IconName } from '../../ui'
import { createBrowserEnv, frameUrl, HOME_ROUTE } from './env'
import { CHROME, FRAMES, layoutFrames, type Layout } from './layout'
import { runScenario, SCENARIO_LABELS, type FrameId, type RunView, type ScenarioId } from './scenarios'
import './showcase.css'

const META: Record<FrameId, { title: string; note: string; icon: IconName }> = {
  tv: { title: 'TV', note: 'Kumandayla · 10-foot', icon: 'tv' },
  web: { title: 'Web', note: 'Masaüstü tarayıcı', icon: 'laptop' },
  telefon: { title: 'Telefon', note: 'Mobil · kumanda', icon: 'phone' },
}

const ORDER: ScenarioId[] = ['qr', 'remote', 'cast', 'live']

const HINTS: Record<ScenarioId, string> = {
  qr: 'TV kod gösterir, telefon QR adresini açar, sen onaylarsın.',
  remote: "Telefon kumandaya döner; pedle TV'yi gez.",
  cast: "Web'de Sintel başlar ve TV'ye geçer.",
  live: "Telefondan Kanal 1 TV'de açılır.",
  reset: 'Üç cihazın oturumu kapanır.',
}

function useStageSize(): [(el: HTMLElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ w: 1200, h: 700 })
  useEffect(() => {
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      // Sahne, pencerenin kalan yüksekliğini kullanır (başlık için en az 48 px pay).
      setSize({ w: Math.floor(r.width), h: Math.max(320, Math.floor(window.innerHeight - r.top - 64)) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [el])
  return [setEl, size]
}

/** Çerçevelerin güncel yolu (başlık altı için), saniyede bir okunur. */
function useFrameRoutes(env: ReturnType<typeof createBrowserEnv>): Record<FrameId, string | null> {
  const [routes, setRoutes] = useState<Record<FrameId, string | null>>({ tv: null, web: null, telefon: null })
  useEffect(() => {
    const t = window.setInterval(() => {
      const next = { tv: env.route('tv'), web: env.route('web'), telefon: env.route('telefon') }
      setRoutes((prev) => (prev.tv === next.tv && prev.web === next.web && prev.telefon === next.telefon ? prev : next))
    }, 1000)
    return () => window.clearInterval(t)
  }, [env])
  return routes
}

export function ShowcasePage(): ReactElement {
  useDocumentTitle('Cihaz vitrini')
  const frames = useRef<Partial<Record<FrameId, HTMLIFrameElement | null>>>({})
  const env = useMemo(() => createBrowserEnv(() => frames.current), [])
  const [stageRef, size] = useStageSize()
  const layout: Layout = layoutFrames(size.w, size.h)
  const routes = useFrameRoutes(env)
  const [run, setRun] = useState<RunView | null>(null)
  const [autoApprove, setAutoApprove] = useState(false)
  const signal = useRef<{ cancelled: boolean } | null>(null)
  const [srcs] = useState(() => ({
    tv: frameUrl('tv', HOME_ROUTE.tv),
    web: frameUrl('web', HOME_ROUTE.web),
    telefon: frameUrl('telefon', HOME_ROUTE.telefon),
  }))

  useEffect(() => {
    document.documentElement.classList.add('sc-root')
    return () => document.documentElement.classList.remove('sc-root')
  }, [])
  useEffect(() => () => void (signal.current && (signal.current.cancelled = true)), [])

  const busy = run?.status === 'running'
  const start = (id: ScenarioId) => {
    if (signal.current) signal.current.cancelled = true
    const s = { cancelled: false }
    signal.current = s
    void runScenario(
      id,
      env,
      { autoApprove },
      (v) => {
        if (!s.cancelled || v.status === 'cancelled') setRun(v)
      },
      s,
    )
  }
  const stop = () => {
    if (signal.current) signal.current.cancelled = true
  }

  return (
    <main className="sc-page">
      <header className="sc-head">
        <div className="sc-brand">
          <Logo height={26} decorative />
          <div>
            <h1 className="sc-title">Cihaz vitrini</h1>
            <p className="sc-lead">
              Aynı hesap, üç cihaz. Her çerçeve ayrı bir cihaz gibi canlı çalışır: TV'ye QR ile giriş, telefonu kumanda
              yapma ve TV'ye yansıtma burada denenir.
            </p>
          </div>
        </div>
        <div className="sc-controls">
          <div className="sc-scenarios" role="group" aria-label="Senaryolar">
            {ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={cx('sc-scn', run?.scenario === id && 'is-current', run?.scenario === id && run.status)}
                onClick={() => start(id)}
                title={HINTS[id]}
              >
                <span className="sc-scn__label">{SCENARIO_LABELS[id]}</span>
                <span className="sc-scn__hint">{HINTS[id]}</span>
              </button>
            ))}
            <button type="button" className="sc-scn sc-scn--reset" onClick={() => start('reset')} title={HINTS.reset}>
              <Icon name="startOver" size={18} />
              <span className="sc-scn__label">{SCENARIO_LABELS.reset}</span>
            </button>
          </div>
          <Switch checked={autoApprove} onChange={setAutoApprove} label="Benim yerime onayla" className="sc-auto" />
        </div>
        <RunStrip run={run} onStop={busy ? stop : null} />
      </header>

      <section ref={stageRef} className={cx('sc-stage', `sc-stage--${layout.mode}`)} aria-label="Cihazlar">
        {FRAMES.map((spec) => {
          const box = layout.frames.find((f) => f.id === spec.id)!
          const m = META[spec.id]
          return (
            <figure
              key={spec.id}
              className={cx('sc-device', `sc-device--${spec.id}`)}
              style={{ width: box.width + CHROME[spec.id].x }}
            >
              <div className="sc-shell">
                <div className="sc-device__body" style={{ width: box.width, height: box.height } as CSSProperties}>
                  <iframe
                    ref={(el) => {
                      frames.current[spec.id] = el
                    }}
                    title={`${m.title} çerçevesi`}
                    src={srcs[spec.id]}
                    className="sc-device__frame"
                    style={{
                      width: spec.vw,
                      height: spec.vh,
                      transform: `scale(${box.scale})`,
                    }}
                    allow="autoplay; fullscreen; picture-in-picture"
                  />
                </div>
              </div>
              <figcaption className="sc-cap">
                <span className="sc-cap__title">
                  <Icon name={m.icon} size={18} />
                  {m.title}
                  <span className="sc-cap__note">{m.note}</span>
                </span>
                <span className="sc-cap__route" title={routes[spec.id] ?? ''}>
                  {routes[spec.id] ?? '…'}
                </span>
                <span className="sc-cap__actions">
                  <button
                    type="button"
                    className="sc-iconbtn"
                    aria-label={`${m.title} çerçevesini yenile`}
                    title="Yenile"
                    onClick={() => frames.current[spec.id]?.contentWindow?.location.reload()}
                  >
                    <Icon name="startOver" size={18} />
                  </button>
                  <a
                    className="sc-iconbtn sc-open"
                    href={frameUrl(spec.id, routes[spec.id] ?? HOME_ROUTE[spec.id])}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ayrı sekmede aç
                  </a>
                </span>
              </figcaption>
            </figure>
          )
        })}
      </section>
    </main>
  )
}

function RunStrip({ run, onStop }: { run: RunView | null; onStop: (() => void) | null }): ReactElement {
  if (!run) {
    return (
      <p className="sc-strip sc-strip--idle">
        Bir senaryo seç ya da çerçevelerde kendin gez. TV'de oklar ve Enter çalışır; Geri için Backspace.
      </p>
    )
  }
  return (
    <div className={cx('sc-strip', `is-${run.status}`)} aria-live="polite">
      <ol className="sc-steps">
        {run.steps.map((s) => (
          <li key={s.id} className={cx('sc-step', `is-${s.status}`)}>
            <span className="sc-step__mark" aria-hidden="true">
              {s.status === 'done' ? (
                <Icon name="check" size={14} />
              ) : s.status === 'running' ? (
                <Spinner size={14} label="" />
              ) : s.status === 'failed' ? (
                '!'
              ) : s.status === 'waiting' ? (
                '…'
              ) : null}
            </span>
            <span className="sc-step__text">
              <span className="sc-step__label">{s.label}</span>
              {s.note ? <span className="sc-step__note">{s.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {run.message ? <p className="sc-strip__msg">{run.message}</p> : null}
      {onStop ? (
        <button type="button" className="sc-stop" onClick={onStop}>
          Durdur
        </button>
      ) : null}
    </div>
  )
}
