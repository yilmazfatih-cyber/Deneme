import type { ActivityType, CueOrder, SrsState, Stage } from '../../db'
import type { LearnItem } from './learn'

/**
 * Oturum planlayıcı (saf fonksiyonlar; test edilebilir).
 * 10–15 dakika, 8–10 kelime. Önce zamanı gelen tekrarlar, sonra yeni kelimeler.
 * Her oturum en az üç farklı aktivite türü karıştırır (ısınma dahil).
 */

export interface Step {
  wordId: string
  activity: Exclude<ActivityType, 'warmup'>
  stage: Stage
  /** Eşleştirme ve dinle-seç için seçenekler (hedef dahil, karışık sırada) */
  options: string[]
  /** İpucu varyantı: kişi aynı cümleyi ezberlemesin diye her oturumda farklı seçilir */
  variant: number
}

export interface SessionPlan {
  warmupId: string
  steps: Step[]
}

export type Rng = () => number

/** Deterministik rastgele (testler ve aynı gün tekrar açılışlar için). */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

export function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)]!
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export const MAX_NEW_PER_SESSION = 4

export interface PlanInput {
  targets: LearnItem[]
  states: Map<string, SrsState>
  now: number
  size: number
  choiceCount: number
  warmupIds: string[]
  scenarioWords: Set<string>
  rng: Rng
}

function activityFor(stage: Stage, index: number, hasScenario: boolean, rng: Rng): Step['activity'] {
  switch (stage) {
    case 'tani':
      return index % 2 === 0 ? 'match' : 'listen'
    case 'hatirla':
      return index % 3 === 2 ? 'repeat' : 'naming'
    case 'kullan':
      return hasScenario && rng() < 0.5 ? 'scenario' : 'sentence'
    case 'surdur':
    case 'kazanildi':
      return 'naming'
  }
}

function distractorsFor(item: LearnItem, pool: LearnItem[], count: number, rng: Rng): string[] {
  const others = pool.filter((p) => p.id !== item.id && p.label !== item.label)
  // Başlangıçta farklı kategorilerden çeldiriciler (daha kolay); 4 seçenekte bir tanesi aynı kategoriden.
  const different = shuffle(
    others.filter((o) => o.category !== item.category),
    rng,
  )
  const same = shuffle(
    others.filter((o) => o.category === item.category),
    rng,
  )
  const chosen = count >= 3 && same.length ? [same[0]!, ...different] : [...different, ...same]
  return chosen.slice(0, count).map((o) => o.id)
}

export function planSession(input: PlanInput): SessionPlan {
  const { targets, states, now, size, rng } = input
  const byId = new Map(targets.map((t) => [t.id, t]))

  const due = [...states.values()]
    .filter((s) => byId.has(s.wordId) && s.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
    .map((s) => s.wordId)

  const fresh = targets.filter((t) => !states.has(t.id)).map((t) => t.id)
  const chosen: string[] = [...due.slice(0, size)]
  for (const id of fresh) {
    if (chosen.length >= size || chosen.filter((c) => !states.has(c)).length >= MAX_NEW_PER_SESSION) break
    chosen.push(id)
  }
  if (chosen.length < size) {
    // Hâlâ yer varsa: erken tekrar (öğrenme aşamasındaki kelimeler önce)
    const early = [...states.values()]
      .filter((s) => byId.has(s.wordId) && !chosen.includes(s.wordId))
      .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.nextReview - b.nextReview)
      .map((s) => s.wordId)
    chosen.push(...early.slice(0, size - chosen.length))
  }
  if (chosen.length < size) {
    for (const id of fresh) {
      if (chosen.length >= size) break
      if (!chosen.includes(id)) chosen.push(id)
    }
  }

  const choices = Math.min(4, Math.max(2, input.choiceCount)) - 1
  const pool = targets
  const steps: Step[] = shuffle(chosen, rng).map((wordId, i) => {
    const stage = states.get(wordId)?.stage ?? 'tani'
    const activity = activityFor(stage, i, input.scenarioWords.has(wordId), rng)
    const needsChoices = activity === 'match' || activity === 'listen'
    const options = needsChoices ? shuffle([wordId, ...distractorsFor(byId.get(wordId)!, pool, choices, rng)], rng) : []
    return { wordId, stage, activity, options, variant: Math.floor(rng() * 3) }
  })

  ensureVariety(steps)
  return { warmupId: pick(input.warmupIds, rng), steps }
}

