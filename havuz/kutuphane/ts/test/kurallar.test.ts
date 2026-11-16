// Kural testleri: kütüphanenin değişmez kurallarını korur. Bir test kırılırsa iletisi ne yapılacağını söyler.
//  1. Her modül tek dosyadır ve başka modülü (ya da paketi) içe aktarmaz.     6. Görünmez karakter yok.
//  2. Her modülün testi vardır.                                              7. Büyük/küçük harf çağrıları gerekçeli.
//  3. README dizininde her modül doğru TS/Py işaretiyle listelidir.           8. Vektör dosyaları modüllerle eşleşir.
//  4. İki dilde olan modüllerin dışa açtığı adlar eşleşir.                    9. Kopyalama yardımcısı çalışır.
//  5. Her modülün başlığında Kullanım, Sınırlar ve Genişletme: vardır.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { copyModule } from '../kopyala.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TS_SRC = join(ROOT, 'ts', 'src')
const PY_SRC = join(ROOT, 'py', 'kutuphane')

const tsModules = readdirSync(TS_SRC)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3))
  .sort()
const pyModules = readdirSync(PY_SRC)
  .filter((f) => f.endsWith('.py') && f !== '__init__.py')
  .map((f) => f.slice(0, -3))
  .sort()

/** İzinli istisnalar: modül → içe aktarabileceği yerel dosyalar. Şu an hiçbir modül başka dosyaya bağlı değil. */
const ALLOWED_IMPORTS: Record<string, string[]> = {}

/** Bilinçli dil farkları (gerekçesiyle). Python adları snake_case karşılığıyla yazılır. */
const LANGUAGE_DIFFERENCES: Record<string, { tsOnly?: string[]; pyOnly?: string[]; neden: string }> = {
  csv: { tsOnly: ['parse_csv_stream'], pyOnly: ['iter_csv'], neden: 'akış: TS ReadableStream/async, Py yineleyici' },
  derin: { tsOnly: ['deep_freeze'], neden: "Python'da dondurma yerine MappingProxyType/frozen dataclass" },
  yeniden_dene: {
    pyOnly: ['retry_async', 'RetryCancelledError'],
    neden: 'Py eşzamanlı + asyncio; TS iptali AbortSignal',
  },
}

/** Yalnız bir dilde bulunması kararlaştırılan modüller (şartname: Python'da "anlamlı olanlar"). */
const TS_ONLY_MODULES = ['geri_al', 'olay', 'renk', 'zamanlama']
const TURKISH_MODULES = ['turkce', 'ek', 'sayi_yazi', 'para', 'tarih', 'dogrulama', 'maske']

function snake(name: string): string {
  return /^[a-z]/.test(name) ? name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) : name // harf: ASCII ad
}

function tsExports(source: string): Set<string> {
  const names = [
    ...source.matchAll(/^export (?:async )?function\*? ?(\w+)/gm),
    ...source.matchAll(/^export (?:abstract )?class (\w+)/gm),
    ...source.matchAll(/^export const (\w+)/gm),
    ...source.matchAll(/^export (?:interface|type) (\w+)/gm),
  ].map((m) => snake(m[1] ?? ''))
  return new Set(names)
}

function pyExports(source: string): Set<string> {
  const block = /__all__ = \[([\s\S]*?)\]/.exec(source)?.[1] ?? ''
  return new Set([...block.matchAll(/"(\w+)"/g)].map((m) => (m[1] ?? '').replace(/_$/, '')))
}

