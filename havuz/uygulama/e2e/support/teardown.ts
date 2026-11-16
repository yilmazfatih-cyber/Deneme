/**
 * Uçtan uca testler bitince geçici veritabanını (api/.data/e2e-….db ve yan dosyaları) siler.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

export default function teardown(): void {
  const db = process.env.E2E_DB
  if (!db) return
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(join(import.meta.dirname, '..', '..', 'api', `${db}${suffix}`), { force: true })
}
