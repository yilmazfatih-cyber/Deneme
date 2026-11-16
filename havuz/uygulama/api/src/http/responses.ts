/**
 * Gövdesiz başarı yanıtı: `{ "ok": true }`. Çıkış, şifre işlemleri, silme gibi döndürecek nesnesi olmayan uçlar
 * bunu döndürür (istemci her yanıtı JSON olarak okuyabilsin diye 204 yerine).
 *
 * Genişletme: API'ye özgü (shared'da olmayan) yeni bir yanıt şeması gerekirse buraya yazın ve docs/API.md'deki
 * örneğin şema adını verin (kural testi örnekleri bu şemalarla doğrular).
 */
import { z } from 'zod'

export const okResponseSchema = z.object({ ok: z.literal(true) })
export type OkResponse = z.infer<typeof okResponseSchema>

export const OK: OkResponse = { ok: true }
