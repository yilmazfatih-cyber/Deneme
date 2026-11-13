import type { FastifyInstance } from 'fastify'
import { createEpgService } from './epg'

/**
 * Yayın akışı servisi. TVP_CLOCK (ISO) verilirse saat açılışta o ana kaydırılır ve oradan akmaya devam eder
 * (gösterim/hata ayıklama için).
 */
export default async function plugin(app: FastifyInstance): Promise<void> {
  const target = process.env.TVP_CLOCK ? new Date(process.env.TVP_CLOCK).getTime() : NaN
  const shift = Number.isFinite(target) ? target - Date.now() : 0
  const clock = () => new Date(Date.now() + shift)
  app.services.epg = createEpgService(() => app.services, clock)
}
