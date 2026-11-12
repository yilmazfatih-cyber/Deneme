// Aşama 1 — Meydan okuma (challenge) markdown ayrıştırıcısı.
//
// freeCodeCamp müfredatındaki her alıştırma bir markdown dosyasıdır: başta YAML ön bilgi (id, title,
// challengeType …), sonra "# --description--", "# --hints--", "# --seed--" / "## --seed-contents--",
// "# --solutions--" gibi işaretçi başlıklarla ayrılmış bölümler. Her ipucu bir açıklama paragrafı ve hemen
// ardından gelen bir JS kod bloğudur (gizli test).
// Gerçek: tools/challenge-parser/parser/index.js (unified/remark eklenti zinciri),
//         plugins/validate-sections.js, add-frontmatter.js, add-seed.js, add-tests.js, add-hooks.js, add-solution.js.
// Biz markdown AST'si kurmadan, satır satır tarayarak aynı veriyi çıkarıyoruz.

/** Bilinen işaretçiler ve başlık düzeyleri (gerçek listenin JS meydan okumalarına yetecek alt kümesi). */
export const ISARETCILER = {
  '--description--': 1,
  '--instructions--': 1,
  '--notes--': 1,
  '--hints--': 1,
  '--seed--': 1,
  '--solutions--': 1,
  '--before-all--': 1,
  '--before-each--': 1,
  '--after-each--': 1,
  '--after-all--': 1,
  '--seed-contents--': 2,
}

export const DUZENLENEBILIR_BOLGE = '--fcc-editable-region--'

export class AyristirmaHatasi extends Error {
  /** @param {string} mesaj @param {number} [satir] */
  constructor(mesaj, satir) {
    super(satir ? `${mesaj} (satır ${satir})` : mesaj)
    this.name = 'AyristirmaHatasi'
  }
}

/**
 * @typedef {{ text: string, testString: string }} Ipucu
 * @typedef {{ lang: string, contents: string, editableRegionBoundaries: number[] }} Tohum
 * @typedef {{ lang: string, contents: string }} KodDosyasi
 * @typedef {{
 *   id: string, title: string, challengeType: number, dashedName?: string, [k: string]: unknown,
 *   description: string, instructions: string, notes: string,
 *   hints: Ipucu[], seed: Tohum[], solutions: KodDosyasi[][],
 *   hooks: { beforeAll?: string, beforeEach?: string, afterEach?: string, afterAll?: string },
 * }} MeydanOkuma
 */

/**
 * YAML'ın küçük bir alt kümesi: `anahtar: değer` satırları; sayı, true/false ve tırnaklı metin.
 * @param {string} blok
 */
