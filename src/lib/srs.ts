import type { PracticeResult, SrsState, Stage } from '../db'

/**
 * Beş kutulu aralıklı tekrar (1, 2, 4, 7, 14 gün) ve kelimenin dört aşaması.
 * İpucusuz başarı kutuyu ilerletir; ipuçlu başarı yerinde tutar; "henüz değil" bir kutu geri alır.
 * Ekranda hiçbir zaman "kaybettin" gösterilmez — bu modül yalnızca sıradaki tekrarı planlar.
 */

export const DAY = 24 * 60 * 60 * 1000
export const BOX_INTERVAL_DAYS = [1, 2, 4, 7, 14] as const
export const MAINTAIN_DAYS = 14

export function initialState(wordId: string, now: number): SrsState {
  return { wordId, stage: 'tani', box: 1, nextReview: now, streak: 0, updatedAt: now }
}

export function intervalFor(box: number): number {
  const i = Math.min(Math.max(box, 1), 5) - 1
  return BOX_INTERVAL_DAYS[i]! * DAY
}

export interface Outcome {
  result: PracticeResult
  /** 0 = ipucusuz … 5 = model, 6 = henüz değil */
  cueLevel: number
}

/** Başarı sayılır mı (ipucuyla ya da ipucusuz)? */
export function isSuccess(o: Outcome): boolean {
  return o.result === 'said' || o.result === 'said_with_help' || o.result === 'correct'
}

/** İpucusuz başarı: kendiliğinden söyledi ya da ilk denemede doğru seçti. */
export function isUncued(o: Outcome): boolean {
  return (o.result === 'said' && o.cueLevel === 0) || (o.result === 'correct' && o.cueLevel === 0)
}

export function nextStage(state: SrsState, o: Outcome, now: number): { stage: Stage; streak: number } {
  const uncued = isUncued(o)
  switch (state.stage) {
    case 'tani': {
      // Tanı → Hatırla: üst üste 2 doğru
      const streak = o.result === 'correct' && o.cueLevel === 0 ? state.streak + 1 : 0
      return streak >= 2 ? { stage: 'hatirla', streak: 0 } : { stage: 'tani', streak }
    }
    case 'hatirla': {
      // Hatırla → Kullan: ipucu ihtiyacı azalıyor (üst üste 2 kez ipucusuz ya da yalnız anlam ipucuyla)
      const light = isSuccess(o) && o.cueLevel <= 1
      const streak = light ? state.streak + 1 : 0
      return streak >= 2 ? { stage: 'kullan', streak: 0 } : { stage: 'hatirla', streak }
    }
    case 'kullan':
      // Kullan → Sürdür: cümle içinde ipucusuz söyledi
      return uncued ? { stage: 'surdur', streak: 0 } : { stage: 'kullan', streak: 0 }
    case 'surdur': {
      // Sürdür → Kazanıldı: 14 gün sonra hâlâ ipucusuz söylüyor
      const since = state.maintainSince ?? now
      if (uncued && now - since >= MAINTAIN_DAYS * DAY) return { stage: 'kazanildi', streak: 0 }
      return { stage: 'surdur', streak: 0 }
    }
    case 'kazanildi':
      return { stage: uncued || isSuccess(o) ? 'kazanildi' : 'surdur', streak: 0 }
  }
}

export function applyOutcome(state: SrsState, o: Outcome, now: number): SrsState {
  let box = state.box
  if (isUncued(o)) box = Math.min(5, box + 1)
  else if (!isSuccess(o)) box = Math.max(1, box - 1)

  const { stage, streak } = nextStage(state, o, now)
  const maintainSince =
    stage === 'surdur' && state.stage !== 'surdur'
      ? now
      : stage === 'surdur' || stage === 'kazanildi'
        ? state.maintainSince
        : undefined

  // Tanı ve hatırla aşamasında kelime aynı gün tekrar gelebilir; sonra kutu aralığı işler.
  const nextReview = stage === 'tani' || (stage === 'hatirla' && !isSuccess(o)) ? now : now + intervalFor(box)

  return {
    ...state,
    stage,
    streak,
    box,
    nextReview,
    lastCueLevel: o.cueLevel,
    maintainSince,
    updatedAt: now,
  }
}

export function isDue(state: SrsState, now: number): boolean {
  return state.nextReview <= now
}

/** Panoda "artık söyleyebiliyorsun" işareti gösterilecek mi? */
export function canSay(state: SrsState | undefined): boolean {
  return !!state && (state.stage === 'surdur' || state.stage === 'kazanildi')
}

export const STAGE_LABEL: Record<Stage, string> = {
  tani: 'Tanı',
  hatirla: 'Hatırla',
  kullan: 'Kullan',
  surdur: 'Sürdür',
  kazanildi: 'Söyleyebiliyorsun',
}
