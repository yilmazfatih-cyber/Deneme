import { describe, expect, it } from 'vitest'
import { content } from '../../src/content'
import { defaultSettings, type SrsState } from '../../src/db'
import { targetItems, type LearnItem } from '../../src/features/journey/learn'
import {
  activityTypes,
  adaptChoiceCount,
  MAX_NEW_PER_SESSION,
  nextAvailableCue,
  planSession,
  seededRng,
  shouldSuggestBreak,
  startingCue,
  type PlanInput,
} from '../../src/features/journey/session'
import { DAY, initialState } from '../../src/lib/srs'

const now = Date.UTC(2026, 9, 2, 9)
const targets = targetItems(defaultSettings, [])

function input(patch: Partial<PlanInput> = {}): PlanInput {
  return {
    targets,
    states: new Map(),
    now,
    size: 8,
    choiceCount: 3,
    warmupIds: content.journey.warmups.map((w) => w.id),
    scenarioWords: new Set(content.journey.scenarios.map((s) => s.answer)),
    rng: seededRng(42),
    ...patch,
  }
}

describe('oturum planı', () => {
  it('yeni kullanıcıda yeni kelime sayısı sınırlı ve en az üç aktivite türü var', () => {
    const plan = planSession(input())
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.steps.length).toBeLessThanOrEqual(8)
    expect(plan.steps.filter((s) => s.stage === 'tani').length).toBeLessThanOrEqual(8)
    expect(activityTypes(plan).size).toBeGreaterThanOrEqual(3)
  })

  it('her oturumda en az üç aktivite türü (farklı tohumlarla)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const states = new Map<string, SrsState>()
      targets.slice(0, 6).forEach((t, i) => {
        states.set(t.id, {
          ...initialState(t.id, now - DAY),
          stage: (['hatirla', 'kullan', 'surdur'] as const)[i % 3]!,
        })
      })
      const plan = planSession(input({ states, rng: seededRng(seed) }))
      expect(activityTypes(plan).size, `seed ${seed}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('önce zamanı gelen tekrarlar gelir', () => {
    const states = new Map<string, SrsState>()
    const due = targets.slice(10, 18)
    for (const t of due) states.set(t.id, { ...initialState(t.id, now), stage: 'surdur', nextReview: now - DAY })
    const plan = planSession(input({ states }))
    expect(new Set(plan.steps.map((s) => s.wordId))).toEqual(new Set(due.map((d) => d.id)))
  })

  it(`bir oturumda en fazla ${MAX_NEW_PER_SESSION} yeni kelime (yer varsa erken tekrar)`, () => {
    const states = new Map<string, SrsState>()
    for (const t of targets.slice(0, 2))
      states.set(t.id, { ...initialState(t.id, now), nextReview: now + DAY, stage: 'hatirla' })
    const plan = planSession(input({ states }))
    const fresh = plan.steps.filter((s) => !states.has(s.wordId))
    expect(fresh.length).toBeLessThanOrEqual(8)
    expect(plan.steps.slice(0, 8).length).toBe(8)
  })

  it('seçenekler hedefi içerir ve seçenek sayısına uyar', () => {
    const plan = planSession(input({ choiceCount: 4 }))
    for (const step of plan.steps.filter((s) => s.activity === 'match' || s.activity === 'listen')) {
      expect(step.options).toContain(step.wordId)
      expect(step.options).toHaveLength(4)
      expect(new Set(step.options).size).toBe(4)
    }
  })
})

describe('ipucu basamakları', () => {
  const item: LearnItem = targets.find((t) => t.id === 'su')!
  const personal: LearnItem = { ...item, id: 'p1', cues: { semantic: [], sentence: [], firstSound: 'E…' } }

  it('artan ipucu her zaman resimle başlar', () => {
    const s = { ...initialState('su', now), lastCueLevel: 4 }
    expect(startingCue('increasing', s, item)).toBe(0)
  })

  it('azalan ipucu geçen seferki basamağın bir altından başlar', () => {
    expect(startingCue('decreasing', { ...initialState('su', now), lastCueLevel: 4 }, item)).toBe(3)
    expect(startingCue('decreasing', { ...initialState('su', now), lastCueLevel: 6 }, item)).toBe(4)
    expect(startingCue('decreasing', { ...initialState('su', now), lastCueLevel: 1 }, item)).toBe(0)
    expect(startingCue('decreasing', undefined, item)).toBe(0)
  })

  it('içeriği olmayan basamaklar atlanır', () => {
    expect(nextAvailableCue(0, personal)).toBe(3)
    expect(nextAvailableCue(0, item)).toBe(1)
    expect(nextAvailableCue(5, item)).toBeUndefined()
    expect(startingCue('decreasing', { ...initialState('p1', now), lastCueLevel: 3 }, personal)).toBe(0)
  })
})

describe('uyarlama', () => {
  it('başarı %85 üstünde seçenek artar, %65 altında azalır', () => {
    expect(adaptChoiceCount(3, 9, 10)).toBe(4)
    expect(adaptChoiceCount(3, 5, 10)).toBe(2)
    expect(adaptChoiceCount(3, 7, 10)).toBe(3)
    expect(adaptChoiceCount(4, 10, 10)).toBe(4)
    expect(adaptChoiceCount(2, 1, 10)).toBe(2)
    expect(adaptChoiceCount(3, 0, 2)).toBe(3)
  })

  it('yanıt süreleri belirgin uzayınca mola önerilir', () => {
    expect(shouldSuggestBreak([5000, 6000, 5000, 7000, 6000, 6500])).toBe(false)
    expect(shouldSuggestBreak([5000, 6000, 5000, 25000, 30000, 28000])).toBe(true)
    expect(shouldSuggestBreak([5000, 6000])).toBe(false)
  })
})

describe('hedef kelimeler', () => {
  it('kişisel kartlar ve panodan eklenenler önce gelir', () => {
    const list = targetItems({ ...defaultSettings, extraWords: ['makarna'] }, [
      { id: 'p1', word: 'Elif', category: 'kisiler', phrases: [], createdAt: 1 },
      { id: 'p2', word: 'Pamuk', category: 'hobiler', phrases: [], createdAt: 2 },
    ])
    expect(list.slice(0, 3).map((i) => i.id)).toEqual(['p1', 'p2', 'makarna'])
  })

  it('yerine geçen kişisel kart hazır kelimenin kimliğini ve fotoğrafını kullanır', () => {
    const photo = new Blob(['x'], { type: 'image/jpeg' })
    const list = targetItems(defaultSettings, [
      { id: 'p1', word: 'Ahmet', category: 'kisiler', replacesId: 'es', photo, phrases: [], createdAt: 1 },
    ])
    const es = list.find((i) => i.id === 'es')!
    expect(es.word).toBe('Ahmet')
    expect(es.photo).toBe(photo)
    expect(es.cues.firstSound).toBe('A…')
  })
})
