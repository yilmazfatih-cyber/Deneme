// Aşama 3 — Müfredat yapısı, ilerleme ve sertifika modeli.
//
// Gerçek düzen (curriculum/ klasörü):
//   structure/curriculum.json          → süper blokların ve sertifikaların listesi
//   structure/superblocks/<sb>.json    → süper bloğun blokları (yeni müfredatta chapters → modules → blocks)
//   structure/blocks/<blok>.json       → challengeOrder: [{ id, title }]
//   challenges/english/blocks/<blok>/<id>.md          → meydan okumanın kendisi
//   challenges/english/certifications/<sertifika>.yml → sertifikanın istediği projeler (tests: [{ id, title }])
// Sertifika talebi API'de doğrulanır: api/src/routes/protected/certificate.ts → "/certificate/verify";
// koşul, sertifikanın her test kimliğinin kullanıcının completedChallenges listesinde olmasıdır.
// Biz sertifikayı YAML yerine JSON tutuyoruz (YAML ayrıştırıcı yazmamak için).

import fs from 'node:fs'
import path from 'node:path'
import { parseChallenge } from './asama1_ayristirici.js'

/** @param {string} dosya */
const jsonOku = (dosya) => JSON.parse(fs.readFileSync(dosya, 'utf8'))

/**
 * @typedef {import('./asama1_ayristirici.js').MeydanOkuma} MeydanOkuma
 * @typedef {{ dashedName: string, title: string, challenges: MeydanOkuma[] }} Blok
 * @typedef {{ dashedName: string, title: string, blocks: Blok[] }} SuperBlok
 * @typedef {{ id: string, title: string, certification: string, tests: { id: string, title: string }[] }} Sertifika
 * @typedef {{ superBloklar: SuperBlok[], sertifikalar: Sertifika[], meydanOkumalar: Map<string, MeydanOkuma> }} Mufredat
 */

/**
 * Müfredatı diskten kurar ve tutarlılığını denetler (gerçek: build-curriculum.ts, get-challenges.ts ve
 * build-superblock.ts içindeki validateChallenges). Gerçek kod yalnızca kimlikleri denetler; blok JSON'undaki
 * başlıklar insan içindir ve denetlenmez. Biz öğretmek için başlık uyuşmazlığını da hata sayıyoruz.
 * @param {string} kok
 * @returns {Mufredat}
 */
export function mufredatiYukle(kok) {
  const yapi = jsonOku(path.join(kok, 'structure', 'curriculum.json'))
  /** @type {Map<string, MeydanOkuma>} */
  const meydanOkumalar = new Map()
  const hatalar = []

  const superBloklar = yapi.superblocks.map((sbAdi) => {
    const sb = jsonOku(path.join(kok, 'structure', 'superblocks', `${sbAdi}.json`))
    const blocks = sb.blocks.map((blokAdi) => {
      const blok = jsonOku(path.join(kok, 'structure', 'blocks', `${blokAdi}.json`))
      const klasor = path.join(kok, 'challenges', 'blocks', blokAdi)
      const dosyalar = new Set(fs.readdirSync(klasor).filter((d) => d.endsWith('.md')))
      const challenges = blok.challengeOrder.map(({ id, title }) => {
        const dosya = `${id}.md`
        if (!dosyalar.has(dosya)) {
          hatalar.push(`${blokAdi}: ${id} için dosya yok`)
          return null
        }
        dosyalar.delete(dosya)
        const m = parseChallenge(fs.readFileSync(path.join(klasor, dosya), 'utf8'))
        if (m.id !== id) hatalar.push(`${blokAdi}/${dosya}: ön bilgideki id (${m.id}) dosya adıyla uyuşmuyor`)
        if (m.title !== title) hatalar.push(`${blokAdi}/${dosya}: başlık blok sırasındakiyle uyuşmuyor`)
        if (meydanOkumalar.has(m.id)) hatalar.push(`${m.id} kimliği iki kez kullanılmış`)
        meydanOkumalar.set(m.id, m)
        return m
      })
      for (const sahipsiz of dosyalar) hatalar.push(`${blokAdi}/${sahipsiz}: challengeOrder'da yok (sahipsiz dosya)`)
      return { dashedName: blokAdi, title: blok.title, challenges: challenges.filter(Boolean) }
    })
    return { dashedName: sbAdi, title: sb.title, blocks }
  })

  const sertifikalar = yapi.certifications.map((ad) => {
    /** @type {Sertifika} */
    const s = jsonOku(path.join(kok, 'challenges', 'certifications', `${ad}.json`))
    for (const t of s.tests) {
      if (!meydanOkumalar.has(t.id)) hatalar.push(`${ad}: istenen proje ${t.id} müfredatta yok`)
    }
    return s
  })

  if (hatalar.length) throw new Error(`Müfredat tutarsız:\n- ${hatalar.join('\n- ')}`)
  return { superBloklar, sertifikalar, meydanOkumalar }
}

