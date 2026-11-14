/**
 * İzleme ekranından çıkış hedefi (saf; testli: exit.test.ts) ve yansıtma kaydı.
 *
 * Çıkış ("Geri" ya da oynatıcının kendi çıkışı) izleyiciyi geldiği yere götürür:
 *   - telefondan yansıtma (CAST) ile açıldıysa → Ana Sayfa
 *   - zap / sonraki bölüm gibi oynatıcının kendi geçişleriyse (yol değiştirme) → önceki planı sürdür
 *   - uygulama içinden bir ekrandan (detay, Canlı TV listesi, Rehber, Ana Sayfa…) geldiyse → geçmişte geri
 *     (zaplar geçmişi değiştirmez; geri, listeye o anki kanalda döner)
 *   - geçmiş yoksa (adres doğrudan açıldı) → içeriğe göre: kanal → Canlı TV, yayın kaydı → Rehber,
 *     başlık → detayı, diğer → Ana Sayfa
 * Bitişte: film → detayına (zaten detaydan gelindiyse geçmişte geri); dizi bölümü → oynatıcının kendi
 * "sonraki bölüm" akışı (null).
 */
import type { DevEvent } from '../../lib/devbus'

export type ExitPlan = { kind: 'history' } | { kind: 'path'; path: string }

export interface ExitInput {
  viewableId: string
  /** Bu içerik az önce telefondan yansıtıldı */
  cast: boolean
  /** Önceki izleme ekranının planı (oynatıcı kendi içinde yol değiştirdiyse) */
  continued: ExitPlan | null
  /** Gelinen TV ekranının kimliği (`data-screen`), bilinmiyorsa null */
  originScreen: string | null
  /** Uygulama içi geçmişte önceki ekran var mı */
  canGoBack: boolean
}

const VIDEO_RE = /^Video:(\d+)$/

/** Geçmiş yokken içeriğe göre çıkış yolu. */
export function fallbackExit(viewableId: string): string {
  if (viewableId.startsWith('Channel:')) return '/tv/canli'
  if (viewableId.startsWith('Airing:')) return '/tv/rehber'
  const v = VIDEO_RE.exec(viewableId)
  if (v) return `/tv/baslik/${v[1]}`
  return '/tv'
}

export function resolveExit(i: ExitInput): ExitPlan {
  if (i.cast) return { kind: 'path', path: '/tv' }
  if (i.continued) return i.continued
  if (i.canGoBack && i.originScreen) return { kind: 'history' }
  return { kind: 'path', path: fallbackExit(i.viewableId) }
}

export interface EndedInput {
  /** PlaybackMetadata.video.__typename */
  typename: string | null
  videoId: number | null
  plan: ExitPlan
  originScreen: string | null
}

/** Başlık bitince: film → detayına; diğerleri (bölüm, kanal) → null (oynatıcı kendisi yönetir). */
export function endedExit(i: EndedInput): ExitPlan | null {
  if (i.typename !== 'Movie' || i.videoId === null) return null
  if (i.plan.kind === 'history' && i.originScreen === `detay-${i.videoId}`) return { kind: 'history' }
  return { kind: 'path', path: `/tv/baslik/${i.videoId}` }
}

/* ───────────── Yansıtma kaydı ───────────── */

export interface CastRecord {
  viewableId: string
  from: string
  at: number
}

/** Yansıtma, ekranın açılmasından en çok bu kadar önce gelmiş olmalı. */
export const CAST_WINDOW_MS = 6000

/** devbus `device` olayından gelen CAST komutu (shell yönlendirmeden önce yayınlanır). */
export function castFromEvent(e: Pick<DevEvent, 'cat' | 'label' | 'detail' | 'at'>): CastRecord | null {
  if (e.cat !== 'device' || !e.label.startsWith('komut ←')) return null
  const d = e.detail as { command?: { type?: string; viewableId?: unknown }; from?: { name?: unknown } } | undefined
  if (d?.command?.type !== 'CAST' || typeof d.command.viewableId !== 'string') return null
  return {
    viewableId: d.command.viewableId,
    from: typeof d.from?.name === 'string' ? d.from.name : 'Telefon',
    at: e.at,
  }
}

/** Bu içerik için taze bir yansıtma kaydı var mı? */
export function matchCast(rec: CastRecord | null, viewableId: string, now: number): CastRecord | null {
  if (!rec || rec.viewableId !== viewableId) return null
  return now - rec.at <= CAST_WINDOW_MS ? rec : null
}
