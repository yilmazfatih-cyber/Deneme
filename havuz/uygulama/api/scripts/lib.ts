/**
 * Betiklerin (migrate, seed, backup, create-admin) ortak yardımcıları: `.env` okuma, ayar, veritabanı ve
 * uygulama bağlamı kurma, Türkçe hata ile çıkış. Betikler sunucuyla AYNI ayarı kullanır (DATABASE_PATH vb.);
 * `npm run <betik> -w @uygulama/api` api/ klasöründen çalıştığı için göreli yollar oraya göredir.
 *
 * Genişletme: yeni betik için bu dosyadaki `openScriptContext` + `runScript` kalıbını kopyalayın ve
 * api/package.json → scripts'e satır ekleyin.
 */
import { ConfigError, loadConfig, loadDotEnv, type Config } from '../src/config.ts'
import { createContext, type AppContext } from '../src/context.ts'
import { openDatabase, type Db } from '../src/db/database.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { createLogger } from '../src/lib/logger.ts'
import { cryptoRandom, systemClock } from '../src/lib/random.ts'
import { createMailer } from '../src/mail/mailer.ts'

export class ScriptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptError'
  }
}

export function loadScriptConfig(): Config {
  loadDotEnv()
  return loadConfig(process.env)
}

export interface ScriptContext {
  readonly config: Config
  readonly db: Db
  readonly ctx: AppContext
}

/** Veritabanını açar, bekleyen migrasyonları uygular ve uygulama bağlamını kurar. */
export function openScriptContext(options: { migrate?: boolean } = {}): ScriptContext {
  const config = loadScriptConfig()
  const db = openDatabase(config.databasePath)
  if (options.migrate !== false) runMigrations(db)
  const logger = createLogger({ level: 'warn' })
  const mailer = createMailer(config, { db, clock: systemClock, logger })
  const ctx = createContext({ config, db, clock: systemClock, random: cryptoRandom, mailer, logger })
  return { config, db, ctx }
}

/** Betiği koşar; hatayı Türkçe ve yığın izi olmadan basar, çıkış kodunu 1 yapar. */
export function runScript(main: () => void | Promise<void>): void {
  Promise.resolve()
    .then(main)
    .catch((error: unknown) => {
      if (error instanceof ScriptError || error instanceof ConfigError) {
        process.stderr.write(`\n${error.message}\n`)
      } else {
        process.stderr.write(
          `\nBeklenmeyen hata: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        )
      }
      process.exitCode = 1
    })
}

export function print(line = ''): void {
  process.stdout.write(`${line}\n`)
}
