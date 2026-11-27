// Sabitlenmiş "Apple Root CA - G3" kökünü denetler.
//
//   node scripts/kok-denetle.mjs                     → src/kok.ts içindeki PEM ile parmak izinin birbirini tuttuğunu denetler
//   node scripts/kok-denetle.mjs AppleRootCA-G3.cer  → ayrıca Apple'dan indirilen dosyayla bayt bayt karşılaştırır
//
// Apple'ın yayımladığı dosya: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// Çıkış kodu: 0 = tutuyor, 1 = tutmuyor ya da okunamadı.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const kaynak = readFileSync(new URL('../src/kok.ts', import.meta.url), 'utf8')
const pem = /-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----/.exec(kaynak)
const yazili = /APPLE_KOK_G3_SHA256 = '([0-9a-f]{64})'/.exec(kaynak)
if (pem === null || yazili === null) {
  console.error('HATA: src/kok.ts içinde PEM ya da parmak izi bulunamadı.')
  process.exit(1)
}

const parmakIzi = (baytlar) => createHash('sha256').update(baytlar).digest('hex')
const iki = (onaltilik) => onaltilik.toUpperCase().replace(/(..)(?=.)/g, '$1:')

const sabitDer = Buffer.from(pem[1].replace(/\s+/g, ''), 'base64')
const sabitIz = parmakIzi(sabitDer)
console.log(`Sabitlenmiş kök (SHA-256): ${iki(sabitIz)}`)
if (sabitIz !== yazili[1]) {
  console.error(`HATA: PEM ile kaynakta yazılı parmak izi tutmuyor (yazılı: ${iki(yazili[1])}).`)
  process.exit(1)
}
console.log('PEM ile kaynakta yazılı parmak izi aynı.')

const dosya = process.argv[2]
if (dosya !== undefined) {
  let indirilen
  try {
    indirilen = readFileSync(dosya)
  } catch {
    console.error(`HATA: ${dosya} okunamadı.`)
    process.exit(1)
  }
  // Dosya DER ya da PEM olabilir.
  const metin = indirilen.toString('latin1')
  const der = metin.includes('-----BEGIN CERTIFICATE-----')
    ? Buffer.from(metin.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''), 'base64')
    : indirilen
  const iz = parmakIzi(der)
  console.log(`Verilen dosya     (SHA-256): ${iki(iz)}`)
  if (!der.equals(sabitDer)) {
    console.error("HATA: Sabitlenmiş kök, verilen dosyayla aynı DEĞİL. Yayımlamayın; src/kok.ts'i inceleyin.")
    process.exit(1)
  }
  console.log('Sabitlenmiş kök, verilen dosyayla bayt bayt aynı.')
}
