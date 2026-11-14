/**
 * Eşleme dosyası: okuma, doğrulama, derleme ve bir Mixpanel satırını kanonik ViewingEvent'e çevirme.
 * Satırdan yalnız eşlemede adı geçen özellikler okunur; geri kalan her şey (e-posta, ad, IP, $device_id …) atılır.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ViewingDevice, ViewingEvent, ViewingEventType, ViewingSource } from '../../../../shared/intelligence'
import {
  MAPPING_PROPERTY_FIELDS,
  zMixpanelMapping,
  type MappingPropertyField,
  type MappingPropertyMap,
  type MixpanelMapping,
  type TitleMatchStep,
} from '../../../../shared/mixpanel-mapping'
import type { TitleResolver } from '../viewing/resolve'

export interface CompiledRule {
  type: ViewingEventType
  props: Record<MappingPropertyField, string[]>
}

export interface CompiledMapping {
  mapping: MixpanelMapping
  viewerProperty: string
  insertIdProperty: string
  timeProperty: string
  timeUnit: 'auto' | 's' | 'ms'
  offsetMs: number
  events: Map<string, CompiledRule>
  /** watched/position/duration → saniye çarpanı */
  durationFactor: number
  completionThreshold: number
  deviceMap: Map<string, ViewingDevice>
  ratingMap: Map<string, -1 | 0 | 1 | 2>
  order: readonly TitleMatchStep[]
  namespace: string
}

const asList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

function propsOf(
  base: MappingPropertyMap,
  over: MappingPropertyMap | undefined,
): Record<MappingPropertyField, string[]> {
  const out = {} as Record<MappingPropertyField, string[]>
  for (const f of MAPPING_PROPERTY_FIELDS) out[f] = asList(over?.[f] ?? base[f])
  return out
}

export function compileMapping(mapping: MixpanelMapping): CompiledMapping {
  const events = new Map<string, CompiledRule>()
  for (const [name, rule] of Object.entries(mapping.events)) {
    if (typeof rule === 'string') events.set(name, { type: rule, props: propsOf(mapping.properties, undefined) })
    else events.set(name, { type: rule.type, props: propsOf(mapping.properties, rule.properties) })
  }
  return {
    mapping,
    viewerProperty: mapping.viewerProperty,
    insertIdProperty: mapping.insertIdProperty,
    timeProperty: mapping.time.property,
    timeUnit: mapping.time.unit,
    offsetMs: mapping.time.offsetMinutes * 60_000,
    events,
    durationFactor: mapping.durationUnit === 'ms' ? 0.001 : mapping.durationUnit === 'min' ? 60 : 1,
    completionThreshold: mapping.completionThreshold,
    deviceMap: new Map(Object.entries(mapping.deviceMap).map(([k, v]) => [k.trim().toLowerCase(), v])),
    ratingMap: new Map(Object.entries(mapping.ratingMap).map(([k, v]) => [k.trim().toLowerCase(), v])),
    order: mapping.titleMatch.order,
    namespace: mapping.titleMatch.namespace,
  }
}

/** Zod hatasını okunur tek satıra çevirir. */
export function describeMappingError(err: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return err.issues
    .slice(0, 6)
    .map((i) => `${i.path.length ? i.path.map(String).join('.') : '(kök)'}: ${i.message}`)
    .join('; ')
}

/** Dosyadan eşleme okur; yoksa null, bozuksa hata metni. */
export function readMappingFile(file: string): { mapping: MixpanelMapping | null; error: string | null } {
  if (!existsSync(file)) return { mapping: null, error: null }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { mapping: null, error: `JSON okunamadı: ${(e as Error).message}` }
  }
  const r = zMixpanelMapping.safeParse(json)
  return r.success ? { mapping: r.data, error: null } : { mapping: null, error: describeMappingError(r.error) }
}

/** Eşleme dosyalarının yeri: sunucu deposundaki kopya depodaki dosyanın önüne geçer. */
export const mappingPaths = (dataDir: string, contentDir: string) => ({
  override: join(dataDir, 'viewing', 'mixpanel-mapping.json'),
  repo: join(contentDir, 'analytics', 'mixpanel-mapping.json'),
})

/** Geçerli eşleme: sunucu deposundaki → depodaki dosya → yerleşik. Geçersiz dosya uyarıyla atlanır. */
export function loadEffectiveMapping(
  paths: { override: string; repo: string },
  builtin: MixpanelMapping,
  warn: (message: string) => void,
): { mapping: MixpanelMapping; origin: 'override' | 'repo' | 'builtin' } {
  const o = readMappingFile(paths.override)
  if (o.mapping) return { mapping: o.mapping, origin: 'override' }
  if (o.error) warn(`Sunucudaki Mixpanel eşlemesi geçersiz, yok sayıldı (${paths.override}): ${o.error}`)
  const r = readMappingFile(paths.repo)
  if (r.mapping) return { mapping: r.mapping, origin: 'repo' }
  if (r.error) warn(`Mixpanel eşleme dosyası geçersiz (${paths.repo}): ${r.error}`)
  return { mapping: builtin, origin: 'builtin' }
}

/* ───────────── Satır çevirme ───────────── */

export interface ConvertContext {
  source: ViewingSource
  /** ham izleyici kimliği → takma kimlik */
  viewerId(raw: string): string
  /** yinelenme anahtarı üretir (HMAC) */
  eventId(parts: string): string
  resolver: TitleResolver
}

