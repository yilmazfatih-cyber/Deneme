// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/errors.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Hata sözleşmesi. API her hatayı şu gövdeyle döndürür:
 *   { "error": { "code": "<ErrorCode>", "message": "<Türkçe ileti>", "details": ... } }
 * İstemci `code` alanına göre davranır; `message` kullanıcıya gösterilebilir.
 *
 * Genişletme: yeni hata kodu eklemek için ÜÇ yere satır ekleyin: ERROR_CODES, ERROR_STATUS, ERROR_MESSAGES_TR.
 * TypeScript eksik olanı derleme hatasıyla gösterir.
 */
import { z } from 'zod'

export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'payload_too_large',
  'upgrade_required',
  'unknown_collection',
  'email_taken',
  'invalid_credentials',
  'weak_password',
  'invalid_token',
  'account_disabled',
  'internal',
  // YENİ HATA KODU BURAYA
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  upgrade_required: 426,
  unknown_collection: 400,
  email_taken: 409,
  invalid_credentials: 401,
  weak_password: 400,
  invalid_token: 400,
  account_disabled: 403,
  internal: 500,
}

/** Kullanıcıya gösterilebilecek varsayılan iletiler: suçlamaz, ne yapılacağını söyler. */
export const ERROR_MESSAGES_TR: Record<ErrorCode, string> = {
  validation: 'Bilgilerde düzeltilmesi gereken yerler var.',
  unauthorized: 'Devam etmek için giriş yapın.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  not_found: 'Aranan kayıt bulunamadı.',
  conflict: 'Bu kayıt başka bir yerde değişmiş. Sayfayı yenileyip yeniden deneyin.',
  rate_limited: 'Çok sık denendi. Biraz bekleyip yeniden deneyin.',
  payload_too_large: 'Gönderilen veri çok büyük.',
  upgrade_required: 'Uygulamanın yeni sürümü gerekiyor. Sayfayı yenileyin.',
  unknown_collection: 'Bu veri türü tanınmıyor. Uygulamayı güncelleyin.',
  email_taken: 'Bu e-posta ile bir hesap var. Giriş yapmayı deneyin.',
  invalid_credentials: 'E-posta ya da şifre hatalı.',
  weak_password: 'Şifre çok kısa ya da çok yaygın. Daha uzun bir şifre seçin.',
  invalid_token: 'Bağlantının süresi dolmuş ya da daha önce kullanılmış.',
  account_disabled: 'Bu hesap kullanıma kapatılmış.',
  internal: 'Beklenmeyen bir sorun oldu. Biraz sonra yeniden deneyin.',
}

export const errorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ErrorBody = z.infer<typeof errorBodySchema>

/** Uygulama içinde fırlatılan tek hata türü. Sunucu bunu yakalayıp `ErrorBody`'ye çevirir. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES_TR[code])
    this.name = 'AppError'
    this.code = code
    this.details = details
  }

  get status(): number {
    return ERROR_STATUS[this.code]
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    }
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

/** Zod hatasını alan → ileti listesine çevirir (form alanlarının altında göstermek için). */
export function issuesToDetails(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }))
}
