/** Üç kabuğun ortak parçaları: ortadaki geri bildirim simgesi, hata paneli, sonraki bölüm kartı, boşta gizlenme. */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { RemoteKey } from '../../../../shared/devices'
import type { PlayerModel } from './core'
import { IconBack10, IconClose, IconFwd10, IconMuted, IconPause, IconPlay, IconVolume } from './icons'
import { StatsOverlay, SubtitleOverlay } from './parts'
import { remoteKeyFromKeyboard } from './tvKeys'

/* ───────────── ortadaki geri bildirim simgesi ───────────── */

export type GlyphKind = 'play' | 'pause' | 'back' | 'fwd' | 'volume' | 'muted'
export interface GlyphState {
  kind: GlyphKind
  label: string | null
  n: number
}

export function useGlyph(): [GlyphState | null, (kind: GlyphKind, label?: string | null) => void] {
  const [g, setG] = useState<GlyphState | null>(null)
  const timer = useRef<number | null>(null)
  const show = useCallback((kind: GlyphKind, label: string | null = null) => {
    setG((prev) => ({ kind, label, n: (prev?.n ?? 0) + 1 }))
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setG(null), 700)
  }, [])
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )
  return [g, show]
}

export function Glyph({ glyph }: { glyph: GlyphState | null }): ReactElement | null {
  if (!glyph) return null
  const icon =
    glyph.kind === 'play' ? (
      <IconPlay size={48} />
    ) : glyph.kind === 'pause' ? (
      <IconPause size={48} />
    ) : glyph.kind === 'back' ? (
      <IconBack10 size={48} />
    ) : glyph.kind === 'fwd' ? (
      <IconFwd10 size={48} />
    ) : glyph.kind === 'muted' ? (
      <IconMuted size={48} />
    ) : (
      <IconVolume size={48} />
    )
  return (
    <div key={glyph.n} className="kb-glyph" aria-hidden="true">
      <span className="kb-glyph-disc">{icon}</span>
      {glyph.label ? <span className="kb-glyph-label">{glyph.label}</span> : null}
    </div>
  )
}

/* ───────────── boşta gizlenme ───────────── */

export function useIdle(ms: number): { idle: boolean; poke: () => void; hideNow: () => void } {
  const [idle, setIdle] = useState(false)
  const timer = useRef<number | null>(null)
  const poke = useCallback(() => {
    setIdle(false)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setIdle(true), ms)
  }, [ms])
  const hideNow = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    setIdle(true)
  }, [])
  useEffect(() => {
    poke()
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [poke])
  return { idle, poke, hideNow }
}

/* ───────────── altyazı, yükleniyor, istatistik ───────────── */

export function Subtitles({ m, raised }: { m: PlayerModel; raised: boolean }): ReactElement | null {
  if (!m.adapter || !m.text || !m.text.selectedId()) return null
  return <SubtitleOverlay adapter={m.adapter} controller={m.text} raised={raised} />
}

export function Busy({ m }: { m: PlayerModel }): ReactElement | null {
  if (m.error || (m.state !== 'buffering' && m.state !== 'loading')) return null
  return <div className="kb-spinner" role="status" aria-label="Yükleniyor" />
}

export function Stats({ m }: { m: PlayerModel }): ReactElement | null {
  if (!m.stats || !m.adapter) return null
  return <StatsOverlay adapter={m.adapter} onClose={() => m.act.setStats(false)} />
}

/* ───────────── hata ───────────── */

/** TV hata panelinin düğmeleri (soldan sağa): yeniden denenebilirse [Tekrar dene, Geri dön], değilse [Geri dön]. */
export function errorButtons(retryable: boolean): ('retry' | 'back')[] {
  return retryable ? ['retry', 'back'] : ['back']
}

export function ErrorPanel({
  m,
  tv = false,
  focus = 0,
}: {
  m: PlayerModel
  tv?: boolean
  /** TV: odaktaki düğme sırası */
  focus?: number
}): ReactElement | null {
  const e = m.error
  if (!e) return null
  return (
    <section className="kb-panel" role="alert">
      <h2>{e.message}</h2>
      <p>
        {e.code === 'ALL_CDNS_FAILED'
          ? 'Bağlantı düzelince kaldığın yerden devam eder.'
          : 'Yeniden denemek çoğu zaman yeterli olur.'}
      </p>
      <div className="kb-actions">
        {e.retryable ? (
          <button
            type="button"
            className="kb-btn kb-btn-primary"
            data-focus={tv && focus === 0}
            onClick={() => m.act.retry()}
          >
            Tekrar dene
          </button>
        ) : null}
        <button
          type="button"
          className="kb-btn kb-btn-secondary"
          data-focus={tv && focus === (e.retryable ? 1 : 0)}
          onClick={() => m.act.back()}
        >
          Geri dön
        </button>
      </div>
      {tv ? <p className="kb-hint-line">◀ ▶ Seç · OK Onayla · Geri Çık</p> : null}
    </section>
  )
}

