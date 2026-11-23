/**
 * Belgeye soru ucu: `POST /api/sor` — oturum + kullanıcı başına hız sınırı + gövde doğrulama, sonra yz vekilliği
 * (service.ts). Dört adım account/routes.ts örneğiyle aynıdır: kimlik → (hız sınırı) → girdi → iş → yanıt.
 * Yanıt eşitlenmez ve saklanmaz; soru metni günlüğe yazılmaz.
 *
 * Genişletme: soru geçmişi saklanacaksa yeni bir varlık (shared/src/entities) olarak ekleyin, bu uca dokunmayın;
 * yz'ye başka bir uç (ör. belge yükleme) açılacaksa aynı kalıpla yeni işleyici + docs/API.md başlığı.
 */
import { askRequestSchema, type AskResponse } from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { readJson } from '../../http/body.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireUser } from '../auth/session.ts'
import { createAskService } from './service.ts'

export function sorRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const ask = createAskService(ctx)

  app.post(ROUTES.ask, async (c) => {
    const auth = requireUser(c)
    ctx.limiter.consume(RATE_RULES.ask, auth.user.id)
    const { question } = await readJson(c, askRequestSchema)
    const answer = await ask(question)
    return c.json(answer satisfies AskResponse)
  })

  return app
}
