import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zVocabulary } from '../shared/tagging-schema'
import { buildGuide, GUIDE_FILE, renderGuide } from './tagging-guide'

const CONTENT = join(__dirname, '..', 'content')
const vocab = zVocabulary.parse(JSON.parse(readFileSync(join(CONTENT, 'tagging', 'vocabulary.json'), 'utf8')))

describe('tagging-guide', async () => {
  const guide = await buildGuide(CONTENT)

  it('kendi kendine yeterli: kurallar, her ölçeğin tablosu, her yüz değeri ve ifadesi, iki örnek', () => {
    expect(guide).toMatch(/İki seviye arasında kalırsanız düşük olanı seçin/)
    expect(guide).toMatch(/Yapımın tamamını izleyin/)
    expect(guide).toMatch(/Her etiketleyici kendi fişini doldurur/)
    expect(guide).toMatch(/Not yazın/)
    for (const s of vocabulary().scales) {
      expect(guide).toContain(`${s.name} (\`${s.key}\`)`)
      for (const l of s.levels) expect(guide).toContain(l.description.replace(/\|/g, '\\|'))
    }
    for (const f of vocabulary().facets)
      for (const v of f.values) {
        expect(guide).toContain(`\`${v.key}\``)
        if (v.phrase) expect(guide).toContain(`"${v.phrase}"`)
      }
    expect(guide).toMatch(/### 6\.1\. Sintel \(2010, film\)/)
    expect(guide).toMatch(/### 6\.2\. Köydeki Lezzet \(2026, dizi\)/)
    // içerik uyarılarında RTÜK sütunu
    expect(guide).toMatch(/\|\s+4\s+\| Sert\s+\| .*\|\s+18\+\s+\|/)
  })

  it('belirlenimci; depodaki docs/ETIKETLEME_KILAVUZU.md sözlükle güncel', () => {
    expect(renderGuide(vocab, [])).toBe(renderGuide(vocab, []))
    expect(readFileSync(GUIDE_FILE, 'utf8')).toBe(guide)
  })
})

function vocabulary() {
  return vocab
}
