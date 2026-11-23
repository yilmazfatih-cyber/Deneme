/**
 * Eşitleme tetikleyicileri: bağlanınca ilk eşitleme; yerel yazmadan sonra (gecikmeli) gönderme; ağ gelince hemen;
 * ön plana dönünce; ön plandayken aralıkla; arka plandayken aralık yok; çözülünce hiçbiri çalışmaz.
 * Sahte uygulama durumu ve ağ kaynakları kullanılır; zamanlar kısaltılmıştır.
 */
import { MemoryServer } from '@uygulama/shared/testing'
import type { AppLifecycle } from '../../src/lib/platform/lifecycle.ts'
import type { NetworkMonitor } from '../../src/lib/platform/network.ts'
import { createRecord } from '../../src/lib/store/records.ts'
import { SyncEngine } from '../../src/lib/sync/engine.ts'
import { attachSyncTriggers } from '../../src/lib/sync/triggers.ts'
import { freshDb } from '../support/db.ts'
import { fakeNetwork } from '../support/sync.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      for (const listener of listeners) listener(next)
    },
    on: (listener: (value: T) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

async function setup(pollMs = 10_000) {
  const server = new MemoryServer()
  const user = server.createUser('Ayşe')
  const db = await freshDb()
  const network = fakeNetwork(server, user.userId)
  const active = source(true)
  const online = source(true)
  const app: AppLifecycle = { isActive: active.get, onChange: active.on }
  const monitor: NetworkMonitor = { isOnline: online.get, onChange: online.on }
  const engine = new SyncEngine({ db, send: network.send, isOnline: online.get, random: () => 1 })
  let clock = 1_000_000
  const detach = attachSyncTriggers({
    engine,
    db,
    app,
    network: monitor,
    timing: { pushDebounceMs: 20, pollMs, resumeMinGapMs: 1000 },
    now: () => clock,
  })
  return {
    ...{ server, user, db, network, engine, detach, active, online },
    advance: (ms: number) => (clock += ms),
  }
}

describe('eşitleme tetikleyicileri', () => {
  it('bağlanınca eşitler; yerel yazma gecikmeyle gönderilir', async () => {
    const ctx = await setup()
    await ctx.engine.syncNow()
    expect(ctx.network.requests.length).toBeGreaterThanOrEqual(1)
    const before = ctx.network.requests.length
    await createRecord(ctx.db, ctx.user.personalWorkspaceId, 'tasks', { title: 'Yaz' })
    await createRecord(ctx.db, ctx.user.personalWorkspaceId, 'tasks', { title: 'Gönder' })
    expect(ctx.network.requests.length).toBe(before) // henüz gecikme dolmadı
    await sleep(80)
    await ctx.engine.syncNow()
    expect(ctx.server.recordsOf(ctx.user.personalWorkspaceId)).toHaveLength(2)
    ctx.detach()
  })

  it('ağ geri gelince hemen eşitler', async () => {
    const ctx = await setup()
    await ctx.engine.syncNow()
    ctx.online.set(false)
    ctx.network.offline = true
    await createRecord(ctx.db, ctx.user.personalWorkspaceId, 'tasks', { title: 'Çevrimdışı' })
    await sleep(60)
    expect(ctx.server.recordsOf(ctx.user.personalWorkspaceId)).toHaveLength(0)
    ctx.network.offline = false
    ctx.online.set(true)
    await sleep(30)
    await ctx.engine.syncNow()
    expect(ctx.server.recordsOf(ctx.user.personalWorkspaceId)).toHaveLength(1)
    ctx.detach()
  })

  it('ön plana dönünce (yeterince zaman geçtiyse) eşitler', async () => {
    const ctx = await setup()
    await ctx.engine.syncNow()
    const before = ctx.network.requests.length
    ctx.active.set(false)
    ctx.active.set(true) // az önce denendi: istek yok
    await sleep(20)
    expect(ctx.network.requests.length).toBe(before)
    ctx.advance(5000)
    ctx.active.set(false)
    ctx.active.set(true)
    await sleep(20)
    await ctx.engine.syncNow()
    expect(ctx.network.requests.length).toBeGreaterThan(before)
    ctx.detach()
  })

  it('aralıkla yalnız ön plandayken yoklar; çözülünce durur', async () => {
    const ctx = await setup(30)
    await ctx.engine.syncNow()
    await sleep(100)
    const whileActive = ctx.network.requests.length
    expect(whileActive).toBeGreaterThanOrEqual(2)
    ctx.active.set(false)
    await sleep(20)
    const paused = ctx.network.requests.length
    await sleep(100)
    expect(ctx.network.requests.length).toBe(paused)
    ctx.active.set(true)
    ctx.detach()
    const detached = ctx.network.requests.length
    await sleep(100)
    expect(ctx.network.requests.length).toBe(detached)
  })
})
