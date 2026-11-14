import { describe, expect, it } from 'vitest'
import { inDirection, pickNearest, pickNext, unionRect, type Candidate, type Rect } from './geometry'

const r = (left: number, top: number, width = 100, height = 60): Rect => ({ left, top, width, height })

/** cols × rows ızgara; kimlik "satır,sütun". Kart 100×60, aralık 10. */
function grid(rows: number[], gap = 10): Candidate[] {
  const out: Candidate[] = []
  rows.forEach((cols, y) => {
    for (let x = 0; x < cols; x++)
      out.push({ id: `${y},${x}`, rect: r(x * (100 + gap), y * (60 + gap)), order: out.length })
  })
  return out
}
const at = (cs: Candidate[], id: string): Rect => cs.find((c) => c.id === id)!.rect
const others = (cs: Candidate[], id: string) => cs.filter((c) => c.id !== id)
const next = (cs: Candidate[], from: string, dir: 'up' | 'down' | 'left' | 'right') =>
  pickNext(at(cs, from), others(cs, from), dir)?.id ?? null

describe('pickNext — düzenli ızgara', () => {
  const g = grid([3, 3, 3])
  it('dört yönde komşuya gider', () => {
    expect(next(g, '1,1', 'right')).toBe('1,2')
    expect(next(g, '1,1', 'left')).toBe('1,0')
    expect(next(g, '1,1', 'up')).toBe('0,1')
    expect(next(g, '1,1', 'down')).toBe('2,1')
  })
  it('kenarda aday yoksa null (boş yön)', () => {
    expect(next(g, '0,0', 'left')).toBeNull()
    expect(next(g, '0,0', 'up')).toBeNull()
    expect(next(g, '2,2', 'right')).toBeNull()
    expect(next(g, '2,2', 'down')).toBeNull()
  })
  it('satır sonunda sağa giderken alt satıra kaymaz', () => {
    expect(next(g, '0,2', 'right')).toBeNull()
  })
  it('aday listesi boşsa null', () => {
    expect(pickNext(r(0, 0), [], 'down')).toBeNull()
  })
})

describe('pickNext — düzensiz satırlar', () => {
  const g = grid([5, 3, 5])
  it('↓ bir alttaki kısa satırın en yakın (son) kartına iner, iki alttaki hizalı karta atlamaz', () => {
    expect(next(g, '0,4', 'down')).toBe('1,2')
  })
  it('↑ kısa satırdan uzun satıra hizalı karta çıkar', () => {
    expect(next(g, '1,2', 'up')).toBe('0,2')
  })
  it('hizalı kartlar arasında örtüşen tercih edilir', () => {
    expect(next(g, '1,0', 'down')).toBe('2,0')
  })
})

describe('pickNext — kaydırılmış ve örtüşen öğeler', () => {
  it('ikincil eksende örtüşen aday, daha yakın ama kayık adaya yeğlenir', () => {
    const cur = r(0, 0, 100, 100)
    const cands: Candidate[] = [
      { id: 'kayik', rect: r(105, 105, 100, 100) }, // köşegen, birincil boşluk 5
      { id: 'hizali', rect: r(140, 20, 100, 60) }, // aynı yatay hatta, boşluk 40
    ]
    expect(pickNext(cur, cands, 'right')?.id).toBe('hizali')
  })
  it('büyümüş odaklı kartın altında kalan komşu (örtüşme) yine sağdaki adaydır', () => {
    const cur = r(0, 0, 108, 65) // 1.08 büyüdü
    const cands: Candidate[] = [{ id: 'komsu', rect: r(104, 2, 100, 60) }]
    expect(pickNext(cur, cands, 'right')?.id).toBe('komsu')
    expect(pickNext(cur, cands, 'left')).toBeNull()
  })
  it('mevcudu kaplayan geniş öğe sağ/sol adayı değildir, alt adayıdır', () => {
    const cur = r(100, 0, 100, 50)
    const wide: Candidate = { id: 'genis', rect: r(0, 60, 400, 50) }
    expect(pickNext(cur, [wide], 'right')).toBeNull()
    expect(pickNext(cur, [wide], 'down')?.id).toBe('genis')
  })
  it('boyutsuz (gizli) adaylar yok sayılır', () => {
    const cands: Candidate[] = [
      { id: 'gizli', rect: r(110, 0, 0, 0) },
      { id: 'uzak', rect: r(400, 0) },
    ]
    expect(pickNext(r(0, 0), cands, 'right')?.id).toBe('uzak')
  })
  it('eşitlikte belirlenimci: sıra, sonra kimlik', () => {
    const cur = r(100, 0)
    const a: Candidate = { id: 'b', rect: r(50, 100), order: 2 }
    const b: Candidate = { id: 'a', rect: r(150, 100), order: 1 }
    expect(pickNext(cur, [a, b], 'down')?.id).toBe('a')
    expect(pickNext(cur, [b, a], 'down')?.id).toBe('a')
    const c: Candidate = { id: 'y', rect: r(50, 100) }
    const d: Candidate = { id: 'x', rect: r(150, 100) }
    expect(pickNext(cur, [c, d], 'down')?.id).toBe('x')
  })
  it('dikey listeden yandaki ızgaraya geçişte satır hizası korunur', () => {
    const list = [0, 1, 2, 3].map((i) => ({ id: `l${i}`, rect: r(0, i * 70, 200, 60) }))
    const tiles = grid([3, 3, 3]).map((c) => ({ ...c, rect: { ...c.rect, left: c.rect.left + 300 } }))
    expect(pickNext(list[2]!.rect, tiles, 'right')?.id).toBe('2,0')
    expect(pickNext(tiles[3]!.rect, list, 'left')?.id).toBe('l1')
  })
})

describe('yardımcılar', () => {
  it('inDirection', () => {
    expect(inDirection(r(0, 0), r(0, 100), 'down')).toBe(true)
    expect(inDirection(r(0, 0), r(0, 100), 'up')).toBe(false)
    expect(inDirection(r(0, 0), r(0, 0), 'right')).toBe(false)
  })
  it('pickNearest merkez uzaklığına göre seçer', () => {
    expect(
      pickNearest(r(0, 0), [
        { id: 'uzak', rect: r(500, 0) },
        { id: 'yakin', rect: r(0, 80) },
      ])?.id,
    ).toBe('yakin')
  })
  it('unionRect boşları atlar', () => {
    expect(unionRect([r(0, 0), null, r(200, 100)])).toEqual({ left: 0, top: 0, width: 300, height: 160 })
    expect(unionRect([null])).toBeNull()
  })
})
