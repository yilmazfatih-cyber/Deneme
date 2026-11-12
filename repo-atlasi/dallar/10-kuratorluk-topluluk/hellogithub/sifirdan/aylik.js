// Aylık açık kaynak bülteni üretici: HelloGitHub'ın yayın mekanizmasının küçük, özgün bir kopyası.
//
// HelloGitHub (521xueweihan/HelloGitHub, d65699c) her ayın 28'inde bir "sayı" yayımlar:
// content/HelloGitHubNNN.md (Çince) ve content/en/HelloGitHubNNN.md (İngilizce). Her sayıda
// projeler dil kategorilerine ayrılır, numaralar kategoriler boyunca kesintisiz artar, her
// bağlantı sitenin tıklama sayacından geçer, öneren kullanıcı adıyla anılır.
//
// Bu modül saf fonksiyonlardan oluşur (dosya okuma/yazma cli.js'de):
//   dogrula()            -> öneri kuralları (başvuru formundaki sınırlar, tekrar önleme)
//   sayiyiOlustur()      -> tek sayının Markdown metni
//   rssOlustur()         -> RSS 2.0 akışı
//   dizinTablosu()       -> README'deki "tüm sayılar" tablosu (satır başına 5 sayı)
//   katkidaBulunanlar()  -> öneren kullanıcılar listesi (content/contributors.md karşılığı)

/** Kategorilerin yayın sırası: önce diller, sonra yapay zekâ, diğer ve kitap (HelloGitHub düzeni). */
export const KATEGORI_SIRASI = [
  'C',
  'C#',
  'C++',
  'CSS',
  'Go',
  'Java',
  'JavaScript',
  'Kotlin',
  'PHP',
  'Python',
  'Ruby',
  'Rust',
  'Swift',
  'Yapay Zekâ',
  'Diğer',
  'Kitap',
]

const AYLAR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]
const GUNLER_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const AYLAR_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GITHUB_DEPO = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/

/**
 * @typedef {{url: string, kategori: string, baslik: string, aciklama: string, oneren?: string}} Proje
 * @typedef {{sayi: number, tarih: string, projeler: Proje[]}} Sayi
 */

/** Sayı numarasını üç haneye tamamlar: 7 -> "007". */
export const numara = (n) => String(n).padStart(3, '0')

/** "2026-10-28" -> "28 Ekim 2026" (ICU verisine bağlı kalmamak için ay adları elle). */
export function turkceTarih(tarih) {
  const [yil, ay, gun] = tarih.split('-').map(Number)
  return `${gun} ${AYLAR[ay - 1]} ${yil}`
}

/** RSS'in istediği RFC 822 tarihi: "Wed, 28 Oct 2026 09:00:00 GMT" (yayın saati sabit 09:00 UTC). */
export function rfc822(tarih) {
  const d = new Date(`${tarih}T09:00:00Z`)
  const iki = (n) => String(n).padStart(2, '0')
  return `${GUNLER_EN[d.getUTCDay()]}, ${iki(d.getUTCDate())} ${AYLAR_EN[d.getUTCMonth()]} ${d.getUTCFullYear()} 09:00:00 GMT`
}

/** XML metin ve öznitelik kaçışı. CDATA yerine kaçış: CDATA "]]>" içeren metinde bozulur. */
export const xmlKacis = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

/**
 * Tıklama sayacı bağlantısı. HelloGitHub hedefi kodlamadan ekler (?target=https://github.com/...);
 * hedefte "?" ya da "&" varsa bu bozulur, o yüzden encodeURIComponent kullanıyoruz.
 * Kişisel veri notu: sayaç IP/zaman kaydederse KVKK aydınlatma metni gerekir.
 */
export function tiklamaBaglantisi(hedef, onek) {
  return onek ? `${onek}?hedef=${encodeURIComponent(hedef)}` : hedef
}

