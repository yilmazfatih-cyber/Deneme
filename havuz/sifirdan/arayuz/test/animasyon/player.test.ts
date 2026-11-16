import { afterEach, describe, expect, it } from 'vitest'
import {
  flip,
  ManualClock,
  setMediaQuery,
  setMotionPreference,
  springAnimation,
  stagger,
  Ticker,
  timeline,
  tween,
} from '../../src/animasyon/index.ts'

afterEach(() => {
  setMotionPreference('system')
  setMediaQuery(() => ({ matches: false }))
})

function setup() {
  const clock = new ManualClock()
  return { clock, ticker: new Ticker(clock) }
}

describe('zamanlayıcı', () => {
  it('çalışan animasyon yokken kare istemez', () => {
    const { clock, ticker } = setup()
    const times: number[] = []
    const remove = ticker.add((t) => times.push(t))
    clock.advance(16)
    clock.advance(16)
    remove()
    clock.advance(16)
    expect(times).toEqual([16, 32])
    expect(clock.waiting).toBe(0)
    expect(ticker.running).toBe(false)
  })
})

describe('ara değerleme (tween)', () => {
  it('saate göre ilerler, gecikmeye uyar, biter ve sözü çözer', async () => {
    const { clock, ticker } = setup()
    const values: number[] = []
    let completed = false
    const anim = tween({
      from: 0,
      to: 100,
      duration: 100,
      delay: 50,
      ticker,
      onUpdate: (v) => values.push(v),
      onComplete: () => (completed = true),
    })
    clock.advance(0)
    clock.advance(50)
    clock.advance(50)
    expect(values).toEqual([0, 0, 50])
    clock.advance(200)
    expect(values.at(-1)).toBe(100)
    expect(await anim.finished).toBe(true)
    expect(completed).toBe(true)
  })

  it('duraklatma, konuma gitme, ters çevirme ve iptal', async () => {
    const { clock, ticker } = setup()
    const anim = tween({ from: '#000000', to: '#ffffff', duration: 200, ticker })
    clock.advance(0)
    clock.advance(100)
    anim.pause()
    clock.advance(500)
    expect(anim.current).toBe('rgb(99, 99, 99)')
    anim.seek(200)
    expect(anim.current).toBe('rgb(255, 255, 255)')
    anim.reverse()
    clock.advance(0)
    clock.advance(200)
    expect(anim.current).toBe('rgb(0, 0, 0)')
    const second = tween({ from: 0, to: 1, duration: 100, ticker })
    second.cancel()
    expect(await second.finished).toBe(false)
  })

  it('hareket azaltma tercihinde anında sona atlar', async () => {
    const { ticker } = setup()
    setMediaQuery((q) => ({ matches: q.includes('reduce') }))
    const values: number[] = []
    const anim = tween({ from: 0, to: 1, duration: 1000, ticker, onUpdate: (v) => values.push(v) })
    expect(values).toEqual([1])
    expect(await anim.finished).toBe(true)
    setMotionPreference('full')
    const full = tween({ from: 0, to: 1, duration: 1000, ticker })
    expect(full.playing).toBe(true)
  })
})

describe('yay animasyonu', () => {
  it('durulunca biter; hedef değişince hız korunur', async () => {
    const { clock, ticker } = setup()
    const spring = springAnimation({ from: 0, to: 100, ticker, config: { stiffness: 120, damping: 14 } })
    clock.advance(0)
    clock.advance(150, 16)
    const speed = spring.velocity
    expect(speed).toBeGreaterThan(0)
    spring.retarget(200)
    clock.advance(16)
    expect(spring.velocity).toBeGreaterThan(0)
    clock.advance(5000, 16)
    expect(spring.value).toBe(200)
    expect(await spring.finished).toBe(true)
  })
})

describe('zaman çizelgesi', () => {
  it('konum kuralları, toplam süre ve geri sarmada doğru durum', () => {
    const { ticker } = setup()
    const state = { x: 0, y: 0 }
    const tl = timeline(ticker)
      .add(tween({ from: 0, to: 100, duration: 100, ticker, autoplay: false, onUpdate: (v) => (state.x = v) }))
      .add(tween({ from: 0, to: 50, duration: 100, ticker, autoplay: false, onUpdate: (v) => (state.y = v) }), '<')
      .add(tween({ from: 100, to: 0, duration: 100, ticker, autoplay: false, onUpdate: (v) => (state.x = v) }), '+=50')
    expect(tl.duration).toBe(250)
    tl.seek(50)
    expect(state).toEqual({ x: 50, y: 25 })
    tl.seek(200)
    expect(state).toEqual({ x: 50, y: 50 })
    tl.seek(120)
    expect(state).toEqual({ x: 100, y: 50 })
    tl.seek(0)
    expect(state).toEqual({ x: 0, y: 0 })
    expect([0, 1, 2].map(stagger(40, 10))).toEqual([10, 50, 90])
  })
})

describe('FLIP', () => {
  it('öğeyi eski yerinden yenisine kaydırır ve sonunda dönüşümü temizler', () => {
    const { clock, ticker } = setup()
    const element = { style: { transform: '', transformOrigin: '' } } as unknown as HTMLElement
    let rect = { left: 0, top: 0, width: 100, height: 50 }
    const anim = flip([element], () => (rect = { left: 200, top: 100, width: 50, height: 50 }), {
      ticker,
      duration: 100,
      measure: () => rect,
      easing: (t) => t,
    })!
    expect(element.style.transform).toBe('translate(-200px, -100px) scale(2, 1)')
    clock.advance(0)
    clock.advance(50)
    expect(element.style.transform).toBe('translate(-100px, -50px) scale(1.5, 1)')
    clock.advance(60)
    expect(element.style.transform).toBe('')
    expect(anim.playing).toBe(false)
    setMotionPreference('reduce')
    expect(flip([element], () => undefined, { ticker, measure: () => rect })).toBeUndefined()
  })
})
