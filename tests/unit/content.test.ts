import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { content } from '../../src/content'
import tr from '../../src/i18n/tr.json'
import {
  CategorySchema,
  crossCheck,
  JourneySchema,
  QuickItemSchema,
  TemplateSchema,
  WordSchema,
} from '../../src/content/schema'

describe('içerik', () => {
  it('her dosya şemaya uyar', () => {
    expect(() => z.array(CategorySchema).parse(content.categories)).not.toThrow()
    expect(() => z.array(TemplateSchema).parse(content.templates)).not.toThrow()
    expect(() => z.array(QuickItemSchema).parse(content.quick)).not.toThrow()
    expect(() => z.array(WordSchema).parse(content.words)).not.toThrow()
    expect(() => JourneySchema.parse(content.journey)).not.toThrow()
  })

  it('dosyalar arası tutarlı', () => {
    expect(crossCheck(content)).toEqual([])
  })

  it('sekiz durak, her biri 8–12 kelime', () => {
    expect(content.journey.stops).toHaveLength(8)
    for (const stop of content.journey.stops) {
      expect(stop.words.length).toBeGreaterThanOrEqual(8)
      expect(stop.words.length).toBeLessThanOrEqual(12)
    }
  })

  it('hızlı ihtiyaçlar planla aynı dokuz öğe', () => {
    expect(content.quick.map((q) => q.label)).toEqual([
      'Evet',
      'Hayır',
      'Ağrım var',
      'Su',
      'Tuvalet',
      'Yardım',
      'Bekle',
      'Tekrar et',
      'Bilmiyorum',
    ])
  })

  it('her kelimede 3 anlam ipucu, 2 cümle tamamlama ve en az 2 hazır biçim var', () => {
    for (const w of content.words) {
      expect(w.cues.semantic, w.id).toHaveLength(3)
      expect(w.cues.sentence, w.id).toHaveLength(2)
      expect(w.phrases.length + Object.keys(w.forms).length, w.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('vücut haritasındaki her bölgenin "___ ağrıyor" biçimi var', () => {
    for (const id of ['bas', 'bogaz', 'gogus', 'karin', 'sirt', 'kol', 'el', 'bacak', 'ayak', 'diz', 'omuz']) {
      const w = content.words.find((x) => x.id === id)
      expect(w?.forms.agriyor, id).toMatch(/ağrıyor$/)
    }
  })

  it('arayüz ve içerik metinlerinde çocuksu ödül dili yok', () => {
    const text = JSON.stringify(content) + JSON.stringify(tr)
    for (const banned of ['Aferin', 'Bravo', 'Süper', 'Kaybettin', 'kaybettin', 'Yanlış!']) {
      expect(text).not.toContain(banned)
    }
  })

  it('arayüz metinleri tedavi vaadinde bulunmaz', () => {
    const ui = JSON.stringify(tr)
    for (const claim of ['tedavi eder', 'iyileştirir', 'iyileştirecek']) {
      expect(ui).not.toContain(claim)
    }
    expect(tr['setup.disclaimer']).toContain('Tedavinin yerini almaz')
  })
})