describe('kurallar', () => {
  it("modül listeleri: Python, TS'nin TS_ONLY dışındaki her modülünü içerir", () => {
    const expectedPy = tsModules.filter((m) => !TS_ONLY_MODULES.includes(m))
    expect(
      pyModules,
      'py/kutuphane ile ts/src modül listeleri uyuşmuyor; eksik eşi yazın ya da TS_ONLY_MODULES’e ekleyin',
    ).toEqual(expectedPy)
  })

  it.each(tsModules)('%s: başka modül ya da paket içe aktarmaz (TS)', (name) => {
    const source = readFileSync(join(TS_SRC, `${name}.ts`), 'utf8')
    const imports = [...source.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    const allowed = ALLOWED_IMPORTS[name] ?? []
    const unexpected = imports.filter((spec) => !allowed.includes(spec ?? ''))
    expect(
      unexpected,
      `${name}.ts içe aktarma yapıyor: ${unexpected.join(', ')}. Modüller tek dosyalık ve bağımsızdır; gereken kodu dosyaya kopyalayın ya da ALLOWED_IMPORTS'a gerekçesiyle ekleyin.`,
    ).toEqual([])
  })

  it.each(tsModules)('%s: testi var ve başlığı tam', (name) => {
    expect(
      existsSync(join(ROOT, 'ts', 'test', `${name}.test.ts`)),
      `ts/test/${name}.test.ts yok: modülün testini yazın.`,
    ).toBe(true)
    const header = /^\/\*\*([\s\S]*?)\*\//.exec(readFileSync(join(TS_SRC, `${name}.ts`), 'utf8'))?.[1] ?? ''
    for (const word of ['Kullanım', 'Sınırlar', 'Genişletme:']) {
      expect(
        header.includes(word),
        `${name}.ts başlık yorumunda "${word}" bölümü yok (şablon: README "Yeni modül" tarifi).`,
      ).toBe(true)
    }
  })

  it('README dizini her modülü doğru TS/Py işaretiyle listeler', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    for (const name of new Set([...tsModules, ...pyModules])) {
      const row = readme.split('\n').find((line) => line.startsWith(`| \`${name}\``))
      expect(
        row,
        `README.md dizininde "${name}" satırı yok: | \`${name}\` | ne yapar | ✓ | ✓ | örnek | biçiminde ekleyin.`,
      ).toBeDefined()
      const cells = (row ?? '').split('|').map((cell) => cell.trim())
      expect(cells[3], `README: ${name} için TS sütunu`).toBe(tsModules.includes(name) ? '✓' : '—')
      expect(cells[4], `README: ${name} için Py sütunu`).toBe(pyModules.includes(name) ? '✓' : '—')
    }
  })

  it.each(pyModules)('%s: dışa açılan adlar iki dilde eşleşir', (name) => {
    const ts = tsExports(readFileSync(join(TS_SRC, `${name}.ts`), 'utf8'))
    const py = pyExports(readFileSync(join(PY_SRC, `${name}.py`), 'utf8'))
    const allowed = LANGUAGE_DIFFERENCES[name]
    const onlyTs = [...ts].filter((n) => !py.has(n) && !(allowed?.tsOnly ?? []).includes(n))
    // TS'de dışa açık tipler (interface/type) Python'da olmayabilir; Python'daki her ad TS'de bulunmalı.
    const onlyPy = [...py].filter((n) => !ts.has(n) && !(allowed?.pyOnly ?? []).includes(n))
    const tsFunctions = [...ts].filter((n) => /^[a-z]/.test(n) || n.endsWith('Error'))
    expect(
      onlyPy,
      `${name}: Python'da olup TS'de olmayan: ${onlyPy.join(', ')}. Eşini ekleyin ya da LANGUAGE_DIFFERENCES'e gerekçesiyle yazın.`,
    ).toEqual([])
    expect(
      onlyTs.filter((n) => tsFunctions.includes(n)),
      `${name}: TS'de olup Python'da olmayan işlev/hata: ${onlyTs.join(', ')}. Eşini ekleyin ya da LANGUAGE_DIFFERENCES'e yazın.`,
    ).toEqual([])
  })

  it('kaynak, test ve vektörlerde görünmez karakter yok (BOM, birleşik işaret, sıfır genişlikli boşluk)', () => {
    const files = [
      ...tsModules.map((m) => join(TS_SRC, `${m}.ts`)),
      ...readdirSync(join(ROOT, 'ts', 'test')).map((f) => join(ROOT, 'ts', 'test', f)),
      ...readdirSync(join(ROOT, 'vektorler')).map((f) => join(ROOT, 'vektorler', f)),
      ...readdirSync(join(ROOT, 'docs')).map((f) => join(ROOT, 'docs', f)),
      join(ROOT, 'README.md'),
      join(ROOT, 'AGENTS.md'),
      join(ROOT, 'ts', 'kopyala.mjs'),
    ]
    for (const file of files) {
      const bad = [...readFileSync(file, 'utf8')].filter((ch) =>
        /[\p{Mn}\p{Me}\p{Cf}\p{Co}\u{a0}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]/u.test(ch),
      )
      expect(
        bad.map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16)}`),
        `${file}: görünmez karakteri kaçışla yazın (\\u{…}).`,
      ).toEqual([])
    }
  })

  it('toUpperCase/toLowerCase yalnız gerekçeli satırlarda (// harf: …); Türkçe için turkce.upperTr', () => {
    for (const name of tsModules) {
      readFileSync(join(TS_SRC, `${name}.ts`), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const isComment = /^\s*(\*|\/\/|\/\*)/.test(line)
          if (!isComment && /\.to(Upper|Lower)Case\(\)/.test(line)) {
            expect(
              line.includes('harf:'),
              `${name}.ts:${i + 1} gerekçesiz büyük/küçük harf çevirme. Türkçe metinde i→İ hatası olur: turkce.upperTr/lowerTr kullanın ya da satır sonuna "// harf: neden" yazın.`,
            ).toBe(true)
          }
        })
    }
  })

  it('vektör dosyaları: her biri iki dilde bir modüle ve teste bağlı; Türkçe modüllerin hepsinde var', () => {
    const vectors = readdirSync(join(ROOT, 'vektorler'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
    for (const name of TURKISH_MODULES)
      expect(vectors, `vektorler/${name}.json yok (Türkçe modüller iki dilde ortak vektörle sınanır).`).toContain(name)
    for (const name of vectors) {
      const data = JSON.parse(readFileSync(join(ROOT, 'vektorler', `${name}.json`), 'utf8'))
      expect(data.modul, `vektorler/${name}.json içindeki "modul" alanı dosya adıyla aynı olmalı.`).toBe(name)
      expect(tsModules).toContain(name)
      expect(pyModules).toContain(name)
      expect(readFileSync(join(ROOT, 'ts', 'test', `${name}.test.ts`), 'utf8')).toContain(`'${name}'`)
      expect(readFileSync(join(ROOT, 'py', 'tests', `test_${name}.py`), 'utf8')).toContain(`"${name}"`)
      const fns = Object.keys(data.islevler)
      const tsNames = tsExports(readFileSync(join(TS_SRC, `${name}.ts`), 'utf8'))
      for (const fn of fns) {
        if (name === 'sema') continue // sema vektörü şemayı testteki build ile kurar
        expect(tsNames.has(snake(fn)), `vektorler/${name}.json: "${fn}" işlevi ${name}.ts'de yok.`).toBe(true)
      }
    }
  })

  it('kopyala.mjs modülü, testi (import yolu düzeltilmiş) ve vektörü kopyalar', () => {
    const target = mkdtempSync(join(tmpdir(), 'kutuphane-kopya-'))
    try {
      const copied = copyModule({ module: 'turkce', target })
      expect(copied).toEqual(['turkce.ts', 'turkce.test.ts', 'vektorler/turkce.json'])
      const test = readFileSync(join(target, 'turkce.test.ts'), 'utf8')
      expect(test).toContain("from './turkce.ts'")
      expect(test).not.toContain('../src/')
      expect(() => copyModule({ module: 'turkce', target })).toThrow('--uzerine-yaz')
      copyModule({ module: 'para', target, noExtension: true })
      expect(readFileSync(join(target, 'para.test.ts'), 'utf8')).toContain("from './para'")
      expect(() => copyModule({ module: 'yok_boyle', target })).toThrow('modül yok')
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })
})
