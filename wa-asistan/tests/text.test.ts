import { describe, expect, it } from 'vitest'
import {
  chunkText,
  clip,
  formatDateTr,
  looksSecret,
  markdownToWhatsApp,
  normalizeToken,
  trLower,
  trUpper,
} from '../src/core/text.js'

const F = '```'

describe('normalizeToken', () => {
  it('makes Turkish and ASCII spellings of a command equal', () => {
    expect(normalizeToken('/Yardım')).toBe('/yardim')
    expect(normalizeToken('/yardim')).toBe('/yardim')
    expect(normalizeToken('/YARDIM')).toBe('/yardim')
    expect(normalizeToken('/Modeller görsel')).toBe('/modeller gorsel')
  })

  it('handles dotted İ and dotless I the Turkish way', () => {
    expect(normalizeToken('İSTANBUL')).toBe('istanbul')
    expect(normalizeToken('IŞIK')).toBe('isik')
    expect(normalizeToken('DİKKAT')).toBe('dikkat')
    expect(normalizeToken('ılık')).toBe('ilik')
    expect(normalizeToken('İzin')).toBe('izin')
  })

  it('folds every Turkish letter and strips a combining dot', () => {
    expect(normalizeToken('Ğüşiöç ÇÖÜŞĞ')).toBe('gusioc cousg')
    expect(normalizeToken('i̇')).toBe('i')
  })

  it('trims and keeps other characters', () => {
    expect(normalizeToken('  /model gpt-4o_mini:free  ')).toBe('/model gpt-4o_mini:free')
    expect(normalizeToken('')).toBe('')
  })
})

describe('trUpper / trLower', () => {
  it('uppercases with Turkish rules', () => {
    expect(trUpper('istanbul')).toBe('İSTANBUL')
    expect(trUpper('ılık')).toBe('ILIK')
    expect(trUpper('iğdır')).toBe('İĞDIR')
  })

  it('lowercases with Turkish rules', () => {
    expect(trLower('İ')).toBe('i')
    expect(trLower('I')).toBe('ı')
    expect(trLower('IŞIK')).toBe('ışık')
  })
})

