// Soniox geçici anahtarı (https://docs.soniox.com/api-reference/auth/create_temporary_api_key).

export const SONIOX_ADRESI = 'https://api.soniox.com/v1/auth/temporary-api-key'
/** Geçici anahtarla akış açmak için tanınan süre (sn). Açılmış akışı kesmez; onu `max_session_duration_seconds` sınırlar. */
export const ANAHTAR_OMRU_SN = 60
const ZAMAN_ASIMI_MS = 8000

export type GetirIslevi = (adres: string, secenekler: RequestInit) => Promise<Response>

export type AnahtarSonucu = { tamam: true; anahtar: string } | { tamam: false; durum: number }

/**
 * Uzun ömürlü anahtarla tek kullanımlık, süre sınırlı bir geçici anahtar ister.
 * Başarısızlıkta Soniox'un HTTP durumunu döndürür (ağ hatası ya da zaman aşımında 0); yanıt gövdesi saklanmaz.
 */
export async function geciciAnahtarAl(
  getir: GetirIslevi,
  sonioxAnahtari: string,
  sureSn: number,
  referans: string,
): Promise<AnahtarSonucu> {
  try {
    const yanit = await getir(SONIOX_ADRESI, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sonioxAnahtari}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: ANAHTAR_OMRU_SN,
        single_use: true,
        max_session_duration_seconds: sureSn,
        client_reference_id: referans,
      }),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    })
    if (!yanit.ok) {
      await yanit.body?.cancel()
      return { tamam: false, durum: yanit.status }
    }
    const govde: unknown = await yanit.json()
    const anahtar = typeof govde === 'object' && govde !== null ? (govde as { api_key?: unknown }).api_key : undefined
    if (typeof anahtar !== 'string' || anahtar === '') return { tamam: false, durum: yanit.status }
    return { tamam: true, anahtar }
  } catch {
    return { tamam: false, durum: 0 }
  }
}
