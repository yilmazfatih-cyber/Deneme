/**
 * Hata ayıklama bayrak geçersiz kılması: `x-tvplus-flags: home.top10=off;home.rowRanker=popularity`.
 * Yalnız `debugAccess === 'open'` ya da (`'member'` ve üye oturumu) iken dikkate alınır; tanınmayan anahtar/değer atlanır.
 * Geçersiz kılma olan istekte maruziyet yazılmaz (çağıranlar `overrides !== null` iken expose çağırmaz).
 */
import { HEADERS } from '../../../../shared/constants'
import { isFlagKey, isFlagValue } from '../../../../shared/experiments'
import type { AppConfig } from '../../kernel/config'
import type { Passport } from '../../kernel/context'

/** Başlık değerini çözer; geçerli çift yoksa null */
export function parseFlagsHeader(raw: unknown): Record<string, string> | null {
  const text = Array.isArray(raw) ? raw.join(';') : raw
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) return null
  const out: Record<string, string> = {}
  for (const part of text.split(/[;,]/)) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (isFlagKey(k) && isFlagValue(k, v)) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/** Hata ayıklama geçersiz kılmasına izin var mı */
export function flagOverridesAllowed(config: Pick<AppConfig, 'debugAccess'>, passport: Passport | undefined): boolean {
  if (config.debugAccess === 'open') return true
  return config.debugAccess === 'member' && passport?.membershipStatus === 'CURRENT_MEMBER'
}

/** İstekteki geçerli geçersiz kılmalar (izin yoksa ya da başlık yoksa null) */
export function flagOverridesOf(
  headers: Record<string, string | string[] | undefined> | undefined,
  config: Pick<AppConfig, 'debugAccess'>,
  passport: Passport | undefined,
): Record<string, string> | null {
  const raw = headers?.[HEADERS.FLAGS]
  if (raw === undefined || !flagOverridesAllowed(config, passport)) return null
  return parseFlagsHeader(raw)
}
