// Komut satırı: veri/sayi-*.json dosyalarından bülten sayılarını, RSS akışını ve dizini üretir.
//
//   node cli.js veri cikti --site https://bulten.example [--izleme https://bulten.example/tikla]
//
// Her sayı, kendinden ÖNCEKİ sayılarda yer alan projelere karşı denetlenir (aynı proje iki kez
// öne çıkarılmaz). Hata varsa hiçbir dosya yazılmaz ve çıkış kodu 1 olur.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { dizinTablosu, dogrula, katkidaBulunanlar, numara, rssOlustur, sayiyiOlustur } from './aylik.js'

/** @returns {number} çıkış kodu */
export function calistir(argv, yaz = console.log, hataYaz = console.error) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { site: { type: 'string', default: 'https://bulten.example' }, izleme: { type: 'string' } },
  })
  const [veriKlasoru = 'veri', cikti = 'cikti'] = positionals
  const sayilar = readdirSync(veriKlasoru)
    .filter((ad) => /^sayi-\d+\.json$/.test(ad))
    .map((ad) => JSON.parse(readFileSync(join(veriKlasoru, ad), 'utf8')))
    .sort((a, b) => a.sayi - b.sayi)

  const oncekiler = new Map()
  const hatalar = []
  for (const sy of sayilar) {
    for (const h of dogrula(sy, oncekiler)) hatalar.push(`Sayı ${numara(sy.sayi)}: ${h}`)
    for (const p of sy.projeler ?? []) oncekiler.set(p.url.toLowerCase(), sy.sayi)
  }
  if (hatalar.length) {
    hatalar.forEach((h) => hataYaz(`[hata] ${h}`))
    return 1
  }

  mkdirSync(join(cikti, 'icerik'), { recursive: true })
  for (const sy of sayilar) {
    const metin = sayiyiOlustur(sy, { izlemeOneki: values.izleme })
    writeFileSync(join(cikti, 'icerik', `sayi-${numara(sy.sayi)}.md`), metin)
  }
  writeFileSync(join(cikti, 'rss.xml'), rssOlustur(sayilar, { site: values.site }))
  const kisiler = katkidaBulunanlar(sayilar).map(
    ({ kisi, adet }) => `- [@${kisi}](https://github.com/${kisi}) (${adet})`,
  )
  const dizin = ['# Açık Kaynak Aylık', '', dizinTablosu(sayilar), '## Öneren katkıcılar', '', ...kisiler, '']
  writeFileSync(join(cikti, 'README.md'), dizin.join('\n'))
  yaz(`${sayilar.length} sayı, ${oncekiler.size} proje -> ${cikti}/`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = calistir(process.argv.slice(2))
}
