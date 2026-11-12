// Komut satırı:
//   node cli.js calistir ornekler/siparis-akisi.json      # elle tetikle, günlüğü ve sonucu yaz
//   node cli.js sunucu ornekler/webhook-akisi.json [--port 5678]
//   curl -X POST localhost:5678/webhook/siparis -H 'content-type: application/json' -d '{"tutar": 250}'

import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { akisiCalistir, dugumCiktisi, IsAkisi } from './asama3_motor.js'
import { webhookSunucusu } from './asama4_webhook.js'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { port: { type: 'string', default: '5678' } },
})
const [komut, ...dosyalar] = positionals
const akislar = await Promise.all(dosyalar.map(async (d) => JSON.parse(await readFile(d, 'utf8'))))

if (komut === 'calistir' && akislar.length === 1) {
  const sonuc = await akisiCalistir(new IsAkisi(akislar[0]))
  for (const { zaman, dugum, mesaj } of sonuc.gunluk)
    console.log(`${zaman.slice(11, 23)}  ${dugum.padEnd(22)} ${mesaj}`)
  const son = sonuc.data.resultData.lastNodeExecuted
  console.log(`\nDurum: ${sonuc.status} | son düğüm: ${son}`)
  console.log(
    JSON.stringify(
      dugumCiktisi(sonuc, son).map((o) => o.json),
      null,
      2,
    ),
  )
  if (sonuc.status !== 'success') process.exitCode = 1
} else if (komut === 'sunucu' && akislar.length) {
  const { sunucu, kayitli } = webhookSunucusu({ akislar })
  sunucu.listen(Number(values.port), () => {
    for (const anahtar of kayitli.keys()) {
      const [yontem, yol] = anahtar.split(' ')
      console.log(`${yontem} http://localhost:${values.port}/webhook/${yol}`)
    }
    console.log(`Yürütmeler: http://localhost:${values.port}/executions`)
  })
} else {
  console.error('Kullanım: node cli.js calistir <akis.json> | sunucu <akis.json...> [--port 5678]')
  process.exitCode = 1
}
