// Aşama 1 — Yol haritası belgesi: düğümler, kenarlar, doğrulama ve konu dosyası adları.
//
// roadmap.sh'de bir yol haritası, düzenleyicide (draw.roadmap.sh) çizilen bir graf belgesidir: `nodes`
// (id, type, position, data.label) ve `edges` (source, target). Belgenin kendisi bu depoda değil, sitenin
// veritabanında durur; depoda yalnızca konu metinleri vardır: roadmaps/<slug>/content/<etiket-slug>@<düğüm-id>.md
// Gerçek: scripts/lib/official-roadmap.ts (OfficialRoadmapDocument), scripts/lib/slugger.ts (slugify),
//         scripts/sync-content-to-repo.ts (dosya adı), scripts/cleanup-orphaned-content.ts (yetim dosyalar).

/**
 * @typedef {{ id: string, type: string, position?: { x: number, y: number }, width?: number, height?: number,
 *             data?: { label?: string, [k: string]: unknown } }} Dugum
 * @typedef {{ id: string, source: string, target: string, data?: { edgeStyle?: 'solid' | 'dashed' } }} Kenar
 * @typedef {{ slug: string, title: string, nodes: Dugum[], edges: Kenar[] }} YolHaritasi
 */

/** İçerik dosyası olan düğüm türleri (gerçek temizlik betiği de yalnızca bunlara bakar). */
export const KONU_TURLERI = ['topic', 'subtopic']

/**
 * roadmap.sh'deki slug kuralının davranışı: küçült, [a-z0-9_- ] dışını at, kenar boşluklarını kırp, her boşluğu tire yap.
 * Türkçe harfler ASCII olmadığı için düşer: "Metin Araçları" → "metin-aralar". Bilerek böyle bıraktık; bkz. slugifyTr.
 * @param {string} deger
 */
export function slugify(deger) {
  if (typeof deger !== 'string') return ''
  let sonuc = ''
  for (const ch of deger.toLowerCase()) if (/[a-z0-9_\- ]/.test(ch)) sonuc += ch
  return sonuc.trim().split(' ').join('-')
}

const TR_ASCII = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'c',
  Ğ: 'g',
  I: 'i',
  İ: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
}

/**
 * Türkçe için düzeltilmiş slug: önce harfleri ASCII karşılığına çevir, sonra aynı kuralı uygula,
 * art arda gelen tireleri tek tireye indir.
 * @param {string} deger
 */
