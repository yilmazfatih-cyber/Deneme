/**
 * Cihaz istemcisi (web/src/devices/client.ts) henüz iskeletken çalışabilmek için ince yedek:
 * `deviceClient` yöntemi "henüz yazılmadı" hatası atarsa aynı REST ucuna (shared/devices.ts) doğrudan gidilir.
 * İstemci yazıldığında yedek kendiliğinden devre dışı kalır; bu dosya o zaman silinebilir.
 */
import type { ApiError } from '../../../shared/types'
import { sessionHeaders } from '../api/session'

/** deviceClient iskeletinin attığı hata mı */
export function isDeviceClientStub(err: unknown): boolean {
  return err instanceof Error && /henüz yazılmadı/.test(err.message)
}

/** Sunucu hata kodunu taşıyan hata (PIN_REQUIRED, PIN_INVALID …) */
export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
  }
}

/** Hata nesnesinden sunucu kodunu okur (deviceClient `Error.message` olarak da verebilir). */
export function errorCode(err: unknown): string | null {
  if (err instanceof ApiRequestError) return err.code
  if (err instanceof Error && /^[A-Z_]{4,}$/.test(err.message)) return err.message
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string')
    return (err as { code: string }).code
  return null
}

/** JSON isteği; 2xx değilse ApiRequestError. 204 → null. */
export async function requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...sessionHeaders(),
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let code = `HTTP_${res.status}`
    let message = `İstek başarısız (${res.status})`
    try {
      const e = ((await res.json()) as ApiError).error
      if (e?.code) code = e.code
      if (e?.message) message = e.message
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiRequestError(code, message, res.status)
  }
  if (res.status === 204) return null as T
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** deviceClient yöntemini dener; iskeletse REST yedeğine düşer. */
export async function withRestFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary()
  } catch (err) {
    if (isDeviceClientStub(err)) return fallback()
    throw err
  }
}