describe('markdownToWhatsApp', () => {
  it('turns headings into bold lines without doubling bold', () => {
    expect(markdownToWhatsApp('# Başlık')).toBe('*Başlık*')
    expect(markdownToWhatsApp('### Üçüncü ###')).toBe('*Üçüncü*')
    expect(markdownToWhatsApp('# Başlık **kalın**')).toBe('*Başlık kalın*')
    expect(markdownToWhatsApp('#hashtag')).toBe('#hashtag')
  })

  it('converts bold, italic, strike and nested emphasis', () => {
    const out = markdownToWhatsApp('Bu **kalın** ve *italik* ve ***ikisi*** ve ~~sil~~ ve __alt__.')
    expect(out).toBe('Bu *kalın* ve _italik_ ve *_ikisi_* ve ~sil~ ve *alt*.')
    expect(markdownToWhatsApp('*italik **iç kalın** metin* ve **kalın *iç italik* metin**')).toBe(
      '_italik *iç kalın* metin_ ve *kalın _iç italik_ metin*',
    )
  })

  it('keeps WhatsApp-style single-star bold when the text has no Markdown bold', () => {
    expect(markdownToWhatsApp('*Önemli:* bugün _toplantı_ var.')).toBe('*Önemli:* bugün _toplantı_ var.')
  })

  it('does not treat arithmetic stars as emphasis', () => {
    expect(markdownToWhatsApp('**a** ve 2 * 3 * 4 ve 5*3*2')).toBe('*a* ve 2 * 3 * 4 ve 5*3*2')
  })

  it('converts bullets and keeps indentation, numbered lists unchanged', () => {
    const md = '- bir\n  - alt **x**\n* iki\n+ üç\n1. dört\n2. beş'
    expect(markdownToWhatsApp(md)).toBe('• bir\n  • alt *x*\n• iki\n• üç\n1. dört\n2. beş')
  })

  it('flattens links, images and autolinks', () => {
    expect(markdownToWhatsApp('Bak: [Dokümanlar](https://example.com/a_b "başlık") ve <https://x.y/z>.')).toBe(
      'Bak: Dokümanlar (https://example.com/a_b) ve https://x.y/z.',
    )
    expect(markdownToWhatsApp('![resim](https://e.com/i.png)')).toBe('resim (https://e.com/i.png)')
    expect(markdownToWhatsApp('[](https://e.com)')).toBe('https://e.com')
  })

  it('puts tables inside a code block and strips markers that cannot render there', () => {
    const md = 'Önce\n\n| Model | Fiyat |\n|---|---:|\n| **gpt** | `$1` |\n| [c](u) | $2 |\n\nSonra'
    expect(markdownToWhatsApp(md)).toBe(
      `Önce\n\n${F}\n| Model | Fiyat |\n|---|---:|\n| gpt | $1 |\n| c (u) | $2 |\n${F}\n\nSonra`,
    )
  })

  it('keeps fenced code untouched, drops the language tag and converts ~~~ fences', () => {
    const md = `${F}python\n# yorum - *burası* **dokunulmaz**\n- liste değil\n${F}\n~~~\ntilde | blok\n~~~`
    expect(markdownToWhatsApp(md)).toBe(
      `${F}\n# yorum - *burası* **dokunulmaz**\n- liste değil\n${F}\n${F}\ntilde | blok\n${F}`,
    )
  })

  it('closes an unterminated fence', () => {
    expect(markdownToWhatsApp(`${F}js\nconst a = 1`)).toBe(`${F}\nconst a = 1\n${F}`)
  })

  it('leaves inline code alone', () => {
    expect(markdownToWhatsApp('**x** `a * b` ve ```tek satır``` ve `**raw**`')).toBe(
      '*x* `a * b` ve ```tek satır``` ve `**raw**`',
    )
  })

  it('removes horizontal rules and caps blank lines at two', () => {
    expect(markdownToWhatsApp('a\n\n---\n\nb')).toBe('a\n\nb')
    expect(markdownToWhatsApp('a\n***\nb')).toBe('a\nb')
    expect(markdownToWhatsApp('a\n\n\n\n\n\nb')).toBe('a\n\n\nb')
    expect(markdownToWhatsApp(`${F}\n\n\n\n\n${F}`)).toBe(`${F}\n\n\n\n\n${F}`)
  })

  it('unescapes Markdown escapes and normalizes line endings', () => {
    expect(markdownToWhatsApp('a\\_b\\_ ve \\*c\\*')).toBe('a_b_ ve *c*')
    expect(markdownToWhatsApp('## Selam\r\nDünya\r\n')).toBe('*Selam*\nDünya')
    expect(markdownToWhatsApp('')).toBe('')
    expect(markdownToWhatsApp('\n\n')).toBe('')
  })
})

describe('chunkText', () => {
  /** Content lines only: fence scaffolding and blank lines are what chunking may change. */
  const content = (s: string) => s.split('\n').filter((l) => l.trim() !== '' && !/^\s*```[^`]*$/.test(l))

  it('returns [] for empty input and a single chunk for short text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
    expect(chunkText('merhaba')).toEqual(['merhaba'])
    expect(chunkText('a'.repeat(3500))).toHaveLength(1)
  })

  it('never exceeds max and prefers paragraph boundaries', () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraf ${i} `.repeat(5).trim())
    const text = paras.join('\n\n')
    const chunks = chunkText(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200)
    for (const c of chunks) expect(c.startsWith('Paragraf')).toBe(true)
    for (const c of chunks) expect(c.endsWith('.') || /\d$/.test(c)).toBe(true)
    expect(chunks.join('\n\n')).toBe(text)
  })

  it('falls back to line, then space, then hard cuts', () => {
    const lines = chunkText(Array.from({ length: 30 }, (_, i) => `satır ${i}`).join('\n'), 40)
    for (const c of lines) expect(c.length).toBeLessThanOrEqual(40)
    for (const c of lines) expect(c.startsWith('satır')).toBe(true)
    const words = chunkText('kelime '.repeat(10).trim(), 20)
    expect(words).toEqual(['kelime kelime', 'kelime kelime', 'kelime kelime', 'kelime kelime', 'kelime kelime'])
    const hard = chunkText('a'.repeat(50), 20)
    expect(hard.join('')).toBe('a'.repeat(50))
    for (const c of hard) expect(c.length).toBeLessThanOrEqual(20)
  })

  it('keeps code fences balanced across chunks and reopens them', () => {
    const code = Array.from({ length: 40 }, (_, i) => `const satir${i} = ${i}`).join('\n')
    const text = `Giriş paragrafı.\n\n${F}js\n${code}\n${F}\n\nSon paragraf burada.`
    const chunks = chunkText(text, 200)
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(200)
      const fences = c.split('\n').filter((l) => /^\s*```[^`]*$/.test(l)).length
      expect(fences % 2).toBe(0)
    }
    expect(chunks[0]?.startsWith('Giriş paragrafı.')).toBe(true)
    expect(chunks[0]?.endsWith(F)).toBe(true)
    expect(chunks[1]?.startsWith(`${F}\n`)).toBe(true)
    expect(chunks[chunks.length - 1]).toBe('Son paragraf burada.')
    expect(content(chunks.join('\n'))).toEqual(content(text))
  })

  it('does not end a chunk with a bare fence opener', () => {
    const text = `${'x'.repeat(60)}\n${F}\n${'y'.repeat(60)}\n${F}`
    const chunks = chunkText(text, 80)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(80)
      expect(c.endsWith(`${F}\n${F}`)).toBe(false)
    }
    expect(chunks[0]).toBe('x'.repeat(60))
  })

  it('is deterministic', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Satır ${i} ${'ab'.repeat(i % 7)}`).join('\n')
    expect(chunkText(text, 100)).toEqual(chunkText(text, 100))
  })
})

