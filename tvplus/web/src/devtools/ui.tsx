/** Panelin küçük yapı taşları (tasarım sistemi bileşenlerinden bağımsız; yalnızca tokens.css değişkenleri). */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export function Icon({ d, size = 18, title }: { d: string; size?: number; title?: string }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      <path d={d} />
    </svg>
  )
}

/** DESIGN_SPEC §3 yolları */
export const ICONS = {
  close: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  pause: 'M8 5v14M16 5v14',
  play: 'M8 5.5v13l11-6.5z',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
}

/** Hata işareti: kırmızı/sarı dolgu YOK — nötr çerçeveli "!" ve metin. */
export function ErrMark({ label = 'hata' }: { label?: string }): ReactNode {
  return (
    <span className="kp-err" role="img" aria-label={label} title={label}>
      !
    </span>
  )
}

/** Her sekmenin başındaki "Bu ne?" açıklaması. */
export function Explainer({ netflix, children }: { netflix: string; children: ReactNode }): ReactNode {
  return (
    <section className="kp-explain" aria-label="Bu ne?">
      <div className="kp-explain-head">
        <span className="kp-explain-q">Bu ne?</span>
        <span className="kp-explain-nf">Netflix'te: {netflix}</span>
      </div>
      <p>{children}</p>
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }): ReactNode {
  return (
    <div className="kp-stat" title={hint}>
      <div className="kp-stat-v">{value}</div>
      <div className="kp-stat-l">{label}</div>
    </div>
  )
}

/** Anahtar–değer tablosu */
export function KV({ rows }: { rows: [string, ReactNode][] }): ReactNode {
  return (
    <dl className="kp-kv">
      {rows.map(([k, v]) => (
        <div key={k} className="kp-kv-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <p className="kp-empty">{children}</p>
}

/** Saniyede bir yenilenen "şimdi" (geri sayımlar için); yalnızca bileşen takılıyken çalışır. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export interface PollState<T> {
  data: T | null
  error: string | null
  /** Son yanıtın HTTP durumu (ağ hatasında null) */
  status: number | null
  at: number | null
}

/**
 * Sekme açık ve sayfa görünürken uç noktayı düzenli sorar; hata olursa yavaşlar (`slowMs`).
 * `refresh()` hemen yeniden sorar.
 */
export function usePoll<T>(
  url: string,
  everyMs: number,
  slowMs: number,
  headers: () => Record<string, string>,
): PollState<T> & { refresh: () => void } {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, status: null, at: null })
  const kick = useRef<() => void>(() => {})
  const headersRef = useRef(headers)
  headersRef.current = headers
  useEffect(() => {
    let alive = true
    let timer: number | null = null
    let ctrl: AbortController | null = null
    let failing = false
    const schedule = (ms: number) => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(run, ms)
    }
    async function run(): Promise<void> {
      timer = null
      if (!alive) return
      if (document.visibilityState === 'hidden') return // görünür olunca yeniden başlar
      ctrl?.abort()
      ctrl = new AbortController()
      try {
        const res = await fetch(url, {
          credentials: 'same-origin',
          signal: ctrl.signal,
          headers: { accept: 'application/json', ...headersRef.current() },
        })
        if (!res.ok) {
          if (!alive) return
          failing = true
          // 401/403: oturum yok — eski veri gösterilmez.
          const auth = res.status === 401 || res.status === 403
          setState((s) => ({
            data: auth ? null : s.data,
            error: `HTTP ${res.status}`,
            status: res.status,
            at: Date.now(),
          }))
          schedule(slowMs)
          return
        }
        const data = (await res.json()) as T
        if (!alive) return
        failing = false
        setState({ data, error: null, status: res.status, at: Date.now() })
      } catch (err) {
        if (!alive || (err as Error).name === 'AbortError') return
        failing = true
        setState((s) => ({ ...s, error: String((err as Error).message ?? err), status: null, at: Date.now() }))
      }
      if (alive) schedule(failing ? slowMs : everyMs)
    }
    const onVis = () => {
      if (document.visibilityState === 'visible' && timer === null) void run()
    }
    kick.current = () => void run()
    document.addEventListener('visibilitychange', onVis)
    void run()
    return () => {
      alive = false
      ctrl?.abort()
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [url, everyMs, slowMs])
  const refresh = useCallback(() => kick.current(), [])
  return { ...state, refresh }
}

/** Uç oturum istiyor mu (anonimken 401/403) */
export function needsLogin(p: { status: number | null }): boolean {
  return p.status === 401 || p.status === 403
}

/** Anonimken gösterilen tek, sakin satır */
export function LoginNote(): ReactNode {
  return (
    <p className="kp-calm" role="status">
      Giriş yaptıktan sonra görünür.
    </p>
  )
}
