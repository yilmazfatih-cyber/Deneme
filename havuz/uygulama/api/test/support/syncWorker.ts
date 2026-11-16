/**
 * Eşzamanlılık testinin işçisi: AYRI bir iş parçacığında, AYRI bir veritabanı bağlantısıyla aynı dosyaya
 * art arda eşitleme yazar ve aldığı rev'leri ana iş parçacığına bildirir (test/concurrency.test.ts).
 * Vitest dönüştürmesi olmadan, Node'un yerleşik TypeScript çalıştırmasıyla koşar.
 *
 * Genişletme: başka bir eşzamanlılık senaryosu için `workerData`'ya alan ekleyin.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { ENTITIES, PROTOCOL_VERSION } from '@uygulama/shared'
import { openDatabase } from '../../src/db/database.ts'
import { systemClock } from '../../src/lib/random.ts'
import { runSync } from '../../src/modules/sync/service.ts'

interface Job {
  readonly dbPath: string
  readonly userId: string
  readonly workspaceId: string
  readonly clientId: string
  readonly count: number
}

const job = workerData as Job
const db = openDatabase(job.dbPath, { busyTimeoutMs: 20_000 })
const revs: number[] = []
try {
  for (let mid = 1; mid <= job.count; mid++) {
    const outcome = runSync({ db, clock: systemClock, registry: ENTITIES, pageSize: 1 }, job.userId, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: job.clientId,
      cursors: {},
      mutations: [
        {
          mid,
          workspaceId: job.workspaceId,
          collection: 'tasks',
          recordId: `${job.clientId}-${mid}`,
          at: new Date().toISOString(),
          op: 'put',
          data: { title: `${job.clientId} ${mid}` },
        },
      ],
    })
    const touched = outcome.response.touched[0]
    if (!touched) throw new Error('Kayıt yazılamadı')
    revs.push(touched.rev)
  }
  parentPort?.postMessage({ ok: true, revs })
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
} finally {
  db.close()
}
