import type { FastifyInstance } from 'fastify'
import { createEpgService } from './epg'
import { createReminderScheduler } from './reminders'

/**
 * Yayın akışı servisi. TVP_CLOCK (ISO) verilirse saat açılışta o ana kaydırılır ve oradan akmaya devam eder
 * (gösterim/hata ayıklama için). Hatırlatma zamanlayıcısı da buradadır (testlerde kapalı).
 */
export default async function plugin(app: FastifyInstance): Promise<void> {
  const target = process.env.TVP_CLOCK ? new Date(process.env.TVP_CLOCK).getTime() : NaN
  const shift = Number.isFinite(target) ? target - Date.now() : 0
  const clock = () => new Date(Date.now() + shift)
  app.services.epg = createEpgService(() => app.services, clock)

  const reminders = createReminderScheduler({
    services: () => app.services,
    now: () => app.services.epg?.now() ?? new Date(),
  })
  if (!app.config.isTest) {
    app.addHook('onReady', async () => reminders.start())
    app.addHook('onClose', async () => reminders.stop())
  }
}
