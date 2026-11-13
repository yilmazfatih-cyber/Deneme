import { describe, expect, it } from 'vitest'
import type { PushEvent } from '../../../../shared/types'
import { createPushPoller, type PollerDeps, type PollResponseLike } from './poller'
import { relativeTime } from './time'

/* ───────────── sahte ortam ───────────── */

interface Pending {
  url: string
  signal: AbortSignal
  resolve(r: PollResponseLike): void
  reject(e: unknown): void
}

function env() {
  let now = 0
  let hidden = false
  const timers: { at: number; fn: () => void; id: number }[] = []
  let tid = 0
  const requests: Pending[] = []
  const visListeners = new Set<() => void>()
  const emitted: { label: string; detail: Record<string, unknown>; ok: boolean }[] = []

  const deps: PollerDeps = {
    fetch(url, init) {
      return new Promise((resolve, reject) => {
        const p: Pending = { url, signal: init.signal, resolve, reject }
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        requests.push(p)
      })
    },
    setTimeout(fn, ms) {
      const id = ++tid
      timers.push({ at: now + ms, fn, id })
      return id
    },
    clearTimeout(h) {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
    now: () => now,
    isHidden: () => hidden,
    onVisibilityChange(fn) {
      visListeners.add(fn)
      return () => visListeners.delete(fn)
    },
    headers: () => ({ 'x-tvplus-profile-guid': 'P1' }),
    emit: (label, detail, o) => emitted.push({ label, detail, ok: o?.ok ?? true }),
  }

  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  return {
    deps,
    requests,
    emitted,
    timers,
    flush,
    async advance(ms: number) {
      const end = now + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        const t = timers[0]
        if (!t || t.at > end) break
        timers.shift()
        now = t.at
        t.fn()
        await flush()
      }
      now = end
      await flush()
    },
    tick(ms: number) {
      now += ms
    },
    setHidden(h: boolean) {
      hidden = h
      for (const l of visListeners) l()
    },
    last(): Pending {
      return requests[requests.length - 1]!
    },
  }
}

const json = (body: unknown, status = 200): PollResponseLike => ({ ok: status < 400, status, json: async () => body })
const push = (id: string, cursor: number): PushEvent => ({
  id,
  cursor,
  kind: 'NEW_CONTENT',
  title: 't',
  body: 'b',
  href: '#/baslik/1',
  createdAt: '2026-11-13T10:00:00Z',
  read: false,
})

