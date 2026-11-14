import type { FastifyInstance } from 'fastify'

/**
 * Keşif (lolomo, Canlı TV sayfası, Top 10, benzerler) durumsuz işlevlerdir: Falcor yolları ve GraphQL
 * çözümleyicileri `services/discovery/*` modüllerini istek anında `app.services` ile çağırır.
 * Kaydedilecek ayrı bir servis yoktur (Services arayüzünde `discovery` alanı yok).
 */
export default async function plugin(_app: FastifyInstance): Promise<void> {}
