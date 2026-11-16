/**
 * Sunucunun giriş noktası: `npm run dev` / `npm start` bunu çalıştırır.
 *   1. `.env` varsa okur (çalışma klasörü ya da havuz/uygulama/), ayarı doğrular (hatalıysa Türkçe listeyle ÇIKAR),
 *   2. veritabanını açar, bekleyen migrasyonları uygular, ADMIN_EMAILS'tekileri yönetici yapar,
 *   3. HTTP sunucusunu başlatır (varsayılan kapı 8310), saatte bir bakım işini koşar,
 *   4. SIGINT/SIGTERM'de düzgün kapanır: yeni bağlantı almaz, anlık akışları kapatır, işleri bekler, veritabanını kapatır.
 *
 * Genişletme: açılışta bir kez yapılacak yeni iş (ör. önbellek ısıtma) 2. adımdan sonra eklenir.
 */
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { ConfigError, configWarnings, loadConfig, loadDotEnv, type Config } from './config.ts'
import { openDatabase } from './db/database.ts'
import { runMigrations } from './db/migrate.ts'
import { createLogger, errorFields } from './lib/logger.ts'
import { cryptoRandom, systemClock } from './lib/random.ts'
import { createMailer } from './mail/mailer.ts'
import { runMaintenance } from './maintenance.ts'
import { promoteAdmins } from './modules/auth/userRepo.ts'

const MAINTENANCE_INTERVAL_MS = 60 * 60_000
const SHUTDOWN_TIMEOUT_MS = 10_000

function readConfig(): Config {
  loadDotEnv()
  try {
    return loadConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }
    throw error
  }
}

function main(): void {
  const config = readConfig()
  const logger = createLogger({ level: config.logLevel })
  for (const warning of configWarnings(config)) logger.warn(warning)

  const db = openDatabase(config.databasePath)
  const migrated = runMigrations(db)
  if (migrated.applied.length > 0) logger.info('migrasyonlar uygulandı', { files: migrated.applied.join(', ') })
  const promoted = promoteAdmins(db, config.adminEmails, systemClock.now().toISOString())
  if (promoted > 0) logger.info('ADMIN_EMAILS: kullanıcılar yönetici yapıldı', { count: promoted })

  const mailer = createMailer(config, { db, clock: systemClock, logger })
  const server = createApp({ config, db, clock: systemClock, random: cryptoRandom, mailer, logger })
  if (!server.servesWeb) logger.info('web uygulaması sunulmuyor (WEB_DIST klasörü hazır değil); yalnız API çalışıyor')

  const http = serve({ fetch: server.app.fetch, port: config.port, hostname: config.host }, (info) => {
    logger.info('sunucu hazır', { url: `http://${config.host}:${info.port}`, port: info.port, env: config.env })
  })
  http.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        `Kapı ${config.port} kullanımda: başka bir sunucu açık olabilir. Kapatın ya da PORT=… ile başka kapı seçin.`,
      )
    } else {
      logger.error('sunucu başlatılamadı', errorFields(error))
    }
    process.exit(1)
  })

  const maintain = () => {
    try {
      logger.info('bakım', { ...runMaintenance(server.ctx) })
    } catch (error) {
      logger.error('bakım başarısız', errorFields(error))
    }
  }
  maintain()
  const maintenance = setInterval(maintain, MAINTENANCE_INTERVAL_MS)
  maintenance.unref()

  let closing = false
  const shutdown = (signal: string) => {
    if (closing) return
    closing = true
    logger.info('kapanıyor', { signal })
    clearInterval(maintenance)
    setTimeout(() => {
      logger.warn('kapanış zaman aşımına uğradı; zorla çıkılıyor')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS).unref()
    http.close(() => {
      void server.close().finally(() => {
        db.close()
        logger.info('kapandı')
        process.exit(0)
      })
    })
    server.ctx.hub.closeAll() // açık SSE akışları bitmeden http.close tamamlanmaz
    if ('closeIdleConnections' in http) http.closeIdleConnections()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
