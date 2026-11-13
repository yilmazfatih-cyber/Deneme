/**
 * İSKELET — Mixpanel bağdaştırıcısı (ham dışa aktarımı okur, eşleme dosyasıyla izleme olaylarına çevirir).
 * "İzleme verisi + Mixpanel" ajanı dolduracak. Sözleşme: shared/intelligence.ts "İzleme verisi ve kaynaklar".
 */
import type { FastifyInstance } from 'fastify'

export default async function mixpanelPlugin(_app: FastifyInstance): Promise<void> {}