export function slugifyTr(deger) {
  if (typeof deger !== 'string') return ''
  const ascii = [...deger].map((ch) => TR_ASCII[ch] ?? ch).join('')
  return slugify(ascii).replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** @param {Dugum} d */
export const konuMu = (d) => KONU_TURLERI.includes(d.type) && typeof d.data?.label === 'string' && d.data.label !== ''

/** @param {YolHaritasi} belge */
export function konuDugumleri(belge) {
  return belge.nodes.filter(konuMu)
}

/**
 * İçerik dosyasının adı: <slug>@<id>.md
 * @param {Dugum} dugum @param {(s: string) => string} [slugFn]
 */
export function konuDosyaAdi(dugum, slugFn = slugifyTr) {
  return `${slugFn(String(dugum.data?.label ?? ''))}@${dugum.id}.md`
}

/** "slug@id.md" → { slug, id }; biçim tutmazsa null. @param {string} dosya */
export function dosyaAdiCoz(dosya) {
  const m = /^(.*)@([A-Za-z0-9_-]+)\.md$/.exec(dosya)
  return m ? { slug: m[1], id: m[2] } : null
}

/**
 * Belgeyi doğrular; hata listesi döner (boşsa geçerli).
 * @param {any} belge
 * @returns {string[]}
 */
export function dogrula(belge) {
  const hatalar = []
  if (!belge || typeof belge !== 'object') return ['belge bir nesne olmalı']
  if (typeof belge.slug !== 'string' || !/^[a-z0-9-]+$/.test(belge.slug))
    hatalar.push('slug küçük harf, rakam ve tire olmalı')
  if (typeof belge.title !== 'string' || !belge.title) hatalar.push('title zorunlu')
  if (!Array.isArray(belge.nodes)) return [...hatalar, 'nodes bir dizi olmalı']
  if (!Array.isArray(belge.edges)) return [...hatalar, 'edges bir dizi olmalı']

  const kimlikler = new Set()
  for (const d of belge.nodes) {
    if (typeof d.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(d.id)) {
      hatalar.push(`geçersiz düğüm kimliği: ${JSON.stringify(d.id)}`)
      continue
    }
    if (kimlikler.has(d.id)) hatalar.push(`düğüm kimliği iki kez kullanılmış: ${d.id}`)
    kimlikler.add(d.id)
    if (KONU_TURLERI.includes(d.type) && !konuMu(d)) hatalar.push(`${d.id}: konu düğümünün etiketi (data.label) yok`)
    if (d.position && (!Number.isFinite(d.position.x) || !Number.isFinite(d.position.y))) {
      hatalar.push(`${d.id}: konum sayısal olmalı`)
    }
  }
  const kenarKimlikleri = new Set()
  for (const k of belge.edges) {
    if (kenarKimlikleri.has(k.id)) hatalar.push(`kenar kimliği iki kez kullanılmış: ${k.id}`)
    kenarKimlikleri.add(k.id)
    if (!kimlikler.has(k.source)) hatalar.push(`${k.id}: kaynak düğüm yok (${k.source})`)
    if (!kimlikler.has(k.target)) hatalar.push(`${k.id}: hedef düğüm yok (${k.target})`)
    if (k.source === k.target) hatalar.push(`${k.id}: düğüm kendine bağlanamaz`)
  }
  // Etiketten slug üretilemiyorsa (ör. yalnızca emoji) dosya adı "@id.md" olur: hata say.
  for (const d of konuDugumleri(belge)) {
    if (!slugifyTr(String(d.data?.label))) hatalar.push(`${d.id}: etiketten slug üretilemedi`)
  }
  return hatalar
}

/**
 * Diskteki içerik dosyalarını belgeyle karşılaştırır (gerçek: cleanup-orphaned-content.ts):
 *   - aynı düğüm id'si, eski slug → yeniden adlandır (doğru dosya zaten varsa eskisini sil)
 *   - belgede olmayan düğüm id'si → sil
 *   - dosyası olmayan konu düğümü → eksik
 * @param {YolHaritasi} belge
 * @param {string[]} dosyalar
 * @param {(s: string) => string} [slugFn]
 */
export function icerikFarki(belge, dosyalar, slugFn = slugifyTr) {
  const beklenen = new Map(konuDugumleri(belge).map((d) => [d.id, konuDosyaAdi(d, slugFn)]))
  const mevcut = new Set(dosyalar)
  /** @type {{ tur: 'yeniden-adlandir' | 'sil' | 'eksik', dosya: string, yeni?: string, sebep: string }[]} */
  const islemler = []
  for (const dosya of [...dosyalar].sort()) {
    const coz = dosyaAdiCoz(dosya)
    if (!coz) {
      islemler.push({ tur: 'sil', dosya, sebep: 'ad biçimi slug@id.md değil' })
      continue
    }
    const dogruAd = beklenen.get(coz.id)
    if (!dogruAd) islemler.push({ tur: 'sil', dosya, sebep: 'düğüm yol haritasında yok' })
    else if (dogruAd !== dosya) {
      islemler.push(
        mevcut.has(dogruAd)
          ? { tur: 'sil', dosya, sebep: `doğru adlı dosya zaten var: ${dogruAd}` }
          : { tur: 'yeniden-adlandir', dosya, yeni: dogruAd, sebep: 'etiket değişmiş' },
      )
    }
  }
  const adlandirilacak = new Set(islemler.filter((i) => i.yeni).map((i) => i.yeni))
  for (const ad of [...beklenen.values()].sort()) {
    if (!mevcut.has(ad) && !adlandirilacak.has(ad)) islemler.push({ tur: 'eksik', dosya: ad, sebep: 'konu metni yok' })
  }
  return islemler
}
