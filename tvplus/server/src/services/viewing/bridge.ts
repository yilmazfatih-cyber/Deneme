/**
 * Uygulama olayları köprüsü: olay servisinin kabul ettiği paketleri (POST /log/web/cl/1) kanonik ViewingEvent'e
 * çevirir (kaynak TVPLUS, profilin takma kimliği). Böylece sistem canlı kullanımdan da öğrenir.
 *
 *   playback.start      → PLAY_START      (data.videoId ya da viewableId 'Video:<id>')
 *   playback.heartbeat  → PLAY_PROGRESS   izlenen = bir önceki konumdan bu yana ilerleme (0–30 sn); konum
 *                                         bilinmiyorsa kalp atışı aralığı (10 sn)
 *   playback.end        → PLAY_END        izlenen = son konumdan ilerleme; tamamlandı: reason 'ended' ya da konum/süre ≥ 0.9
 *   playlist            → ADD_TO_LIST / REMOVE_FROM_LIST
 *   rating              → RATING          THUMBS_WAY_UP 2 · THUMBS_UP 1 · THUMBS_DOWN −1 · THUMBS_UNRATED temizler
 *   search              → SEARCH          (uygulama sorgu metnini göndermez; yalnız olay sayılır)
 *   impression / click  → IMPRESSION / CLICK  (videoId ya da entityIds içindeki 'Video:<id>' girdileri)
 * Profilsiz (anonim) paketler ve canlı kanal oynatmaları (Video olmayan varlıklar) çevrilmez.
 */
import type { ClientEvent, EventBatch } from '../../../../shared/types'
import type { ViewingEvent, ViewingEventType } from '../../../../shared/intelligence'
import { eventIdOf } from './ids'
import type { ResolvedTitle } from './resolve'

export const HEARTBEAT_SEC = 10
const MAX_STEP_SEC = 30
const COMPLETION_RATIO = 0.9
const MAX_SESSIONS = 10_000
const MAX_IMPRESSIONS_PER_EVENT = 40

export interface BridgeDeps {
  /** videoId → üst başlık + yaprak; katalogda yoksa null */
  resolve(videoId: number): ResolvedTitle | null
  viewerIdOfProfile(profileGuid: string): string
  /** deriveKey(config, 'viewing-event-id') */
  eventKey: Buffer
}

