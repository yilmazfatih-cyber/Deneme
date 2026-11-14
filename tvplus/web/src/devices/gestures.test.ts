import { describe, expect, it } from 'vitest'
import type { RemoteKey } from '../../../shared/devices'
import {
  DEBOUNCE_MS,
  directionOf,
  KeyRepeater,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  TAP_MAX_MS,
  TouchPad,
  type Timers,
} from './gestures'

/** Elle ilerletilen sahte saat */
function fakeTimers() {
  let now = 0
  let seq = 0
  const tasks = new Map<number, { at: number; fn: () => void; every: number | null }>()
  const t: Timers = {
    now: () => now,
    setTimeout: (fn, ms) => {
      tasks.set(++seq, { at: now + ms, fn, every: null })
      return seq
    },
    clearTimeout: (h) => void tasks.delete(h as number),
    setInterval: (fn, ms) => {
      tasks.set(++seq, { at: now + ms, fn, every: ms })
      return seq
    },
    clearInterval: (h) => void tasks.delete(h as number),
  }
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      let next: [number, { at: number; fn: () => void; every: number | null }] | null = null
      for (const e of tasks) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e
      if (!next) break
      const [id, task] = next
      now = task.at
      if (task.every) task.at += task.every
      else tasks.delete(id)
      task.fn()
    }
    now = end
  }
  return { t, advance }
}

function setup() {
  const { t, advance } = fakeTimers()
  const sent: { key: RemoteKey; repeat: boolean; at: number }[] = []
  const rep = new KeyRepeater(t, (key, repeat) => sent.push({ key, repeat, at: t.now() }))
  const pad = new TouchPad(t, rep)
  return { t, advance, sent, rep, pad }
}

describe('kaydırma yönü', () => {
  it('eşiğin altı null, baskın eksen yön', () => {
    expect(directionOf(10, 5)).toBeNull()
    expect(directionOf(40, 5)).toBe('RIGHT')
    expect(directionOf(-40, 10)).toBe('LEFT')
    expect(directionOf(5, 50)).toBe('DOWN')
    expect(directionOf(0, -50)).toBe('UP')
  })
  it('tam çapraz kararsız', () => {
    expect(directionOf(40, 40)).toBeNull()
  })
})

describe('dokunma pedi', () => {
  it('kısa dokunuş OK', () => {
    const s = setup()
    s.pad.down(100, 100)
    s.advance(120)
    s.pad.up(102, 101)
    expect(s.sent.map((x) => x.key)).toEqual(['OK'])
  })
  it('uzun hareketsiz basış hiçbir şey yollamaz', () => {
    const s = setup()
    s.pad.down(100, 100)
    s.advance(TAP_MAX_MS + 50)
    s.pad.up(100, 100)
    expect(s.sent).toEqual([])
  })
  it('kaydırma eşiği aşılınca yön hemen gider, kalkınca OK gitmez', () => {
    const s = setup()
    s.pad.down(100, 100)
    s.pad.move(110, 100)
    expect(s.sent).toEqual([])
    s.pad.move(140, 102)
    expect(s.sent.map((x) => x.key)).toEqual(['RIGHT'])
    s.pad.up(150, 102)
    expect(s.sent.map((x) => x.key)).toEqual(['RIGHT'])
  })
  it('hızlı fiske (yalnız kalkışta eşik aşıldı) yön sayılır', () => {
    const s = setup()
    s.pad.down(100, 100)
    s.pad.up(100, 40)
    expect(s.sent.map((x) => x.key)).toEqual(['UP'])
  })
  it('kaydırıp tutunca yineler, kalkınca durur', () => {
    const s = setup()
    s.pad.down(0, 0)
    s.pad.move(0, 40)
    s.advance(REPEAT_DELAY_MS + REPEAT_INTERVAL_MS * 3 + 5)
    const downs = s.sent.filter((x) => x.key === 'DOWN')
    expect(downs.length).toBe(4)
    expect(downs.slice(1).every((x) => x.repeat)).toBe(true)
    s.pad.up(0, 40)
    s.advance(2000)
    expect(s.sent.filter((x) => x.key === 'DOWN').length).toBe(4)
  })
  it('aynı yönde kaydırmayı sürdürmek yeni basış değildir; yön değişince yeni yön başlar', () => {
    const s = setup()
    s.pad.down(0, 0)
    s.pad.move(40, 0)
    s.pad.move(80, 0)
    s.pad.move(120, 0)
    expect(s.sent.map((x) => x.key)).toEqual(['RIGHT'])
    s.advance(DEBOUNCE_MS + 1)
    s.pad.move(120, 60)
    expect(s.sent.map((x) => x.key)).toEqual(['RIGHT', 'DOWN'])
  })
})

describe('tuş yinelemesi', () => {
  it('basılı tutma: hemen bir, gecikmeden sonra aralıkla', () => {
    const s = setup()
    s.rep.press('LEFT')
    expect(s.sent.length).toBe(1)
    s.advance(REPEAT_DELAY_MS - 1)
    expect(s.sent.length).toBe(1)
    s.advance(1 + REPEAT_INTERVAL_MS)
    expect(s.sent.length).toBe(2)
    s.rep.release()
    s.advance(1000)
    expect(s.sent.length).toBe(2)
  })
  it('çift olay koruması: aynı tuş DEBOUNCE_MS içinde bir kez', () => {
    const s = setup()
    expect(s.rep.tap('OK')).toBe(true)
    expect(s.rep.tap('OK')).toBe(false)
    s.advance(DEBOUNCE_MS)
    expect(s.rep.tap('OK')).toBe(true)
    expect(s.rep.tap('BACK')).toBe(true)
    expect(s.sent.map((x) => x.key)).toEqual(['OK', 'OK', 'BACK'])
  })
  it('yeni basış eskisinin yinelemesini bitirir', () => {
    const s = setup()
    s.rep.press('LEFT')
    s.advance(REPEAT_DELAY_MS + REPEAT_INTERVAL_MS + 1)
    s.rep.press('UP')
    s.advance(REPEAT_DELAY_MS + REPEAT_INTERVAL_MS + 1)
    s.rep.release()
    expect(s.sent.map((x) => x.key)).toEqual(['LEFT', 'LEFT', 'UP', 'UP'])
  })
})
