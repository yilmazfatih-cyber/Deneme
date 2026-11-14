import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * macOS ve Windows dosya sistemleri büyük/küçük harfi ayırmaz. Aynı klasörde yalnız harf büyüklüğüyle ayrılan iki
 * modül (ör. `Guards.tsx` ile `guards.ts`) Linux'ta sorunsuz çalışır, ama uzantısız `./Guards` içe aktarımı orada
 * önce `Guards.ts`'i dener ve yanlış dosyayı bulur: uygulama "binding name … is not found" hatasıyla açılmaz.
 */
const MODULE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.json'])
const ROOTS = ['web/src', 'server/src', 'shared', 'static-host', 'scripts', 'e2e']
const root = join(import.meta.dirname, '..')

function collisions(dir: string, out: string[]): void {
  const groups = new Map<string, string[]>()
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') collisions(full, out)
      continue
    }
    const ext = extname(name)
    if (!MODULE_EXTS.has(ext)) continue
    const key = name.slice(0, -ext.length).toLocaleLowerCase('en-US')
    groups.set(key, [...(groups.get(key) ?? []), name])
  }
  for (const names of groups.values()) if (names.length > 1) out.push(`${dir}: ${names.sort().join(' ↔ ')}`)
}

describe('dosya adları', () => {
  it('aynı klasörde yalnız harf büyüklüğü ya da uzantısıyla ayrılan modül yok', () => {
    const found: string[] = []
    for (const r of ROOTS) collisions(join(root, r), found)
    expect(found).toEqual([])
  })
})
