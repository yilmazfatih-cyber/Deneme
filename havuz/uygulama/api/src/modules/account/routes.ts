/**
 * ÖRNEK MODÜL — HTTP katmanı. Her işleyici aynı dört adımı izler (yeni uç yazarken birebir kopyalayın):
 *   1. kimlik:   `const auth = requireUser(c)`             (oturum yoksa 401)
 *   2. girdi:    `await readJson(c, şema)`                 (şemalar shared/src/api.ts'te; hata → 400 + alanlar)
 *   3. iş:       servis işlevi (`service.ts`)              (kurallar, işlem, denetim günlüğü orada)
 *   4. yanıt:    `c.json({...} satisfies YanıtTürü)`       (tür shared'daki yanıt şemasından)
 *
 * Genişletme: TARIFLER.md → "Yeni uç nokta ekle".
 */
import { deleteAccountRequestSchema, updateProfileRequestSchema, type MeResponse } from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { readJson } from '../../http/body.ts'
import { requestMeta } from '../../http/meta.ts'
import { OK } from '../../http/responses.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { clearSessionCookie, requireUser } from '../auth/session.ts'
import { toApiUser } from '../auth/userRepo.ts'
import { deleteAccount, exportAccount, updateProfile } from './service.ts'

export function accountRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.patch(ROUTES.account, async (c) => {
    const auth = requireUser(c)
    const { name } = await readJson(c, updateProfileRequestSchema)
    const user = updateProfile(ctx, auth, name, requestMeta(c))
    return c.json({ user: toApiUser(user) } satisfies MeResponse)
  })

  app.get(ROUTES.accountExport, (c) => {
    const auth = requireUser(c)
    const data = exportAccount(ctx, auth)
    const day = data.exportedAt.slice(0, 10)
    c.header('Content-Disposition', `attachment; filename="hesap-verileri-${day}.json"`)
    return c.json(data)
  })

  app.delete(ROUTES.account, async (c) => {
    const auth = requireUser(c)
    const { password } = await readJson(c, deleteAccountRequestSchema)
    await deleteAccount(ctx, auth, password, requestMeta(c))
    clearSessionCookie(c, ctx.config)
    return c.json(OK)
  })

  return app
}
