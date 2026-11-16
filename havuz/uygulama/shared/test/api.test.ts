import { describe, expect, it } from 'vitest'
import {
  adminUpdateUserRequestSchema,
  API_PATHS,
  AppError,
  canWrite,
  emailSchema,
  ERROR_CODES,
  ERROR_MESSAGES_TR,
  ERROR_STATUS,
  errorBodySchema,
  loginRequestSchema,
  PASSWORD_MIN,
  registerRequestSchema,
  WEB_ROUTES,
  webUrl,
} from '../src/index.ts'

describe('API sözleşmesi', () => {
  it('e-posta kırpılır ve İNGİLİZCE kuralla küçültülür (I → i, ı değil)', () => {
    expect(emailSchema.parse('  ISIK@Ornek.COM ')).toBe('isik@ornek.com')
    expect(emailSchema.safeParse('gecersiz').error?.issues[0]?.message).toBe('Geçerli bir e-posta yazın.')
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.co`).success).toBe(false)
  })

  it('kayıt: şifre uzunluğu denetlenir; giriş: eski kısa şifreler de denenebilir', () => {
    const base = { email: 'a@b.co', name: 'Ayşe' }
    expect(registerRequestSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MIN - 1) }).success).toBe(false)
    expect(registerRequestSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MIN) }).success).toBe(true)
    expect(registerRequestSchema.safeParse({ ...base, password: 'x'.repeat(129) }).success).toBe(false)
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'kısa' }).success).toBe(true)
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })

  it('yönetici güncellemesi en az bir alan ister', () => {
    expect(adminUpdateUserRequestSchema.safeParse({}).success).toBe(false)
    expect(adminUpdateUserRequestSchema.safeParse({ disabled: true }).success).toBe(true)
  })

  it('adresler parametreleri kaçışlar', () => {
    expect(API_PATHS.member('ws 1', 'u/2')).toBe('/api/workspaces/ws%201/members/u%2F2')
    expect(API_PATHS.sync).toBe('/api/sync')
  })

  it('web bağlantıları HashRouter biçiminde kurulur', () => {
    expect(webUrl('https://ornek.app/', WEB_ROUTES.invite, { token: 'a b' })).toBe(
      'https://ornek.app/#/davet?token=a+b',
    )
    expect(webUrl('http://localhost:5310', WEB_ROUTES.resetPassword)).toBe('http://localhost:5310/#/sifre-sifirla')
  })

  it('yazma yetkisi: sahip ve düzenleyen yazar, izleyici yazamaz', () => {
    expect([canWrite('owner'), canWrite('editor'), canWrite('viewer')]).toEqual([true, true, false])
  })

  it('her hata kodunun HTTP durumu ve Türkçe iletisi vardır', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
      expect(ERROR_MESSAGES_TR[code].length).toBeGreaterThan(10)
    }
  })

  it('AppError hata gövdesine çevrilir', () => {
    const error = new AppError('email_taken')
    expect(error.status).toBe(409)
    expect(error.toBody()).toEqual({ error: { code: 'email_taken', message: ERROR_MESSAGES_TR.email_taken } })
    const detailed = new AppError('validation', 'Başlık boş', [{ path: 'title', message: 'Başlık boş' }])
    expect(errorBodySchema.parse(detailed.toBody()).error.details).toEqual([{ path: 'title', message: 'Başlık boş' }])
  })
})
