/**
 * Altyazı denetçisi: TTML belgesini OCA'dan (CDN yük devriyle) indirir, parça başına önbelleğe alır;
 * dil değişimi önbellekten anında olur. Varsayılan: Türkçe parça varsa açık, yoksa kapalı.
 */
import type { TimedTextTrack } from '../../../../shared/playback'
import { devbus } from '../../lib/devbus'
import { fetchDocument } from '../engine/fetcher'
import { activeCues, parseTtml, type TtmlCue, type TtmlDocument } from './ttml'

const docs = new Map<string, Promise<TtmlDocument>>()

function cacheKey(t: TimedTextTrack): string {
  const u = t.urls[0]?.url ?? ''
  return `${t.trackId}|${u.split('?')[0]}`
}

function load(t: TimedTextTrack): Promise<TtmlDocument> {
  const key = cacheKey(t)
  const hit = docs.get(key)
  if (hit) {
    devbus.emit('cache', `altyazı: isabet (${t.language})`, { key })
    return hit
  }
  const t0 = performance.now()
  const p = fetchDocument(t.urls, {
    signal: new AbortController().signal,
    onFailover: (from, to, reason) => devbus.emit('cdn', `yük devri ${from}→${to}`, { from, to, reason, type: 'ttml' }, { ok: false }),
  }).then(({ text, cdnId }) => {
    const doc = parseTtml(text)
    devbus.emit(
      'ttml',
      `${t.language} yüklendi`,
      { language: t.language, cues: doc.cues.length, tickRate: doc.tickRate, cdnId, trackId: t.trackId, bytes: text.length },
      { ms: performance.now() - t0 },
    )
    return doc
  })
  docs.set(key, p)
  p.catch((err: unknown) => {
    docs.delete(key)
    devbus.emit('ttml', `${t.language} yüklenemedi`, { language: t.language, error: String(err) }, { ok: false })
  })
  return p
}

export function defaultTextTrackId(tracks: TimedTextTrack[]): string | null {
  return tracks.find((t) => t.language.toLowerCase().startsWith('tr') && t.type === 'SUBTITLES')?.trackId ?? tracks.find((t) => t.language.toLowerCase().startsWith('tr'))?.trackId ?? null
}

export class TextTrackController {
  readonly tracks: TimedTextTrack[]
  private selected: string | null = null
  private doc: TtmlDocument | null = null
  private listeners = new Set<() => void>()
  private token = 0

  constructor(tracks: TimedTextTrack[], initial: string | null | undefined = undefined) {
    this.tracks = tracks
    const id = initial === undefined ? defaultTextTrackId(tracks) : initial
    if (id) this.select(id)
  }

  selectedId(): string | null {
    return this.selected
  }

  select(id: string | null): void {
    const track = id ? this.tracks.find((t) => t.trackId === id) : null
    this.selected = track ? track.trackId : null
    this.doc = null
    const token = ++this.token
    devbus.emit('ttml', track ? `seçildi: ${track.language}` : 'kapatıldı', { language: track?.language ?? null })
    this.notify()
    if (!track) return
    load(track)
      .then((doc) => {
        if (token !== this.token) return
        this.doc = doc
        this.notify()
      })
      .catch(() => undefined)
  }

  /** Yükleniyor mu (seçili ama belge henüz gelmedi) */
  loading(): boolean {
    return this.selected !== null && this.doc === null
  }

  cuesAt(t: number): TtmlCue[] {
    return this.doc ? activeCues(this.doc.cues, t) : []
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}
