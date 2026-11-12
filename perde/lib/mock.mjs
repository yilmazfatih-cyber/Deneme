// @ts-check
// Örnek kip (yalnızca PERDE_MOCK=1): SDK'ya dokunmadan eyleme göre sabit Türkçe çıktı akıtır.

/** @type {Record<import('./prompts.mjs').Action, string>} */
export const CANNED = {
  continue: [
    'Nilüfer ocağın kapısında durur. Elindeki anahtarı bırakmaz.',
    '',
    '@NİLÜFER',
    'Gece yarısı dükkân açık kalmaz, Şevket.',
    '',
    '@ŞEVKET',
    '(gözünü kaçırarak)',
    'Çaylar demliydi. Atamadım.',
    '',
    'Şevket semaveri kapatır. Buharın ardında yüzü silikleşir.',
    '',
  ].join('\n'),
  rewrite: [
    '@ŞEVKET',
    '(sesini alçaltarak)',
    'Bu çay bugün son çay. Yarın kimse gelmeyecek.',
    '',
    'Nilüfer bardağı alır, bakmadan masaya bırakır.',
    '',
  ].join('\n'),
  analyze: [
    '## Yapı',
    "Sahne sakin bir kurulumla açılıyor; çatışma ilk üçte birde belirginleşiyor. **Öneri:** Şevket'in sırrını bir replik erken sezdir.",
    '',
    '## Tempo',
    '- Aksiyon satırları kısa ve akıcı.',
    '- Son üçte birde bir nefes payı bırak.',
    '',
    '## Karakter',
    "Nilüfer ne istediğini açıkça söylemiyor; bu iyi. Şevket'in sesi biraz fazla açıklayıcı.",
    '',
    '## Diyalog',
    'Replikler kısa ve doğal. "Gece yarısı dükkân açık kalmaz" cümlesi alt metin taşıyor.',
    '',
    '## Yapımcı gözüyle',
    'Tek mekân, iki oyuncu: düşük bütçeli ve çekimi kolay bir sahne.',
    '',
  ].join('\n'),
  shots: [
    '| No | Çekim ölçeği | Açı / hareket | Açıklama |',
    '| --- | --- | --- | --- |',
    '| 1 | Geniş | Sabit, göz hizası | Çay ocağı boş; semaverin buharı tek ışık kaynağı. |',
    '| 2 | Orta | Yavaş içeri hareket | Şevket tezgâhın ardında bardak siler. |',
    "| 3 | Yakın | Omuz üstü | Nilüfer'in yüzü, kapıdan gelen ışıkla yarı aydınlık. |",
    "| 4 | Detay | Sabit | Anahtar Nilüfer'in avucunda. |",
    '',
    'Not: Tek ışık kaynağı (semaver, kapı) sahneyi ucuza ve gerilimli kılar.',
    '',
  ].join('\n'),
}

/**
 * @param {import('./prompts.mjs').Action} action
 * @param {{ delayMs?: number, chunk?: number, signal?: AbortSignal }} [opts]
 * @returns {AsyncGenerator<string>}
 */
export async function* mockStream(action, { delayMs = 20, chunk = 14, signal } = {}) {
  const text = CANNED[action]
  for (let i = 0; i < text.length; i += chunk) {
    if (signal?.aborted) return
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    yield text.slice(i, i + chunk)
  }
}