function stageRank(stage: Stage): number {
  return { tani: 0, hatirla: 1, kullan: 2, surdur: 3, kazanildi: 4 }[stage]
}

/** Isınma + en az iki farklı kelime aktivitesi = en az üç tür. Gerekirse bir adımı dönüştürür. */
export function ensureVariety(steps: Step[]): void {
  // Not: match ↔ listen dönüşümünde seçenekler aynı kalır.
  const types = () => new Set(steps.map((s) => s.activity))
  if (steps.length < 2 || types().size >= 2) return
  const only = steps[0]!.activity
  const target = steps.find((s, i) => i > 0 && s.activity === only) ?? steps[1]!
  switch (only) {
    case 'match':
      target.activity = 'listen'
      break
    case 'listen':
      target.activity = 'match'
      break
    case 'naming':
    case 'sentence':
    case 'scenario':
      target.activity = 'repeat'
      target.options = []
      break
    case 'repeat':
      target.activity = 'naming'
      break
  }
}

export function activityTypes(plan: SessionPlan): Set<ActivityType> {
  return new Set<ActivityType>(['warmup', ...plan.steps.map((s) => s.activity)])
}

/** İpucu basamakları: 0 resim, 1 anlam, 2 cümle, 3 ilk ses, 4 yazılı kelime, 5 model. */
export const CUE_LEVELS = [0, 1, 2, 3, 4, 5] as const
export const NOT_YET = 6

/** Bu basamağın içeriği var mı? (ör. kişisel kartta cümle ipucu olmayabilir) */
export function cueAvailable(level: number, item: LearnItem): boolean {
  if (level === 1) return item.cues.semantic.length > 0
  if (level === 2) return item.cues.sentence.length > 0
  return level >= 0 && level <= 5
}

/**
 * Kelimenin bu denemede hangi ipucu basamağından başlayacağı.
 * Artan ipucu: her zaman yalnız resimle başlar, ipucu istendikçe eklenir.
 * Azalan ipucu (varsayılan): geçen sefer söylediği basamağın bir altından başlar; zamanla daha az ipucu.
 */
export function startingCue(order: CueOrder, state: SrsState | undefined, item: LearnItem): number {
  const last = state?.lastCueLevel
  if (order === 'increasing' || last === undefined || last <= 1) return 0
  const target = (last >= NOT_YET ? 5 : last) - 1
  for (let l = target; l > 0; l--) if (cueAvailable(l, item)) return l
  return 0
}

/** İçeriği olmayan basamakları atlar (ör. kişisel kartta cümle ipucu yoksa). */
export function nextAvailableCue(level: number, item: LearnItem): number | undefined {
  for (let l = level + 1; l <= 5; l++) if (cueAvailable(l, item)) return l
  return undefined
}

/** Oturumdaki başarıya göre seçenek sayısı: başarı ~%70–80'de kalsın. */
export function adaptChoiceCount(current: number, successes: number, attempts: number): number {
  if (attempts < 4) return current
  const rate = successes / attempts
  if (rate > 0.85) return Math.min(4, current + 1)
  if (rate < 0.65) return Math.max(2, current - 1)
  return current
}

/** Yanıt süreleri belirgin uzadıysa mola önerilir. */
export function shouldSuggestBreak(responseMs: number[]): boolean {
  if (responseMs.length < 6) return false
  const first = [...responseMs.slice(0, 3)].sort((a, b) => a - b)[1]!
  const recent = responseMs.slice(-3)
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
  return avgRecent > Math.max(first * 2, 20000)
}
