// Statik site üretici: `node olustur.js [ornek-klasoru] [cikti-klasoru]`
// Yol haritası JSON'unu ve konu dosyalarını okur, doğrular, tek dosyalık bir HTML sayfası yazar.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dogrula, icerikFarki, konuDosyaAdi, konuDugumleri } from './asama1_model.js'
import { htmlSayfasi } from './asama2_cizim.js'
import { konuAyristir, konuDogrula, konuHtml } from './asama3_konu.js'

/**
 * @param {string} kaynak yol haritası klasörü (içinde <slug>.json ve content/)
 * @param {string} cikti
 */
export function olustur(kaynak, cikti) {
  const json = fs.readdirSync(kaynak).find((d) => d.endsWith('.json'))
  if (!json) throw new Error(`${kaynak} içinde yol haritası JSON'u yok`)
  const belge = JSON.parse(fs.readFileSync(path.join(kaynak, json), 'utf8'))
  const hatalar = dogrula(belge)
  const icerikKlasoru = path.join(kaynak, 'content')
  const dosyalar = fs.existsSync(icerikKlasoru) ? fs.readdirSync(icerikKlasoru) : []
  for (const i of icerikFarki(belge, dosyalar)) hatalar.push(`${i.tur}: ${i.dosya} (${i.sebep})`)
  /** @type {Map<string, { baslik: string, html: string }>} */
  const konular = new Map()
  for (const d of konuDugumleri(belge)) {
    const yol = path.join(icerikKlasoru, konuDosyaAdi(d))
    if (!fs.existsSync(yol)) continue
    const konu = konuAyristir(fs.readFileSync(yol, 'utf8'))
    for (const h of konuDogrula(konu)) hatalar.push(`${konuDosyaAdi(d)}: ${h}`)
    konular.set(d.id, { baslik: konu.baslik, html: konuHtml(konu) })
  }
  if (hatalar.length) throw new Error(`Yol haritası geçersiz:\n- ${hatalar.join('\n- ')}`)
  fs.mkdirSync(cikti, { recursive: true })
  const hedef = path.join(cikti, 'index.html')
  fs.writeFileSync(hedef, htmlSayfasi({ belge, konular }))
  return { hedef, konuSayisi: konular.size }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const burasi = path.dirname(fileURLToPath(import.meta.url))
  const [kaynak = path.join(burasi, 'ornek'), cikti = path.join(burasi, 'cikti')] = process.argv.slice(2)
  const { hedef, konuSayisi } = olustur(kaynak, cikti)
  console.log(`${konuSayisi} konu yazıldı: ${hedef}`)
}
