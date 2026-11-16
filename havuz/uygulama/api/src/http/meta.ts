/**
 * İstek bilgisi: servislerin denetim günlüğüne ve oturum kaydına yazdığı IP ve tarayıcı bilgisi.
 * Servisler HTTP bağlamını (Context) görmez; yalnız bu küçük nesneyi alır (test etmesi kolay olsun diye).
 *
 * Genişletme: servislere başka bir istek bilgisi gerekecekse (ör. X-Client) buraya alan ekleyin.
 */
import type { Context } from 'hono'
import type { AppEnv } from './types.ts'

export interface RequestMeta {
  readonly ip: string
  readonly userAgent: string
}

export function requestMeta(c: Context<AppEnv>): RequestMeta {
  return { ip: c.get('ip'), userAgent: c.req.header('user-agent') ?? '' }
}
