/**
 * Uygulama bağlamı: modüllerin ihtiyaç duyduğu her şey tek nesnede. `createApp(deps)` dışarıdan gelen
 * bağımlılıkları (veritabanı, saat, rastgele kaynak, postacı, günlük, ayar) alır, ortak servisleri
 * (parola özeti, arka plan işleri, olay merkezi, hız sınırı, denetim günlüğü) kurar ve modüllere bunu verir.
 *
 * Testler `Deps`'i kendisi kurar: bellek içi veritabanı, ileri sarılabilir saat, sahte postacı (test/support).
 *
 * Genişletme: bütün modüllerin kullanacağı yeni bir servis gerekiyorsa `AppContext`'e alan ekleyip
 * `createContext` içinde kurun. Tek modülün işi olan şeyi buraya koymayın.
 */
import { ENTITIES, type EntityRegistry } from '@uygulama/shared'
import type { Config } from './config.ts'
import type { Db } from './db/database.ts'
import { RateLimiter } from './http/rateLimit.ts'
import { createBackgroundJobs, type BackgroundJobs } from './lib/background.ts'
import type { Logger } from './lib/logger.ts'
import { createPasswordHasher, type PasswordHasher } from './lib/password.ts'
import type { Clock, RandomSource } from './lib/random.ts'
import type { Mailer } from './mail/mailer.ts'
import { createAuditLog, type AuditLog } from './modules/audit/repo.ts'
import { EventHub } from './modules/events/hub.ts'

/** Dışarıdan verilen bağımlılıklar. */
export interface Deps {
  readonly config: Config
  readonly db: Db
  readonly clock: Clock
  readonly random: RandomSource
  readonly mailer: Mailer
  readonly logger: Logger
  /** Eşitlenen varlıklar (varsayılan: shared → ENTITIES). */
  readonly registry?: EntityRegistry
}

/** Modüllere verilen bağlam: bağımlılıklar + ortak servisler. */
export interface AppContext extends Deps {
  /** Uygulamanın kurulduğu an (ölçümlerdeki çalışma süresi için). */
  readonly startedAt: Date
  readonly registry: EntityRegistry
  readonly hasher: PasswordHasher
  readonly jobs: BackgroundJobs
  readonly hub: EventHub
  readonly limiter: RateLimiter
  readonly audit: AuditLog
}

export function createContext(deps: Deps): AppContext {
  return {
    ...deps,
    startedAt: deps.clock.now(),
    registry: deps.registry ?? ENTITIES,
    hasher: createPasswordHasher(deps.config.passwordHash, deps.random),
    jobs: createBackgroundJobs(deps.logger),
    hub: new EventHub({ maxPerUser: deps.config.maxSseConnectionsPerUser }),
    limiter: new RateLimiter(deps.clock, { enabled: deps.config.rateLimit }),
    audit: createAuditLog(deps.db, deps.clock),
  }
}
