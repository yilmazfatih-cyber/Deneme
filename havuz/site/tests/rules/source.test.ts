/**
 * Kaynak kod kuralları (STANDARTLAR.md §6): başlık yorumu, yarım iş yasağı, iç adreslerin link() ile yazılması ve
 * arayüz metinlerinin sözlükte durması.
 */
import { describe, expect, it } from 'vitest'
import { listFiles, read } from './helpers.ts'

const sources = [
  ...listFiles('src', (file) => /\.(ts|astro)$/u.test(file) && !file.endsWith('.d.ts')),
  ...listFiles('scripts', (file) => file.endsWith('.ts')),
]
const astroFiles = sources.filter((file) => file.endsWith('.astro'))

/** .astro dosyasının şablon kısmı (ön bölüm, <style> ve <script> blokları ile yorumlar çıkarılmış). */
function template(file: string): string {
  return read(file)
    .replace(/^---\n[\s\S]*?\n---\n/u, '')
    .replace(/<style[\s\S]*?<\/style>/gu, '')
    .replace(/<script[\s\S]*?<\/script>/gu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
}

describe('kaynak dosyalar', () => {
  it.each(sources)('%s bir başlık yorumuyla açılıyor', (file) => {
    const text = read(file)
    const opening = file.endsWith('.astro') ? text.replace(/^---\n/u, '') : text
    expect(opening.startsWith('/**'), `${file}: dosya ne yaptığını anlatan bir /** … */ yorumuyla başlamalı.`).toBe(
      true,
    )
  })

  it('yarım iş işareti (TODO, FIXME) yok', () => {
    const marked = sources.filter((file) => /\b(TODO|FIXME|XXX)\b/u.test(read(file)))
    expect(marked, 'Yarım işi bitirin ya da README → "Sınırlar" bölümüne yazıp işareti kaldırın.').toEqual([])
  })

  it('.astro şablonlarında iç adres elle yazılmıyor (link() kullanılıyor)', () => {
    const offenders = astroFiles.filter((file) => /\s(href|src|action)="\/(?!\/)/u.test(template(file)))
    expect(
      offenders,
      "İç adresi href={link('/blog/')} biçiminde yazın; yoksa alt klasörde yayında kırılır (src/lib/url.ts).",
    ).toEqual([])
  })

  it('.astro şablonlarında Türkçe arayüz metni gömülü değil (src/i18n/ sözlüklerinde olmalı)', () => {
    const offenders = astroFiles.filter((file) => /[çğıİöşüÇĞÖŞÜ]/u.test(template(file)))
    expect(offenders, 'Görünen metni src/i18n/tr.ts (ve en.ts) içine ekleyip t.… ile kullanın.').toEqual([])
  })
})