describe('clip', () => {
  it('returns short text unchanged and cuts long text with an ellipsis', () => {
    expect(clip('merhaba', 10)).toBe('merhaba')
    expect(clip('merhaba', 7)).toBe('merhaba')
    expect(clip('merhaba dünya', 8)).toBe('merhaba…')
    expect(clip('🙂🙂🙂🙂', 3)).toBe('🙂🙂…')
    expect(Array.from(clip('abcdefghij', 5)).length).toBeLessThanOrEqual(5)
  })
})

describe('formatDateTr', () => {
  it('formats in Europe/Istanbul by default', () => {
    expect(formatDateTr(Date.UTC(2026, 10, 2, 11, 5))).toBe('2 Kasım 2026 Pazartesi, 14:05')
  })

  it('uses a 24-hour clock with zero padding across the day boundary', () => {
    expect(formatDateTr(Date.UTC(2026, 0, 1, 21, 0))).toBe('2 Ocak 2026 Cuma, 00:00')
    expect(formatDateTr(Date.UTC(2026, 0, 1, 6, 7))).toBe('1 Ocak 2026 Perşembe, 09:07')
  })

  it('honours the time zone argument', () => {
    expect(formatDateTr(Date.UTC(2026, 0, 1, 21, 0), 'UTC')).toBe('1 Ocak 2026 Perşembe, 21:00')
  })
})

describe('looksSecret', () => {
  it.each([
    'sk-or-v1-abcdef0123456789abcdef0123456789abcdef',
    'Anahtar: sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'github_pat_11ABCDEFG0123456789abcdefghij',
    'AKIAIOSFODNN7EXAMPLE',
    'xoxb-123456789012-abcdefghij',
    'AIzaSyA-abcdefghijklmnopqrstuvwxyz012345',
    'hf_abcdefghijklmnopqrstuvwxyz',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    'Q2xhdWRlIGlzIGEgaGVscGZ1bCBhc3Npc3RhbnQ123=',
    'Şifrem: Abc12345',
    'Wifi şifresi: evdeki123',
    'Banka PİN: 1234',
    'password is hunter2',
    'Parola şu: gizli42',
    'parola=abc',
    "pin kodum 4521'dir",
    'Şifrem abc123tür',
    'Kartım 4111 1111 1111 1111',
    'Kart no 4111-1111-1111-1111',
    '123456789012345',
    'cvv=123',
    'token = abc',
    'API key: ABCDEF',
    'PIN: 1234',
    'ŞİFREM: abc123',
    'Password = Hunter2',
    'Doğrulama kodu: 482913',
  ])('flags %j', (s) => {
    expect(looksSecret(s)).toBe(true)
  })

  it.each([
    '',
    "Toplantı yarın 14:00'te, Ahmet'i ara",
    'şifre değiştirmeyi unutma',
    'Pink renk hoş, pin something on the board',
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
    'https://github.com/yilmazfatih-cyber/Deneme/blob/main/README.md',
    'TC 12345678901 ve tel 0532 123 45 67',
    'wa-asistan-v1-2026-11-02-build-Final',
    'Market listesi: süt, ekmek, yumurta',
    'task-abcdefghijklmnopqrstuvwxyz',
    'Toplam 1.234,56 TL ödendi',
  ])('does not flag %j', (s) => {
    expect(looksSecret(s)).toBe(false)
  })
})
