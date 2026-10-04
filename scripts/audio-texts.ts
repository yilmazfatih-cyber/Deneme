/**
 * Uygulamanın sesli okuduğu tüm sabit metinleri toplar (kelimeler, hazır cümleler, ipuçları,
 * hızlı ihtiyaçlar, kalıplar, ısınma dizileri, senaryolar, arayüzde okunan cümleler).
 * Çıktı: [{ key, file, text }] — scripts/make-audio.py bunları seslendirir.
 * Kullanım: npx tsx scripts/audio-texts.ts > metinler.json
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Journey, QuickItem, Template, Word } from '../src/content/schema.ts'
import { audioFile, audioKey, speakable } from '../src/lib/audioKey.ts'

const root = join(import.meta.dirname, '..')
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

const words = readdirSync(join(root, 'content/vocabulary'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => read<Word[]>(`content/vocabulary/${f}`))
const quick = read<QuickItem[]>('content/quick.json')
const templates = read<Template[]>('content/templates.json')
const journey = read<Journey>('content/journey.json')
const tr = read<Record<string, string>>('src/i18n/tr.json')

const texts: string[] = []
for (const w of words) {
  texts.push(w.word, ...Object.values(w.forms), ...w.phrases, ...w.cues.semantic)
  texts.push(...w.cues.sentence.map(speakable))
  if (w.syllables.length > 1) texts.push(w.syllables[0]!)
}
texts.push(...quick.map((q) => q.speak))
texts.push(...templates.map((t) => t.label.replace('___', '').trim()))
for (const wu of journey.warmups) texts.push(...wu.items)
for (const sc of journey.scenarios) texts.push(sc.prompt, sc.phrase)
texts.push(
  tr['nav.yes']!,
  tr['nav.no']!,
  tr['voice.testPhrase']!,
  tr['partner.default']!,
  tr['session.tryAgain']!,
  'Afazim var.',
  'Anlıyorum ama konuşmakta zorlanıyorum.',
  'Ağrım var',
)
for (const n of [0, 2, 4, 6, 8, 10]) texts.push(`Ağrım ${n} üzerinden 10.`)

const byKey = new Map<string, { key: string; file: string; text: string }>()
const files = new Map<string, string>()
for (const text of texts) {
  const key = audioKey(text)
  if (!key || byKey.has(key)) continue
  const file = audioFile(key)
  const other = files.get(file)
  if (other && other !== key) throw new Error(`Dosya adı çakışması: "${key}" ve "${other}"`)
  files.set(file, key)
  byKey.set(key, { key, file, text: text.replace(/\s+/g, ' ').trim() })
}

process.stdout.write(JSON.stringify([...byKey.values()], null, 1))
console.error(`${byKey.size} metin`)