/* ───────────── sonraki bölüm kartı ───────────── */

export function NextCard({ m, tv = false }: { m: PlayerModel; tv?: boolean }): ReactElement | null {
  const n = m.next
  if (!m.showNext || !n) return null
  const total = 10
  const left = m.countdown ?? total
  return (
    <section className="kb-next" aria-label="Sonraki bölüm" data-tv={tv}>
      {n.storyArt?.url ? <img className="kb-next-art" src={n.storyArt.url} alt="" /> : null}
      <div className="kb-next-body">
        <span className="kb-next-meta">Sonraki Bölüm{n.seasonNumber ? ` · S${n.seasonNumber}:B${n.number}` : ''}</span>
        <span className="kb-next-title">{n.title}</span>
        <div className="kb-actions">
          <button
            type="button"
            className="kb-btn kb-btn-play kb-next-go"
            data-focus={tv}
            onClick={() => m.act.goNext()}
            style={{ ['--kb-fill' as string]: `${((total - left) / total) * 100}%` }}
          >
            <IconPlay size={20} />
            Sonraki Bölüm{m.countdown !== null ? ` · ${m.countdown}` : ''}
          </button>
          {tv ? null : (
            <button type="button" className="kb-btn kb-btn-secondary" onClick={() => m.act.dismissNext()}>
              Jeneriği izle
            </button>
          )}
        </div>
        {tv ? <span className="kb-hint-line">OK Sonraki Bölüm · Geri Jeneriği izle</span> : null}
      </div>
      {tv ? null : (
        <button type="button" className="kb-ibtn kb-next-x" aria-label="Kapat" onClick={() => m.act.dismissNext()}>
          <IconClose size={20} />
        </button>
      )}
    </section>
  )
}

/* ───────────── başlık ───────────── */

export function TitleLine({ m }: { m: PlayerModel }): ReactElement {
  const t = m.title
  return (
    <h1 className="kb-tl">
      <strong>{t.main}</strong>
      {t.code ? (
        <>
          {' '}
          <span className="kb-tl-code">{t.code}</span>
        </>
      ) : null}
      {t.sub ? (
        <>
          {' '}
          <span className="kb-tl-sub">{t.sub}</span>
        </>
      ) : null}
    </h1>
  )
}

/* ───────────── TV: düğme satırı (oynatıcı takılı değilken: yükleniyor / oynatılamıyor) ───────────── */

/** Düğme satırında bir tuşun sonucu (saf): ◀/▶ odak, OK etkinleştir, Geri çık. */
export function tvButtonStep(
  key: RemoteKey,
  focus: number,
  count: number,
): { focus: number; action: 'activate' | 'back' | null; handled: boolean } {
  switch (key) {
    case 'LEFT':
    case 'UP':
      return { focus: Math.max(0, focus - 1), action: null, handled: true }
    case 'RIGHT':
    case 'DOWN':
      return { focus: Math.min(Math.max(0, count - 1), focus + 1), action: null, handled: true }
    case 'OK':
      return { focus, action: count > 0 ? 'activate' : null, handled: true }
    case 'BACK':
    case 'HOME':
      return { focus, action: 'back', handled: true }
    default:
      return { focus, action: null, handled: false }
  }
}

/**
 * TV'de oynatıcı dışı ekranların (yükleniyor, oynatılamıyor) kumanda tuşları. Yakalama aşamasında dinler ve işlediği
 * tuşu TV kabuğunun odak motoruna geçirmez. Dönen değer odaktaki düğmedir.
 */
export function useTvButtons(opts: {
  enabled: boolean
  count: number
  initial: number
  onActivate: (i: number) => void
  onBack: () => void
}): number {
  const [focus, setFocus] = useState(opts.initial)
  const ref = useRef({ opts, focus })
  ref.current = { opts, focus }
  useEffect(() => {
    if (!opts.enabled) return
    const on = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = remoteKeyFromKeyboard(e)
      if (!k) return
      const { opts: o, focus: f } = ref.current
      const step = tvButtonStep(k, f, o.count)
      if (!step.handled) return
      e.preventDefault()
      e.stopPropagation()
      setFocus(step.focus)
      if (step.action === 'activate') o.onActivate(step.focus)
      else if (step.action === 'back') o.onBack()
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [opts.enabled])
  return focus
}