/**
 * Bir sayıyı kurallara göre denetler. `oncekiler`: Map<url(küçük harf), sayı numarası>.
 * Sınırlar HelloGitHub'ın başvuru formundan: başlık en çok 50, açıklama 32-256 karakter,
 * yalnızca GitHub depoları, daha önce yer almış proje tekrar giremez.
 * @param {Sayi} sayi
 * @param {Map<string, number>} [oncekiler]
 * @returns {string[]} hata mesajları (boşsa temiz)
 */
export function dogrula(sayi, oncekiler = new Map()) {
  const hatalar = []
  if (!Number.isInteger(sayi.sayi) || sayi.sayi < 1) hatalar.push('sayi pozitif tam sayı olmalı')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sayi.tarih ?? '') || Number.isNaN(Date.parse(sayi.tarih)))
    hatalar.push('tarih YYYY-AA-GG olmalı')
  if (!Array.isArray(sayi.projeler) || sayi.projeler.length === 0) {
    hatalar.push('en az bir proje gerekli')
    return hatalar
  }
  const bu = new Set()
  sayi.projeler.forEach((p, i) => {
    const yer = `${i + 1}. proje (${p.url ?? '?'})`
    if (!GITHUB_DEPO.test(p.url ?? '')) hatalar.push(`${yer}: yalnızca https://github.com/sahip/depo kabul edilir`)
    if (!KATEGORI_SIRASI.includes(p.kategori)) hatalar.push(`${yer}: bilinmeyen kategori '${p.kategori}'`)
    const baslik = p.baslik ?? ''
    if (baslik.length < 1 || baslik.length > 50) hatalar.push(`${yer}: başlık 1-50 karakter olmalı (${baslik.length})`)
    const aciklama = p.aciklama ?? ''
    if (aciklama.length < 32 || aciklama.length > 256)
      hatalar.push(`${yer}: açıklama 32-256 karakter olmalı (${aciklama.length})`)
    const anahtar = (p.url ?? '').toLowerCase()
    if (bu.has(anahtar)) hatalar.push(`${yer}: bu sayıda iki kez var`)
    if (oncekiler.has(anahtar)) hatalar.push(`${yer}: daha önce Sayı ${numara(oncekiler.get(anahtar))}'de yer aldı`)
    bu.add(anahtar)
  })
  return hatalar
}

/** Projeleri kategori sırasına dizer; kategori içinde öneri sırası korunur (kararlı sıralama). */
export function sirala(projeler) {
  return [...projeler].sort((a, b) => KATEGORI_SIRASI.indexOf(a.kategori) - KATEGORI_SIRASI.indexOf(b.kategori))
}

/**
 * Tek sayının Markdown metni. Numaralar kategoriler boyunca kesintisiz artar: her kategori yeni
 * bir sıralı liste açar ve "4." ile başlayan liste CommonMark'ta 4'ten başlar.
 * @param {Sayi} sayi
 * @param {{ad?: string, slogan?: string, izlemeOneki?: string, lisans?: string, sponsorlar?: {ad: string, url: string}[]}} [ayar]
 */
export function sayiyiOlustur(sayi, ayar = {}) {
  const ad = ayar.ad ?? 'Açık Kaynak Aylık'
  const projeler = sirala(sayi.projeler)
  const s = [
    `# ${ad} — Sayı ${numara(sayi.sayi)}`,
    '',
    `> ${ayar.slogan ?? 'İlgi en iyi öğretmendir: her ay GitHub’dan ilginç ve başlangıç dostu projeler.'}`,
    '',
    `Yayın tarihi: ${turkceTarih(sayi.tarih)} · Bu sayıda ${projeler.length} proje var.`,
    '',
    '## İçerik',
  ]
  let sira = 0
  let kategori = ''
  for (const p of projeler) {
    if (p.kategori !== kategori) {
      kategori = p.kategori
      s.push('', `### ${kategori}`, '')
    }
    sira += 1
    const [, sahip, depo] = GITHUB_DEPO.exec(p.url)
    const oneren = p.oneren ? ` Öneren: [@${p.oneren}](https://github.com/${p.oneren})` : ''
    s.push(
      `${sira}. [${depo}](${tiklamaBaglantisi(p.url, ayar.izlemeOneki)}) (${sahip}): **${p.baslik}.** ${p.aciklama}${oneren}`,
    )
  }
  if (ayar.sponsorlar?.length) {
    s.push('', '## Sponsorlar', '', ...ayar.sponsorlar.map((sp) => `- [${sp.ad}](${sp.url})`))
  }
  s.push('', '---', '', `Bu sayı ${ayar.lisans ?? 'CC BY 4.0'} lisansıyla yayımlanır.`)
  return s.join('\n') + '\n'
}

