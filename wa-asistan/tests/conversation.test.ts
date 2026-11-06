import { describe, expect, it } from 'vitest'
import {
  CHARS_PER_TOKEN,
  DEFAULT_DOCUMENT_PROMPT,
  DEFAULT_IMAGE_PROMPT,
  IMAGE_CHARS,
  IMAGE_PLACEHOLDER,
  MAX_QUOTE_CHARS,
  WHATSAPP_RULE,
  buildMessages,
  buildSystemPrompt,
  charBudgetFor,
  contentChars,
  historyPlaceholder,
  trimHistory,
  userContentFor,
} from '../src/core/conversation.js'
import type { ChatMessage, ChatState, ContentPart, ModelInfo } from '../src/core/types.js'

// 2 November 2026, 11:00 UTC = 14:00 in Europe/Istanbul (UTC+3), a Monday.
const NOW = Date.UTC(2026, 10, 2, 11, 0, 0)
const DATE_LINE = 'Bugün: 2 Kasım 2026 Pazartesi, 14:00.'

const user = (content: string | ContentPart[]): ChatMessage => ({ role: 'user', content })
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content })

/** n user/assistant pairs: u1,a1,u2,a2,… each text `size` characters long. */
function pairs(n: number, size = 10): ChatMessage[] {
  const out: ChatMessage[] = []
  for (let i = 1; i <= n; i++) {
    out.push(user(`u${i}`.padEnd(size, '.')), assistant(`a${i}`.padEnd(size, '.')))
  }
  return out
}

/** The label of each message made by `pairs()` ('u1', 'a1', …). */
const texts = (h: ChatMessage[]): string[] =>
  h.map((m) => (typeof m.content === 'string' ? (m.content.split('.')[0] ?? '') : '?'))

describe('buildSystemPrompt', () => {
  it('is base, a blank line, the date line and the fixed WhatsApp rule when there are no notes', () => {
    const s = buildSystemPrompt({ base: 'Sen bir asistansın.', notes: [], now: NOW })
    expect(s).toBe(`Sen bir asistansın.\n\n${DATE_LINE}\n${WHATSAPP_RULE}`)
    expect(s).not.toContain('Kullanıcı notları')
  })

  it('puts the notes block between the base prompt and the date, one "• " line per note', () => {
    const s = buildSystemPrompt({ base: 'Taban.', notes: ['Kızım Ayşe 12 yaşında', 'Kahveyi sütsüz içerim'], now: NOW })
    expect(s).toBe(
      [
        'Taban.',
        '',
        'Kullanıcı notları:',
        '• Kızım Ayşe 12 yaşında',
        '• Kahveyi sütsüz içerim',
        '',
        DATE_LINE,
        WHATSAPP_RULE,
      ].join('\n'),
    )
  })

  it('ends with the exact WhatsApp rule line', () => {
    const s = buildSystemPrompt({ base: 'x', notes: [], now: NOW })
    expect(s.split('\n').at(-1)).toBe(
      "WhatsApp'ta yazıyorsun: başlık ve tablo kullanma, vurgu için *kalın*, liste için • kullan, kısa tut.",
    )
  })

  it('drops blank notes and flattens multi-line notes so the block stays one bullet per note', () => {
    const s = buildSystemPrompt({ base: 'x', notes: ['  ', 'ilk\nikinci   satır', ''], now: NOW })
    expect(s).toContain('Kullanıcı notları:\n• ilk ikinci satır\n\n')
    expect(s.match(/•/g)?.length).toBe(2) // one bullet plus the one inside the WhatsApp rule
  })

  it('omits the notes block when every note is blank', () => {
    expect(buildSystemPrompt({ base: 'x', notes: ['', '   '], now: NOW })).not.toContain('Kullanıcı notları')
  })

  it('starts with the date line when the base prompt is empty', () => {
    expect(buildSystemPrompt({ base: '  ', notes: [], now: NOW }).startsWith('Bugün:')).toBe(true)
  })

  it('formats the date in Europe/Istanbul by default and honours tz', () => {
    expect(buildSystemPrompt({ base: 'x', notes: [], now: NOW })).toContain('Pazartesi, 14:00.')
    // The US switched back to standard time on 1 Nov 2026, so New York is UTC-5.
    expect(buildSystemPrompt({ base: 'x', notes: [], now: NOW, tz: 'America/New_York' })).toContain('Pazartesi, 06:00.')
  })

  it('crosses midnight in the right zone', () => {
    const lateUtc = Date.UTC(2026, 10, 2, 22, 30, 0) // 01:30 on Tuesday 3 Nov in Istanbul
    expect(buildSystemPrompt({ base: 'x', notes: [], now: lateUtc })).toContain('3 Kasım 2026 Salı, 01:30.')
  })
})