describe('bildirim yoklaması', () => {
  it('eşitler, sonra imleçle bekler; yanıt gelince imleç ilerler ve hemen yeniden sorar', async () => {
    const e = env()
    const got: { ids: string[]; initial: boolean }[] = []
    const p = createPushPoller(e.deps, { route: '/push', cursor: null, onEvents: (ev, info) => got.push({ ids: ev.map((x) => x.id), initial: info.initial }) })
    p.start()
    await e.flush()
    expect(e.last().url).toBe('/push?cursor=0&wait=0')
    e.last().resolve(json({ events: [push('a', 3)], cursor: 3 }))
    await e.flush()
    expect(p.cursor).toBe(3)
    expect(got).toEqual([{ ids: ['a'], initial: true }])
    expect(e.requests).toHaveLength(2)
    expect(e.last().url).toBe('/push?cursor=3&wait=25')

    e.tick(12_000) // sunucu 12 sn bekletti
    e.last().resolve(json({ events: [push('b', 4), push('c', 5)], cursor: 5 }))
    await e.flush()
    expect(p.cursor).toBe(5)
    expect(got[1]).toEqual({ ids: ['b', 'c'], initial: false })
    expect(e.last().url).toBe('/push?cursor=5&wait=25')
    const result = e.emitted.find((x) => x.label === '2 bildirim')
    expect(result?.detail).toMatchObject({ count: 2, cursor: 5, waitMs: 12_000 })
    p.stop()
  })

  it('hatada 2 sn → 4 sn → … → 30 sn bekler, başarıda sıfırlar', async () => {
    const e = env()
    const p = createPushPoller(e.deps, { route: '/push', cursor: 10, onEvents: () => {} })
    p.start()
    await e.flush()
    const waits: number[] = []
    for (let i = 0; i < 6; i++) {
      e.last().resolve(json({ error: 'x' }, 503))
      await e.flush()
      waits.push(p.backoffMs)
      const before = e.requests.length
      await e.advance(p.backoffMs - 1)
      expect(e.requests.length).toBe(before) // süre dolmadan yeniden denemez
      await e.advance(1)
      expect(e.requests.length).toBe(before + 1)
    }
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 30_000, 30_000])
    expect(e.emitted.filter((x) => !x.ok)).toHaveLength(6)
    e.last().resolve(json({ events: [], cursor: 10 }))
    await e.flush()
    expect(p.backoffMs).toBe(0)
    p.stop()
  })

  it('bozuk yanıt ve ağ hatası da geri çekilmeye girer', async () => {
    const e = env()
    const p = createPushPoller(e.deps, { route: '/push', cursor: 1, onEvents: () => {} })
    p.start()
    await e.flush()
    e.last().resolve(json({ nope: true }))
    await e.flush()
    expect(p.backoffMs).toBe(2000)
    await e.advance(2000)
    e.last().reject(new TypeError('Failed to fetch'))
    await e.flush()
    expect(p.backoffMs).toBe(4000)
    p.stop()
  })

  it('durdurunca açık isteği iptal eder ve bir daha sormaz', async () => {
    const e = env()
    let calls = 0
    const p = createPushPoller(e.deps, { route: '/push', cursor: 1, onEvents: () => calls++ })
    p.start()
    await e.flush()
    const req = e.last()
    p.stop()
    expect(req.signal.aborted).toBe(true)
    await e.advance(60_000)
    expect(e.requests).toHaveLength(1)
    expect(p.running).toBe(false)
    expect(calls).toBe(0)
    expect(e.emitted.some((x) => !x.ok)).toBe(false) // iptal hata sayılmaz
  })

  it('hata beklemesindeyken durdurulursa uyanır ve çıkar', async () => {
    const e = env()
    const p = createPushPoller(e.deps, { route: '/push', cursor: 1, onEvents: () => {} })
    p.start()
    await e.flush()
    e.last().resolve(json({}, 500))
    await e.flush()
    p.stop()
    await e.advance(10_000)
    expect(e.requests).toHaveLength(1)
    expect(e.timers).toHaveLength(0)
  })

  it('sekme gizlenince durur, görünür olunca sürer', async () => {
    const e = env()
    const p = createPushPoller(e.deps, { route: '/push', cursor: 7, onEvents: () => {} })
    p.start()
    await e.flush()
    const first = e.last()
    e.setHidden(true)
    await e.flush()
    expect(first.signal.aborted).toBe(true)
    await e.advance(120_000)
    expect(e.requests).toHaveLength(1) // gizliyken hiç istek yok
    expect(p.backoffMs).toBe(0) // gizlenme hata değildir
    e.setHidden(false)
    await e.flush()
    expect(e.requests).toHaveLength(2)
    expect(e.last().url).toBe('/push?cursor=7&wait=25')
    p.stop()
  })

  it('gizli sekmede başlatılırsa görünür olana kadar sormaz', async () => {
    const e = env()
    e.setHidden(true)
    const p = createPushPoller(e.deps, { route: '/push', cursor: 0, onEvents: () => {} })
    p.start()
    await e.flush()
    expect(e.requests).toHaveLength(0)
    e.setHidden(false)
    await e.flush()
    expect(e.requests).toHaveLength(1)
    p.stop()
  })

  it('boş yanıt çok hızlı dönerse sıcak döngüye girmez', async () => {
    const e = env()
    const p = createPushPoller(e.deps, { route: '/push', cursor: 2, onEvents: () => {} })
    p.start()
    await e.flush()
    e.last().resolve(json({ events: [], cursor: 2 }))
    await e.flush()
    expect(e.requests).toHaveLength(1)
    await e.advance(1000)
    expect(e.requests).toHaveLength(2)
    p.stop()
  })

  it('kimlik başlıklarını yollar', async () => {
    const e = env()
    let headers: Record<string, string> = {}
    const deps: PollerDeps = {
      ...e.deps,
      fetch: (url, init) => {
        headers = init.headers
        return e.deps.fetch(url, init)
      },
    }
    const p = createPushPoller(deps, { route: '/push', cursor: 0, onEvents: () => {} })
    p.start()
    await e.flush()
    expect(headers['x-tvplus-profile-guid']).toBe('P1')
    p.stop()
  })
})

describe('göreli zaman', () => {
  const now = Date.parse('2026-11-13T12:00:00+03:00')
  it('Türkçe kısa biçim', () => {
    expect(relativeTime(now - 20_000, now)).toBe('az önce')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 dk önce')
    expect(relativeTime(now - 3 * 3600_000, now)).toBe('3 sa önce')
    expect(relativeTime(now - 26 * 3600_000, now)).toBe('dün')
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('4 gün önce')
    expect(relativeTime(now - 40 * 86_400_000, now)).toBe('4 Eki')
    expect(relativeTime(now + 60_000, now)).toBe('az önce')
  })
})
