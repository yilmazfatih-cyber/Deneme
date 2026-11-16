/**
 * Deney (A/B) ve özellik bayrağı servisi — sözleşme: shared/experiments.ts.
 *
 * - Tanımlar `content/experiments.json`'dan okunur (yok ya da bozuksa boş liste + uyarı; uygulama çökmez).
 * - Stüdyodan yapılan durum değişiklikleri ve sabitlemeler (pins) kalıcı depodadır (`experiments`) ve dosyadakinin
 *   önüne geçer.
 * - Atama durumsuzdur (shared/experiments.ts `assignVariant`); burada atama tablosu tutulmaz.
 * - Maruziyet: aynı birim + deney + kol için İstanbul gününde bir olay; kol başına tekil birim sayacı. Birim kimlikleri
 *   ham saklanmaz: `deriveKey(config, 'experiment-unit')` ile HMAC özetinin ilk 12 baytı tutulur.
 */
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_FLAGS,
  EXPOSURE_EVENT,
  flagsOfExperiment,
  FLAGS,
  resolveFlags,
  withFlags,
  zExperimentsFile,
  type Assignment,
  type Experiment,
  type ExperimentState,
  type ExperimentStatus,
  type Flags,
  type ResolvedFlags,
} from '../../../../shared/experiments'
import type { EventBatch } from '../../../../shared/types'
import { deriveKey, type AppConfig } from '../../kernel/config'
import type { EventsService, ExperimentsService, ExperimentUnit } from '../../kernel/services'
import { createStore } from '../../kernel/store'
import { localDayNumber } from '../epg/time'

export const EXPERIMENTS_FILE = 'experiments.json'
/** Deney × kol başına tutulan en çok tekil birim özeti; aşılırsa yalnız sayaç artar */
export const MAX_UNITS_PER_ARM = 200_000
/** Günlük tekrar süzgecinin üst sınırı (aşılırsa süzgeç boşaltılır; en kötü durumda aynı gün ikinci olay yazılır) */
const MAX_DAILY_SEEN = 1_000_000

interface ArmCounter {
  /** Tekil birim sayısı */
  count: number
  /** Birim özetleri (base64url, 12 bayt) */
  units: string[]
}
export interface ExperimentsStoreState {
  /** Deney anahtarı → stüdyodan verilen durum */
  statusOverrides: Record<string, ExperimentStatus>
  /** Birim kimliği (profil GUID'i ya da cihaz kimliği) → deney anahtarı → kol anahtarı */
  pins: Record<string, Record<string, string>>
  /** Deney → kol → tekil birim sayacı */
  exposures: Record<string, Record<string, ArmCounter>>
  firstExposureAt: Record<string, string>
  lastExposureAt: Record<string, string>
}

export interface ExperimentsServiceInternal extends ExperimentsService {
  /** Durum geçersiz kılması: dosyadakiyle aynıysa geçersiz kılma kaldırılır. Çakışma varsa hata iletisi döner. */
  setStatus(key: string, status: ExperimentStatus): { ok: true; state: ExperimentState } | { ok: false; error: string }
  /** variant null → sabitleme kaldırılır */
  setPin(unitId: string, experiment: string, variant: string | null): void
  /** Bir birimin sabitlemeleri */
  pinsOf(unitId: string): Readonly<Record<string, string>>
}

export interface ExperimentsDeps {
  config: AppConfig
  /** İstek anında çağrılır (events servisi sonradan kaydedilmiş olabilir) */
  events: () => EventsService | undefined
  warn: (obj: Record<string, unknown>, msg: string) => void
}

/** content/experiments.json: yok → [], bozuk → [] + uyarı */
export function loadExperimentsFile(contentDir: string, warn: ExperimentsDeps['warn']): Experiment[] {
  const file = join(contentDir, EXPERIMENTS_FILE)
  if (!existsSync(file)) return []
  try {
    const parsed = zExperimentsFile.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    if (parsed.success) return parsed.data
    warn(
      { issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) },
      'deney dosyası geçersiz; deney yok sayılıyor',
    )
  } catch (err) {
    warn({ err: String(err) }, 'deney dosyası okunamadı; deney yok sayılıyor')
  }
  return []
}

