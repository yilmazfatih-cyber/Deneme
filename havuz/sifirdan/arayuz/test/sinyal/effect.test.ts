import { describe, expect, it } from 'vitest'
import { batch, computed, effect, MAX_FLUSH_ROUNDS, onCleanup, signal, watch } from '../../src/sinyal/index.ts'

describe('effect', () => {
  it('temizliği yeniden çalışmadan önce ve kapatınca çalıştırır', () => {
    const s = signal(1)
    const log: string[] = []
    const stop = effect(() => {
      const v = s.value
      log.push(`çalış ${v}`)
      onCleanup(() => log.push(`onCleanup ${v}`))
      return () => log.push(`temizle ${v}`)
    })
    s.value = 2
    stop()
    s.value = 3
    expect(log).toEqual(['çalış 1', 'temizle 1', 'onCleanup 1', 'çalış 2', 'temizle 2', 'onCleanup 2'])
    expect(s.observers.size).toBe(0)
  })

  it('batch içindeki çok sayıda yazma etkiyi bir kez çalıştırır; iç içe batch dışta biter', () => {
    const a = signal(1)
    const b = signal(2)
    const sums: number[] = []
    effect(() => {
      sums.push(a.value + b.value)
    })
    batch(() => {
      a.value = 10
      batch(() => {
        b.value = 20
      })
      expect(sums).toEqual([3])
      a.value = 11
    })
    expect(sums).toEqual([3, 31])
  })

  it('iç etkiler üst etki yeniden çalışınca kapanır (sızıntı yok) ve üst etki önce çalışır', () => {
    const outer = signal(0)
    const inner = signal(0)
    const log: string[] = []
    effect(() => {
      const o = outer.value
      log.push(`dış ${o}`)
      effect(() => {
        log.push(`iç ${o}/${inner.value}`)
        return () => log.push(`iç temizlik ${o}`)
      })
    })
    expect(inner.observers.size).toBe(1)
    batch(() => {
      inner.value = 1
      outer.value = 1
    })
    expect(log).toEqual(['dış 0', 'iç 0/0', 'iç temizlik 0', 'dış 1', 'iç 1/1'])
    expect(inner.observers.size).toBe(1)
  })

  it('kaynak değişmediyse etkiyi çalıştırmaz (hesaplanmış aynı değeri verdi)', () => {
    const s = signal(1)
    const sign = computed(() => Math.sign(s.value))
    let runs = 0
    effect(() => {
      void sign.value
      runs++
    })
    s.value = 5
    s.value = 50
    expect(runs).toBe(1)
  })

  it('etkiler arası zincirleme yazmaları aynı boşaltmada işler', () => {
    const first = signal(1)
    const second = signal(0)
    const seen: number[] = []
    effect(() => {
      second.value = first.value * 2
    })
    effect(() => {
      seen.push(second.value)
    })
    first.value = 5
    expect(seen).toEqual([2, 10])
  })

  it('kendini sonsuza dek tetikleyen etkiyi durdurur ve sistem kullanılabilir kalır', () => {
    const s = signal(0)
    expect(() =>
      effect(() => {
        s.value = s.value + 1
      }),
    ).toThrow(/Etki döngüsü/)
    expect(s.peek()).toBe(MAX_FLUSH_ROUNDS + 1)
    const t = signal(1)
    const seen: number[] = []
    effect(() => {
      seen.push(t.value)
    })
    t.value = 2
    expect(seen).toEqual([1, 2])
  })

  it('bir etki hata atsa da diğerleri çalışır; ilk hata sonda atılır', () => {
    const s = signal(0)
    const seen: number[] = []
    effect(() => {
      if (s.value === 1) throw new Error('etki bozuldu')
    })
    effect(() => {
      seen.push(s.value)
    })
    expect(() => {
      s.value = 1
    }).toThrow('etki bozuldu')
    expect(seen).toEqual([0, 1])
    s.value = 2
    expect(seen).toEqual([0, 1, 2])
  })

  it('onCleanup etki dışında çağrılırsa yol gösteren hata verir', () => {
    expect(() => onCleanup(() => undefined)).toThrow(/yalnız bir etkinin içinde/)
  })

  it('watch yalnız değişimde ve eski değerle birlikte çağırır', () => {
    const s = signal('a')
    const calls: string[] = []
    const stop = watch(
      () => s.value,
      (next, prev) => calls.push(`${prev}→${next}`),
    )
    s.value = 'b'
    s.value = 'c'
    stop()
    s.value = 'd'
    expect(calls).toEqual(['a→b', 'b→c'])
  })
})
