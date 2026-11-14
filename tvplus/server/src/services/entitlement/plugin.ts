import type { FastifyInstance } from 'fastify'
import { createEntitlementService } from './entitlement'

/** Yetki servisi (istek anında katalog + yayın akışı saatini kullanır). */
export default async function plugin(app: FastifyInstance): Promise<void> {
  app.services.entitlement = createEntitlementService(() => app.services)
}
