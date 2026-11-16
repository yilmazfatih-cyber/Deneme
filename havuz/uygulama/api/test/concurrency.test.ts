/**
 * Eşzamanlılık: iki AYRI bağlantı (iki iş parçacığı) aynı alana aynı anda eşitleme yazar.
 * `BEGIN IMMEDIATE` yazma kilidini baştan aldığı için işlemler sıraya girer: rev'ler çakışmaz, atlanmaz,
 * alanın sayacı toplam yazma sayısına eşit olur. (Tek bağlantıda node:sqlite zaten eşzamanlıdır; gerçek
 * yarış ancak ayrı bağlantılarla oluşur.)
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database.ts'
import { signUp } from './support/client.ts'
import { createTestServer, type TestServer } from './support/harness.ts'

let t: TestServer | null = null
let dir: string | null = null
afterEach(async () => {
  await t?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function runWorker(data: Record<string, unknown>): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./support/syncWorker.ts', import.meta.url), {
      workerData: data,
      execArgv: ['--disable-warning=ExperimentalWarning'],
    })
    worker.once('message', (message: { ok: boolean; revs?: number[]; error?: string }) => {
      if (message.ok && message.revs) resolve(message.revs)
      else reject(new Error(message.error ?? 'işçi hatası'))
    })
    worker.once('error', reject)
  })
}

describe('eşzamanlı eşitleme', () => {
  it('iki bağlantıdan aynı anda gelen yazmaların rev değerleri çakışmaz ve kesintisizdir', async () => {
    dir = mkdtempSync(join(tmpdir(), 'uygulama-eszamanli-'))
    const dbPath = join(dir, 'test.db')
    t = createTestServer({ db: openDatabase(dbPath) })
    const ayse = await signUp(t)
    const count = 40
    const common = { dbPath, userId: ayse.user.id, workspaceId: ayse.personalWorkspaceId, count }
    const [first, second] = await Promise.all([
      runWorker({ ...common, clientId: 'isci-a' }),
      runWorker({ ...common, clientId: 'isci-b' }),
    ])
    const all = [...(first ?? []), ...(second ?? [])].toSorted((a, b) => a - b)
    expect(all).toEqual(Array.from({ length: count * 2 }, (_, index) => index + 1))
    expect(first).toEqual((first ?? []).toSorted((a, b) => a - b))
    const workspace = t.db.get<{ rev: number }>('SELECT rev FROM workspaces WHERE id = ?', ayse.personalWorkspaceId)
    expect(workspace?.rev).toBe(count * 2)
    const records = t.db.get<{ total: number; distinct_revs: number }>(
      'SELECT count(*) AS total, count(DISTINCT rev) AS distinct_revs FROM records WHERE workspace_id = ?',
      ayse.personalWorkspaceId,
    )
    expect(records).toEqual({ total: count * 2, distinct_revs: count * 2 })
  })
})
