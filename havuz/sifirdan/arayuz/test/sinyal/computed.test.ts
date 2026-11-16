import { describe, expect, it } from 'vitest'
import { batch, computed, CycleError, effect, signal, untrack } from '../../src/sinyal/index.ts'

describe('signal', () => {
  it('okur, yazar ve aynı değeri yazınca kimseyi uyandırmaz', () => {
    const s = signal(1)
    let runs = 0
    effect(() => {
      void s.value
      runs++
    })
    s.value = 1
    expect(runs).toBe(1)
    s.value = 2
    expect(runs).toBe(2)
    s.update((n) => n + 1)
    expect(s.peek()).toBe(3)
    expect(runs).toBe(3)
  })
})

describe('computed', () => {
  it('tembeldir ve önbelleğe alır', () => {
    const s = signal(2)
    const double = computed(() => s.value * 2)
    expect(double.computeCount).toBe(0)
    expect(double.value).toBe(4)
    expect(double.value).toBe(4)
    expect(double.computeCount).toBe(1)
    s.value = 5
    expect(double.computeCount).toBe(1)
    expect(double.value).toBe(10)
    expect(double.computeCount).toBe(2)
  })

  it('elmas bağımlılıkta her düğüm bir kez ve tutarlı girdilerle hesaplanır (glitch yok)', () => {
    const s = signal(1)
    const b = computed(() => s.value * 2, { name: 'b' })
    const c = computed(() => s.value * 3, { name: 'c' })
    const seen: string[] = []
    const d = computed(() => {
      seen.push(`${b.value}+${c.value}`)
      return b.value + c.value
    })
    const results: number[] = []
    effect(() => {
      results.push(d.value)
    })
    s.value = 2
    s.value = 3
    expect(results).toEqual([5, 10, 15])
    expect(seen).toEqual(['2+3', '4+6', '6+9'])
    expect([b.computeCount, c.computeCount, d.computeCount]).toEqual([3, 3, 3])
  })

  it('ara değer değişmezse alt düğümler ve etki yeniden çalışmaz', () => {
    const s = signal(2)
    const isEven = computed(() => s.value % 2 === 0)
    const label = computed(() => (isEven.value ? 'çift' : 'tek'))
    let runs = 0
    effect(() => {
      void label.value
      runs++
    })
    s.value = 4
    s.value = 6
    expect(isEven.computeCount).toBe(3)
    expect(label.computeCount).toBe(1)
    expect(runs).toBe(1)
    s.value = 7
    expect(label.value).toBe('tek')
    expect(runs).toBe(2)
  })

  it('hatayı önbelleğe alır, okuyana yeniden atar ve kaynak düzelince toparlanır', () => {
    const s = signal(1)
    const root = computed(() => {
      if (s.value < 0) throw new Error('negatif olamaz')
      return Math.sqrt(s.value)
    })
    expect(root.value).toBe(1)
    s.value = -4
    expect(() => root.value).toThrow('negatif olamaz')
    expect(() => root.value).toThrow('negatif olamaz')
    expect(root.computeCount).toBe(2)
    s.value = 9
    expect(root.value).toBe(3)
    expect(root.computeCount).toBe(3)
  })

  it('hata + elmas: hatalı dal tek kez hesaplanır, birleşen düğüm hatayı tutarlı görür', () => {
    const s = signal(1)
    const ok = computed(() => s.value + 1)
    const risky = computed(() => {
      if (s.value === 0) throw new Error('sıfır')
      return 10 / s.value
    })
    const both = computed(() => {
      try {
        return `${ok.value}:${risky.value}`
      } catch (error) {
        return `${ok.value}:hata(${(error as Error).message})`
      }
    })
    const log: string[] = []
    effect(() => {
      log.push(both.value)
    })
    s.value = 0
    s.value = 2
    expect(log).toEqual(['2:10', '1:hata(sıfır)', '3:5'])
    expect([ok.computeCount, risky.computeCount, both.computeCount]).toEqual([3, 3, 3])
  })

  it('kendine ve karşılıklı başvuran hesaplanmışları döngü hatasıyla durdurur', () => {
    const self = computed((): number => self.value + 1, { name: 'kendi' })
    expect(() => self.value).toThrow(CycleError)
    const a = computed((): number => b.value + 1, { name: 'a' })
    const b = computed((): number => a.value + 1, { name: 'b' })
    expect(() => a.value).toThrow(/Döngüsel bağımlılık/)
  })

  it('hesaplanmış içinde sinyal yazmayı reddeder', () => {
    const s = signal(0)
    const bad = computed(() => {
      s.value = 1
      return 1
    })
    expect(() => bad.value).toThrow(/Hesaplanmış değer içinde sinyal yazılamaz/)
  })

  it('canlı değilken abone olmaz; okununca dönem sayacıyla doğrulanır', () => {
    const s = signal(1)
    const c = computed(() => s.value + 1)
    expect(c.value).toBe(2)
    expect(s.observers.size).toBe(0)
    s.value = 10
    expect(c.value).toBe(11)
    const unrelated = signal(0)
    unrelated.value = 1
    expect(c.value).toBe(11)
    expect(c.computeCount).toBe(2)
  })

  it('canlı değilken kaçırdığı yazmayı, canlı olunca da görür', () => {
    const s = signal(1)
    const c = computed(() => s.value * 10)
    expect(c.value).toBe(10)
    s.value = 2
    const seen: number[] = []
    const stop = effect(() => {
      seen.push(c.value)
    })
    s.value = 3
    expect(seen).toEqual([20, 30])
    stop()
    expect(s.observers.size).toBe(0)
    expect(c.observers.size).toBe(0)
  })

  it('koşullu bağımlılıkta artık okunmayan kaynaktan aboneliği çıkarır', () => {
    const useA = signal(true)
    const a = signal('a')
    const b = signal('b')
    const pick = computed(() => (useA.value ? a.value : b.value))
    let runs = 0
    effect(() => {
      void pick.value
      runs++
    })
    expect(a.observers.size).toBe(1)
    expect(b.observers.size).toBe(0)
    useA.value = false
    expect(a.observers.size).toBe(0)
    expect(b.observers.size).toBe(1)
    a.value = 'A'
    expect(runs).toBe(2)
  })

  it('untrack ve peek bağımlılık kaydetmez; batch içinde değer anında okunur', () => {
    const s = signal(1)
    const t = signal(100)
    let runs = 0
    effect(() => {
      void s.value
      void untrack(() => t.value)
      void t.peek()
      runs++
    })
    t.value = 200
    expect(runs).toBe(1)
    const doubled = computed(() => s.value * 2)
    const inside = batch(() => {
      s.value = 7
      return doubled.value
    })
    expect(inside).toBe(14)
    expect(runs).toBe(2)
  })
})
