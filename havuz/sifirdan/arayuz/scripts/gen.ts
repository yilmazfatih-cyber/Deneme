// Üreteç: `npm run gen -- <ad>` yeni bir mini sistemin iskeletini kurar ve kayıtlara ekler:
//   src/<ad>/index.ts + README.md, test/<ad>/<ad>.test.ts, demo/<ad>/index.html + main.ts,
//   demo/gosterimler.json'a kayıt, e2e/etkilesimler.ts'e temel etkileşim.
// Sonra yapılacaklar ekrana yazılır. Ad: küçük harf, ASCII, alt çizgi (ör. `surukle_birak`).
// Genişletme: yeni bir şablon dosyası gerekiyorsa `files` listesine (yol → içerik) ekleyin.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = join(import.meta.dirname, '..')
const name = process.argv[2]
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error('Kullanım: npm run gen -- <ad>   (küçük harf, ASCII, alt çizgi; ör. surukle_birak)')
  process.exit(1)
}
if (existsSync(join(root, 'src', name))) {
  console.error(`src/${name} zaten var. Başka bir ad seçin.`)
  process.exit(1)
}
const title = name
  .split('_')
  .map((w) => (w[0] ?? '').toLocaleUpperCase('tr-TR') + w.slice(1))
  .join(' ')

const files: Record<string, string> = {
  [`src/${name}/index.ts`]: `// ${name} — (bir cümleyle: bu sistem ne yapar?).
// Dışarıya açılan tek giriş noktası budur; ayrıntılı anlatım README.md'de.
// (Bu dosya \`npm run gen -- ${name}\` ile üretildi; aşağıdaki örneği gerçek kodla değiştirin.)
// Genişletme: yeni parça ayrı bir dosyada yazılıp buradan dışa aktarılır.

/** Örnek işlev: yerine sistemin asıl işlevini yazın (testini de güncelleyin). */
export function example(input: string): string {
  return input.trim()
}
`,
  [`src/${name}/README.md`]: `# ${name} — ${title}

## Ne yapar

(2–4 cümle: bu sistem neyi, neden yapar? Küçük bir kullanım örneği.)

## Nasıl çalışır

(Çizim/akış + ana algoritmanın açıklaması. Zor kısımları ve neden öyle yapıldığını yazın.)

## Dosya haritası

| Dosya      | Sorumluluk         |
| ---------- | ------------------ |
| \`index.ts\` | Dışa açılan yüzey  |

## Sınırlar

(Ne yok, ne denenmedi, nerede yanılıyor olabilir?)

## Buradan nereye

(Sonraki 2–4 mantıklı genişletme.)
`,
  [`test/${name}/${name}.test.ts`]: `import { describe, expect, it } from 'vitest'
import { example } from '../../src/${name}/index.ts'

describe('${name}', () => {
  it('örnek: boşlukları kırpar', () => {
    expect(example('  merhaba  ')).toBe('merhaba')
  })
})
`,
  [`demo/${name}/index.html`]: `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${title} — sıfırdan arayüz</title>
    <link rel="stylesheet" href="../ortak/stil.css" />
  </head>
  <body>
    <header class="ust">
      <div class="kap">
        <a class="geri" href="../../">← Tüm gösterimler</a>
        <h1>${title}</h1>
        <p class="alt-baslik">(Gösterimin bir cümlelik açıklaması.)</p>
      </div>
    </header>
    <main class="kap" id="icerik">
      <section class="panel" aria-labelledby="ornek-baslik">
        <h2 id="ornek-baslik">Örnek</h2>
        <label for="girdi">Metin</label>
        <div class="satir">
          <input id="girdi" value="  merhaba  " />
          <button type="button" class="birincil" id="calistir">Çalıştır</button>
        </div>
        <p id="sonuc" role="status"></p>
      </section>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
  [`demo/${name}/main.ts`]: `// ${name} gösterimi: (ne gösterir?). Kullanıcıya görünen dinamik metinler demo/metin.ts'e taşınmalı.
// Genişletme: yeni etkileşim = HTML'de bir öğe + burada bir olay dinleyicisi.
import { example } from '../../src/${name}/index.ts'

const input = document.getElementById('girdi') as HTMLInputElement
const result = document.getElementById('sonuc') as HTMLElement
document.getElementById('calistir')?.addEventListener('click', () => {
  result.textContent = example(input.value)
})
`,
}

for (const [path, content] of Object.entries(files)) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  console.log(`oluşturuldu: ${path}`)
}

const registryPath = join(root, 'demo/gosterimler.json')
const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<string, string>[]
registry.push({
  ad: name,
  baslik: title,
  ogretir: '(Ne öğretir? Bir cümle.)',
  etkilesim: '(Kullanıcı ne yapar? Bir cümle.)',
})
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
console.log('güncellendi: demo/gosterimler.json')

const e2ePath = join(root, 'e2e/etkilesimler.ts')
const marker = '  // YENİ GÖSTERİM BURAYA'
const e2e = readFileSync(e2ePath, 'utf8')
if (!e2e.includes(marker)) throw new Error(`e2e/etkilesimler.ts içinde "${marker.trim()}" işareti bulunamadı.`)
const entry = `  ${name}: async (page) => {
    await page.getByRole('button', { name: 'Çalıştır' }).click()
    await expect(page.getByRole('status')).toHaveText('merhaba')
  },
`
writeFileSync(e2ePath, e2e.replace(marker, `${entry}${marker}`))
console.log('güncellendi: e2e/etkilesimler.ts')

console.log(`
Sıradaki adımlar:
  1. src/${name}/ altında asıl kodu yazın (dosya başına ~300 satır, Türkçe başlık + "Genişletme:" satırı).
  2. src/${name}/README.md bölümlerini doldurun; her dosyayı "Dosya haritası"na ekleyin.
  3. test/${name}/ altına gerçek testler yazın.
  4. demo/gosterimler.json'daki açıklamaları ve e2e/etkilesimler.ts'teki etkileşimi düzeltin.
  5. README.md (kök) dizin tablosuna bir satır ekleyin.
  6. Denetim: npm run check  ·  Tarayıcı: npm run e2e
`)
