// Aşama 3 — Konu metinleri: ayrıştır, doğrula, yeniden yaz, güvenle HTML'e çevir.
//
// Depodaki her konu dosyası aynı kalıptadır (contributing.md → "How To Structure Content"):
//   # Başlık
//   (tek paragraflık açıklama)
//   Visit the following resources to learn more:
//   - [@article@Başlık](https://…)
// Kaynak türleri ve sırası: official, opensource, article, course, podcast, video, book; konu başına en fazla 8 bağlantı.
// Gerçek: scripts/lib/official-roadmap-topic.ts (tür listesi, formatOfficialRoadmapTopicResourceLink,
//         prepareOfficialRoadmapTopicContent), scripts/sync-repo-to-database.ts (dosyadan kaynak listesini ayırma).

/**
 * contributing.md'deki sıra: official, opensource, article, course, podcast, video, book. Gerçek tür listesinde
 * ayrıca 'roadmap' ve 'feed' de var; bunların sıradaki yeri (başta ve sonda) bizim varsayımımız.
 */
export const KAYNAK_SIRASI = [
  'roadmap',
  'official',
  'opensource',
  'article',
  'course',
  'podcast',
  'video',
  'book',
  'feed',
]

export const KAYNAK_BASLIGI_EN = 'Visit the following resources to learn more:'
export const KAYNAK_BASLIGI_TR = 'Daha fazlası için kaynaklar:'

/**
 * @typedef {{ tur: string, baslik: string, url: string }} Kaynak
 * @typedef {{ baslik: string, aciklama: string, kaynaklar: Kaynak[] }} Konu
 */

const KAYNAK_SATIRI = /^-\s*\[@([a-z]+)@((?:\\.|[^\]\\])*)\]\((\S+)\)\s*$/

/** Bağlantı metnindeki \[ \] \< \> \\ kaçışlarını geri al. @param {string} s */
const kacisCoz = (s) => s.replace(/\\(.)/g, '$1')

/** Bağlantı metnini markdown için kaçır (gerçek: escapeMarkdownLinkText). @param {string} s */
export const baglantiMetniKacir = (s) => s.replace(/[\\<>[\]]/g, (c) => `\\${c}`)

/** @param {string} md @returns {Konu} */
export function konuAyristir(md) {
  const satirlar = md.replace(/\r\n?/g, '\n').split('\n')
  let baslik = ''
  const aciklama = []
  /** @type {Kaynak[]} */
  const kaynaklar = []
  let kaynakBolumunde = false
  for (const satir of satirlar) {
    const t = satir.trim()
    if (!baslik && t.startsWith('# ')) {
      baslik = t.slice(2).trim()
      continue
    }
    if (t === KAYNAK_BASLIGI_EN || t === KAYNAK_BASLIGI_TR) {
      kaynakBolumunde = true
      continue
    }
    const m = KAYNAK_SATIRI.exec(t)
    if (m) {
      kaynakBolumunde = true
      kaynaklar.push({ tur: m[1], baslik: kacisCoz(m[2]), url: m[3] })
      continue
    }
    if (!kaynakBolumunde) aciklama.push(satir)
  }
  return { baslik, aciklama: aciklama.join('\n').trim(), kaynaklar }
}

/**
 * @param {Konu} konu
 * @param {{ enFazla?: number, yasakAlanlar?: string[] }} [kurallar]
 * @returns {string[]}
 */
export function konuDogrula(konu, { enFazla = 8, yasakAlanlar = ['geeksforgeeks.org'] } = {}) {
  const hatalar = []
  if (!konu.baslik) hatalar.push('başlık ("# …") yok')
  if (!konu.aciklama) hatalar.push('açıklama paragrafı yok')
  if (konu.kaynaklar.length > enFazla)
    hatalar.push(`en fazla ${enFazla} kaynak olabilir (${konu.kaynaklar.length} var)`)
  const gorulen = new Set()
  let oncekiSira = -1
  for (const k of konu.kaynaklar) {
    const sira = KAYNAK_SIRASI.indexOf(k.tur)
    if (sira < 0) hatalar.push(`bilinmeyen kaynak türü @${k.tur}@`)
    else if (sira < oncekiSira) hatalar.push(`kaynak sırası yanlış: @${k.tur}@ daha önce gelmeli`)
    else oncekiSira = sira
    let adres
    try {
      adres = new URL(k.url)
    } catch {
      hatalar.push(`geçersiz adres: ${k.url}`)
      continue
    }
    if (adres.protocol !== 'https:') hatalar.push(`yalnızca https: ${k.url}`)
    if (yasakAlanlar.some((a) => adres.hostname === a || adres.hostname.endsWith(`.${a}`))) {
      hatalar.push(`bu alan adı kabul edilmiyor: ${adres.hostname}`)
    }
    if (gorulen.has(adres.href)) hatalar.push(`aynı bağlantı iki kez: ${k.url}`)
    gorulen.add(adres.href)
  }
  return hatalar
}

/**
 * Konuyu dosya biçimine geri yazar (ayrıştır → yaz → ayrıştır aynı sonucu verir).
 * @param {Konu} konu @param {{ kaynakBasligi?: string }} [secenek]
 */
export function konuYaz(konu, { kaynakBasligi = KAYNAK_BASLIGI_TR } = {}) {
  let md = `# ${konu.baslik}\n\n${konu.aciklama}`
  if (konu.kaynaklar.length) {
    const satirlar = konu.kaynaklar.map((k) => `- [@${k.tur}@${baglantiMetniKacir(k.baslik)}](${k.url})`)
    md += `\n\n${kaynakBasligi}\n\n${satirlar.join('\n')}`
  }
  return `${md}\n`
}

/** HTML kaçışı (aşama 2'deki ile aynı kural). @param {string} s */
const kacis = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Satır içi biçim: `kod`, **kalın**, [metin](https://…). Önce kaçır, sonra yalnızca güvenli kalıpları aç. */
function satirIci(s) {
  let h = kacis(s)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Yalnızca http(s) bağlantıları: "javascript:" gibi şemalar düz metin kalır.
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
  return h
}

/**
 * Konu açılır penceresi için küçük ve güvenli markdown → HTML (başlık, paragraf, liste, satır içi).
 * @param {Konu} konu
 */
export function konuHtml(konu) {
  const paragraflar = konu.aciklama
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${satirIci(p.replace(/\n/g, ' '))}</p>`)
  const kaynaklar = konu.kaynaklar.length
    ? `<ul class="kaynaklar">${konu.kaynaklar
        .map((k) => {
          const guvenli = /^https?:\/\//.test(k.url) ? kacis(k.url) : '#'
          return `<li><span class="tur">${kacis(k.tur)}</span> <a href="${guvenli}" rel="noopener">${kacis(k.baslik)}</a></li>`
        })
        .join('')}</ul>`
    : ''
  return paragraflar.join('') + kaynaklar
}
