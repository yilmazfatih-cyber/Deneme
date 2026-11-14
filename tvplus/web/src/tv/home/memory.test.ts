import { describe, expect, it } from 'vitest'
import {
  cardFocusId,
  emptyMemory,
  MemoryStore,
  rememberFocus,
  restoreFocusId,
  restoreIndex,
  rowScopeId,
} from './memory'

describe('odak hafızası', () => {
  it('kimlikler: satır kapsamı ve kart', () => {
    expect(rowScopeId('ana-sayfa', 'L1')).toBe('ana-sayfa:satir:L1')
    expect(cardFocusId('ana-sayfa', 'L1', '80010001')).toBe('ana-sayfa:satir:L1:80010001')
  })

  it('odaklanan kartı kaydeder; aynıysa aynı nesne döner', () => {
    const m0 = emptyMemory()
    const m1 = rememberFocus(m0, 'L2', 3, 7, '99')
    expect(m1).toMatchObject({ rowListId: 'L2', rowIndex: 3, lanes: { L2: { index: 7, key: '99' } } })
    expect(rememberFocus(m1, 'L2', 3, 7, '99')).toBe(m1)
    expect(m0.rowListId).toBeNull()
  })

  it('dönüşte odaklanacak kart: Geri aynı karta döner', () => {
    const m = rememberFocus(rememberFocus(emptyMemory(), 'L1', 0, 2, 'a'), 'L5', 5, 14, 'z')
    expect(restoreFocusId(m, 'ana-sayfa')).toBe('ana-sayfa:satir:L5:z')
    expect(restoreFocusId(emptyMemory(), 'ana-sayfa')).toBeNull()
  })

  it('satır yeniden çizilirken başlanacak sıra: kart yer değiştirdiyse yeni yeri, yoksa eski sıra', () => {
    const m = rememberFocus(emptyMemory(), 'L1', 0, 3, 'x')
    expect(restoreIndex(m, 'L1', ['a', 'b', 'c', 'x'], 4)).toBe(3)
    expect(restoreIndex(m, 'L1', ['x', 'a', 'b', 'c'], 4)).toBe(0)
    expect(restoreIndex(m, 'L1', ['a', 'b', null, null, null], 5)).toBe(3)
    expect(restoreIndex(m, 'L1', ['a', 'b'], 2)).toBe(1)
    expect(restoreIndex(m, 'L9', ['a'], 1)).toBe(0)
    expect(restoreIndex(m, 'L1', [], 0)).toBe(0)
  })

  it('depo profil + ekran başına tutar', () => {
    const s = new MemoryStore()
    s.set('p1|ana-sayfa', rememberFocus(emptyMemory(), 'L1', 0, 1, 'k'))
    expect(s.get('p1|ana-sayfa').rowListId).toBe('L1')
    expect(s.get('p2|ana-sayfa').rowListId).toBeNull()
    s.clear()
    expect(s.get('p1|ana-sayfa').rowListId).toBeNull()
  })
})