export type ConvertResult =
  | { kind: 'ok'; event: ViewingEvent; unknownContent: string | null }
  | { kind: 'unmapped'; name: string }
  | { kind: 'rejected' }

const REJECTED: ConvertResult = { kind: 'rejected' }
/** 2000-01-01'den önceki ve 2100'den sonraki anlar bozuk sayılır */
const MIN_TS = Date.UTC(2000, 0, 1)
const MAX_TS = Date.UTC(2100, 0, 1)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick(props: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    const v = props[n]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}
function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}
function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'TRUE' || v === 'yes') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'FALSE' || v === 'no') return false
  return undefined
}
const toText = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.trim() || undefined : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined

/** properties.time → epoch ms (UTC). Sayı, sayısal metin ya da ISO metni kabul edilir. */
export function parseTime(v: unknown, unit: 'auto' | 's' | 'ms', offsetMs: number): number | null {
  let ms: number
  const n = toNum(v)
  if (n !== undefined) {
    const isMs = unit === 'ms' || (unit === 'auto' && Math.abs(n) >= 1e11)
    ms = isMs ? n : n * 1000
  } else if (typeof v === 'string') {
    const t = v.trim()
    // Saat dilimi yazılmış ISO metni kesin bir andır; yazılmamışsa proje saatindedir varsayılır → fark çıkarılır
    const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(t)
    const p = Date.parse(zoned || /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : `${t}Z`)
    if (!Number.isFinite(p)) return null
    ms = zoned ? p + offsetMs : p
  } else return null
  ms = Math.round(ms - offsetMs)
  return ms >= MIN_TS && ms < MAX_TS ? ms : null
}

/** Bir Mixpanel ham dışa aktarım satırını (ayrıştırılmış JSON) çevirir. `line` yalnız $insert_id yoksa özet için kullanılır. */
export function convertRow(row: unknown, line: string, cm: CompiledMapping, ctx: ConvertContext): ConvertResult {
  if (!isObj(row)) return REJECTED
  const name = row.event
  if (typeof name !== 'string' || !name) return REJECTED
  const props = row.properties
  if (!isObj(props)) return REJECTED
  const rule = cm.events.get(name)
  if (!rule) return { kind: 'unmapped', name }

  const rawViewer = toText(props[cm.viewerProperty])
  if (!rawViewer) return REJECTED
  const rawTime = props[cm.timeProperty]
  const ts = parseTime(rawTime, cm.timeUnit, cm.offsetMs)
  if (ts === null) return REJECTED

  const insert = toText(props[cm.insertIdProperty])
  // Mixpanel'in kendi yinelenme anahtarı: (olay, distinct_id, time, $insert_id)
  const id = insert
    ? ctx.eventId(`i|${name}|${rawViewer}|${String(rawTime)}|${insert}`)
    : ctx.eventId(`l|${line.trim()}`)

  const p = rule.props
  const ev: ViewingEvent = {
    id,
    source: ctx.source,
    type: rule.type,
    ts,
    viewerId: ctx.viewerId(rawViewer),
    titleId: null,
    videoId: null,
  }

  let unknownContent: string | null = null
  const contentId = toText(pick(props, p.contentId))
  const contentTitle = toText(pick(props, p.contentTitle))
  let resolved = contentId ? ctx.resolver.resolve(contentId, cm.order, cm.namespace) : null
  if (!resolved && contentTitle) resolved = ctx.resolver.resolveName(contentTitle)
  if (resolved) {
    ev.titleId = resolved.titleId
    ev.videoId = resolved.videoId
  } else if (contentId || contentTitle) unknownContent = (contentId ?? contentTitle)!.slice(0, 120)

  const f = cm.durationFactor
  const watched = toNum(pick(props, p.watchedSeconds))
  if (watched !== undefined && watched >= 0) ev.watchedSec = watched * f
  const pos = toNum(pick(props, p.positionSeconds))
  if (pos !== undefined && pos >= 0) ev.positionSec = pos * f
  const dur = toNum(pick(props, p.durationSeconds))
  if (dur !== undefined && dur > 0) ev.durationSec = dur * f
  const completed = toBool(pick(props, p.completed))
  if (completed !== undefined) ev.completed = completed
  else if (rule.type === 'PLAY_END' && ev.positionSec !== undefined && ev.durationSec)
    ev.completed = ev.positionSec / ev.durationSec >= cm.completionThreshold

  const ratingRaw = pick(props, p.rating)
  if (ratingRaw !== undefined) {
    const key = String(ratingRaw).trim().toLowerCase()
    const r = cm.ratingMap.get(key) ?? (key === '-1' ? -1 : key === '1' ? 1 : key === '2' ? 2 : undefined)
    if (r === -1 || r === 1 || r === 2) ev.rating = r
  }
  const query = toText(pick(props, p.query))
  if (query) ev.query = query.slice(0, 80)
  const device = toText(pick(props, p.device))
  if (device) ev.device = cm.deviceMap.get(device.toLowerCase()) ?? 'OTHER'
  const country = toText(pick(props, p.country))
  if (country && /^[A-Za-z]{2}$/.test(country)) ev.country = country.toUpperCase()

  return { kind: 'ok', event: ev, unknownContent }
}
