/**
 * Betikler gerçek süreç olarak, geçici bir veritabanıyla koşar: migrate, seed, create-admin, backup.
 * (Gerçek scrypt parametreleriyle özetlendiği için her biri ~0,2–0,5 sn sürer.)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database.ts'

const API_DIR = fileURLToPath(new URL('../', import.meta.url))
let dir: string
let dbPath: string

function run(script: string, args: string[] = []): { code: number | null; out: string } {
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', `scripts/${script}.ts`, ...args],
    {
      cwd: API_DIR,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: dbPath },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

function query<T>(sql: string, ...params: string[]): T[] {
  const db = openDatabase(dbPath)
  try {
    return db.all<T>(sql, ...params)
  } finally {
    db.close()
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'uygulama-betik-'))
  dbPath = join(dir, 'veri.db')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('betikler', () => {
  it('migrate: boş veritabanına bütün migrasyonları uygular, ikinci kez "güncel" der', () => {
    const first = run('migrate')
    expect(first.code).toBe(0)
    expect(first.out).toContain('uygulandı: 0001_identity.sql')
    const second = run('migrate')
    expect(second.out).toContain('Bekleyen migrasyon yok')
  })

  it('seed: kullanıcı + örnek veri açar; yeniden çalışınca yalnız şifreyi günceller; zayıf şifreyi reddeder', () => {
    const seeded = run('seed', ['--email', 'tohum@ornek.com', '--password', 'kuzey-isiklari-uzun-7'])
    expect(seeded.code).toBe(0)
    expect(seeded.out).toContain('E-posta: tohum@ornek.com')
    expect(seeded.out).toContain('Şifre:   kuzey-isiklari-uzun-7')
    expect(query('SELECT collection FROM records ORDER BY rev')).toEqual([
      { collection: 'lists' },
      { collection: 'tasks' },
      { collection: 'tasks' },
      { collection: 'tasks' },
    ])
    const again = run('seed', ['--email', 'tohum@ornek.com', '--password', 'baska-uzun-sifre-22'])
    expect(again.out).toContain('şifresi güncellendi')
    expect(query('SELECT id FROM records')).toHaveLength(4)
    const weak = run('seed', ['--email', 'zayif@ornek.com', '--password', 'galatasaray1905'])
    expect(weak.code).toBe(1)
    expect(weak.out).toContain('--password: Bu şifre çok yaygın')
  })

  it('create-admin: var olanı yönetici yapar, olmayanı yönetici olarak açar; e-posta yoksa kullanım yazar', () => {
    expect(run('create-admin', ['--email', 'tohum@ornek.com']).out).toContain('artık yönetici')
    const created = run('create-admin', ['--email', 'patron@ornek.com'])
    expect(created.code).toBe(0)
    expect(created.out).toMatch(/Şifre: {3}\S{16}/)
    expect(query<{ email: string; role: string }>('SELECT email, role FROM users ORDER BY email')).toEqual([
      { email: 'patron@ornek.com', role: 'admin' },
      { email: 'tohum@ornek.com', role: 'admin' },
    ])
    const usage = run('create-admin')
    expect(usage.code).toBe(1)
    expect(usage.out).toContain('Kullanım: npm run create-admin')
  })

  it('backup: tutarlı ve bütünlüğü denetlenmiş kopya alır; var olan hedefin üstüne yazmaz', () => {
    const target = join(dir, 'yedek', 'kopya.db')
    const backup = run('backup', [target])
    expect(backup.code).toBe(0)
    expect(backup.out).toContain('bütünlük: ok')
    expect(existsSync(target)).toBe(true)
    const copy = openDatabase(target)
    expect(copy.all('SELECT email FROM users ORDER BY email')).toHaveLength(2)
    copy.close()
    const again = run('backup', [target])
    expect(again.code).toBe(1)
    expect(again.out).toContain('Hedef dosya zaten var')
  })
})
