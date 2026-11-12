// Komut satırı:
//   node cli.js tara <url> [--limit 10] [--derinlik 3] [--gecikme 1] [--yerel] [--json]
//   node cli.js kazi <url> [--yerel]
//   node cli.js sunucu [--port 3002] [--yerel]
//
// --yerel: 127.0.0.1 gibi özel adreslere izin verir (yalnızca kendi makinende dene).
// kazi, API'deki POST /v2/scrape ile aynı işlevi kullanır: aynı adres ve yönlendirme denetimi; robots.txt'ye bakmaz.
// Gerçek sitelerde: robots.txt'ye uy, --gecikme ile hızını sınırla, kullanım koşullarını oku.

import { parseArgs } from 'node:util'
import { Tarayici } from './asama5_tarayici.js'
import { apiSunucusu, tekSayfaKazi } from './asama6_api.js'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '10' },
    derinlik: { type: 'string' },
    gecikme: { type: 'string', default: '0' },
    port: { type: 'string', default: '3002' },
    yerel: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
})
const [komut, url] = positionals

/** @param {unknown} hata */
function hataYaz(hata) {
  const mesaj = hata instanceof Error ? hata.message : String(hata)
  const ipucu = /SSRF/.test(mesaj) ? ' — yalnızca kendi makinende denerken --yerel ekle' : ''
  console.error(`hata: ${mesaj}${ipucu}`)
  process.exitCode = 1
}

if (komut === 'tara' && url) {
  const tarayici = new Tarayici(url, {
    limit: Number(values.limit),
    maxDiscoveryDepth: values.derinlik === undefined ? Infinity : Number(values.derinlik),
    delay: Number(values.gecikme),
    allowPrivateNetwork: values.yerel,
  })
  try {
    const sonuc = await tarayici.calistir({
      onSayfa: (belge) => console.error(`[tarandı] ${belge.metadata.url} (${belge.metadata.statusCode})`),
    })
    if (values.json) console.log(JSON.stringify(sonuc, null, 2))
    else for (const belge of sonuc.belgeler) console.log(`<!-- ${belge.metadata.url} -->\n${belge.markdown}`)
    console.error(`${sonuc.belgeler.length} sayfa, ${Object.keys(sonuc.reddedilenler).length} reddedilen bağlantı`)
  } catch (hata) {
    hataYaz(hata)
  }
} else if (komut === 'kazi' && url) {
  try {
    const { sayfa } = await tekSayfaKazi(url, { yerelAgIzni: values.yerel })
    console.log(sayfa.markdown)
  } catch (hata) {
    hataYaz(hata)
  }
} else if (komut === 'sunucu') {
  const { sunucu } = apiSunucusu({ yerelAgIzni: values.yerel })
  sunucu.listen(Number(values.port), () => console.error(`API http://localhost:${values.port}/v2 adresinde`))
} else {
  console.error('Kullanım: node cli.js tara <url> | kazi <url> | sunucu [--port 3002] [--yerel]')
  process.exitCode = 1
}
