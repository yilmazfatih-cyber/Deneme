/**
 * İstek okuma yardımcıları: JSON gövdeyi ve yol parametrelerini şemayla doğrular.
 * Kural: işleyici gövdeyi HER ZAMAN `readJson(c, şema)` ile okur; `c.req.json()` doğrudan kullanılmaz.
 * `readJson`, `Content-Type: application/json` ister: bu, tarayıcı formlarıyla yapılan siteler arası
 * isteklerin (CSRF) önündeki duvarlardan biridir (formlar JSON gönderemez).
 *
 * Genişletme: sorgu dizgisi (?q=…) okumak için `readQuery` örneğine bakın.
 */
import { AppError, idSchema, issuesToDetails } from '@uygulama/shared'
import type { Context } from 'hono'
import type { z } from 'zod'
import { MESSAGES } from '../messages.ts'
import type { AppEnv } from './types.ts'

function validate<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const details = issuesToDetails(parsed.error)
    throw new AppError('validation', details[0]?.message, details)
  }
  return parsed.data
}

/** Gövdeyi JSON olarak okur ve şemayla doğrular. Hatalı istekte `validation` (alan ayrıntılarıyla) fırlatır. */
export async function readJson<S extends z.ZodType>(c: Context<AppEnv>, schema: S): Promise<z.output<S>> {
  const type = c.req.header('content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new AppError('validation', MESSAGES.jsonRequired)
  let raw: unknown
  try {
    raw = JSON.parse(await c.req.text())
  } catch {
    throw new AppError('validation', MESSAGES.invalidJson)
  }
  return validate(schema, raw)
}

/** Sorgu dizgisini (`?q=…&limit=…`) şemayla doğrular. */
export function readQuery<S extends z.ZodType>(c: Context<AppEnv>, schema: S): z.output<S> {
  return validate(schema, c.req.query())
}

/** Yol parametresini (`:workspaceId`) kimlik biçimiyle doğrular. */
export function readIdParam(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name)
  if (value === undefined || !idSchema.safeParse(value).success) throw new AppError('validation', MESSAGES.invalidId)
  return value
}
