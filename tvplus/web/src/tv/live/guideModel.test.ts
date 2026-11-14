import { describe, expect, it } from 'vitest'
import {
  anchorFor,
  blockAt,
  firstRowFor,
  guideWindow,
  horizontalStep,
  placeRow,
  REM_PER_SLOT,
  scrollXFor,
  slotTicks,
  timeToRem,
  verticalStep,
  windowRem,
  zonedParts,
  type GuideWindow,
} from './guideModel'

const MIN = 60_000
const W: GuideWindow = { from: Date.parse('2026-11-13T15:00:00Z'), to: Date.parse('2026-11-13T23:00:00Z') }
const at = (min: number): number => W.from + min * MIN
const item = (id: string, from: number, to: number) => ({
  id,
  startAt: new Date(at(from)).toISOString(),
  endAt: new Date(at(to)).toISOString(),
})

describe('pencere ve ölçek', () => {
  it('bugün: 06:00 → ertesi 02:00 (İstanbul), şimdi kapsanır', () => {
    const now = Date.parse('2026-11-13T17:10:00Z') // 20:10 İstanbul
    const w = guideWindow(0, now)
    expect(zonedParts(w.from)).toMatchObject({ hour: 6, minute: 0, day: 13 })
    expect(zonedParts(w.to)).toMatchObject({ hour: 2, minute: 0, day: 14 })
  })
  it('gece yarısından sonra bugünün penceresi şimdiyi kapsayacak kadar genişler', () => {
    const now = Date.parse('2026-11-13T23:40:00Z') // 02:40 İstanbul (14 Kasım)
    const w = guideWindow(0, now)
    expect(w.from).toBeLessThanOrEqual(now - 60 * MIN)
    expect(w.to).toBeGreaterThan(now)
  })
  it('yarın: ertesi günün 06:00 → 02:00', () => {
    const now = Date.parse('2026-11-13T17:10:00Z')
    const w = guideWindow(1, now)
    expect(zonedParts(w.from)).toMatchObject({ hour: 6, day: 14 })
    expect(zonedParts(w.to)).toMatchObject({ hour: 2, day: 15 })
  })
  it('30 dk = REM_PER_SLOT rem; çentikler 30 dakikada bir, tam saatler vurgulu', () => {
    expect(timeToRem(at(30), W)).toBe(REM_PER_SLOT)
    expect(windowRem(W)).toBe(16 * REM_PER_SLOT)
    const ticks = slotTicks(W)
    expect(ticks).toHaveLength(16)
    expect(ticks[0]).toMatchObject({ left: 0, label: '18:00', major: true })
    expect(ticks[1]).toMatchObject({ label: '18:30', major: false })
  })
})

describe('blok yerleşimi', () => {
  it('süreyle orantılı genişlik, kenarda kırpma, pencere dışı atlanır', () => {
    const row = placeRow([item('b', 30, 75), item('a', -20, 30), item('z', 500, 520), item('c', 470, 500)], W)
    expect(row.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(row[0]).toMatchObject({ left: 0, clippedStart: true })
    expect(row[0]!.width).toBeCloseTo(REM_PER_SLOT)
    expect(row[1]!.width).toBeCloseTo(1.5 * REM_PER_SLOT)
    expect(row[2]).toMatchObject({ clippedEnd: true })
  })
  it('çakışan yayın öncekinin bitişinden başlatılır (üst üste binme yok)', () => {
    const row = placeRow([item('a', 0, 40), item('b', 30, 60)], W)
    expect(row[1]!.start).toBe(at(40))
    expect(row[1]!.left).toBeCloseTo(timeToRem(at(40), W))
  })
})

describe('yön tuşu komşuları (düzensiz bloklar)', () => {
  // Kanal 0: 0–30, 30–90, 90–120   Kanal 1: boş   Kanal 2: 0–10, 10–25, 25–100, 100–200   Kanal 3: 0–200
  const rows = [
    placeRow([item('a0', 0, 30), item('a1', 30, 90), item('a2', 90, 120)], W),
    placeRow([], W),
    placeRow([item('c0', 0, 10), item('c1', 10, 25), item('c2', 25, 100), item('c3', 100, 200)], W),
    placeRow([item('d0', 0, 200)], W),
  ]

  it('↓ odak anını kapsayan bloğa iner, boş kanal atlanır', () => {
    // a1'deyiz, odak anı a1'in başı (30. dk) → kanal 2'de 25–100 bloğu
    const anchor = anchorFor(rows[0]![1]!, W.from)
    expect(anchor).toBe(at(30))
    expect(verticalStep(rows, 0, anchor, 1)).toEqual({ row: 2, index: 2 })
  })

  it('art arda ↓/↑ aynı anda kalır (uzun bloktan geçerken kaymaz)', () => {
    const anchor = at(12) // c1 içinde
    const down = verticalStep(rows, 2, anchor, 1)
    expect(down).toEqual({ row: 3, index: 0 })
    const up = verticalStep(rows, 3, anchor, -1)
    expect(up).toEqual({ row: 2, index: 1 }) // c1'e döner, c2'ye değil
    const up2 = verticalStep(rows, 2, anchor, -1)
    expect(up2).toEqual({ row: 0, index: 0 })
  })

  it('kapsayan blok yoksa en yakını seçilir; kenarda null', () => {
    const late = at(150)
    expect(verticalStep(rows, 2, late, -1)).toEqual({ row: 0, index: 2 })
    expect(verticalStep(rows, 0, at(10), -1)).toBeNull()
    expect(verticalStep(rows, 3, at(10), 1)).toBeNull()
    expect(blockAt([], 0)).toBeNull()
  })

  it('←/→ satır içinde, kenarda null', () => {
    expect(horizontalStep(rows[2]!, 0, -1)).toBeNull()
    expect(horizontalStep(rows[2]!, 0, 1)).toBe(1)
    expect(horizontalStep(rows[2]!, 3, 1)).toBeNull()
  })

  it('görünür alanın solundan başlayan uzun blokta odak anı görünür alanın başıdır', () => {
    expect(anchorFor(rows[3]![0]!, at(60))).toBe(at(60))
    expect(anchorFor(rows[2]![1]!, at(0))).toBe(at(10))
  })
})

describe('kaydırma', () => {
  it('sığan blok tamamen görünür tutulur, kenar payıyla', () => {
    expect(scrollXFor(0, 80, { left: 90, width: 14 }, 400)).toBe(26)
    expect(scrollXFor(50, 80, { left: 40, width: 14 }, 400)).toBe(38)
    expect(scrollXFor(20, 80, { left: 40, width: 14 }, 400)).toBe(20)
  })
  it('sınırlar: 0 ile toplam − görünüm', () => {
    expect(scrollXFor(10, 80, { left: 0, width: 14 }, 400)).toBe(0)
    expect(scrollXFor(0, 80, { left: 390, width: 10 }, 400)).toBe(320)
  })
  it('görünümü kaplayan geniş blokta kaydırma yok; değilse odak anı görünür olur', () => {
    expect(scrollXFor(50, 80, { left: 0, width: 300 }, 400, 60)).toBe(50)
    expect(scrollXFor(0, 80, { left: 100, width: 200 }, 400, 100)).toBe(98)
  })
  it('dikey: odaktaki satırın üstünde bir satır pay', () => {
    expect(firstRowFor(0, 6, 0, 13)).toBe(0)
    expect(firstRowFor(0, 6, 5, 13)).toBe(1)
    expect(firstRowFor(5, 6, 5, 13)).toBe(4)
    expect(firstRowFor(0, 6, 12, 13)).toBe(7)
  })
})
