/**
 * Altyazı servisi eklentisi. Belgeler OCA üzerinden verilir (GET /oca/:node/timedtext/:trackId — bkz. oca/plugin.ts);
 * bu eklenti dönüştürücüyü düzlemde hazırlar. Dönüştürme: subtitles/convert.ts, önbellek: subtitles/service.ts.
 */
import type { FastifyInstance } from 'fastify'
import { planeOf } from '../playback/plane'

export default async function plugin(app: FastifyInstance): Promise<void> {
  // Düzlem tembel kurulur; altyazı servisi ilk erişimde hazır olsun diye burada da dokunuyoruz.
  planeOf(app)
}
