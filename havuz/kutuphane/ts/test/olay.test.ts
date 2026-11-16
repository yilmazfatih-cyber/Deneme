// olay modülünün testi.
import { describe, expect, it } from 'vitest'
import { Emitter } from '../src/olay.ts'

type Olaylar = { kaydedildi: { id: string }; silindi: string; temizlendi: undefined }

describe('Emitter', () => {
  it('on/off/once ve sıra', () => {
    const emitter = new Emitter<Olaylar>()
    const seen: string[] = []
    const off = emitter.on('kaydedildi', (p) => seen.push(`a:${p.id}`))
    emitter.on('kaydedildi', (p) => seen.push(`b:${p.id}`))
    emitter.once('silindi', (p) => seen.push(`sil:${p}`))
    emitter.emit('kaydedildi', { id: '1' })
    off()
    emitter.emit('kaydedildi', { id: '2' })
    emitter.emit('silindi', 'x')
    emitter.emit('silindi', 'y')
    emitter.emit('temizlendi', undefined)
    expect(seen).toEqual(['a:1', 'b:1', 'b:2', 'sil:x'])
    expect(emitter.listenerCount('kaydedildi')).toBe(1)
    expect(emitter.listenerCount()).toBe(1)
  })

  it('bir dinleyicinin hatası diğerlerini durdurmaz; sonra fırlatılır', () => {
    const emitter = new Emitter<Olaylar>()
    const seen: string[] = []
    emitter.on('silindi', () => {
      throw new Error('bir')
    })
    emitter.on('silindi', (p) => seen.push(p))
    expect(() => emitter.emit('silindi', 'z')).toThrow('bir')
    expect(seen).toEqual(['z'])
    emitter.on('silindi', () => {
      throw new Error('iki')
    })
    expect(() => emitter.emit('silindi', 'q')).toThrow(AggregateError)
    const reported: unknown[] = []
    const quiet = new Emitter<Olaylar>({ onError: (e) => reported.push(e) })
    quiet.on('silindi', () => {
      throw new Error('sessiz')
    })
    quiet.emit('silindi', 'w')
    expect(reported).toHaveLength(1)
  })

  it('yayın sırasında abonelikten çıkmak o turu bozmaz', () => {
    const emitter = new Emitter<Olaylar>()
    const seen: string[] = []
    const offA = emitter.on('silindi', () => {
      seen.push('a')
      offB()
    })
    const offB = emitter.on('silindi', () => seen.push('b'))
    emitter.emit('silindi', '1')
    emitter.emit('silindi', '2')
    expect(seen).toEqual(['a', 'b', 'a'])
    offA()
    emitter.clear()
    expect(emitter.listenerCount()).toBe(0)
  })

  it('waitFor bekler, süzer, zaman aşımı ve iptalde reddeder', async () => {
    const emitter = new Emitter<Olaylar>()
    const waiting = emitter.waitFor('silindi', { filter: (p) => p.startsWith('ok') })
    emitter.emit('silindi', 'hayır')
    emitter.emit('silindi', 'ok-1')
    await expect(waiting).resolves.toBe('ok-1')
    await expect(emitter.waitFor('silindi', { timeoutMs: 5 })).rejects.toThrow('5 ms')
    const controller = new AbortController()
    const aborted = emitter.waitFor('silindi', { signal: controller.signal })
    controller.abort(new Error('iptal'))
    await expect(aborted).rejects.toThrow('iptal')
    expect(emitter.listenerCount()).toBe(0)
  })
})
