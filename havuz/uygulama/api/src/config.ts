/**
 * Ayarlar: ortam değişkenlerini Zod ile doğrular ve tek bir `Config` nesnesine çevirir.
 * Eksik ya da yanlış ayarda sunucu BAŞLAMAZ; Türkçe ve ne yapılacağını söyleyen bir hata listesi basılır.
 * Ortam değişkenlerinin dökümü: docs/YAYINLAMA.md → "Ortam değişkenleri" (kopyalanabilir .env örneği orada).
 *
 * Genişletme: yeni ayar için TARIFLER.md → "Yeni ayar ekle": (1) `envSchema`'ya alan, (2) `Config`'e karşılığı,
 * (3) `buildConfig` içinde dönüşüm, (4) docs/YAYINLAMA.md tablosu ve .env örneği, (5) test/config.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emailSchema } from '@uygulama/shared'
import { z } from 'zod'

export const APP_ENVS = ['development', 'production', 'test'] as const
export type AppEnv = (typeof APP_ENVS)[number]

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/** scrypt parametreleri. Gerekçe: docs/GUVENLIK.md → "Parola özeti". */
export interface PasswordHashParams {
  readonly N: number
  readonly r: number
  readonly p: number
}

/** OWASP'ın eşdeğer scrypt seçeneklerinden en az bellek isteyeni: özet başına ~16 MiB, ~0,15 sn. */
export const DEFAULT_PASSWORD_HASH: PasswordHashParams = { N: 2 ** 14, r: 8, p: 5 }

export type MailConfig =
  | { readonly provider: 'console'; readonly from: string }
  | { readonly provider: 'http'; readonly from: string; readonly url: string; readonly apiKey: string }

export interface Config {
  readonly env: AppEnv
  readonly isProduction: boolean
  readonly version: string
  readonly port: number
  readonly host: string
  readonly databasePath: string
  /** Web uygulamasının herkese açık adresi (e-posta bağlantıları ve köken denetimi). Sonunda `/` yok. */
  readonly appUrl: string
  readonly appOrigin: string
  /** Başka kökenden gelen istemciler için CORS izin listesi (varsayılan boş = kapalı). */
  readonly allowedOrigins: readonly string[]
  /** Önümüzdeki güvenilen vekil sayısı (0 = yok). Gerçek IP X-Forwarded-For'un sağından bu kadar içeriden okunur. */
  readonly trustProxy: number
  readonly adminEmails: readonly string[]
  readonly sessionTtlDays: number
  readonly mail: MailConfig
  /** Derlenmiş web uygulamasının klasörü; varsa aynı kökenden sunulur. */
  readonly webDist: string | null
  readonly logLevel: LogLevel
  readonly rateLimit: boolean
  // ── Ortam değişkeni olmayan, koddan gelen ayarlar (testler küçültür) ──
  readonly passwordHash: PasswordHashParams
  readonly syncPageSize: number
  readonly sseHeartbeatMs: number
  readonly maxSseConnectionsPerUser: number
  readonly resetTokenTtlMinutes: number
  readonly inviteTtlDays: number
}

export class ConfigError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      [
        'Ayarlar geçersiz; sunucu başlatılmadı. Düzeltilmesi gerekenler:',
        ...problems.map((problem) => `  - ${problem}`),
        'Ayrıntı: docs/YAYINLAMA.md → "Ortam değişkenleri".',
      ].join('\n'),
    )
    this.name = 'ConfigError'
    this.problems = problems
  }
}

const API_DIR = fileURLToPath(new URL('../', import.meta.url))
const DEFAULT_WEB_DIST = resolve(API_DIR, '../web/dist')

function readVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(resolve(API_DIR, 'package.json'), 'utf8'))
  const version = (raw as { version?: unknown }).version
  return typeof version === 'string' ? version : '0.0.0'
}

const httpUrl = (message: string) => z.url({ protocol: /^https?$/, error: message })

