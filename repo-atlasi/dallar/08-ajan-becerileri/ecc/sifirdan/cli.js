#!/usr/bin/env node
// Komut satırı:
//   node cli.js plan    [--kaynak kaynak.json] [--hedefler claude,codex]
//   node cli.js uygula  --cikti /tmp/demo [--kaynak kaynak.json] [--hedefler ...] [--zorla]
//   node cli.js denetle --cikti /tmp/demo [--kaynak kaynak.json] [--hedefler ...]
//   node cli.js kaldir  --cikti /tmp/demo
//   node cli.js icgudu  [--dosya kaynak/icguduler.json] [--proje ornek-proje] [--yigin python,react]

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { baglamMetni, sec } from './icguduler.js'
import { denetle, kaldir, uygula } from './kurulum.js'
import { kaynagiYukle, planla } from './uretici.js'

const KLASOR = path.dirname(fileURLToPath(import.meta.url))

export function ana(argv, yaz = (s) => process.stdout.write(s + '\n')) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      kaynak: { type: 'string', default: path.join(KLASOR, 'kaynak.json') },
      hedefler: { type: 'string' },
      cikti: { type: 'string' },
      zorla: { type: 'boolean', default: false },
      dosya: { type: 'string', default: path.join(KLASOR, 'kaynak', 'icguduler.json') },
      proje: { type: 'string', default: 'ornek-proje' },
      yigin: { type: 'string', default: '' },
    },
  })
  const komut = positionals[0]
  if (komut === 'icgudu') {
    const secilen = sec(JSON.parse(readFileSync(values.dosya, 'utf8')), {
      proje: values.proje,
      yigin: values.yigin.split(',').filter(Boolean),
    })
    yaz(baglamMetni(secilen))
    return 0
  }
  if (komut === 'kaldir') {
    yaz(JSON.stringify(kaldir(gerekli(values.cikti)), null, 2))
    return 0
  }
  const kaynak = kaynagiYukle(values.kaynak)
  const hedefler = values.hedefler ? values.hedefler.split(',') : kaynak.hedefler
  const plan = planla(kaynak, hedefler)
  if (komut === 'plan') {
    for (const islem of plan.islemler) yaz(`${islem.sha256.slice(0, 12)}  ${islem.hedef.padEnd(15)} ${islem.yol}`)
    for (const uyari of plan.uyarilar) yaz(`uyarı: ${uyari}`)
    return 0
  }
  if (komut === 'uygula') {
    const rapor = uygula(plan, gerekli(values.cikti), { zorla: values.zorla, kaynakSurumu: kaynak.surum })
    yaz(JSON.stringify(rapor, null, 2))
    return rapor.atlanan.length ? 1 : 0
  }
  if (komut === 'denetle') {
    const sonuc = denetle(plan, gerekli(values.cikti))
    yaz(JSON.stringify(sonuc, null, 2))
    const temiz = ['eksik', 'eski', 'elle_degismis', 'sahipsiz', 'yetim'].every((k) => sonuc[k].length === 0)
    return temiz ? 0 : 1
  }
  throw new Error(`bilinmeyen komut: ${komut ?? '(yok)'} — plan | uygula | denetle | kaldir | icgudu`)
}

function gerekli(cikti) {
  if (!cikti) throw new Error('--cikti klasörü gerekli')
  return path.resolve(cikti)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = ana(process.argv.slice(2))
}
