// HTTP katmanı yardımcıları: ortak tipler, hata sınıfı, gövde/parametre doğrulama.
import type { Context } from 'hono'
import { z } from 'zod'
import type { Role } from '../shared/labels.ts'
import type { AIService } from './ai/service.ts'
import type { Config } from './config.ts'
import type { DB } from './db/db.ts'
import type { Messaging } from './integrations/messaging.ts'
import type { Payments } from './integrations/payments.ts'

z.config(z.locales.tr())

export type AppUser = {
  id: number
  orgId: number
  name: string
  email: string | null
  phone: string | null
  role: Role
  personId: number | null
}

export type Deps = {
  db: DB
  config: Config
  ai: AIService
  messaging: Messaging
  payments: Payments
  /** Testlerde sabit "bugün" için. */
  now: () => Date
}

export type Env = { Variables: { user: AppUser } }
export type Ctx = Context<Env>

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message)
}

export function notFound(what = 'Kayıt'): never {
  throw new HttpError(404, `${what} bulunamadı`)
}

function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}

export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  // Yalnız JSON kabul edilir: form/metin gönderimiyle siteler arası istek sahteciliği (CSRF) engellenir.
  if (!c.req.header('content-type')?.includes('application/json')) fail(415, 'İstek JSON olmalı')
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    fail(400, 'İstek gövdesi geçerli JSON değil')
  }
  const r = schema.safeParse(raw)
  if (!r.success) fail(400, `Eksik veya hatalı alan — ${describe(r.error)}`)
  return r.data
}

export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.infer<T> {
  const r = schema.safeParse(c.req.query())
  if (!r.success) fail(400, `Hatalı sorgu — ${describe(r.error)}`)
  return r.data
}

export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? '127.0.0.1'
}

export function idParam(c: Context, name = 'id'): number {
  const v = Number(c.req.param(name))
  if (!Number.isInteger(v) || v <= 0) fail(400, 'Geçersiz kimlik')
  return v
}

// Sık kullanılan şema parçaları
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı')
export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-AA biçiminde olmalı')
export const zKurus = z.number().int('Tutar kuruş cinsinden tamsayı olmalı').positive('Tutar sıfırdan büyük olmalı')
export const zId = z.number().int().positive()
export const zOptId = z.number().int().positive().nullable().optional()
export const zText = (max = 2000) => z.string().trim().min(1, 'Boş bırakılamaz').max(max)
export const zIdQuery = z.coerce.number().int().positive()

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