/**
 * RSS 2.0 akışı: en yeni sayı en üstte. lastBuildDate "şimdi" değil en yeni sayının tarihidir;
 * böylece aynı veri her zaman aynı dosyayı üretir (belirlenimci çıktı, gereksiz commit yok).
 * @param {Sayi[]} sayilar
 * @param {{site: string, ad?: string, aciklama?: string}} ayar
 */
export function rssOlustur(sayilar, ayar) {
  const site = ayar.site.replace(/\/$/, '')
  const yeniden = [...sayilar].sort((a, b) => b.sayi - a.sayi)
  const ogeler = yeniden.map((sy) => {
    const link = `${site}/sayi/${numara(sy.sayi)}`
    const [yil, ay] = sy.tarih.split('-').map(Number)
    const ozet = `${sy.projeler.length} proje: ${sirala(sy.projeler)
      .map((p) => p.url.replace('https://github.com/', ''))
      .join(', ')}`
    return [
      '    <item>',
      `      <title>${xmlKacis(`Sayı ${numara(sy.sayi)} — ${AYLAR[ay - 1]} ${yil}`)}</title>`,
      `      <link>${xmlKacis(link)}</link>`,
      `      <guid isPermaLink="true">${xmlKacis(link)}</guid>`,
      `      <pubDate>${rfc822(sy.tarih)}</pubDate>`,
      `      <description>${xmlKacis(ozet)}</description>`,
      '    </item>',
    ].join('\n')
  })
  const kanal = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${xmlKacis(ayar.ad ?? 'Açık Kaynak Aylık')}</title>`,
    `    <link>${xmlKacis(site + '/')}</link>`,
    `    <description>${xmlKacis(ayar.aciklama ?? 'Her ay GitHub’dan ilginç açık kaynak projeler.')}</description>`,
    '    <language>tr</language>',
  ]
  if (yeniden.length) kanal.push(`    <lastBuildDate>${rfc822(yeniden[0].tarih)}</lastBuildDate>`)
  return [...kanal, ...ogeler, '  </channel>', '</rss>', ''].join('\n')
}

/** README'deki sayı tablosu: en yeni önce, satır başına 5 sayı (HelloGitHub README düzeni). */
export function dizinTablosu(sayilar, klasor = 'icerik') {
  const hucreler = [...sayilar]
    .sort((a, b) => b.sayi - a.sayi)
    .map((sy) => `[Sayı ${numara(sy.sayi)}](${klasor}/sayi-${numara(sy.sayi)}.md)`)
  const satirlar = ['| Sayılar |     |     |     |     |', '| ------- | --- | --- | --- | --- |']
  for (let i = 0; i < hucreler.length; i += 5) {
    satirlar.push(`| ${hucreler.slice(i, i + 5).join(' | ')} |`)
  }
  return satirlar.join('\n') + '\n'
}

/** Öneren kullanıcılar: en çok öneriden aza, eşitlikte ada göre. */
export function katkidaBulunanlar(sayilar) {
  const sayac = new Map()
  for (const sy of sayilar) {
    for (const p of sy.projeler) {
      if (p.oneren) sayac.set(p.oneren, (sayac.get(p.oneren) ?? 0) + 1)
    }
  }
  return [...sayac.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kisi, adet]) => ({ kisi, adet }))
}