/** Deneyin bayraklarından biri bu tarafta (sunucu / istemci) okunuyor mu */
export function experimentHasSide(e: Pick<Experiment, 'variants'>, side: 'server' | 'client'): boolean {
  return flagsOfExperiment(e).some((k) => FLAGS[k].side === side)
}

/** Yalnız belirtilen tarafta okunan bayrakları yöneten deneylerin atamaları */
export function assignmentsForSide(
  defs: readonly Experiment[],
  assignments: readonly Assignment[],
  side: 'server' | 'client',
): Assignment[] {
  const byKey = new Map(defs.map((e) => [e.key, e]))
  return assignments.filter((a) => {
    const e = byKey.get(a.experiment)
    return !!e && experimentHasSide(e, side)
  })
}

/** RUNNING durumuna geçerken aynı bayrağı yöneten başka RUNNING deney (varsa ilk çakışma) */
export function runningConflict(
  defs: readonly Experiment[],
  key: string,
): { flag: string; experiment: string; name: string } | null {
  const target = defs.find((e) => e.key === key)
  if (!target) return null
  const mine = new Set(flagsOfExperiment(target))
  for (const e of defs) {
    if (e.key === key || e.status !== 'RUNNING') continue
    for (const f of flagsOfExperiment(e)) if (mine.has(f)) return { flag: f, experiment: e.key, name: e.name }
  }
  return null
}

