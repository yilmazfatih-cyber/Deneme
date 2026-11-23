/**
 * İletişim formu ucu: `POST /api/iletisim` — HERKESE AÇIK (oturum yok). Web sitesinin formu (site temeli,
 * PUBLIC_FORM_ENDPOINT) buraya JSON ile gönderir; JavaScript kapalıysa tarayıcı düz form gönderir, o zaman yanıt
 * küçük bir HTML teşekkür sayfasıdır. Korumalar (sırasıyla): özellik açık mı (CONTACT_TO) → köken (Origin,
 * CONTACT_ORIGINS) → IP ve toplam hız sınırı → şema → bal küpü. CORS ayrı ara katmandadır (http/cors.ts →
 * publicFormCors, app.ts'te genel CORS'tan önce); CSRF ara katmanı bu adresi atlar, köken denetimi burada.
 *
 * Genişletme: başka bir herkese açık form (ör. bülten) için bu dosyayı kopyalayın, adresi app.ts'teki
 * publicFormCors ve csrfProtection → exemptPaths listelerine ve test/rules.test.ts → PUBLIC_ROUTES'a ekleyin.
 */
import { AppError, contactRequestSchema, type ContactRequest } from '@uygulama/shared'
import { Hono, type Context } from 'hono'
import type { ContactConfig } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { readForm, readJson } from '../../http/body.ts'
import { rateLimitKey } from '../../http/clientIp.ts'
import { ownOrigin } from '../../http/csrf.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import { OK } from '../../http/responses.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { escapeHtml } from '../../mail/templates.ts'
import { MESSAGES } from '../../messages.ts'
import { submitContact } from './service.ts'

/** Tarayıcı başka bir siteden gönderdiyse (Origin izinli değil) 403. Origin'siz istek (curl) geçer. */
function assertAllowedOrigin(c: Context<AppEnv>, ctx: AppContext, contact: ContactConfig): string | null {
  const origin = c.req.header('origin')
  if (origin === undefined) return null
  const allowed = [...contact.origins, ctx.config.appOrigin, ownOrigin(c, ctx.config.trustProxy)]
  if (!allowed.includes(origin)) throw new AppError('forbidden', MESSAGES.crossSiteBlocked)
  return origin
}

/** JS kapalı tarayıcıya gösterilen sayfa (API'nin sıkı CSP'si altında: betik ve stil yok). */
function thanksPage(backTo: string | null): string {
  const back = backTo ? `<p><a href="${escapeHtml(backTo)}">${MESSAGES.contactBack}</a></p>` : ''
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${MESSAGES.contactThanksTitle}</title></head><body><h1>${MESSAGES.contactThanksTitle}</h1><p>${MESSAGES.contactThanksBody}</p>${back}</body></html>`
}

export function iletisimRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.post(ROUTES.contact, async (c) => {
    const contact = ctx.config.contact
    if (!contact) throw new AppError('not_found', MESSAGES.contactDisabled)
    const origin = assertAllowedOrigin(c, ctx, contact)
    ctx.limiter.consume(RATE_RULES.contact, rateLimitKey(c.get('ip')))
    ctx.limiter.consume(RATE_RULES.contactAll, 'hepsi')
    const isJson = /^application\/json/i.test(c.req.header('content-type') ?? '')
    const form: ContactRequest = isJson
      ? await readJson(c, contactRequestSchema)
      : await readForm(c, contactRequestSchema)
    submitContact(ctx, contact, form)
    return isJson ? c.json(OK) : c.html(thanksPage(origin))
  })

  return app
}