/**
 * Yüzdeleri hesaplar. Saf fonksiyon: girdileri değiştirmez.
 * @param {Mufredat} mufredat
 * @param {Iterable<string>} tamamlananIdler
 */
export function ilerlemeHesapla(mufredat, tamamlananIdler) {
  const bitti = new Set(tamamlananIdler)
  const yuzde = (n, toplam) => (toplam === 0 ? 0 : Math.round((100 * n) / toplam))
  return mufredat.superBloklar.map((sb) => {
    const bloklar = sb.blocks.map((b) => {
      const n = b.challenges.filter((c) => bitti.has(c.id)).length
      return { blok: b.dashedName, tamamlanan: n, toplam: b.challenges.length, yuzde: yuzde(n, b.challenges.length) }
    })
    const n = bloklar.reduce((t, b) => t + b.tamamlanan, 0)
    const toplam = bloklar.reduce((t, b) => t + b.toplam, 0)
    return { superBlok: sb.dashedName, tamamlanan: n, toplam, yuzde: yuzde(n, toplam), bloklar }
  })
}

/**
 * @param {Sertifika} sertifika
 * @param {Iterable<string>} tamamlananIdler
 */
export function sertifikaDurumu(sertifika, tamamlananIdler) {
  const bitti = new Set(tamamlananIdler)
  const eksikler = sertifika.tests.filter((t) => !bitti.has(t.id))
  return { uygun: eksikler.length === 0, eksikler }
}

/**
 * @typedef {{ kullaniciAdi: string, completedChallenges: { id: string, completedDate: number }[],
 *             sertifikalar: Record<string, { tarih: number }> }} Kullanici
 */

/**
 * Bir meydan okumayı tamamlandı işaretler. Aynı id ikinci kez eklenmez. Saf: yeni nesne döner.
 * @param {Kullanici} kullanici @param {string} id @param {number} [tarih]
 * @returns {Kullanici}
 */
export function tamamla(kullanici, id, tarih = Date.now()) {
  if (kullanici.completedChallenges.some((c) => c.id === id)) return kullanici
  return { ...kullanici, completedChallenges: [...kullanici.completedChallenges, { id, completedDate: tarih }] }
}

/**
 * Sertifika talebi (gerçek: "/certificate/verify"): bütün projeler bitmişse sertifikayı ekler.
 * @param {Kullanici} kullanici @param {Sertifika} sertifika @param {number} [tarih]
 * @returns {{ basarili: true, kullanici: Kullanici } | { basarili: false, sebep: string, eksikler?: string[] }}
 */
export function sertifikaTalepEt(kullanici, sertifika, tarih = Date.now()) {
  if (kullanici.sertifikalar[sertifika.certification]) {
    return { basarili: false, sebep: 'Bu sertifika zaten alınmış' }
  }
  const { uygun, eksikler } = sertifikaDurumu(
    sertifika,
    kullanici.completedChallenges.map((c) => c.id),
  )
  if (!uygun) {
    return { basarili: false, sebep: 'Eksik projeler var', eksikler: eksikler.map((e) => e.title) }
  }
  return {
    basarili: true,
    kullanici: { ...kullanici, sertifikalar: { ...kullanici.sertifikalar, [sertifika.certification]: { tarih } } },
  }
}
