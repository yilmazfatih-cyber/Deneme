import type { PokeEvent } from '@uygulama/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecord } from '../../src/lib/store/records.ts'
import type { SyncEngine } from '../../src/lib/sync/engine.ts'
import { attachSyncTriggers } from '../../src/lib/sync/triggers.ts'
import { freshDb } from '../helpers/sync.ts'

function fakeEngine() {
  const calls: string[] = []
  const engine = {
    lastAttemptAt: 0,
    requestSync: (reason: string) => calls.push(reason),
    syncNow: async () => {
      calls.push('now')
      return {}
    },
  } as unknown as SyncEngine
  return { engine, calls }
}

const timing = { pushDebounceMs: 30, pokeDebounceMs: 10, pollMs: 60_000, resumeMinGapMs: 0 }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('eşitleme tetikleyicileri', () => {
  let detach: (() => void) | null = null
  afterEach(() => detach?.())

  it('açılışta çeker; art arda yerel yazmalar TEK gönderime toplanır', async () => {
    const db = freshDb()
    const { engine, calls } = fakeEngine()
    detach = attachSyncTriggers({ engine, db, clientId: 'ben', timing })
    expect(calls).toEqual(['pull'])
    await createRecord(db, 'ws', 'tasks', { title: 'Bir' })
    await createRecord(db, 'ws', 'tasks', { title: 'İki' })
    await wait(80)
    expect(calls).toEqual(['pull', 'push'])
  })

  it('kendi dürtmemizi yok sayar, başkasınınkinde çeker; çevrimiçi olunca hemen eşitler', async () => {
    const db = freshDb()
    const { engine, calls } = fakeEngine()
    let send: ((poke: PokeEvent) => void) | null = null
    detach = attachSyncTriggers({
      engine,
      db,
      clientId: 'ben',
      timing,
      connectPokes: (onPoke) => {
        send = onPoke
        return () => {}
      },
    })
    send!({ workspaceId: 'ws', rev: 2, clientId: 'ben' })
    await wait(30)
    expect(calls).toEqual(['pull'])
    send!({ workspaceId: 'ws', rev: 3, clientId: 'baskasi' })
    send!({ workspaceId: 'ws', rev: 4, clientId: null })
    await wait(30)
    expect(calls).toEqual(['pull', 'pull'])
    window.dispatchEvent(new Event('online'))
    expect(calls.at(-1)).toBe('now')
  })

  it('çözülünce dinleyiciler kalkar', async () => {
    const db = freshDb()
    const { engine, calls } = fakeEngine()
    const disconnect = vi.fn()
    attachSyncTriggers({ engine, db, clientId: 'ben', timing, connectPokes: () => disconnect })()
    await createRecord(db, 'ws', 'tasks', { title: 'Bir' })
    window.dispatchEvent(new Event('online'))
    await wait(60)
    expect(calls).toEqual(['pull'])
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
