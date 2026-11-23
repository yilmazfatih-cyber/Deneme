/**
 * Uygulamaya özgü hata türleri ve "hatadan kullanıcıya gösterilecek ileti" yardımcıları.
 * Sunucunun döndürdüğü hatalar `AppError`'dır (shared/errors.ts); sunucuya hiç ulaşılamadıysa `NetworkError`.
 *
 * Genişletme: yeni bir hata türü eklerseniz `errorMessage` içinde karşılığını da yazın.
 */
import { isAppError } from '@uygulama/shared'
import { t } from '../i18n/index.ts'

/** İstek sunucuya ulaşmadı ya da yanıt gelmedi (çevrimdışı, zaman aşımı, DNS…). Yeniden denenebilir. */
export class NetworkError extends Error {
  constructor(message = 'Sunucuya ulaşılamadı.', options?: ErrorOptions) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

export function isNetworkError(value: unknown): value is NetworkError {
  return value instanceof NetworkError
}

/** Her tür hatadan kullanıcıya gösterilebilecek, suçlamayan Türkçe bir ileti çıkarır. */
export function errorMessage(error: unknown): string {
  if (isAppError(error)) return error.message
  if (isNetworkError(error)) return t('error.network')
  return t('error.unexpected')
}

/**
 * `AppError('validation')` ayrıntısını alan → ileti eşlemesine çevirir (form alanlarının altında göstermek için).
 * Ayrıntı yoksa boş nesne döner.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isAppError(error) || !Array.isArray(error.details)) return {}
  const fields: Record<string, string> = {}
  for (const item of error.details as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const { path, message } = item as { path?: unknown; message?: unknown }
    if (typeof path === 'string' && typeof message === 'string' && !(path in fields)) fields[path] = message
  }
  return fields
}
