// Aşama 2 — Yol haritası belgesini SVG'ye ve tek dosyalık bir HTML sayfasına çevirmek.
//
// Hepsi saf fonksiyon: girdi belge + durumlar, çıktı metin. Böylece testte karşılaştırılabilir, sunucuda
// (statik site üretimi) ya da tarayıcıda aynı kod çalışabilir.
// Gerçek site bu depoda değil (bkz. dosya README'si); sitenin çizim kodu hakkındaki ayrıntılar doğrulanmadı.

import { konuDosyaAdi, konuMu } from './asama1_model.js'

const VARSAYILAN_GENISLIK = 180
const VARSAYILAN_YUKSEKLIK = 40
const KENAR_BOSLUGU = 20

/** XML/HTML için kaçış: kullanıcı etiketleri asla ham olarak basılmaz. @param {unknown} s */
export function kacis(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Konumu olmayan düğümlere katmanlı bir yerleşim verir: kökten (gelen kenarı olmayan) başlayıp
 * genişlik öncelikli aramayla seviye bul, her seviyeyi bir satıra diz. Belgeyi değiştirmez, kopyasını döner.
 * @param {import('./asama1_model.js').YolHaritasi} belge
 */
export function otomatikYerlesim(belge) {
  const gelen = new Map(belge.nodes.map((d) => [d.id, 0]))
  for (const k of belge.edges) gelen.set(k.target, (gelen.get(k.target) ?? 0) + 1)
  const seviye = new Map()
  const kuyruk = belge.nodes.filter((d) => gelen.get(d.id) === 0).map((d) => d.id)
  for (const id of kuyruk) seviye.set(id, 0)
  while (kuyruk.length) {
    const id = /** @type {string} */ (kuyruk.shift())
    for (const k of belge.edges.filter((x) => x.source === id)) {
      if (!seviye.has(k.target)) {
        seviye.set(k.target, seviye.get(id) + 1)
        kuyruk.push(k.target)
      }
    }
  }
  const sira = new Map()
  const nodes = belge.nodes.map((d) => {
    if (d.position) return d
    const s = seviye.get(d.id) ?? 0 // döngüde kalanlar en üste
    const i = sira.get(s) ?? 0
    sira.set(s, i + 1)
    return { ...d, position: { x: i * (VARSAYILAN_GENISLIK + 40), y: s * (VARSAYILAN_YUKSEKLIK + 40) } }
  })
  return { ...belge, nodes }
}

/** @param {import('./asama1_model.js').Dugum} d */
function kutu(d) {
  const p = d.position ?? { x: 0, y: 0 }
  return { x: p.x, y: p.y, w: d.width ?? VARSAYILAN_GENISLIK, h: d.height ?? VARSAYILAN_YUKSEKLIK }
}

/**
 * @param {import('./asama1_model.js').YolHaritasi} belge
 * @param {{ durumlar?: Record<string, string> }} [secenek] düğüm id → 'done' | 'learning' | 'skipped'
 */
export function svgCiz(belge, { durumlar = {} } = {}) {
  const yerlesik = otomatikYerlesim(belge)
  const kutular = new Map(yerlesik.nodes.map((d) => [d.id, kutu(d)]))
  const tum = [...kutular.values()]
  const minX = Math.min(0, ...tum.map((k) => k.x)) - KENAR_BOSLUGU
  const minY = Math.min(0, ...tum.map((k) => k.y)) - KENAR_BOSLUGU
  const maxX = Math.max(0, ...tum.map((k) => k.x + k.w)) + KENAR_BOSLUGU
  const maxY = Math.max(0, ...tum.map((k) => k.y + k.h)) + KENAR_BOSLUGU

  const kenarlar = yerlesik.edges.map((k) => {
    const a = /** @type {{x:number,y:number,w:number,h:number}} */ (kutular.get(k.source))
    const b = /** @type {{x:number,y:number,w:number,h:number}} */ (kutular.get(k.target))
    const kesik = k.data?.edgeStyle === 'dashed' ? ' stroke-dasharray="6 4"' : ''
    // Kaynağın alt ortasından hedefin üst ortasına
    return `<line class="kenar" x1="${a.x + a.w / 2}" y1="${a.y + a.h}" x2="${b.x + b.w / 2}" y2="${b.y}"${kesik}/>`
  })

  const dugumler = yerlesik.nodes.map((d) => {
    const k = /** @type {{x:number,y:number,w:number,h:number}} */ (kutular.get(d.id))
    const etiket = kacis(d.data?.label ?? '')
    const durum = durumlar[d.id]
    const sinif = ['dugum', `tur-${kacis(d.type)}`, durum ? `durum-${kacis(durum)}` : ''].filter(Boolean).join(' ')
    const konuOz = konuMu(d) ? ` data-konu="${kacis(konuDosyaAdi(d))}" tabindex="0" role="button"` : ''
    return (
      `<g class="${sinif}" data-dugum="${kacis(d.id)}"${konuOz}>` +
      `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="6"/>` +
      `<text x="${k.x + k.w / 2}" y="${k.y + k.h / 2}" text-anchor="middle" dominant-baseline="middle">${etiket}</text>` +
      `</g>`
    )
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img" aria-label="${kacis(belge.title)}">`,
    ...kenarlar,
    ...dugumler,
    '</svg>',
  ].join('\n')
}

/**
 * Tek dosyalık sayfa: SVG + her konu için gizli bir bölüm + ilerlemeyi tarayıcıda saklayan küçük betik.
 * @param {{ belge: import('./asama1_model.js').YolHaritasi, konular: Map<string, { baslik: string, html: string }>,
 *           durumlar?: Record<string, string> }} p
 */
export function htmlSayfasi({ belge, konular, durumlar = {} }) {
  const bolumler = [...konular.entries()].map(
    ([id, k]) => `<section class="konu" id="konu-${kacis(id)}" hidden><h2>${kacis(k.baslik)}</h2>${k.html}</section>`,
  )
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kacis(belge.title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1rem; }
  svg { width: 100%; max-width: 900px; height: auto; }
  .kenar { stroke: #888; stroke-width: 2; }
  .dugum rect { fill: #fff8c5; stroke: #333; }
  .tur-title rect { fill: #fff; stroke: none; } .tur-title text { font-weight: bold; }
  .tur-subtopic rect { fill: #fce8b2; }
  .tur-paragraph rect, .tur-label rect { fill: none; stroke: none; }
  .durum-done rect { fill: #c6f0c2; } .durum-done text { text-decoration: line-through; }
  .durum-learning rect { fill: #d6e4ff; } .durum-skipped rect { fill: #e5e5e5; }
  [data-konu] { cursor: pointer; }
  .konu { border-top: 1px solid #ccc; margin-top: 1rem; }
</style>
</head>
<body>
<h1>${kacis(belge.title)}</h1>
${svgCiz(belge, { durumlar })}
<p id="ozet"></p>
${bolumler.join('\n')}
<script>
  // Durum tarayıcıda saklanır (gerçek site giriş yapan kullanıcı için sunucuya da yazar).
  const anahtar = 'ilerleme:${kacis(belge.slug)}'
  const sirala = ['done', 'learning', 'skipped', '']
  let durumlar = {}
  try { durumlar = JSON.parse(localStorage.getItem(anahtar) || '{}') } catch { durumlar = {} }
  function boya() {
    for (const g of document.querySelectorAll('[data-dugum]')) {
      g.classList.remove('durum-done', 'durum-learning', 'durum-skipped')
      const d = durumlar[g.dataset.dugum]
      if (d) g.classList.add('durum-' + d)
    }
    const konular = document.querySelectorAll('[data-konu]')
    const biten = [...konular].filter((g) => durumlar[g.dataset.dugum] === 'done').length
    document.getElementById('ozet').textContent = biten + ' / ' + konular.length + ' konu tamamlandı'
  }
  for (const g of document.querySelectorAll('[data-konu]')) {
    g.addEventListener('click', (olay) => {
      const id = g.dataset.dugum
      if (olay.shiftKey) {
        const simdi = durumlar[id] || ''
        durumlar[id] = sirala[(sirala.indexOf(simdi) + 1) % sirala.length]
        if (!durumlar[id]) delete durumlar[id]
        try { localStorage.setItem(anahtar, JSON.stringify(durumlar)) } catch {}
        boya()
        return
      }
      for (const s of document.querySelectorAll('.konu')) s.hidden = s.id !== 'konu-' + id
    })
  }
  boya()
</script>
</body>
</html>
`
}
