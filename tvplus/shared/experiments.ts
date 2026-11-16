/**
 * Deney (A/B) ve özellik bayrağı sözleşmesi — bkz. docs/LAB.md "Deney altyapısı".
 *
 * Aynı tanım üç yerde çalışır ve üçü de BU dosyadaki saf işlevleri kullanır:
 *   canlı uygulama  — server/src/services/experiments (atama, maruziyet olayı, bayraklar keşfe ve istemciye gider)
 *   simülasyon      — lab/src/sim (simüle izleyiciler aynı atama işleviyle kollara ayrılır)
 *   analiz          — lab/src/ab (gerçek ya da simüle maruziyet + sonuç ölçümleri)
 *
 * Kurallar
 *   - Bayrağın İLK değeri varsayılandır ve bugünkü davranıştır: hiçbir deney çalışmıyorsa uygulama aynen eskisi gibidir.
 *   - Atama durumsuz ve belirleyicidir: birim kimliği + deney tuzu → kol. Hiçbir yerde atama tablosu tutulmaz.
 *   - Trafik payı ile kol seçimi ayrı özetlerden gelir: trafik %10'dan %50'ye çıkarılınca ilk %10'un kolu değişmez.
 *   - Aynı bayrağı iki RUNNING deney birden yönetemez (doğrulamada hata).
 *   - Atamaya yalnız `status` karar verir; `startAt` / `endAt` bilgilendiricidir (analiz penceresi için kullanılır).
 *   - Sabitlenmiş (pin) birimler ve `x-tvplus-flags` başlığıyla geçersiz kılınan istekler maruziyet SAYILMAZ:
 *     kalite denetimi ölçümü kirletmez. Lab analizi de yalnız maruziyet olayı olan birimleri sayar.
 *
 * Tanımlar: content/experiments.json (zExperimentsFile). Stüdyodan yapılan durum değişikliği ve sabitlemeler sunucu
 * deposunda tutulur ve dosyadakinin önüne geçer.
 */
import { z } from 'zod'
import {
  assignVariant,
  DEFAULT_FLAGS,
  FLAGS,
  isFlagKey,
  isFlagValue,
  withFlags,
  type Assignment,
  type FlagKey,
  type Flags,
} from './flags'

export * from './flags'

/* ───────────── Deney tanımı ───────────── */

export const EXPERIMENT_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'ENDED'] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

const zKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,48}$/, 'küçük harf, rakam ve tire; en çok 49 karakter')

export const zVariant = z
  .object({
    key: zKey,
    name: z.string().min(1).max(120),
    /** Göreli ağırlık (kollar arası pay) */
    weight: z.number().positive().max(1000).default(1),
    /** Bu kolun değiştirdiği bayraklar; boş → varsayılan davranış (kontrol) */
    flags: z.record(z.string(), z.string()).default({}),
  })
  .strict()

export const zExperiment = z
  .object({
    key: zKey,
    name: z.string().min(1).max(120),
    /** Ne bekliyoruz ve neden (serbest metin) */
    hypothesis: z.string().max(800).default(''),
    /** DRAFT taslak (yalnız simülasyon) · RUNNING canlı · PAUSED atama durdu · ENDED bitti */
    status: z.enum(EXPERIMENT_STATUSES).default('DRAFT'),
    /** Atama birimi: PROFILE profil GUID'i · DEVICE cihaz kimliği (anonim deneyler) */
    unit: z.enum(['PROFILE', 'DEVICE']).default('PROFILE'),
    /** Deneye giren birim payı (0–1). Dışarıda kalanlar varsayılanı görür ve maruziyet yazılmaz. */
    traffic: z.number().min(0).max(1).default(1),
    /** Atama tuzu; verilmezse deney anahtarı. Yeniden karıştırmak için değiştirilir. */
    salt: z.string().min(1).max(64).optional(),
    /** İlk kol kontroldür. */
    variants: z.array(zVariant).min(2).max(8),
    /** Birincil ölçüm (lab/src/ab/metrics.ts sözlüğünden) */
    primaryMetric: z.string().min(1).max(60).default('izleme_dk'),
    /** Bozulmaması gereken ölçümler */
    guardrails: z.array(z.string().min(1).max(60)).max(12).default([]),
    startAt: z.iso.date().nullable().default(null),
    endAt: z.iso.date().nullable().default(null),
    /** Analitik sistemdeki (Mixpanel) deney adı; verilmezse `key` */
    analyticsName: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const seen = new Set<string>()
    e.variants.forEach((v, i) => {
      if (seen.has(v.key))
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'key'], message: 'Kol anahtarı tekrar ediyor' })
      seen.add(v.key)
      for (const [k, val] of Object.entries(v.flags)) {
        if (!isFlagKey(k))
          ctx.addIssue({ code: 'custom', path: ['variants', i, 'flags', k], message: 'Bilinmeyen bayrak' })
        else if (!isFlagValue(k, val))
          ctx.addIssue({
            code: 'custom',
            path: ['variants', i, 'flags', k],
            message: `Geçersiz değer; beklenen: ${FLAGS[k].values.join(' | ')}`,
          })
      }
    })
  })