const envSchema = z.object({
  NODE_ENV: z.enum(APP_ENVS, { error: 'development, production ya da test olmalı.' }).default('development'),
  PORT: z
    .string()
    .regex(/^\d{1,5}$/, '0–65535 arası bir sayı olmalı (ör. PORT=8310).')
    .transform(Number)
    .refine((value) => value <= 65535, '0–65535 arası bir sayı olmalı (ör. PORT=8310).')
    .optional(),
  HOST: z.string().optional(),
  DATABASE_PATH: z.string().optional(),
  APP_URL: httpUrl('http(s) ile başlayan bir adres olmalı (ör. APP_URL=https://ornek.com).').optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .regex(/^(true|false|\d{1,2})$/, 'Önünüzdeki vekil sayısı olmalı: 0, 1, 2… (ya da true = 1, false = 0).')
    .optional(),
  ADMIN_EMAILS: z.string().optional(),
  SESSION_TTL_DAYS: z
    .string()
    .regex(/^\d{1,3}$/, '1–365 arası gün sayısı olmalı (ör. SESSION_TTL_DAYS=30).')
    .transform(Number)
    .refine((value) => value >= 1 && value <= 365, '1–365 arası gün sayısı olmalı (ör. SESSION_TTL_DAYS=30).')
    .optional(),
  MAIL_PROVIDER: z.enum(['console', 'http'], { error: 'console ya da http olmalı.' }).default('console'),
  MAIL_FROM: z.string().optional(),
  MAIL_HTTP_URL: httpUrl('E-posta sağlayıcısının https adresi olmalı.').optional(),
  MAIL_HTTP_KEY: z.string().optional(),
  WEB_DIST: z.string().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: 'debug, info, warn ya da error olmalı.' }).optional(),
  RATE_LIMIT: z.enum(['on', 'off'], { error: 'on ya da off olmalı.' }).default('on'),
})

type RawEnv = z.output<typeof envSchema>

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

function tryUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLocalHost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
}

/** Ayrıştırılmış değişkenler arası kurallar. Her sorun "DEĞİŞKEN: ne yapılmalı" biçimindedir. */
function crossCheck(raw: RawEnv, problems: string[]): void {
  const production = raw.NODE_ENV === 'production'
  if (production && !raw.APP_URL) {
    problems.push(
      'APP_URL: üretimde zorunludur. Uygulamanın herkese açık adresini yazın (ör. APP_URL=https://ornek.com).',
    )
  }
  if (production && raw.APP_URL) {
    const url = new URL(raw.APP_URL)
    if (url.protocol !== 'https:' && !isLocalHost(url)) {
      problems.push('APP_URL: üretimde https ile başlamalı (oturum çerezi yalnız HTTPS üzerinde güvenlidir).')
    }
  }
  if (production && raw.RATE_LIMIT === 'off') {
    problems.push('RATE_LIMIT: üretimde kapatılamaz. Satırı silin ya da RATE_LIMIT=on yazın.')
  }
  for (const origin of list(raw.ALLOWED_ORIGINS)) {
    if (origin === '*') {
      problems.push('ALLOWED_ORIGINS: * kullanılamaz; izin verilecek kökenleri virgülle tek tek yazın.')
      continue
    }
    const parsed = tryUrl(origin)
    if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) {
      problems.push(
        `ALLOWED_ORIGINS: "${origin}" geçersiz. Yalnız köken yazın, sonda / olmadan (ör. https://ornek.com).`,
      )
    }
  }
  for (const email of list(raw.ADMIN_EMAILS)) {
    if (!emailSchema.safeParse(email).success) problems.push(`ADMIN_EMAILS: "${email}" geçerli bir e-posta değil.`)
  }
  if (raw.MAIL_PROVIDER === 'http') {
    if (!raw.MAIL_HTTP_URL)
      problems.push('MAIL_HTTP_URL: MAIL_PROVIDER=http iken zorunludur (sağlayıcının gönderim adresi).')
    if (!raw.MAIL_HTTP_KEY)
      problems.push('MAIL_HTTP_KEY: MAIL_PROVIDER=http iken zorunludur (sağlayıcının API anahtarı).')
    if (!raw.MAIL_FROM)
      problems.push('MAIL_FROM: MAIL_PROVIDER=http iken zorunludur (ör. MAIL_FROM="Uygulama <bildirim@ornek.com>").')
  }
}

function trustProxyHops(value: string | undefined): number {
  if (value === undefined || value === 'false') return 0
  if (value === 'true') return 1
  return Number(value)
}