describe('userContentFor', () => {
  it('returns plain text unchanged (trimmed)', () => {
    expect(userContentFor({ text: 'Merhaba' })).toBe('Merhaba')
    expect(userContentFor({ text: '  Merhaba  \n' })).toBe('Merhaba')
  })

  it('returns an empty string when there is nothing at all', () => {
    expect(userContentFor({ text: '' })).toBe('')
  })

  it('prefixes the quoted message as Alıntı: "…"', () => {
    expect(userContentFor({ text: 'Bunu özetle', quotedText: 'Toplantı yarın 10:00.' })).toBe(
      'Alıntı: "Toplantı yarın 10:00."\nBunu özetle',
    )
  })

  it('ignores a blank quote and clips a very long one', () => {
    expect(userContentFor({ text: 'a', quotedText: '   ' })).toBe('a')
    const long = userContentFor({ text: 'a', quotedText: 'x'.repeat(MAX_QUOTE_CHARS + 500) })
    expect(typeof long).toBe('string')
    const quoteLine = String(long).split('\n')[0] ?? ''
    expect(quoteLine.startsWith('Alıntı: "')).toBe(true)
    expect(quoteLine.endsWith('…"')).toBe(true)
    expect(quoteLine.length).toBeLessThan(MAX_QUOTE_CHARS + 20)
  })

  it('prefixes a voice transcript with a microphone emoji', () => {
    expect(userContentFor({ text: '', transcript: 'yarın saat kaçta' })).toBe('🎤 yarın saat kaçta')
  })

  it('puts the quote first, then the transcript, then the text', () => {
    expect(userContentFor({ text: 'Not', quotedText: 'Q', transcript: 'T' })).toBe('Alıntı: "Q"\n🎤 T\nNot')
  })

  it('inlines a document as "Dosya <name>:" with a fenced block after the caption', () => {
    const out = userContentFor({ text: 'Özetle', documentText: { name: 'notlar.txt', text: 'Satır 1\nSatır 2\n\n' } })
    expect(out).toBe('Özetle\n\nDosya notlar.txt:\n```\nSatır 1\nSatır 2\n```')
  })

  it('uses a default instruction when a document has no caption', () => {
    const out = userContentFor({ text: '', documentText: { name: 'a.csv', text: 'x,y' } })
    expect(out).toBe(`${DEFAULT_DOCUMENT_PROMPT}\n\nDosya a.csv:\n\`\`\`\nx,y\n\`\`\``)
  })

  it('uses a longer fence when the document itself contains a fence', () => {
    const out = userContentFor({ text: 'Bak', documentText: { name: 'r.md', text: 'önce\n```js\nlet a\n```\nsonra' } })
    expect(typeof out).toBe('string')
    const s = String(out)
    expect(s).toContain('Dosya r.md:\n````\nönce\n```js')
    expect(s.endsWith('sonra\n````')).toBe(true)
  })

  it('falls back to "dosya" for an empty file name', () => {
    expect(String(userContentFor({ text: 'x', documentText: { name: ' ', text: 'y' } }))).toContain('Dosya dosya:')
  })

  it('returns text part first, then image_url, for an image', () => {
    const out = userContentFor({ text: 'Bu ne?', imageDataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(out).toEqual([
      { type: 'text', text: 'Bu ne?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ])
  })

  it('asks to look at the picture when there is an image but no words', () => {
    const out = userContentFor({ text: '', imageDataUrl: 'data:image/png;base64,BBBB' })
    expect(out).toEqual([
      { type: 'text', text: 'Bu resmi incele.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
    ])
    expect(DEFAULT_IMAGE_PROMPT).toBe('Bu resmi incele.')
  })

  it('keeps the quote in the text part of an image message', () => {
    const out = userContentFor({ text: '', quotedText: 'Reçete', imageDataUrl: 'data:image/png;base64,C' })
    expect(Array.isArray(out)).toBe(true)
    const first = (out as ContentPart[])[0]
    expect(first).toEqual({ type: 'text', text: 'Alıntı: "Reçete"' })
  })
})

describe('historyPlaceholder', () => {
  it('stores text as is', () => {
    expect(historyPlaceholder('Merhaba dünya')).toBe('Merhaba dünya')
    expect(historyPlaceholder('')).toBe('')
  })

  it('replaces image parts with [resim] and keeps the text part', () => {
    const content = userContentFor({ text: 'Bu ne?', imageDataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(historyPlaceholder(content)).toBe('Bu ne?\n[resim]')
    expect(IMAGE_PLACEHOLDER).toBe('[resim]')
  })

  it('never keeps the data URL', () => {
    const content = userContentFor({ text: '', imageDataUrl: `data:image/png;base64,${'Z'.repeat(5000)}` })
    const stored = historyPlaceholder(content)
    expect(stored).toBe('Bu resmi incele.\n[resim]')
    expect(stored).not.toContain('base64')
  })

  it('handles image-only and empty part lists', () => {
    expect(historyPlaceholder([{ type: 'image_url', image_url: { url: 'data:x' } }])).toBe('[resim]')
    expect(historyPlaceholder([])).toBe('')
  })
})

describe('contentChars', () => {
  it('counts string length, text part lengths and 1000 per image part', () => {
    expect(contentChars('abcd')).toBe(4)
    expect(
      contentChars([
        { type: 'text', text: 'abc' },
        { type: 'image_url', image_url: { url: 'data:x' } },
        { type: 'image_url', image_url: { url: 'data:y' } },
      ]),
    ).toBe(3 + 2 * IMAGE_CHARS)
  })
})

describe('trimHistory', () => {
  const big = { maxMessages: 1000, maxChars: 1_000_000 }

  it('returns an empty history unchanged', () => {
    expect(trimHistory([], big)).toEqual([])
  })

  it('keeps everything that fits both limits', () => {
    const h = pairs(3)
    expect(trimHistory(h, big)).toEqual(h)
  })

  it('does not mutate the input', () => {
    const h = pairs(4)
    const copy = [...h]
    trimHistory(h, { maxMessages: 2, maxChars: 5 })
    expect(h).toEqual(copy)
  })

  it('keeps the most recent messages when over maxMessages, dropping whole pairs from the front', () => {
    const h = pairs(3) // u1 a1 u2 a2 u3 a3
    expect(texts(trimHistory(h, { ...big, maxMessages: 4 }))).toEqual(['u2', 'a2', 'u3', 'a3'])
    expect(texts(trimHistory(h, { ...big, maxMessages: 2 }))).toEqual(['u3', 'a3'])
  })

  it('never starts with an assistant turn: an odd cut drops the orphaned reply too', () => {
    const h = pairs(3)
    expect(texts(trimHistory(h, { ...big, maxMessages: 5 }))).toEqual(['u2', 'a2', 'u3', 'a3'])
    expect(texts(trimHistory(h, { ...big, maxMessages: 3 }))).toEqual(['u3', 'a3'])
    expect(texts(trimHistory(h, { ...big, maxMessages: 1 }))).toEqual([])
  })

  it('maxMessages 0 keeps nothing', () => {
    expect(trimHistory(pairs(2), { ...big, maxMessages: 0 })).toEqual([])
  })

  it('drops from the front in whole pairs until the character budget fits', () => {
    const h = pairs(3) // 6 × 10 chars = 60
    expect(texts(trimHistory(h, { maxMessages: 100, maxChars: 60 }))).toHaveLength(6)
    expect(texts(trimHistory(h, { maxMessages: 100, maxChars: 59 }))).toEqual(['u2', 'a2', 'u3', 'a3'])
    // 35 < 40: even though dropping a single message would nearly fit, a whole pair goes.
    expect(texts(trimHistory(h, { maxMessages: 100, maxChars: 35 }))).toEqual(['u3', 'a3'])
    expect(texts(trimHistory(h, { maxMessages: 100, maxChars: 20 }))).toEqual(['u3', 'a3'])
  })

  it('returns [] when even the newest pair does not fit', () => {
    expect(trimHistory(pairs(3), { maxMessages: 100, maxChars: 19 })).toEqual([])
    expect(trimHistory(pairs(3), { maxMessages: 100, maxChars: 0 })).toEqual([])
  })

  it('applies the message limit first and then the character limit', () => {
    const h = pairs(10)
    expect(texts(trimHistory(h, { maxMessages: 6, maxChars: 40 }))).toEqual(['u9', 'a9', 'u10', 'a10'])
  })

  it('weighs an image part as 1000 characters', () => {
    const withImage: ChatMessage[] = [
      user([
        { type: 'text', text: 'Bu ne?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
      ]),
      assistant('Bir kedi.'),
      user('Teşekkürler'),
      assistant('Rica ederim.'),
    ]
    const imageWeight = 6 + IMAGE_CHARS + 9
    expect(trimHistory(withImage, { maxMessages: 10, maxChars: imageWeight + 23 })).toHaveLength(4)
    const tight = trimHistory(withImage, { maxMessages: 10, maxChars: imageWeight + 22 })
    expect(tight.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(tight[0]?.content).toBe('Teşekkürler')
    expect(trimHistory(withImage, { maxMessages: 10, maxChars: 22 })).toEqual([])
  })

  it('removes a leading assistant turn left over from earlier trimming', () => {
    const h = [assistant('yetim'), user('soru'), assistant('yanıt')]
    expect(trimHistory(h, big).map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('drops one message at a time when the front is not a user+assistant pair', () => {
    const h = [user('aaaaaaaaaa'), user('bbbbbbbbbb'), assistant('cccccccccc')]
    // 30 chars; limit 20 → drop only the first user turn, the remaining pair stays.
    expect(trimHistory(h, { maxMessages: 10, maxChars: 20 })).toEqual([user('bbbbbbbbbb'), assistant('cccccccccc')])
  })

  it('ignores system turns that should never be in a stored history', () => {
    const h: ChatMessage[] = [{ role: 'system', content: 'gizli' }, ...pairs(1)]
    expect(trimHistory(h, big).every((m) => m.role !== 'system')).toBe(true)
  })

  it('floors fractional limits and treats negatives as zero', () => {
    expect(trimHistory(pairs(3), { maxMessages: 2.9, maxChars: 1e6 })).toHaveLength(2)
    expect(trimHistory(pairs(3), { maxMessages: -3, maxChars: 1e6 })).toEqual([])
  })
})

describe('charBudgetFor', () => {
  it('is about 60 % of the context length times 3 chars per token', () => {
    expect(charBudgetFor({ id: 'm', name: 'M', inputModalities: ['text'], contextLength: 128_000 })).toBe(230_400)
    expect(charBudgetFor({ id: 'm', name: 'M', inputModalities: ['text'], contextLength: 8192 })).toBe(14_745)
    expect(CHARS_PER_TOKEN).toBe(3)
  })

  it('falls back to a 32 000-token context when the model or its context is unknown', () => {
    expect(charBudgetFor(undefined)).toBe(57_600)
    expect(charBudgetFor({ id: 'm', name: 'M', inputModalities: ['text'] })).toBe(57_600)
    expect(charBudgetFor(undefined, 10_000)).toBe(18_000)
  })

  it('ignores nonsensical context lengths', () => {
    const base: ModelInfo = { id: 'm', name: 'M', inputModalities: ['text'] }
    expect(charBudgetFor({ ...base, contextLength: 0 })).toBe(57_600)
    expect(charBudgetFor({ ...base, contextLength: -5 })).toBe(57_600)
    expect(charBudgetFor({ ...base, contextLength: Number.NaN })).toBe(57_600)
  })
})

describe('buildMessages', () => {
  const config = { systemPrompt: 'Varsayılan sistem mesajı.', maxHistory: 30 }
  const state = (over: Partial<ChatState> = {}): ChatState => ({
    chatJid: '905321234567@s.whatsapp.net',
    history: [],
    notes: [],
    updatedAt: 0,
    ...over,
  })
  const model = (contextLength?: number): ModelInfo => ({
    id: 'x/y',
    name: 'Y',
    inputModalities: ['text'],
    ...(contextLength !== undefined ? { contextLength } : {}),
  })

  it('is [system, …history, user] with the config prompt, date and rule in the system turn', () => {
    const history = pairs(2)
    const msgs = buildMessages({ state: state({ history }), config, userContent: 'Yeni soru', now: NOW })
    expect(msgs).toHaveLength(6)
    expect(msgs[0]?.role).toBe('system')
    const sys = String(msgs[0]?.content)
    expect(sys).toContain('Varsayılan sistem mesajı.')
    expect(sys).toContain(DATE_LINE)
    expect(sys).toContain(WHATSAPP_RULE)
    expect(msgs.slice(1, 5)).toEqual(history)
    expect(msgs[5]).toEqual({ role: 'user', content: 'Yeni soru' })
  })

  it('uses the per-chat system prompt over the config one, but not when it is blank', () => {
    const own = buildMessages({ state: state({ systemPrompt: 'Kısa yanıt ver.' }), config, userContent: 'x', now: NOW })
    expect(String(own[0]?.content)).toContain('Kısa yanıt ver.')
    expect(String(own[0]?.content)).not.toContain('Varsayılan sistem mesajı.')
    const blank = buildMessages({ state: state({ systemPrompt: '   ' }), config, userContent: 'x', now: NOW })
    expect(String(blank[0]?.content)).toContain('Varsayılan sistem mesajı.')
  })

  it('injects the chat notes into the system turn', () => {
    const msgs = buildMessages({ state: state({ notes: ['Eşim Ali'] }), config, userContent: 'x', now: NOW })
    expect(String(msgs[0]?.content)).toContain('Kullanıcı notları:\n• Eşim Ali')
  })

  it('works with no history at all', () => {
    const msgs = buildMessages({ state: state(), config, userContent: 'x', now: NOW })
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('honours maxHistory', () => {
    const history = pairs(5)
    const msgs = buildMessages({
      state: state({ history }),
      config: { ...config, maxHistory: 4 },
      userContent: 'x',
      now: NOW,
    })
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(msgs.slice(1, 5)).toEqual(history.slice(-4))
  })

  it('keeps no history at all when maxHistory is 0', () => {
    const msgs = buildMessages({
      state: state({ history: pairs(3) }),
      config: { ...config, maxHistory: 0 },
      userContent: 'x',
      now: NOW,
    })
    expect(msgs).toHaveLength(2)
  })

  it('trims history to the model character budget after reserving room for system prompt and user turn', () => {
    const history = pairs(10, 200) // 4000 chars
    const userContent = 'soru'.repeat(10)
    const m = model(2000) // budget 3600 chars
    const msgs = buildMessages({ state: state({ history }), config, model: m, userContent, now: NOW })
    const kept = msgs.slice(1, -1)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(20)
    expect(kept[0]?.role).toBe('user')
    expect(kept.at(-1)).toEqual(history.at(-1)) // the newest turn survives
    const total = msgs.reduce((n, x) => n + contentChars(x.content), 0)
    expect(total).toBeLessThanOrEqual(charBudgetFor(m))
  })

  it('drops all history when the current turn (a big document) already eats the budget', () => {
    const bigDoc = userContentFor({ text: 'Özetle', documentText: { name: 'b.txt', text: 'kelime '.repeat(2000) } })
    const msgs = buildMessages({
      state: state({ history: pairs(3) }),
      config,
      model: model(4000),
      userContent: bigDoc,
      now: NOW,
    })
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user'])
    expect(msgs[1]?.content).toBe(bigDoc)
  })

  it('passes an image user turn through untouched as the last message', () => {
    const content = userContentFor({ text: 'Bu ne?', imageDataUrl: 'data:image/jpeg;base64,AAAA' })
    const msgs = buildMessages({ state: state({ history: pairs(1) }), config, userContent: content, now: NOW })
    expect(msgs.at(-1)).toEqual({ role: 'user', content })
  })

  it('does not mutate the stored state', () => {
    const s = state({ history: pairs(3), notes: ['a'] })
    const snapshot = JSON.stringify(s)
    buildMessages({ state: s, config: { ...config, maxHistory: 2 }, userContent: 'x', now: NOW })
    expect(JSON.stringify(s)).toBe(snapshot)
  })

  it('passes tz to the date line', () => {
    const msgs = buildMessages({ state: state(), config, userContent: 'x', now: NOW, tz: 'America/New_York' })
    expect(String(msgs[0]?.content)).toContain('Pazartesi, 06:00.')
  })
})
