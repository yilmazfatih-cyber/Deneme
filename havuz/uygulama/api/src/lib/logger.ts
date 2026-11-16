/**
 * Yapılandırılmış günlük: her satır tek bir JSON nesnesidir (`{"time":…,"level":"info","msg":"istek",…}`).
 * Barındırma servisleri (Render, Fly, Docker) bu satırları olduğu gibi toplar ve aranabilir kılar.
 *
 * YASAK: parola, belirteç (token), çerez, e-posta adresi ya da istek gövdesi günlüğe yazılmaz.
 * Güvenlik testi (test/security.test.ts) bütün akışlardan sonra günlükte bunların geçmediğini denetler.
 *
 * Genişletme: yeni alan eklerken değerin kişisel veri olmadığından emin olun; kullanıcıyı `userId` ile anın.
 */
import type { LogLevel } from '../config.ts'

export type LogFields = Record<string, string | number | boolean | null | undefined>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogEntry extends LogFields {
  readonly time: string
  readonly level: LogLevel
  readonly msg: string
}

/** Satırları `write` işlevine veren günlükçü. `now` test için dışarıdan verilebilir. */
export function createLogger(options: { level: LogLevel; write?: (line: string) => void; now?: () => Date }): Logger {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const now = options.now ?? (() => new Date())
  const min = ORDER[options.level]
  const log =
    (level: LogLevel) =>
    (msg: string, fields: LogFields = {}) => {
      if (ORDER[level] < min) return
      const entry: LogEntry = { time: now().toISOString(), level, msg, ...fields }
      write(JSON.stringify(entry))
    }
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') }
}

/** Testler için: satırları bellekte tutar. */
export function createMemoryLogger(level: LogLevel = 'debug'): Logger & { readonly lines: string[] } {
  const lines: string[] = []
  const logger = createLogger({ level, write: (line) => lines.push(line) })
  return Object.assign(logger, { lines })
}

/** Hata nesnesini günlük alanlarına çevirir (yığın izi dahil; ileti kullanıcı verisi içermemeli). */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) return { error: error.name, detail: error.message, stack: error.stack }
  return { error: 'unknown', detail: String(error) }
}
