// @ts-check
// Saf istem kurucular: ağ yok, SDK yok. Sistem istemi donmuş tek metindir (tarih, kimlik, rastgelelik yok);
// önbellek önekini bozacak hiçbir şey eklenmez.

/** @typedef {'continue'|'rewrite'|'analyze'|'shots'} Action */

/** @type {readonly Action[]} */
export const ACTIONS = Object.freeze(['continue', 'rewrite', 'analyze', 'shots'])

/** @type {Record<Action, 'low'|'medium'>} */
export const EFFORT = Object.freeze({ continue: 'low', rewrite: 'low', analyze: 'medium', shots: 'medium' })

/**
 * @param {unknown} a
 * @returns {a is Action}
 */
export function isAction(a) {
  return typeof a === 'string' && /** @type {readonly string[]} */ (ACTIONS).includes(a)
}

export const SYSTEM_PROMPT = [
  "Sen Perde adlı senaryo editöründe çalışan deneyimli bir senaryo yazarı ve script doctor'sun.",
  'Yazarın kendi sesine hizmet edersin; kendi tarzını dayatmazsın.',
  '',
  'Zanaat ilkeleri:',
  '- Aksiyon satırları şimdiki zamanda, görülebilir ve duyulabilir olanı anlatır; içinden geçeni değil, ekrana yansıyanı yazar.',
  '- Diyalog alt metin taşır: karakterler ne istediklerini çoğu zaman doğrudan söylemez.',
  '- Her karakter kendi sesini korur: kelime seçimi, cümle uzunluğu, alışkanlıkları öncekilerle tutarlı kalır.',
  '- Sahnenin tonuna, mekânına ve zamanına sadık kal; senaryoda daha önce kurulmuş bilgilerle çelişme.',
  '- Gereksiz açıklama, sahne sonu özeti ve kendini tekrar eden replikten kaçın.',
  '',
  'Dil: yanıtını senaryonun diliyle yaz. Türkçe senaryoda doğal, güncel bir Türkçe kullan; Türkçe karakterleri eksiksiz yaz.',
  '',
  'Fountain biçimi (devam ettirme ve yeniden yazma çıktıları için):',
  '- Sahne başlığı: ".İÇ. MEKÂN - GÜN" ya da "INT. LOCATION - DAY" (Türkçe başlıklarda başa nokta koy).',
  '- Karakter adı büyük harfle ayrı satırda, Türkçe adlarda başına @ koy; altında diyalog, gerekirse (parantez) satırı.',
  '- Geçiş "> KESME" biçiminde; aksiyon düz paragraf.',
  '- Öğeler arasında bir boş satır bırak; karakter, parantez ve diyalog satırları arasında boş satır olmaz.',
  '- Yalnızca Fountain metni ver; açıklama, başlık, kod çiti (```) ya da önsöz ekleme.',
  '',
  'Analiz ve çekim listesi çıktıları Markdown olur; kısa, somut ve uygulanabilir yaz.',
].join('\n')

const CACHE = Object.freeze({ type: /** @type {'ephemeral'} */ ('ephemeral') })

/**
 * Tek bloklu, önbellekli sistem istemi. Her çağrıda bayt bayt aynıdır.
 * @returns {Array<{ type: 'text', text: string, cache_control: { type: 'ephemeral' } }>}
 */
export function buildSystem() {
  return [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
}

/**
 * @typedef {object} ActionInput
 * @property {Action} action
 * @property {string} script  Senaryonun tamamı (Fountain)
 * @property {{ number: number, heading: string } | null} [scene]  Geçerli sahne (1 tabanlı numara)
 * @property {string} [selection]  Seçili öğeler (Fountain)
 * @property {string} [instruction]  Serbest metin talimat ya da ek not
 */

/**
 * @param {ActionInput} input
 * @returns {string}
 */
function instructionText({ action, scene, selection, instruction }) {
  const note = (instruction ?? '').trim()
  const where = scene ? `${scene.number}. sahne (${scene.heading})` : null
  switch (action) {
    case 'continue':
      return [
        'Görev: DEVAM ETTİR.',
        where
          ? `${where} henüz bitmedi. Sahnenin şu anki son satırından sonra gelecek bir sonraki vuruşu (beat) yaz: yaklaşık 3 ile 8 öğe.`
          : 'Senaryonun şu anki son satırından sonra gelecek bir sonraki vuruşu (beat) yaz: yaklaşık 3 ile 8 öğe.',
        'Yeni sahne başlığı açma; mevcut sahneyi ilerlet. Yazılmış satırları tekrar etme.',
        note ? `Yazarın notu: ${note}` : '',
        'Çıktı yalnızca Fountain olsun.',
      ]
        .filter(Boolean)
        .join('\n')
    case 'rewrite':
      return [
        'Görev: YENİDEN YAZ.',
        where ? `Seçim ${where} içinde.` : '',
        'Aşağıdaki seçili öğeleri talimata göre yeniden yaz. Olay örgüsünü ve bilgi akışını koru; talimat başka bir şey istemedikçe karakterlerin seslerini değiştirme.',
        'Seçim (Fountain):',
        '<secim>',
        (selection ?? '').trim(),
        '</secim>',
        `Talimat: ${note || 'Sahnenin tonunu koruyarak daha net, daha canlı ve daha az açıklayıcı yaz.'}`,
        'Çıktı yalnızca yeniden yazılmış öğeler olsun, Fountain biçiminde.',
      ]
        .filter(Boolean)
        .join('\n')
    case 'analyze':
      return [
        'Görev: ANALİZ ET.',
        'Senaryoyu bir script doctor gibi oku. Şu başlıklar altında (Markdown "##" başlıkları): Yapı, Tempo, Karakter, Diyalog, Yapımcı gözüyle.',
        'Her başlıkta güçlü yanları ve en çok işe yarayacak birkaç değişikliği somut sahne ve replik örnekleriyle yaz.',
        where ? `Özellikle ${where} üzerinde dur.` : '',
        note ? `Yazarın sorusu: ${note}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    case 'shots':
      return [
        'Görev: ÇEKİM LİSTESİ.',
        where ? `${where} için çekim listesi hazırla.` : 'Geçerli sahne için çekim listesi hazırla.',
        'Çıktı bir Markdown tablosu olsun; sütunlar: No | Çekim ölçeği | Açı / hareket | Açıklama.',
        'Çekimleri sahnenin akışına göre sırala; her açıklama tek cümle olsun. Tablonun altına en fazla iki satırlık prodüksiyon notu ekleyebilirsin.',
        note ? `Yazarın notu: ${note}` : '',
      ]
        .filter(Boolean)
        .join('\n')
  }
}

/**
 * Kullanıcı mesajının içeriği: blok 1 senaryo (önbellekli, eylemden bağımsız), blok 2 eyleme özgü talimat.
 * @param {ActionInput} input
 * @returns {Array<{ type: 'text', text: string, cache_control?: { type: 'ephemeral' } }>}
 */
export function buildUserContent(input) {
  return [
    { type: 'text', text: `<senaryo>\n${input.script}\n</senaryo>`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: instructionText(input) },
  ]
}
