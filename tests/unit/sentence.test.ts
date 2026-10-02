import { describe, expect, it } from 'vitest'
import { templateById, wordById } from '../../src/content'
import {
  addPhrase,
  addTemplate,
  addWord,
  displayText,
  lastItemId,
  spokenText,
  undo,
  type Segment,
} from '../../src/features/board/sentence'
import { capitalizeTr, compareTr, tail, upperTr } from '../../src/lib/text'

const su = wordById.get('su')!
const bas = wordById.get('bas')!
const ilac = wordById.get('ilac')!
const istiyorum = templateById.get('istiyorum')!
const agriyor = templateById.get('agriyor')!

describe('cümle şeridi', () => {
  it('kelimeler yalın sırayla okunur', () => {
    let s: Segment[] = []
    s = addWord(s, su)
    s = addWord(s, ilac)
    expect(displayText(s)).toBe('Su ilaç')
  })

  it('kalıp + kelime → hazır biçim kullanılır (çekim üretilmez)', () => {
    let s: Segment[] = addTemplate([], agriyor)
    expect(displayText(s)).toBe('___ ağrıyor')
    expect(spokenText(s)).toBe('Ağrıyor')
    s = addWord(s, bas)
    expect(displayText(s)).toBe('Başım ağrıyor')
  })

  it('hazır biçim yoksa kalıbın yedeği kullanılır', () => {
    const s = addWord(addTemplate([], istiyorum), { id: 'x', word: 'simit', forms: {} })
    expect(displayText(s)).toBe('Simit istiyorum')
  })

  it('üst üste iki boş kalıpta sonuncusu kalır', () => {
    const s = addTemplate(addTemplate([], istiyorum), agriyor)
    expect(s).toHaveLength(1)
  })

  it('hazır cümle aynı kartın yalın kelimesinin yerine geçer', () => {
    let s = addWord([], su)
    s = addPhrase(s, 'Su istiyorum', 'su')
    expect(displayText(s)).toBe('Su istiyorum')
    expect(s).toHaveLength(1)
    expect(lastItemId(s)).toBe('su')
  })

  it('geri al son parçayı siler', () => {
    const s = undo(addWord(addWord([], su), ilac))
    expect(displayText(s)).toBe('Su')
  })
})

describe('Türkçe metin', () => {
  it('büyük harf tr-TR ile: i → İ, ı → I', () => {
    expect(capitalizeTr('ilaç')).toBe('İlaç')
    expect(upperTr('ılık')).toBe('ILIK')
    expect(upperTr('şiş')).toBe('ŞİŞ')
  })

  it('alfabetik sıralama Türkçe kurallarına uyar', () => {
    expect(['çay', 'cami', 'dut'].sort(compareTr)).toEqual(['cami', 'çay', 'dut'])
  })

  it('uzun cümlenin sonu gösterilir', () => {
    const long = 'Eşim nerede, kızımı arar mısın, ilacımı içme vakti geldi galiba'
    expect(tail(long, 30).startsWith('… ')).toBe(true)
    expect(tail('Su', 30)).toBe('Su')
  })
})