function buildMail(raw: RawEnv): MailConfig {
  const from = raw.MAIL_FROM ?? 'Uygulama <bildirim@localhost>'
  if (raw.MAIL_PROVIDER === 'http') {
    return { provider: 'http', from, url: raw.MAIL_HTTP_URL ?? '', apiKey: raw.MAIL_HTTP_KEY ?? '' }
  }
  return { provider: 'console', from }
}

function buildConfig(raw: RawEnv, cwd: string): Config {
  const production = raw.NODE_ENV === 'production'
  const appUrl = (raw.APP_URL ?? 'http://localhost:5310').replace(/\/+$/, '')
  return {
    env: raw.NODE_ENV,
    isProduction: production,
    version: readVersion(),
    port: raw.PORT ?? 8310,
    host: raw.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    databasePath:
      raw.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(cwd, raw.DATABASE_PATH ?? '.data/uygulama.db'),
    appUrl,
    appOrigin: new URL(appUrl).origin,
    allowedOrigins: list(raw.ALLOWED_ORIGINS),
    trustProxy: trustProxyHops(raw.TRUST_PROXY),
    adminEmails: list(raw.ADMIN_EMAILS).map((email) => emailSchema.parse(email)),
    sessionTtlDays: raw.SESSION_TTL_DAYS ?? 30,
    mail: buildMail(raw),
    webDist: raw.WEB_DIST ? resolve(cwd, raw.WEB_DIST) : DEFAULT_WEB_DIST,
    logLevel: raw.LOG_LEVEL ?? (raw.NODE_ENV === 'test' ? 'warn' : 'info'),
    rateLimit: raw.RATE_LIMIT === 'on',
    passwordHash: DEFAULT_PASSWORD_HASH,
    syncPageSize: 500,
    sseHeartbeatMs: 25_000,
    maxSseConnectionsPerUser: 10,
    resetTokenTtlMinutes: 60,
    inviteTtlDays: 7,
  }
}

/**
 * Ortam değişkenlerinden ayarı kurar. Hata varsa HEPSİNİ birlikte bildiren `ConfigError` fırlatır.
 * Boş değerli değişken (`APP_URL=`) hiç yazılmamış sayılır.
 */
export function loadConfig(env: Record<string, string | undefined>, cwd: string = process.cwd()): Config {
  const cleaned: Record<string, string> = {}
  for (const key of Object.keys(envSchema.shape)) {
    const value = env[key]?.trim()
    if (value) cleaned[key] = value
  }
  const parsed = envSchema.safeParse(cleaned)
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`))
  }
  const problems: string[] = []
  crossCheck(parsed.data, problems)
  if (problems.length > 0) throw new ConfigError(problems)
  return buildConfig(parsed.data, cwd)
}

/**
 * `.env` dosyasını okur (varsa): önce çalışma klasörü, sonra uygulama kökü (`havuz/uygulama/.env`).
 * Ortamda zaten tanımlı değişkenlerin üstüne yazmaz. Okunan dosyanın yolunu döndürür.
 */
export function loadDotEnv(cwd: string = process.cwd()): string | null {
  for (const candidate of [resolve(cwd, '.env'), resolve(API_DIR, '../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate)
      return candidate
    }
  }
  return null
}

/** Başlamayı engellemeyen ama bilinmesi gereken durumlar (günlüğe uyarı olarak yazılır). */
export function configWarnings(config: Config): string[] {
  const warnings: string[] = []
  if (config.isProduction && config.mail.provider === 'console') {
    warnings.push(
      'MAIL_PROVIDER=console: e-postalar GÖNDERİLMİYOR (yalnız mail_outbox tablosuna yazılıyor). Şifre sıfırlama çalışmaz; MAIL_PROVIDER=http ayarlayın.',
    )
  }
  if (config.isProduction && !config.appUrl.startsWith('https://')) {
    warnings.push('APP_URL https değil: yalnız yerel deneme için uygundur.')
  }
  if (config.isProduction && config.trustProxy === 0) {
    warnings.push(
      'TRUST_PROXY=0: bir ters vekilin (Render, Fly, nginx…) arkasındaysanız hız sınırı bütün kullanıcıları tek IP sayar. Vekil varsa TRUST_PROXY=1 yazın.',
    )
  }
  return warnings
}