export function onBilgiAyristir(blok) {
  /** @type {Record<string, unknown>} */
  const sonuc = {}
  for (const [i, satir] of blok.split('\n').entries()) {
    if (!satir.trim() || satir.trim().startsWith('#')) continue
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(satir)
    if (!m) throw new AyristirmaHatasi(`Ön bilgide anlaşılmayan satır: "${satir}"`, i + 2)
    const ham = m[2].trim()
    let deger
    if (/^-?\d+(\.\d+)?$/.test(ham)) deger = Number(ham)
    else if (ham === 'true' || ham === 'false') deger = ham === 'true'
    else if (/^(['"]).*\1$/.test(ham)) deger = ham.slice(1, -1)
    else deger = ham
    sonuc[m[1]] = deger
  }
  return sonuc
}

/**
 * Bir bölümün satırlarını metin ve kod bloklarına böler.
 * @param {string[]} satirlar
 * @param {number} baslangicSatiri hata mesajları için dosyadaki satır numarası
 * @returns {Array<{ tur: 'metin', deger: string } | { tur: 'kod', dil: string, deger: string, satir: number } | { tur: 'ayirac' }>}
 */
function bloklaraBol(satirlar, baslangicSatiri) {
  const bloklar = []
  let metin = []
  let i = 0
  const metniBosalt = () => {
    const t = metin.join('\n').trim()
    if (t) bloklar.push({ tur: 'metin', deger: t })
    metin = []
  }
  while (i < satirlar.length) {
    const s = satirlar[i]
    const acilis = /^```(\w*)\s*$/.exec(s)
    if (acilis) {
      metniBosalt()
      const kod = []
      const satir = baslangicSatiri + i
      i++
      while (i < satirlar.length && !/^```\s*$/.test(satirlar[i])) kod.push(satirlar[i++])
      if (i >= satirlar.length) throw new AyristirmaHatasi('Kapanmamış kod bloğu', satir)
      bloklar.push({ tur: 'kod', dil: acilis[1] || 'text', deger: kod.join('\n'), satir })
      i++
      continue
    }
    if (/^---\s*$/.test(s)) {
      metniBosalt()
      bloklar.push({ tur: 'ayirac' })
      i++
      continue
    }
    metin.push(s)
    i++
  }
  metniBosalt()
  return bloklar
}

/**
 * @param {string} kaynak .md dosyasının içeriği
 * @returns {MeydanOkuma}
 */
export function parseChallenge(kaynak) {
  const metin = kaynak.replace(/\r\n?/g, '\n')
  const on = /^---\n([\s\S]*?)\n---\n/.exec(metin)
  if (!on) throw new AyristirmaHatasi('Dosya "---" ile başlayan bir ön bilgi bloğuyla başlamalı', 1)
  const meta = onBilgiAyristir(on[1])
  for (const alan of ['id', 'title', 'challengeType']) {
    if (meta[alan] === undefined) throw new AyristirmaHatasi(`Ön bilgide "${alan}" zorunlu`)
  }
  const govdeBasi = on[0].split('\n').length - 1
  // Kod bloğu dışındaki yalnızca-yorum satırlarını (<!-- … -->) boşalt: bu klasördeki dosyalar Prettier
  // biçimlendirmesinden korunmak için <!-- prettier-ignore-start/end --> içerir. Satır sayısı korunur.
  let yorumKodda = false
  const satirlar = metin
    .slice(on[0].length)
    .split('\n')
    .map((s) => {
      if (/^```/.test(s)) yorumKodda = !yorumKodda
      return !yorumKodda && /^\s*<!--.*-->\s*$/.test(s) ? '' : s
    })

  // 1) İşaretçi başlıklarını bul ve doğrula (kod blokları içindeki satırlar başlık sayılmaz).
  /** @type {{ ad: string, duzey: number, satir: number }[]} */
  const basliklar = []
  let kodda = false
  satirlar.forEach((s, i) => {
    if (/^```/.test(s)) kodda = !kodda
    if (kodda) return
    const m = /^(#{1,6})\s+(--[\w-]+--)\s*$/.exec(s)
    if (!m) {
      if (s.trim() === DUZENLENEBILIR_BOLGE) {
        throw new AyristirmaHatasi(
          `${DUZENLENEBILIR_BOLGE} yalnızca kod bloğu içinde kullanılabilir`,
          govdeBasi + i + 1,
        )
      }
      return
    }
    const ad = m[2]
    const duzey = m[1].length
    if (!(ad in ISARETCILER)) throw new AyristirmaHatasi(`Geçersiz bölüm işaretçisi: ${m[0]}`, govdeBasi + i + 1)
    if (ISARETCILER[ad] !== duzey) {
      throw new AyristirmaHatasi(
        `${ad} başlık düzeyi ${ISARETCILER[ad]} olmalı ("${'#'.repeat(ISARETCILER[ad])} ${ad}")`,
        govdeBasi + i + 1,
      )
    }
    if (basliklar.some((b) => b.ad === ad)) throw new AyristirmaHatasi(`${ad} bölümü iki kez var`, govdeBasi + i + 1)
    basliklar.push({ ad, duzey, satir: i })
  })

  /** Bir başlığın gövdesi: bir sonraki aynı ya da daha üst düzey başlığa kadar. */
  const bolum = (ad) => {
    const k = basliklar.findIndex((b) => b.ad === ad)
    if (k < 0) return null
    const b = basliklar[k]
    const sonraki = basliklar.slice(k + 1).find((x) => x.duzey <= b.duzey)
    const bitis = sonraki ? sonraki.satir : satirlar.length
    // Alt başlıklar (ör. ## --seed-contents--) kendi bölümlerine aittir; üst bölüm onların öncesini alır.
    const altBaslik = basliklar.slice(k + 1).find((x) => x.duzey > b.duzey && x.satir < bitis)
    const gercekBitis = altBaslik ? altBaslik.satir : bitis
    return { satirlar: satirlar.slice(b.satir + 1, gercekBitis), ilkSatir: govdeBasi + b.satir + 2 }
  }

  const duzMetin = (ad) => {
    const b = bolum(ad)
    return b ? b.satirlar.join('\n').trim() : ''
  }

  // 2) İpuçları: her biri "açıklama metni + hemen ardından bir kod bloğu".
  /** @type {Ipucu[]} */
  const hints = []
  const ipucuBolumu = bolum('--hints--')
  if (ipucuBolumu) {
    let bekleyenMetin = null
    for (const blok of bloklaraBol(ipucuBolumu.satirlar, ipucuBolumu.ilkSatir)) {
      if (blok.tur === 'metin') {
        if (bekleyenMetin !== null) throw new AyristirmaHatasi(`İpucunun test kodu yok: "${bekleyenMetin}"`)
        bekleyenMetin = blok.deger
      } else if (blok.tur === 'kod') {
        if (bekleyenMetin === null) throw new AyristirmaHatasi('Açıklaması olmayan test kodu', blok.satir)
        hints.push({ text: bekleyenMetin, testString: blok.deger })
        bekleyenMetin = null
      }
    }
    if (bekleyenMetin !== null) throw new AyristirmaHatasi(`İpucunun test kodu yok: "${bekleyenMetin}"`)
  }

  // 3) Tohum (öğrencinin başlangıç kodu) ve düzenlenebilir bölge.
  /** @type {Tohum[]} */
  const seed = []
  const tohumBolumu = bolum('--seed-contents--')
  if (bolum('--seed--') && !tohumBolumu)
    throw new AyristirmaHatasi('## --seed-contents-- bölümü # --seed-- altında zorunlu')
  if (tohumBolumu) {
    for (const blok of bloklaraBol(tohumBolumu.satirlar, tohumBolumu.ilkSatir)) {
      if (blok.tur !== 'kod') continue
      seed.push(duzenlenebilirBolgeyiCikar(blok.dil, blok.deger, blok.satir))
    }
  }

  // 4) Çözümler: "---" ile ayrılmış, her biri bir ya da daha çok kod dosyası.
  /** @type {KodDosyasi[][]} */
  const solutions = []
  const cozumBolumu = bolum('--solutions--')
  if (cozumBolumu) {
    let simdiki = []
    for (const blok of bloklaraBol(cozumBolumu.satirlar, cozumBolumu.ilkSatir)) {
      if (blok.tur === 'kod') simdiki.push({ lang: blok.dil, contents: blok.deger })
      else if (blok.tur === 'ayirac' && simdiki.length) {
        solutions.push(simdiki)
        simdiki = []
      }
    }
    if (simdiki.length) solutions.push(simdiki)
  }

  // 5) Kancalar: her biri tek bir JS kod bloğu.
  /** @type {MeydanOkuma['hooks']} */
  const hooks = {}
  for (const [ad, alan] of [
    ['--before-all--', 'beforeAll'],
    ['--before-each--', 'beforeEach'],
    ['--after-each--', 'afterEach'],
    ['--after-all--', 'afterAll'],
  ]) {
    const b = bolum(ad)
    if (!b) continue
    const kodlar = bloklaraBol(b.satirlar, b.ilkSatir)
    if (kodlar.length !== 1 || kodlar[0].tur !== 'kod') {
      throw new AyristirmaHatasi(`# ${ad} bölümü tek bir kod bloğu içermeli`, b.ilkSatir)
    }
    if (!['js', 'javascript'].includes(kodlar[0].dil)) throw new AyristirmaHatasi(`# ${ad} JavaScript olmalı`)
    hooks[/** @type {'beforeAll'} */ (alan)] = kodlar[0].deger
  }

  return {
    ...meta,
    id: String(meta.id),
    title: String(meta.title),
    challengeType: Number(meta.challengeType),
    description: duzMetin('--description--'),
    instructions: duzMetin('--instructions--'),
    notes: duzMetin('--notes--'),
    hints,
    seed,
    solutions,
    hooks,
  }
}

/**
 * Tohum kodundaki `--fcc-editable-region--` satırlarını siler ve sınırlarını kaydeder
 * (gerçek: add-seed.js → editableRegionBoundaries). En fazla iki işaret olabilir.
 * @param {string} dil @param {string} kod @param {number} satir
 * @returns {Tohum}
 */
export function duzenlenebilirBolgeyiCikar(dil, kod, satir) {
  const satirlar = kod.split('\n')
  const isaretler = satirlar.map((s, i) => (s.trim() === DUZENLENEBILIR_BOLGE ? i : -1)).filter((i) => i >= 0)
  if (isaretler.length > 2) throw new AyristirmaHatasi('Düzenlenebilir bölgede ikiden fazla işaret var', satir)
  if (isaretler.length === 1) throw new AyristirmaHatasi('Düzenlenebilir bölge kapanmamış (tek işaret)', satir)
  const temiz = satirlar.filter((_, i) => !isaretler.includes(i))
  return {
    lang: dil,
    contents: temiz.join('\n'),
    // Sınırlar: işaret satırlarının SİLİNMEDEN ÖNCEKİ indeksleri (gerçek add-seed.js de böyle saklar);
    // editör bu iki satırın arasını düzenlenebilir yapar.
    editableRegionBoundaries: isaretler.length === 2 ? isaretler : [],
  }
}

/** Öğrencinin editörde göreceği başlangıç kodu. @param {MeydanOkuma} m */
export function baslangicKodu(m) {
  return m.seed.map((s) => s.contents).join('\n')
}
