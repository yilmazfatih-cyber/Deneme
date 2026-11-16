// kuyruk modülünün testi: eşzamanlılık sınırı, öncelik, temizleme, mapLimit.
import { describe, expect, it } from 'vitest'
import { mapLimit, QueueClearedError, TaskQueue } from '../src/kuyruk.ts'

const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms))

describe('TaskQueue', () => {
  it('aynı anda en çok concurrency görev çalıştırır ve hepsini bitirir', async () => {
    const queue = new TaskQueue({ concurrency: 3 })
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        queue.add(async () => {
          running += 1
          peak = Math.max(peak, running)
          await tick(1 + (i % 3))
          running -= 1
          return i * 2
        }),
      ),
    )
    expect(peak).toBe(3)
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2))
    await queue.onIdle()
    expect(queue.size + queue.pending).toBe(0)
  })

  it('önceliği büyük olan önce, eşitlerde ilk gelen önce çalışır', async () => {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false })
    const order: string[] = []
    const add = (name: string, priority = 0) => queue.add(async () => void order.push(name), { priority })
    const all = Promise.all([add('a'), add('b', 5), add('c'), add('d', 5), add('e', 10)])
    queue.start()
    await all
    expect(order).toEqual(['e', 'b', 'd', 'a', 'c'])
  })

  it("hatalı görev yalnız kendi Promise'ini reddeder", async () => {
    const queue = new TaskQueue({ concurrency: 2 })
    const bad = queue.add(async () => {
      throw new Error('bozuk')
    })
    const good = queue.add(async () => 'iyi')
    await expect(bad).rejects.toThrow('bozuk')
    await expect(good).resolves.toBe('iyi')
  })

  it('clear sıradakileri reddeder, abortRunning çalışanın sinyalini tetikler', async () => {
    const queue = new TaskQueue({ concurrency: 1 })
    let aborted = false
    const running = queue.add(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true
            resolve('durdu')
          })
        }),
    )
    const waiting = queue.add(async () => 'çalışmamalı')
    queue.clear({ abortRunning: true })
    await expect(waiting).rejects.toBeInstanceOf(QueueClearedError)
    await expect(running).resolves.toBe('durdu')
    expect(aborted).toBe(true)
  })

  it('iptal edilmiş sinyalle eklenen görev çalışmaz', async () => {
    const queue = new TaskQueue()
    const controller = new AbortController()
    controller.abort(new Error('vazgeçildi'))
    let ran = false
    await expect(queue.add(async () => void (ran = true), { signal: controller.signal })).rejects.toThrow('vazgeçildi')
    expect(ran).toBe(false)
  })
})

describe('mapLimit', () => {
  it('sırayı korur ve paralelliği sınırlar', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (n, i) => {
      running += 1
      peak = Math.max(peak, running)
      await tick(n)
      running -= 1
      return `${i}:${n}`
    })
    expect(out).toEqual(['0:5', '1:1', '2:3', '3:2', '4:4'])
    expect(peak).toBe(2)
  })

  it('ilk hatada reddeder ve yeni iş başlatmaz', async () => {
    const started: number[] = []
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n)
        if (n === 2) throw new Error('iki')
        return n
      }),
    ).rejects.toThrow('iki')
    expect(started).toEqual([1, 2])
    expect(await mapLimit([], 3, async (n: number) => n)).toEqual([])
  })
})
