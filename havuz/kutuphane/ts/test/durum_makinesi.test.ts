// durum_makinesi modülünün testi.
import { describe, expect, it } from 'vitest'
import { createMachine, MachineError, TransitionError } from '../src/durum_makinesi.ts'

interface Baglam {
  adresVar: boolean
  odendi: boolean
}

const siparis = createMachine<'taslak' | 'onayda' | 'hazirlaniyor' | 'kargoda' | 'iptal', string, Baglam>({
  initial: 'taslak',
  states: {
    taslak: { on: { GONDER: 'onayda', IPTAL: 'iptal' } },
    onayda: { on: { ONAYLA: 'hazirlaniyor', REDDET: 'taslak' } },
    hazirlaniyor: {
      on: {
        KARGOLA: [
          { target: 'kargoda', guard: (c) => c.adresVar && c.odendi },
          { target: 'onayda', guard: (c) => !c.odendi },
        ],
      },
    },
    kargoda: { final: true },
    iptal: { final: true },
  },
})

describe('Machine', () => {
  it('geçişler ve son durum', () => {
    let state = siparis.initial
    state = siparis.transition(state, 'GONDER')
    state = siparis.transition(state, 'ONAYLA')
    expect(state).toBe('hazirlaniyor')
    expect(siparis.transition(state, 'KARGOLA', { adresVar: true, odendi: true })).toBe('kargoda')
    expect(siparis.transition(state, 'KARGOLA', { adresVar: true, odendi: false })).toBe('onayda')
    expect(siparis.isFinal('kargoda')).toBe(true)
    expect(siparis.nextEvents('taslak')).toEqual(['GONDER', 'IPTAL'])
    expect(siparis.states()).toHaveLength(5)
  })

  it('geçersiz geçiş ne yapılabileceğini söyleyen hata verir', () => {
    expect(() => siparis.transition('taslak', 'KARGOLA')).toThrow(TransitionError)
    expect(() => siparis.transition('taslak', 'KARGOLA')).toThrow('GONDER, IPTAL')
    expect(siparis.can('hazirlaniyor', 'KARGOLA', { adresVar: false, odendi: true })).toBe(false)
    expect(() => siparis.transition('kargoda', 'GONDER')).toThrow('(yok)')
  })

  it('hatalı tanım kurulurken yakalanır', () => {
    // Tanım dışarıdan (JSON) gelebilir; tip denetimi yoksa kurucu yakalar.
    expect(() => createMachine(JSON.parse('{"initial":"yok","states":{"a":{}}}'))).toThrow(MachineError)
    expect(() => createMachine(JSON.parse('{"initial":"a","states":{"a":{"on":{"GIT":"b"}}}}'))).toThrow(
      'böyle bir durum yok',
    )
    expect(() => createMachine({ initial: 'a', states: { a: { final: true, on: { X: 'a' } } } })).toThrow('son durum')
  })

  it('Mermaid çıktısı', () => {
    const text = siparis.toMermaid()
    expect(text.split('\n')[0]).toBe('stateDiagram-v2')
    expect(text).toContain('[*] --> taslak')
    expect(text).toContain('hazirlaniyor --> kargoda: KARGOLA [koşullu]')
    expect(text).toContain('kargoda --> [*]')
  })
})
