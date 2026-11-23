/**
 * Yedek saklama (scripts/retention.ts) ve geri yükleme tatbikatı (scripts/backup.ts + scripts/restore.ts):
 * betikler gerçek süreç olarak, geçici veritabanıyla koşar. Senaryo: kullanıcı A → yedek → kullanıcı B →
 * geri yükleme → A var, B yok; onaysız ve sunucu çalışırken reddedilir; bozuk yedek hiçbir şeye dokunmaz.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database.ts'
import { backupTime, expiredBackups } from '../scripts/retention.ts'

const API_DIR = fileURLToPath(new URL('../', import.meta.url))
let dir: string
let dbPath: string

function run(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
): { code: number | null; out: string } {
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', `scripts/${script}.ts`, ...args],
    {
      cwd: API_DIR,
      env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: dbPath, PORT: '1', ...env },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

/** Aynı süreçteki sahte sunucunun yanıt verebilmesi için olay döngüsünü kilitlemeyen çalıştırma. */
function runAsync(script: string, args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', `scripts/${script}.ts`, ...args],
      { cwd: API_DIR, env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: dbPath, ...env }, timeout: 60_000 },
      (error, stdout, stderr) => done({ code: error ? Number(error.code ?? 1) : 0, out: `${stdout}${stderr}` }),
    )
  })
}

function emails(): string[] {
  const db = openDatabase(dbPath)
  try {
    return db.all<{ email: string }>('SELECT email FROM users ORDER BY email').map((row) => row.email)
  } finally {
    db.close()
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'uygulama-yedek-'))
  dbPath = join(dir, 'veri', 'uygulama.db')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('yedek saklama kuralı (saf işlev)', () => {
  const now = new Date('2026-11-23T03:17:00Z')
  const name = (date: string) => `uygulama-${date}.db`

  it('ad kalıbı UTC zamana çevrilir; kalıp dışı ad null', () => {
    expect(backupTime(name('20261123-031700'))?.toISOString()).toBe('2026-11-23T03:17:00.000Z')
    expect(backupTime('kopya.db')).toBeNull()
    expect(backupTime(name('20261399-000000'))).toBeNull()
  })

  it('keepDays günden eskiler silinir; en yeni 3 yedek ve kalıp dışı dosyalar korunur', () => {
    const names = [name('20261122-031700'), name('20261101-031700'), name('20261001-031700'), 'elle-kopya.db']
    expect(expiredBackups(names, now, 14)).toEqual([])
    const more = [...names, name('20261121-031700'), name('20261120-031700')]
    expect(expiredBackups(more, now, 14).sort()).toEqual([name('20261001-031700'), name('20261101-031700')])
    expect(expiredBackups(more, now, 14, 5)).toEqual([])
  })
})

describe('yedek ve geri yükleme tatbikatı', () => {
  it('yedek --klasor/--sakla ile alınır; eski yedekler silinir, yeniler kalır', () => {
    expect(run('seed', ['--email', 'a@ornek.com', '--password', 'kuzey-isiklari-uzun-7']).code).toBe(0)
    const folder = join(dir, 'yedekler')
    expect(run('backup', ['--klasor', folder, '--sakla', '0']).out).toContain('--sakla 1 ya da daha büyük')
    mkdirSync(folder, { recursive: true })
    for (const old of ['20200101-000000', '20200102-000000', '20200103-000000', '20200104-000000'])
      writeFileSync(join(folder, `uygulama-${old}.db`), 'eski')
    const backup = run('backup', ['--klasor', folder, '--sakla', '14'])
    expect(backup.code).toBe(0)
    expect(backup.out).toContain('bütünlük: ok')
    expect(backup.out).toContain('Silindi (14 günden eski yedek): uygulama-20200101-000000.db')
    const left = readdirSync(folder)
      .filter((file) => file.endsWith('.db'))
      .sort()
    expect(left).toHaveLength(3) // yeni yedek + en yeni iki eski (en yeni 3 her zaman korunur)
    expect(left).toContain('uygulama-20200104-000000.db')
  })

  it('geri yükleme: onaysız ve sunucu çalışırken reddedilir; onaylıyla yedekteki hâle döner', async () => {
    const folder = join(dir, 'yedekler')
    const latest = readdirSync(folder)
      .filter((file) => file.endsWith('.db') && !file.startsWith('uygulama-2020'))
      .map((file) => join(folder, file))[0]
    expect(latest).toBeDefined()
    expect(run('seed', ['--email', 'b@ornek.com', '--password', 'kuzey-isiklari-uzun-7']).code).toBe(0)
    expect(emails()).toEqual(['a@ornek.com', 'b@ornek.com'])

    const unconfirmed = run('restore', [latest ?? ''])
    expect(unconfirmed.code).toBe(1)
    expect(unconfirmed.out).toContain('--onayla')

    const fake: Server = createServer((_request, response) => response.end('{"ok":true}'))
    await new Promise<void>((done) => fake.listen(0, '127.0.0.1', done))
    const port = String((fake.address() as { port: number }).port)
    const running = await runAsync('restore', [latest ?? '', '--onayla'], { PORT: port, HOST: '127.0.0.1' })
    await new Promise<void>((done) => fake.close(() => done()))
    expect(running.code).toBe(1)
    expect(running.out).toContain('Sunucu çalışıyor görünüyor')
    expect(emails()).toEqual(['a@ornek.com', 'b@ornek.com'])

    const restored = run('restore', [latest ?? '', '--onayla'])
    expect(restored.code).toBe(0)
    expect(restored.out).toContain('Geri yüklendi')
    expect(emails()).toEqual(['a@ornek.com'])
    expect(readdirSync(join(dir, 'veri')).some((file) => file.startsWith('uygulama.db.onceki-'))).toBe(true)
  })

  it('bozuk ya da yanlış dosya geri yüklenmez ve veritabanına dokunulmaz', () => {
    const broken = join(dir, 'bozuk.db')
    writeFileSync(broken, 'bu bir veritabanı değil')
    const result = run('restore', [broken, '--onayla'])
    expect(result.code).toBe(1)
    expect(result.out).toContain('Yedek')
    expect(emails()).toEqual(['a@ornek.com'])
    expect(existsSync(`${dbPath}.yukleniyor`)).toBe(false)
  })
})
