// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getMeta, setMeta } from '../../src/lib/store/meta.ts'
import { LEASE_MS, withSyncLock } from '../../src/lib/sync/lock.ts'
import { freshDb } from '../helpers/sync.ts'

describe('eşitleme kilidi (Web Locks yokken kira yedeği)', () => {
  it('iki sekme aynı anda koşamaz; ikincisi birincinin bitmesini bekler', async () => {
    const db = freshDb()
    const order: string[] = []
    let inside = 0
    let maxInside = 0
    const task = (name: string) => async () => {
      inside += 1
      maxInside = Math.max(maxInside, inside)
      order.push(`${name}:başla`)
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push(`${name}:bitir`)
      inside -= 1
    }
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)))
    await Promise.all([
      withSyncLock(db, task('A'), { useWebLocks: false, owner: 'A', sleep }),
      withSyncLock(db, task('B'), { useWebLocks: false, owner: 'B', sleep }),
    ])
    expect(maxInside).toBe(1)
    expect(order).toHaveLength(4)
    expect(await getMeta(db, 'syncLease')).toBeNull() // iş bitince kira bırakılır
  })

  it('kirayı tutan sekme çökerse süre dolunca başkası alır', async () => {
    const db = freshDb()
    let now = 1_000_000
    await setMeta(db, 'syncLease', { owner: 'cöken-sekme', until: now + LEASE_MS })
    const sleep = async () => {
      now += 1000 // her beklemede saat 1 sn ilerler
    }
    let ran = false
    await withSyncLock(db, async () => (ran = true), { useWebLocks: false, owner: 'yeni', now: () => now, sleep })
    expect(ran).toBe(true)
  })

  it('iş hata verse de kira bırakılır', async () => {
    const db = freshDb()
    await expect(
      withSyncLock(db, () => Promise.reject(new Error('patladı')), { useWebLocks: false, owner: 'A' }),
    ).rejects.toThrow('patladı')
    expect(await getMeta(db, 'syncLease')).toBeNull()
  })
})
