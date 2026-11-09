import { describe, expect, it } from 'vitest'
import { ruleAnnouncement, ruleAnswer, ruleTriage } from '../../server/ai/rules.ts'

describe('kural tabanlı sınıflandırma', () => {
  it.each([
    [
      'Merhaba, mutfak tavanından su damlıyor, üst kattan geliyor olabilir. Bakabilir misiniz? A blok 5',
      'tesisat',
      'ariza',
      'yuksek',
    ],
    ['B blok asansör yine çalışmıyor, annem 6. katta oturuyor', 'asansor', 'ariza', 'yuksek'],
    ['Merdiven boşluğunda gaz kokusu var!!', 'isitma', 'ariza', 'acil'],
    ['Asansörde mahsur kaldık, 3. kat ile 4. kat arasında', 'asansor', 'ariza', 'acil'],
    [
      'Üst kattaki komşu gece 2’ye kadar yüksek sesle müzik açıyor, 3 gündür uyuyamıyoruz.',
      'gurultu',
      'sikayet',
      'normal',
    ],
    ['Ekim aidatını havale ettim ama portalda hâlâ borç görünüyor', 'aidat', 'odeme', 'dusuk'],
    ['Lale Evleri’nde aylık aidatlar ne kadar, otopark var mı?', 'aidat', 'bilgi', 'dusuk'],
    ['Bahçe düzenlemesi çok güzel olmuş, emeği geçenlere teşekkürler', 'peyzaj', 'tesekkur', 'dusuk'],
    ['Selam, otoparkta benim yerime başkası park etmiş', 'otopark', 'sikayet', 'normal'],
    ['Havuz kaçta açılıyor?', 'diger', 'bilgi', 'dusuk'],
    ['Otopark lambaları yanmıyor, çok karanlık', 'elektrik', 'ariza', 'normal'],
  ])('%s', (text, category, intent, priority) => {
    const r = ruleTriage(text, { senderName: 'Ayşe Kaya', blockKeys: ['a', 'b'] })
    expect({ category: r.category, intent: r.intent, priority: r.priority }).toEqual({ category, intent, priority })
  })

  it('acil durumda güvenlik talimatı ve yanıt', () => {
    const r = ruleTriage('Merdivende gaz kokusu var', { senderName: 'Ayşe Kaya' })
    expect(r.safety_advice).toMatch(/187/)
    expect(r.reply.startsWith('Merhaba Ayşe,')).toBe(true)
    expect(r.needs_ticket).toBe(true)
  })

  it('blok ve daire ipucu', () => {
    const r = ruleTriage('A blok 5 numarada su sızıntısı', { blockKeys: ['a', 'b'] })
    expect([r.block_hint, r.unit_hint]).toEqual(['a', '5'])
  })

  it('selamlaşma sel baskını sayılmaz', () => {
    expect(ruleTriage('Selam, kapı kartım çalışmıyor').priority).not.toBe('acil')
  })
})

describe('kural tabanlı yanıt ve duyuru', () => {
  it('hesap sorusunda sakin bilgisi döner', () => {
    const r = ruleAnswer('Borcum ne kadar?', [], 'Güncel bakiye ₺1.250,00 borç.')
    expect(r.answer).toContain('₺1.250,00')
  })

  it('belgede yoksa personele iletilir', () => {
    expect(ruleAnswer('Mars’a uçuş var mı?', [], null).needs_staff).toBe(true)
  })

  it('duyuru taslağı', () => {
    const d = ruleAnnouncement('yarın 10-14 arası su kesintisi olacak')
    expect(d.title).toBe('Yarın 10-14 arası su kesintisi olacak')
    expect(d.body).toContain('Site Yönetimi')
  })
})