export type Experiment = z.infer<typeof zExperiment>
export type ExperimentInput = z.input<typeof zExperiment>
export type ExperimentVariant = z.infer<typeof zVariant>

export const zExperimentsFile = z.array(zExperiment).superRefine((list, ctx) => {
  const keys = new Set<string>()
  const owner = new Map<string, string>()
  list.forEach((e, i) => {
    if (keys.has(e.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Deney anahtarı tekrar ediyor' })
    keys.add(e.key)
    if (e.status !== 'RUNNING') return
    for (const k of flagsOfExperiment(e)) {
      const other = owner.get(k)
      if (other)
        ctx.addIssue({
          code: 'custom',
          path: [i, 'variants'],
          message: `'${k}' bayrağını aynı anda '${other}' deneyi de yönetiyor`,
        })
      else owner.set(k, e.key)
    }
  })
})

/** Deneyin herhangi bir kolunun değiştirdiği bayraklar. */
export function flagsOfExperiment(e: Pick<Experiment, 'variants'>): FlagKey[] {
  const out = new Set<FlagKey>()
  for (const v of e.variants) for (const k of Object.keys(v.flags)) if (isFlagKey(k)) out.add(k)
  return [...out]
}

/* ───────────── Bayrak çözümleme ───────────── */

export interface ResolvedFlags {
  flags: Flags
  /** Bayraklara katkı yapan (birimin girdiği) deneyler ve kolları */
  assignments: Assignment[]
}

/**
 * Birim için geçerli bayraklar: varsayılanlar ← etkin deneylerin kolları ← sabitlemeler (pins) ← elle geçersiz kılma.
 *   statuses  hangi durumdaki deneyler atama yapar (varsayılan yalnız RUNNING)
 *   pins      deney anahtarı → kol anahtarı (kalite denetimi için bir birimi kola sabitleme)
 *   overrides doğrudan bayrak değerleri (yalnız geliştirme / hata ayıklama; maruziyet sayılmaz)
 */
export function resolveFlags(
  experiments: readonly Experiment[],
  unitId: string,
  opts: {
    statuses?: readonly ExperimentStatus[]
    pins?: Readonly<Record<string, string>>
    overrides?: Readonly<Record<string, string>>
  } = {},
): ResolvedFlags {
  const statuses = opts.statuses ?? ['RUNNING']
  let flags: Flags = { ...DEFAULT_FLAGS }
  const assignments: Assignment[] = []
  for (const e of experiments) {
    if (!statuses.includes(e.status)) continue
    const pinned = opts.pins?.[e.key]
    const variantKey = pinned && e.variants.some((v) => v.key === pinned) ? pinned : assignVariant(e, unitId)
    if (!variantKey) continue
    const variant = e.variants.find((v) => v.key === variantKey)
    if (!variant) continue
    flags = withFlags(flags, variant.flags)
    assignments.push({ experiment: e.key, variant: variant.key })
  }
  flags = withFlags(flags, opts.overrides)
  return { flags, assignments }
}

/* ───────────── Stüdyo uçları (/api/studio/experiments) ─────────────
 * GET    /api/studio/experiments                      → ExperimentsResponse
 * POST   /api/studio/experiments/:key/status          gövde: { status } → ExperimentState   (dosyadaki durumun önüne geçer)
 * PUT    /api/studio/experiments/pins                 gövde: { unitId, experiment, variant | null } → 204
 */
export interface ExperimentState {
  definition: Experiment
  /** Dosyadaki durum stüdyodan değiştirildiyse true */
  statusOverridden: boolean
  /** Kol anahtarı → maruz kalan tekil birim sayısı (sunucu açıldığından beri değil, kalıcı sayaç) */
  exposures: Record<string, number>
  firstExposureAt: string | null
  lastExposureAt: string | null
}
export interface ExperimentsResponse {
  flags: { key: FlagKey; values: readonly string[]; side: 'server' | 'client'; defaultValue: string }[]
  experiments: ExperimentState[]
}
