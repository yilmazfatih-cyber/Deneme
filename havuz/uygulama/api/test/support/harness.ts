/**
 * Test düzeneği: her test kendi bellek içi veritabanıyla, ileri sarılabilir saatle ve bellek içi günlükle
 * yepyeni bir uygulama kurar. Ağ yoktur: istekler `app.request(...)` ile gider (bkz. client.ts).
 *
 * Parola özeti testlerde ucuz parametrelerle (N=16) hesaplanır; gerçek parametreler test/password.test.ts'te sınanır.
 *
 * Genişletme: yeni bir bağımlılık (ör. sahte dış servis) gerekiyorsa `createTestServer` seçeneklerine ekleyin.
 */
import { createApp, type ServerApp } from '../../src/app.ts'
import { loadConfig, type Config } from '../../src/config.ts'
import type { AppContext } from '../../src/context.ts'
import { openDatabase, type Db } from '../../src/db/database.ts'
import { runMigrations } from '../../src/db/migrate.ts'
import { createMemoryLogger } from '../../src/lib/logger.ts'
import { cryptoRandom, type Clock } from '../../src/lib/random.ts'
import { createMailer, type Mailer } from '../../src/mail/mailer.ts'

/** Her okunuşta 1 ms ilerleyen saat (kimlikler ve zamanlar sıralı olsun); `advance` ile ileri sarılır. */
export class FakeClock implements Clock {
  private ms: number

  constructor(start = '2026-11-16T09:00:00.000Z') {
    this.ms = Date.parse(start)
  }

  now(): Date {
    this.ms += 1
    return new Date(this.ms)
  }

  advance(ms: number): void {
    this.ms += ms
  }

  advanceDays(days: number): void {
    this.advance(days * 24 * 60 * 60_000)
  }
}

export const TEST_APP_URL = 'http://localhost:5310'

export const CHEAP_HASH = { N: 16, r: 1, p: 1 } as const

export interface TestServer {
  readonly server: ServerApp
  readonly ctx: AppContext
  readonly db: Db
  readonly clock: FakeClock
  readonly config: Config
  readonly logLines: string[]
  /** Arka plan işlerini (e-posta) bekler. */
  idle(): Promise<void>
  /** `mail_outbox`'taki e-postalar (eskiden yeniye). */
  outbox(): { to_address: string; subject: string; text_body: string; html_body: string | null }[]
  close(): Promise<void>
}

export interface TestServerOptions {
  /** Ortam değişkenleri (NODE_ENV=test ve APP_URL verilir; üstüne yazılabilir). */
  readonly env?: Record<string, string>
  /** Ortam değişkeni olmayan ayarlar (sayfa boyutu, nabız aralığı…). */
  readonly config?: Partial<Config>
  readonly db?: Db
  readonly mailer?: Mailer
  readonly clock?: FakeClock
}

export function testConfig(options: Pick<TestServerOptions, 'env' | 'config'> = {}): Config {
  const base = loadConfig({ NODE_ENV: 'test', APP_URL: TEST_APP_URL, LOG_LEVEL: 'debug', ...options.env })
  return { ...base, passwordHash: CHEAP_HASH, ...options.config }
}

export function createTestServer(options: TestServerOptions = {}): TestServer {
  const config = testConfig(options)
  const db = options.db ?? openDatabase(':memory:')
  const clock = options.clock ?? new FakeClock()
  runMigrations(db, { now: () => clock.now() })
  const logger = createMemoryLogger('debug')
  const mailer = options.mailer ?? createMailer(config, { db, clock, logger })
  const server = createApp({ config, db, clock, random: cryptoRandom, mailer, logger })
  return {
    server,
    ctx: server.ctx,
    db,
    clock,
    config,
    logLines: logger.lines,
    idle: () => server.ctx.jobs.idle(),
    outbox: () => db.all('SELECT to_address, subject, text_body, html_body FROM mail_outbox ORDER BY id'),
    async close() {
      await server.close()
      db.close()
    },
  }
}
