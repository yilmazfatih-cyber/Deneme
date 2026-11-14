/**
 * Canlı TV ana sayfasının saf mantığı: yetenek bildirimi, tanınmayanı atlama (netflix_patterns §4.2),
 * istemcide ilerleme / kalan süre, "hangi satırın yeniden çekilmesi gerekiyor" kararı ve kart metinleri.
 */
import { formatDayTime, formatLiveLine, liveProgress, minutesLeft } from '../../ui'
import { catchupHint } from './airing'
import type { AiringData, ChannelData, PageRowData, RowItemData } from './types'

/** İstemcinin çizebildiği satır tipleri ve varlık türleri (LivePage `capabilities` değişkeni). */
export const LIVE_ROW_TYPES = ['LIVE_HERO', 'CHANNEL_ROW', 'TONIGHT_ROW', 'CATCHUP_ROW'] as const
export const LIVE_ENTITY_KINDS = ['CHANNEL', 'PROGRAM_AIRING'] as const
export type LiveRowType = (typeof LIVE_ROW_TYPES)[number]

export const LIVE_CAPABILITIES = {
  rowTypes: [...LIVE_ROW_TYPES],
  entityKinds: [...LIVE_ENTITY_KINDS],
}

/** Varlık türü → bu istemcinin o türde tanıdığı __typename değerleri. */
const TYPENAMES_BY_KIND: Record<string, readonly string[]> = {
  CHANNEL: ['Channel'],
  PROGRAM_AIRING: ['ProgramAiring'],
}

export interface RenderableRow extends Omit<PageRowData, 'type'> {
  type: LiveRowType
}

const isKnownRowType = (t: string): t is LiveRowType => (LIVE_ROW_TYPES as readonly string[]).includes(t)

/** Tanımadığımız satır tipi, varlık türü ya da __typename sessizce atlanır; boş kalan satır çizilmez. */
export function renderableRows(rows: readonly PageRowData[]): RenderableRow[] {
  const out: RenderableRow[] = []
  for (const r of rows) {
    if (!isKnownRowType(r.type)) continue
    const items = r.items.filter((it) => TYPENAMES_BY_KIND[it.kind]?.includes(it.entity.__typename) ?? false)
    if (items.length === 0) continue
    out.push({ ...r, type: r.type, items })
  }
  return out
}

export const asChannel = (it: RowItemData): ChannelData | null =>
  it.entity.__typename === 'Channel' ? (it.entity as unknown as ChannelData) : null
export const asAiring = (it: RowItemData): AiringData | null =>
  it.entity.__typename === 'ProgramAiring' ? (it.entity as unknown as AiringData) : null

/* ───────────── İlerleme ve kalan süre ───────────── */

export interface LiveStatus {
  /** 0–1 */
  progress: number
  /** yukarı yuvarlanmış kalan dakika */
  remainingMin: number
  /** "20:00–23:15 · 42 dk kaldı" */
  line: string
  ended: boolean
}

export function liveStatus(startAt: string, endAt: string, now: number): LiveStatus {
  return {
    progress: liveProgress(startAt, endAt, now),
    remainingMin: minutesLeft(endAt, now),
    line: formatLiveLine(startAt, endAt, now),
    ended: now >= Date.parse(endAt),
  }
}

/* ───────────── Yeniden çekme kararı ───────────── */

/** Bir öğenin "durumu değişir" anları: program sınırları ve geri al penceresinin kapanışı. */
function boundariesOf(it: RowItemData): string[] {
  const ch = asChannel(it)
  if (ch) return [ch.now?.endAt, ch.next?.startAt].filter((x): x is string => !!x)
  const a = asAiring(it)
  if (a) return [a.startAt, a.endAt, a.catchup.until].filter((x): x is string => !!x)
  return []
}

/**
 * Yeniden çekilmesi gereken satırlar: satırın `ttlSec` süresi dolduysa ya da içindeki bir programın sınırı
 * (bitiş / sonrakinin başlangıcı / geri al penceresi) veri alındıktan sonra geçtiyse.
 * Boş değilse sayfa TEK sorguyla yeniden çekilir.
 */
export function rowsNeedingRefetch(rows: readonly PageRowData[], fetchedAt: number, now: number): string[] {
  const out: string[] = []
  for (const r of rows) {
    const ttlDue = r.ttlSec > 0 && now >= fetchedAt + r.ttlSec * 1000
    const boundaryPassed = r.items.some((it) =>
      boundariesOf(it).some((iso) => {
        const t = Date.parse(iso)
        return t > fetchedAt && t <= now
      }),
    )
    if (ttlDue || boundaryPassed) out.push(r.rowId)
  }
  return out
}

/** Bir sonraki yeniden çekme anı: satır ttl'lerinin ve veri alındıktan sonraki ilk program sınırının en erkeni. */
export function nextRefetchAt(rows: readonly PageRowData[], fetchedAt: number): number | null {
  let at = Infinity
  for (const r of rows) {
    if (r.ttlSec > 0) at = Math.min(at, fetchedAt + r.ttlSec * 1000)
    for (const it of r.items)
      for (const iso of boundariesOf(it)) {
        const t = Date.parse(iso)
        if (t > fetchedAt) at = Math.min(at, t)
      }
  }
  return Number.isFinite(at) ? at : null
}

/* ───────────── Komşu kanal ön hazırlığı ───────────── */

/** Kahraman kanalın kanal sırasındaki sonraki `n` kanalı (sona gelince başa döner). */
export function neighbourChannelIds(order: readonly number[], heroId: number, n = 2): number[] {
  const i = order.indexOf(heroId)
  if (i < 0) return order.filter((id) => id !== heroId).slice(0, n)
  const out: number[] = []
  for (let k = 1; k < order.length && out.length < n; k++) out.push(order[(i + k) % order.length]!)
  return out
}

/* ───────────── Kart metinleri ───────────── */

/** "Bu akşam": "Bugün 21:00" */
export const tonightMeta = (a: Pick<AiringData, 'startAt'>, now: number): string => formatDayTime(a.startAt, now)

/** "Kaçırdıkların": "Dün 20:00" ya da pencere 24 saatten azsa "Dün 20:00 · Son 5 saat" */
export function catchupMeta(a: Pick<AiringData, 'startAt' | 'catchup'>, now: number): string {
  const when = formatDayTime(a.startAt, now)
  const hint = catchupHint(a.catchup.until, now)
  return hint ? `${when} · ${hint}` : when
}

/** Satırda örnek yayın akışlı kanal var mı (not satır başına bir kez gösterilir). */
export function rowHasSampleSchedule(row: Pick<PageRowData, 'items'>): boolean {
  return row.items.some((it) => {
    const ch = asChannel(it)
    if (ch) return ch.isSampleSchedule
    const a = asAiring(it)
    return a?.channel.isSampleSchedule === true
  })
}
