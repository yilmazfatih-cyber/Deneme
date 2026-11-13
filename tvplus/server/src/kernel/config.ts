import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REGION } from '../../../shared/constants'

export interface AppConfig {
  host: string
  port: number
  /** tvplus/ kök klasörü */
  rootDir: string
  contentDir: string
  /** Kalıcı durum (JSON), önbellekler. Git'e girmez. */
  dataDir: string
  /** Yerelde paketlenmiş medya (npm run package:title). Git'e girmez. */
  mediaDir: string
  webDistDir: string
  /** web/public — marka görselleri (logo, kanal logoları, avatarlar) */
  publicDir: string
  /** Ana gizli anahtar; alt anahtarlar deriveKey ile türetilir. */
  secret: string
  region: string
  buildId: string
  isTest: boolean
  /** true → dış ağa çıkılmaz (testler); uzak kaynak gerektiren işler hızlıca yedeğe düşer. */
  offline: boolean
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug'
  /**
   * /api/debug/* uçlarına erişim: 'member' (varsayılan) giriş yapmış üye ister, 'open' herkese açık (yalnız testler),
   * 'off' uçları kapatır. Bu uçlar CDN düğümlerini yavaşlatıp kapatabildiği için oturumsuz açık bırakılmaz.
   */
  debugAccess: 'open' | 'member' | 'off'
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Gizli anahtar: TVP_SECRET ortam değişkeni, yoksa .data/secret dosyasında saklanan rastgele değer. */
function loadSecret(dataDir: string): string {
  if (process.env.TVP_SECRET) return process.env.TVP_SECRET
  const file = join(dataDir, 'secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const s = randomBytes(32).toString('hex')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(file, s, { mode: 0o600 })
  return s
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = overrides.dataDir ?? process.env.TVP_DATA_DIR ?? join(ROOT, '.data')
  mkdirSync(dataDir, { recursive: true })
  return {
    // Varsayılan yalnız bu makine; telefondan denemek için HOST=0.0.0.0 verin.
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 8787),
    rootDir: ROOT,
    contentDir: process.env.TVP_CONTENT_DIR ?? join(ROOT, 'content'),
    mediaDir: process.env.TVP_MEDIA_DIR ?? join(ROOT, 'media'),
    webDistDir: join(ROOT, 'web', 'dist'),
    publicDir: join(ROOT, 'web', 'public'),
    secret: overrides.secret ?? loadSecret(dataDir),
    region: REGION,
    buildId: process.env.TVP_BUILD_ID ?? 'dev',
    isTest: false,
    offline: process.env.TVP_OFFLINE === '1',
    logLevel: (process.env.TVP_LOG_LEVEL as AppConfig['logLevel']) ?? 'info',
    debugAccess: process.env.TVP_DEBUG === 'off' ? 'off' : process.env.TVP_DEBUG === 'open' ? 'open' : 'member',
    ...overrides,
    dataDir,
  }
}

/** Alt anahtar türetme: her kullanım kendi etiketini verir ('cookie', 'authurl', 'oca-url', 'image-url', 'msl-master', …). */
export function deriveKey(config: AppConfig, label: string): Buffer {
  return createHmac('sha256', config.secret).update(`tvplus|${label}`).digest()
}
