// Komut satırından bir meydan okumayı dene:
//   node cli.js <meydan-okuma.md> [cozum.js]
// Çözüm dosyası verilmezse önce başlangıç kodu (kalmalı), sonra dosyadaki ilk çözüm (geçmeli) denenir.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baslangicKodu, parseChallenge } from './asama1_ayristirici.js'
import { runTests } from './asama2_calistirici.js'

/** @param {import('./asama2_calistirici.js').CalismaSonucu} r */
function raporla(baslik, r) {
  console.log(`\n${baslik}`)
  for (const s of r.sonuclar)
    console.log(`  [${s.gecti ? 'GEÇTİ' : 'KALDI'}] ${s.text}${s.hata ? `\n          → ${s.hata}` : ''}`)
  if (r.konsol.length) console.log(`  konsol: ${r.konsol.join(' | ')}`)
  console.log(`  Sonuç: ${r.hepsiGecti ? 'tüm testler geçti' : 'eksikler var'}`)
}

export async function main(argv) {
  const [dosya, cozumDosyasi] = argv
  if (!dosya) {
    console.error('kullanım: node cli.js <meydan-okuma.md> [cozum.js]')
    return 2
  }
  const m = parseChallenge(fs.readFileSync(dosya, 'utf8'))
  console.log(`${m.title}  (id ${m.id}, tür ${m.challengeType})`)
  if (m.instructions) console.log(`\nYönerge: ${m.instructions}`)
  if (cozumDosyasi) {
    const r = await runTests({ challenge: m, code: fs.readFileSync(cozumDosyasi, 'utf8') })
    raporla(`Senin çözümün (${path.basename(cozumDosyasi)}):`, r)
    return r.hepsiGecti ? 0 : 1
  }
  raporla('Başlangıç kodu:', await runTests({ challenge: m, code: baslangicKodu(m) }))
  const cozum = m.solutions[0]?.map((d) => d.contents).join('\n') ?? ''
  const r = await runTests({ challenge: m, code: cozum })
  raporla('Dosyadaki çözüm:', r)
  return r.hepsiGecti ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2))
}