export function createExperimentsService(deps: ExperimentsDeps): ExperimentsServiceInternal {
  const { config } = deps
  const fileDefs = loadExperimentsFile(config.contentDir, deps.warn)
  const store = createStore<ExperimentsStoreState>(config, 'experiments', () => ({
    statusOverrides: {},
    pins: {},
    exposures: {},
    firstExposureAt: {},
    lastExposureAt: {},
  }))
  // Eski ya da elle bozulmuş depo: eksik alanlar tamamlanır
  {
    const s = store.get()
    s.statusOverrides ??= {}
    s.pins ??= {}
    s.exposures ??= {}
    s.firstExposureAt ??= {}
    s.lastExposureAt ??= {}
  }
  const unitKey = deriveKey(config, 'experiment-unit')
  const digestOf = (kind: 'PROFILE' | 'DEVICE', id: string) =>
    createHmac('sha256', unitKey).update(`${kind}|${id}`).digest().subarray(0, 12).toString('base64url')

  /** Deney|kol → özet kümesi (depodaki dizilerden ilk gerektiğinde kurulur) */
  const unitSets = new Map<string, Set<string>>()
  const unitSetOf = (exp: string, variant: string, arm: ArmCounter) => {
    const k = `${exp}|${variant}`
    let set = unitSets.get(k)
    if (!set) unitSets.set(k, (set = new Set(arm.units)))
    return set
  }
  let seenDay = -1
  const seenToday = new Set<string>()
  let rev = 1
  let seq = 0

  const definitions = (): Experiment[] => {
    const over = store.get().statusOverrides
    return fileDefs.map((e) => {
      const s = over[e.key]
      return s && s !== e.status ? { ...e, status: s } : e
    })
  }

  const unitIdFor = (e: Experiment, unit: ExperimentUnit): string | null =>
    e.unit === 'PROFILE' ? unit.profileGuid || null : unit.deviceId || null

  function stateOf(e: Experiment): ExperimentState {
    const s = store.get()
    const file = fileDefs.find((x) => x.key === e.key)
    const arms = s.exposures[e.key] ?? {}
    return {
      definition: e,
      statusOverridden: !!file && file.status !== e.status,
      exposures: Object.fromEntries(e.variants.map((v) => [v.key, arms[v.key]?.count ?? 0])),
      firstExposureAt: s.firstExposureAt[e.key] ?? null,
      lastExposureAt: s.lastExposureAt[e.key] ?? null,
    }
  }

  const service: ExperimentsServiceInternal = {
    definitions,

    resolve(unit, opts = {}): ResolvedFlags {
      const pins = store.get().pins
      let flags: Flags = { ...DEFAULT_FLAGS }
      const assignments: Assignment[] = []
      for (const e of definitions()) {
        if (e.status !== 'RUNNING') continue
        const id = unitIdFor(e, unit)
        if (!id) continue
        const r = resolveFlags([e], id, { pins: pins[id] })
        const a = r.assignments[0]
        if (!a) continue
        const variant = e.variants.find((v) => v.key === a.variant)
        flags = withFlags(flags, variant?.flags)
        assignments.push(a)
      }
      return { flags: withFlags(flags, opts.overrides), assignments }
    },

    expose(unit, assignments, at = new Date()) {
      if (!assignments.length) return
      const defs = new Map(definitions().map((e) => [e.key, e]))
      const pins = store.get().pins
      const day = localDayNumber(at)
      if (day !== seenDay || seenToday.size > MAX_DAILY_SEEN) {
        seenDay = day
        seenToday.clear()
      }
      const fresh: { e: Experiment; variant: string; digest: string }[] = []
      for (const a of assignments) {
        const e = defs.get(a.experiment)
        if (!e || e.status !== 'RUNNING' || !e.variants.some((v) => v.key === a.variant)) continue
        const id = unitIdFor(e, unit)
        if (!id) continue
        // Sabitlenmiş birim (kalite denetimi) ölçüme girmez
        if (pins[id]?.[e.key]) continue
        const digest = digestOf(e.unit, id)
        const k = `${e.key}|${a.variant}|${digest}`
        if (seenToday.has(k)) continue
        seenToday.add(k)
        fresh.push({ e, variant: a.variant, digest })
      }
      if (!fresh.length) return
      const iso = at.toISOString()
      store.update((s) => {
        for (const { e, variant, digest } of fresh) {
          const arms = (s.exposures[e.key] ??= {})
          const arm = (arms[variant] ??= { count: 0, units: [] })
          s.firstExposureAt[e.key] ??= iso
          s.lastExposureAt[e.key] = iso
          const set = unitSetOf(e.key, variant, arm)
          if (set.has(digest)) continue
          if (set.size < MAX_UNITS_PER_ARM) {
            set.add(digest)
            arm.units.push(digest)
          }
          arm.count++
        }
      })
      const events = deps.events()
      if (!events) return
      const ts = at.getTime()
      const batch: EventBatch = {
        sessionId: 'sunucu-deney',
        sentAt: ts,
        events: fresh.map(({ e, variant }) => ({
          name: EXPOSURE_EVENT as 'experiment.exposure',
          ts,
          seq: ++seq,
          data: { experiment: e.key, variant },
        })),
      }
      try {
        events.ingest(batch, unit.profileGuid)
      } catch (err) {
        deps.warn({ err: String(err) }, 'maruziyet olayı yazılamadı')
      }
    },

    state: () => definitions().map(stateOf),
    revision: () => rev,

    setStatus(key, status) {
      const file = fileDefs.find((e) => e.key === key)
      if (!file) return { ok: false, error: 'Deney bulunamadı.' }
      if (status === 'RUNNING') {
        const c = runningConflict(definitions(), key)
        if (c)
          return {
            ok: false,
            error: `'${c.flag}' bayrağını şu an '${c.name}' (${c.experiment}) deneyi yönetiyor. Önce o deneyi durdurun.`,
          }
      }
      store.update((s) => {
        if (status === file.status) delete s.statusOverrides[key]
        else s.statusOverrides[key] = status
      })
      rev++
      return { ok: true, state: stateOf(definitions().find((e) => e.key === key)!) }
    },

    setPin(unitId, experiment, variant) {
      store.update((s) => {
        if (variant === null) {
          const m = s.pins[unitId]
          if (!m) return
          delete m[experiment]
          if (!Object.keys(m).length) delete s.pins[unitId]
        } else (s.pins[unitId] ??= {})[experiment] = variant
      })
      rev++
    },

    pinsOf: (unitId) => ({ ...(store.get().pins[unitId] ?? {}) }),
  }
  return service
}