interface PlaySession {
  lastPos: number | null
  touched: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function videoIdOf(data: Record<string, unknown>): number | null {
  const v = num(data.videoId)
  if (v !== null && Number.isInteger(v) && v > 0) return v
  const ent = typeof data.viewableId === 'string' ? data.viewableId : null
  const m = ent ? /^Video:(\d+)$/.exec(ent) : null
  return m ? Number(m[1]) : null
}

export function createAppEventsBridge(deps: BridgeDeps) {
  const sessions = new Map<string, PlaySession>()

  function session(key: string, now: number): PlaySession {
    let s = sessions.get(key)
    if (!s) {
      if (sessions.size >= MAX_SESSIONS) {
        // En eski yarısını bırak
        const old = [...sessions].sort((a, b) => a[1].touched - b[1].touched).slice(0, MAX_SESSIONS / 2)
        for (const [k] of old) sessions.delete(k)
      }
      s = { lastPos: null, touched: now }
      sessions.set(key, s)
    }
    s.touched = now
    return s
  }

  /** Paketi çevirir (yan etkisi: oynatma oturumlarının son konumu). */
  function translate(batch: EventBatch, profileGuid: string | null): ViewingEvent[] {
    if (!profileGuid) return []
    const viewerId = deps.viewerIdOfProfile(profileGuid)
    const out: ViewingEvent[] = []
    const sid = typeof batch.sessionId === 'string' ? batch.sessionId : ''

    const make = (
      e: ClientEvent,
      type: ViewingEventType,
      videoId: number,
      sub: number,
      extra: Partial<ViewingEvent> = {},
    ): void => {
      const r = deps.resolve(videoId)
      if (!r) return
      out.push({
        id: eventIdOf(deps.eventKey, 'tv_', `${profileGuid}|${sid}|${e.seq}|${e.name}|${sub}`),
        source: 'TVPLUS',
        type,
        ts: e.ts,
        viewerId,
        titleId: r.titleId,
        videoId: r.videoId ?? (r.titleId === videoId ? null : videoId),
        ...extra,
      })
    }

    for (const e of batch.events ?? []) {
      const data = (e.data ?? {}) as Record<string, unknown>
      switch (e.name) {
        case 'playback.start': {
          const vid = videoIdOf(data)
          if (vid === null) break
          const key = `${profileGuid}|${String(data.playbackContextId ?? data.viewableId ?? vid)}`
          const pos = num(data.positionSec)
          session(key, e.ts).lastPos = pos ?? 0
          make(e, 'PLAY_START', vid, 0, pos !== null ? { positionSec: pos } : {})
          break
        }
        case 'playback.heartbeat':
        case 'playback.end': {
          const vid = videoIdOf(data)
          if (vid === null) break
          const key = `${profileGuid}|${String(data.playbackContextId ?? data.viewableId ?? vid)}`
          const s = session(key, e.ts)
          const pos = num(data.positionSec)
          const isEnd = e.name === 'playback.end'
          let watched: number
          if (pos !== null && s.lastPos !== null) watched = Math.max(0, Math.min(MAX_STEP_SEC, pos - s.lastPos))
          else watched = isEnd ? 0 : HEARTBEAT_SEC
          if (pos !== null) s.lastPos = pos
          const extra: Partial<ViewingEvent> = { watchedSec: watched }
          if (pos !== null) extra.positionSec = pos
          if (isEnd) {
            const dur = num(data.durationSec)
            if (dur !== null && dur > 0) extra.durationSec = dur
            extra.completed =
              data.reason === 'ended' || (dur !== null && dur > 0 && pos !== null && pos / dur >= COMPLETION_RATIO)
            sessions.delete(key)
          }
          make(e, isEnd ? 'PLAY_END' : 'PLAY_PROGRESS', vid, 0, extra)
          break
        }
        case 'playlist': {
          const vid = videoIdOf(data)
          if (vid === null) break
          if (data.action === 'ADD_TO_PLAYLIST') make(e, 'ADD_TO_LIST', vid, 0)
          else if (data.action === 'DELETE_FROM_PLAYLIST') make(e, 'REMOVE_FROM_LIST', vid, 0)
          break
        }
        case 'rating': {
          const vid = videoIdOf(data)
          if (vid === null) break
          const r = data.rating
          // THUMBS_UNRATED (ya da tanınmayan değer) → `rating` alanı olmayan RATING olayı = değerlendirme temizlendi
          const rating = r === 'THUMBS_WAY_UP' ? 2 : r === 'THUMBS_UP' ? 1 : r === 'THUMBS_DOWN' ? -1 : null
          make(e, 'RATING', vid, 0, rating !== null ? { rating } : {})
          break
        }
        case 'search':
          out.push({
            id: eventIdOf(deps.eventKey, 'tv_', `${profileGuid}|${sid}|${e.seq}|${e.name}|0`),
            source: 'TVPLUS',
            type: 'SEARCH',
            ts: e.ts,
            viewerId,
            titleId: null,
            videoId: null,
          })
          break
        case 'impression':
        case 'click': {
          const type: ViewingEventType = e.name === 'impression' ? 'IMPRESSION' : 'CLICK'
          const direct = videoIdOf(data)
          if (direct !== null) {
            make(e, type, direct, 0)
            break
          }
          const ids = Array.isArray(data.entityIds) ? data.entityIds.slice(0, MAX_IMPRESSIONS_PER_EVENT) : []
          ids.forEach((ent, i) => {
            const m = typeof ent === 'string' ? /^Video:(\d+)$/.exec(ent) : null
            if (m) make(e, type, Number(m[1]), i + 1)
          })
          break
        }
        default:
          break
      }
    }
    return out
  }

  return { translate, sessionCount: () => sessions.size }
}
