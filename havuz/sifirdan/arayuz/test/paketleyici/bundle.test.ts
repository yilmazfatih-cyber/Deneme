import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInThisContext } from 'node:vm'
import { afterAll, describe, expect, it } from 'vitest'
import { bundle, decodeLines } from '../../src/paketleyici/index.ts'
import { memoryFs, writeProject } from './fixtures.ts'

const root = writeProject()
afterAll(() => rmSync(root, { recursive: true, force: true }))

type MainExports = { result: unknown[]; default: () => string; counter: number; increment: () => number }

/** CommonJS çıktısını bir işlev kapsamında çalıştırır (module.exports'u döndürür). */
function runCjs(code: string): MainExports {
  const module = { exports: {} as MainExports }
  const wrapped = runInThisContext(`(function (module, exports) {\n${code}\n})`) as (
    m: typeof module,
    e: MainExports,
  ) => void
  wrapped(module, module.exports)
  return module.exports
}

describe("paketlenmiş çıktı Node'da özgün modüllerle aynı sonucu verir", () => {
  it('cjs biçimi', async () => {
    delete (globalThis as Record<string, unknown>).__yanEtki
    const original = (await import(pathToFileURL(join(root, 'src/main.js')).href)) as MainExports
    const expected = original.result
    delete (globalThis as Record<string, unknown>).__yanEtki
    const bundled = runCjs(bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'cjs' }).code)
    expect(bundled.result).toEqual(expected)
    expect(bundled.result).toEqual([12.56, 'İSTANBUL', 'Merhaba Ayşe', 'Selam Ali', 3.14, 'yan etki çalıştı'])
    expect(bundled.default()).toBe(original.default())
    expect(bundled.counter).toBe(0)
    expect(bundled.increment()).toBe(1)
    expect(bundled.counter).toBe(1)
  })

  it('esm biçimi dosyadan içe aktarılabilir', async () => {
    const out = join(root, 'paket.mjs')
    writeFileSync(out, bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'esm' }).code)
    const bundled = (await import(pathToFileURL(out).href)) as MainExports
    expect(bundled.result[0]).toBe(12.56)
    expect(bundled.default()).toBe('ana')
  })

  it('iife biçimi genel bir değişkene atanır', () => {
    const { code } = bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'iife', name: 'Uygulama' })
    const value = (runInThisContext(`(function () {\n${code}\nreturn Uygulama\n})`) as () => MainExports)()
    expect(value.result[1]).toBe('İSTANBUL')
  })

  it('döngüsel bağımlılığı raporlar ve yine de ESM gibi çalışır (yukarı taşınan işlevler)', async () => {
    const original = (await import(pathToFileURL(join(root, 'src/cycle/entry.js')).href)) as { value: string }
    const result = bundle({ entry: '/src/cycle/entry.js', fs: memoryFs(), format: 'cjs' })
    expect(result.cycles).toEqual([['/src/cycle/a.js', '/src/cycle/b.js']])
    expect((runCjs(result.code) as unknown as { value: string }).value).toBe(original.value)
    expect(original.value).toBe('abA')
  })
})

describe('ağaç silkeleme', () => {
  it('kullanılmayan dışa aktarımları ve modülleri atar; yan etkili içe aktarmayı tutar', () => {
    const result = bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'cjs' })
    expect(result.code).not.toContain('KULLANILMAYAN_DEGER')
    expect(result.code).not.toContain('circumference')
    expect(result.code).toContain('function round')
    expect(result.removed).toEqual(['/src/geometry/square.js'])
    expect(result.included).toContain('/src/side-effect.js')
    expect(result.code).toContain('lower')
    expect(result.stats.kept).toBeLessThan(result.stats.statements)
  })

  it('silkeleme kapatılırsa her şey kalır', () => {
    const result = bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'cjs', treeShake: false })
    expect(result.code).toContain('KULLANILMAYAN_DEGER')
    expect(result.removed).toEqual([])
  })
})

describe('kaynak haritası', () => {
  it('paketteki satır özgün dosyanın satırına eşlenir', () => {
    const result = bundle({ entry: '/src/main.js', fs: memoryFs(), format: 'cjs', sourceMap: true })
    const lines = result.code.split('\n')
    const index = lines.findIndex((l) => l.includes('function round'))
    const mapped = decodeLines(result.map!)[index]
    expect(mapped).toEqual({ source: '/src/geometry/circle.js', line: 5 })
    expect(decodeLines(result.map!)[0]).toBeNull()
    expect(result.map!.sourcesContent[result.map!.sources.indexOf('/src/geometry/circle.js')]).toContain(
      'function round',
    )
  })

  it('satır içi harita yorumu Base64 JSON taşır', () => {
    const { code } = bundle({ entry: '/src/cycle/entry.js', fs: memoryFs(), sourceMap: 'inline' })
    const comment = code.trim().split('\n').pop()!
    const json = Buffer.from(comment.split('base64,')[1]!, 'base64').toString('utf8')
    expect(JSON.parse(json).version).toBe(3)
  })
})
