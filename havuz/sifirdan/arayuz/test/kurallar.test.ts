// Kural testleri: temelin kendi kurallarını korur. Her iletide düzeltme adımı yazar.
// 1) Kayıttaki (demo/gosterimler.json) her sistemin kaynağı, README'si, testi, gösterimi, e2e etkileşimi var.
// 2) README zorunlu bölümleri içerir ve sistemin her kaynak dosyasını "Dosya haritası"nda anar.
// 3) Her kaynak dosya Türkçe başlık yorumu + "Genişletme:" satırıyla açılır; 300 satırı aşmaz.
// 4) Düz toUpperCase()/toLowerCase() yok (Türkçe i/ı tuzağı).
// 5) Sistemler birbirini içe aktarmaz (izinli istisnalar listede); çalışma zamanı bağımlılığı yok.
// Genişletme: yeni kural = yeni bir `it(...)`; iletisi ne yapılacağını söylemeli.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const registry = JSON.parse(read('demo/gosterimler.json')) as {
  ad: string
  baslik: string
  ogretir: string
  etkilesim: string
}[]
const SECTIONS = ['## Ne yapar', '## Nasıl çalışır', '## Dosya haritası', '## Sınırlar', '## Buradan nereye']
/** Sistemler arası izinli içe aktarmalar (kaynak dosya → hedef sistem). */
const ALLOWED_CROSS_IMPORTS: Record<string, string[]> = { 'src/yonlendirici/signal_adapter.ts': ['sinyal'] }
const MAX_LINES = 300

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = join(dir, entry)
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}
const sourceFiles = (system: string) => walk(`src/${system}`).filter((p) => /\.tsx?$/.test(p))

describe('kayıt ve klasörler', () => {
  it('kayıttaki her sistemin kaynağı, README, testi, gösterimi ve e2e etkileşimi var', () => {
    const e2e = read('e2e/etkilesimler.ts')
    const rootReadme = read('README.md')
    for (const { ad, baslik, ogretir, etkilesim } of registry) {
      const fix = `(iskelet için: npm run gen -- ${ad})`
      expect(existsSync(join(ROOT, `src/${ad}/index.ts`)), `src/${ad}/index.ts eksik ${fix}`).toBe(true)
      expect(existsSync(join(ROOT, `src/${ad}/README.md`)), `src/${ad}/README.md eksik ${fix}`).toBe(true)
      const tests = existsSync(join(ROOT, `test/${ad}`))
        ? walk(`test/${ad}`).filter((p) => /\.test\.tsx?$/.test(p))
        : []
      expect(tests.length, `test/${ad}/ altında en az bir *.test.ts olmalı ${fix}`).toBeGreaterThan(0)
      expect(existsSync(join(ROOT, `demo/${ad}/index.html`)), `demo/${ad}/index.html eksik ${fix}`).toBe(true)
      expect(
        new RegExp(`^ {2}${ad}: async`, 'm').test(e2e),
        `e2e/etkilesimler.ts içine "${ad}" etkileşimi ekleyin`,
      ).toBe(true)
      expect(rootReadme.includes(`demo/${ad}/`), `Kök README.md dizin tablosuna ${ad} satırını ekleyin`).toBe(true)
      for (const field of [baslik, ogretir, etkilesim])
        expect(field.trim().startsWith('('), `demo/gosterimler.json: ${ad} açıklamalarını doldurun`).toBe(false)
    }
  })

  it('src altındaki her klasör kayıtta', () => {
    const names = new Set(registry.map((g) => g.ad))
    for (const dir of readdirSync(join(ROOT, 'src'))) {
      expect(names.has(dir), `src/${dir} demo/gosterimler.json kaydında yok: bir girdi ekleyin`).toBe(true)
    }
  })
})

describe('belgeler', () => {
  it.each(registry.map((g) => g.ad))('%s README: zorunlu bölümler ve tüm dosyalar', (ad) => {
    const readme = read(`src/${ad}/README.md`)
    for (const section of SECTIONS)
      expect(readme.includes(section), `src/${ad}/README.md içine "${section}" bölümünü ekleyin`).toBe(true)
    for (const file of sourceFiles(ad)) {
      const local = relative(`src/${ad}`, file)
      const mentioned = readme.includes(local) || readme.includes(local.split('/').pop() as string)
      expect(mentioned, `src/${ad}/README.md "Dosya haritası"na ${local} satırını ekleyin`).toBe(true)
    }
  })
})

describe('kaynak dosyalar', () => {
  const files = walk('src').filter((p) => /\.tsx?$/.test(p))

  it.each(files)('%s: başlık yorumu, "Genişletme:" satırı, en çok 300 satır', (file) => {
    const text = read(file)
    const lines = text.split('\n')
    expect(lines[0]?.startsWith('//'), `${file}: dosya 3–10 satırlık Türkçe bir başlık yorumuyla açılmalı`).toBe(true)
    expect(
      lines.slice(0, 14).some((l) => l.includes('Genişletme:')),
      `${file}: başlığa "Genişletme:" satırı ekleyin`,
    ).toBe(true)
    expect(lines.length, `${file}: ${MAX_LINES} satırı aşıyor; sorumluluğu ayrı bir dosyaya bölün`).toBeLessThanOrEqual(
      MAX_LINES + 1,
    )
  })

  it('düz toUpperCase()/toLowerCase() kullanılmaz (Türkçe i/ı tuzağı)', () => {
    const all = [...walk('src'), ...walk('demo'), ...walk('test'), ...walk('e2e'), ...walk('scripts')].filter((p) =>
      /\.(tsx?|js)$/.test(p),
    )
    for (const file of all) {
      const text = read(file).replace(/\/\/.*$/gm, '')
      expect(
        /\.to(Upper|Lower)Case\(/.test(text),
        `${file}: toLocaleUpperCase('tr-TR') / toLocaleLowerCase('tr-TR') kullanın`,
      ).toBe(false)
    }
  })

  it('sistemler birbirini içe aktarmaz (izinli istisnalar dışında)', () => {
    for (const file of walk('src').filter((p) => /\.tsx?$/.test(p))) {
      const system = file.split('/')[1] as string
      for (const match of read(file).matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
        const target = join(file, '..', match[1] as string)
        const targetSystem = relative('src', target).split('/')[0] as string
        if (targetSystem === system) continue
        const allowed = ALLOWED_CROSS_IMPORTS[file]?.includes(targetSystem) ?? false
        expect(
          allowed,
          `${file} → ${targetSystem}: sistemler bağımsız kalmalı; yardımcıyı kopyalayın ya da ALLOWED_CROSS_IMPORTS'a gerekçeyle ekleyin`,
        ).toBe(true)
      }
    }
  })

  it('çalışma zamanı bağımlılığı yok; havuz.json geçerli', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> }
    expect(
      pkg.dependencies,
      'package.json: sistemler bağımlılıksızdır; yalnız devDependencies kullanın',
    ).toBeUndefined()
    const havuz = JSON.parse(read('havuz.json')) as Record<string, unknown>
    for (const key of ['ad', 'baslik', 'ozet', 'tur', 'kur', 'denetle', 'uzunDenetim', 'baslat'])
      expect(havuz[key], `havuz.json: "${key}" alanı eksik`).toBeDefined()
  })
})
