import { describe, expect, it } from 'vitest'
import { audioFile, audioKey, speakable, splitSentences } from '../../src/lib/audioKey'

describe('ses anahtarı', () => {
  it('büyük harf, noktalama ve boşluk fark etmez; Türkçe harfler korunur', () => {
    expect(audioKey('Su istiyorum.')).toBe('su istiyorum')
    expect(audioKey('  Su   var mı? ')).toBe('su var mı')
    expect(audioKey('İlacımı içme vakti')).toBe('ilacımı içme vakti')
    expect(audioKey(speakable('Susadım, bir bardak …'))).toBe('susadım bir bardak')
  })

  it('dosya adı kararlı ve 8 haneli', () => {
    expect(audioFile('su')).toMatch(/^[0-9a-f]{8}\.mp3$/)
    expect(audioFile('su')).toBe(audioFile('su'))
    expect(audioFile('su')).not.toBe(audioFile('çay'))
  })

  it('cümlelere böler', () => {
    expect(splitSentences('Karnım ağrıyor. Ağrım 8 üzerinden 10.')).toEqual([
      'Karnım ağrıyor.',
      'Ağrım 8 üzerinden 10.',
    ])
  })
})
