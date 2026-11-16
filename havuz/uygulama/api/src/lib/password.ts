/**
 * Parola özeti: Node'un yerleşik scrypt'i. Özet dizgisi parametreleri taşır: `scrypt$N$r$p$tuz$özet`
 * (tuz ve özet base64url). Böylece parametre yükseltildiğinde eski özetler doğrulanmaya devam eder ve kullanıcı
 * bir sonraki girişinde yeni parametrelerle yeniden özetlenir (`needsRehash`).
 *
 * Seçimler (gerekçe: docs/GUVENLIK.md → "Parola özeti"):
 *  - Parametre: N=2^14, r=8, p=5 → özet başına ~16 MiB bellek. Aynı anda en çok 2 özet hesaplanır (bellek tavanı).
 *  - Parola önce Unicode NFC'ye çevrilir: "ş" iki farklı bayt dizisiyle yazılabilir; cihaz değişince giriş bozulmasın.
 *  - Karşılaştırma sabit zamanlıdır (timingSafeEqual).
 *
 * Genişletme: parametreyi yükseltmek için config.ts → DEFAULT_PASSWORD_HASH değiştirilir; başka bir şey gerekmez.
 */
import { scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { PasswordHashParams } from '../config.ts'
import type { RandomSource } from './random.ts'

const KEY_LENGTH = 32
const SALT_BYTES = 16
const PREFIX = 'scrypt'

function scryptAsync(password: string, salt: Uint8Array, params: PasswordHashParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    // Varsayılan bellek sınırı (32 MiB) N=2^15 için yetmez; parametreden hesaplanır.
    maxmem: 256 * params.N * params.r + 1024 * 1024,
  }
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

interface ParsedHash {
  readonly params: PasswordHashParams
  readonly salt: Buffer
  readonly key: Buffer
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 1 && (value & (value - 1)) === 0
}

/** Özet dizgisini çözer; biçim bozuksa `null`. */
export function parsePasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return null
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (!isPowerOfTwo(N) || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return null
  const salt = Buffer.from(parts[4] ?? '', 'base64url')
  const key = Buffer.from(parts[5] ?? '', 'base64url')
  if (salt.length < 8 || key.length !== KEY_LENGTH) return null
  return { params: { N, r, p }, salt, key }
}

/** Aynı anda en çok `max` işi koşturan basit kuyruk (bellek tavanı için). */
class Semaphore {
  private active = 0
  private readonly waiting: (() => void)[] = []
  private readonly max: number

  constructor(max: number) {
    this.max = max
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, stored: string): Promise<boolean>
  /** Özet bugünkü parametrelerle değil mi (girişte yeniden özetlenmeli mi)? */
  needsRehash(stored: string): boolean
  /** Hesap yokken de aynı süreyi harcamak için sahte doğrulama (e-posta varlığı zamanlamadan sızmasın). */
  burn(password: string): Promise<void>
}

export function createPasswordHasher(
  params: PasswordHashParams,
  random: RandomSource,
  options: { maxConcurrent?: number } = {},
): PasswordHasher {
  const limiter = new Semaphore(options.maxConcurrent ?? 2)
  let dummy: Promise<string> | null = null

  const hash = (password: string) =>
    limiter.run(async () => {
      const salt = random.bytes(SALT_BYTES)
      const key = await scryptAsync(password, salt, params)
      const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
      return [PREFIX, params.N, params.r, params.p, encode(salt), encode(key)].join('$')
    })

  const verify = async (password: string, stored: string) => {
    const parsed = parsePasswordHash(stored)
    if (!parsed) return false
    const key = await limiter.run(() => scryptAsync(password, parsed.salt, parsed.params))
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key)
  }

  return {
    hash,
    verify,
    needsRehash(stored) {
      const parsed = parsePasswordHash(stored)
      if (!parsed) return true
      return parsed.params.N !== params.N || parsed.params.r !== params.r || parsed.params.p !== params.p
    },
    async burn(password) {
      dummy ??= hash('zamanlama-esitleme-icin-sahte-parola')
      await verify(password, await dummy)
    },
  }
}
