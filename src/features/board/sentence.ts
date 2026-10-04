import { capitalizeTr } from '../../lib/text'

/**
 * Türkçe eklemeli bir dil: "baş" + "ağrımak" kendiliğinden "Başım ağrıyor" olmaz.
 * Bu yüzden çekim üretilmez:
 *  1. Kelime kartlarının hazır biçimleri (forms) kalıp seçilince kullanılır.
 *  2. Hazır biçim yoksa kalıbın yedeği ("{w} istiyorum") kelimeyle doldurulur.
 *  3. Kalıp yoksa kelimeler yalın sırayla okunur; anlam yine geçer.
 */

export interface SentenceWord {
  id: string
  word: string
  forms: Record<string, string>
}

export interface SentenceTemplate {
  id: string
  label: string
  fallback: string
}

export type Segment =
  | { kind: 'word'; text: string; itemId: string }
  | { kind: 'phrase'; text: string; itemId?: string }
  | { kind: 'template'; templateId: string; label: string; fallback: string }
  | { kind: 'filled'; text: string; templateId: string; itemId: string }

export function fillTemplate(template: SentenceTemplate, item: SentenceWord): string {
  return item.forms[template.id] ?? template.fallback.replace('{w}', item.word)
}

export function addWord(segments: Segment[], item: SentenceWord): Segment[] {
  const last = segments.at(-1)
  if (last?.kind === 'template') {
    const text = fillTemplate({ id: last.templateId, label: last.label, fallback: last.fallback }, item)
    return [...segments.slice(0, -1), { kind: 'filled', text, templateId: last.templateId, itemId: item.id }]
  }
  return [...segments, { kind: 'word', text: item.word, itemId: item.id }]
}

export function addTemplate(segments: Segment[], template: SentenceTemplate): Segment[] {
  const last = segments.at(-1)
  // Üst üste iki boş kalıp anlamsız; sonuncusu yenisiyle değişir.
  const base = last?.kind === 'template' ? segments.slice(0, -1) : segments
  return [...base, { kind: 'template', templateId: template.id, label: template.label, fallback: template.fallback }]
}

/** Hazır cümle seçilince, aynı kartın yalın kelimesi şeritteyse onun yerine geçer. */
export function addPhrase(segments: Segment[], text: string, itemId?: string): Segment[] {
  const last = segments.at(-1)
  if (itemId && last && (last.kind === 'word' || last.kind === 'filled') && last.itemId === itemId) {
    return [...segments.slice(0, -1), { kind: 'phrase', text, itemId }]
  }
  return [...segments, { kind: 'phrase', text, itemId }]
}

export function undo(segments: Segment[]): Segment[] {
  return segments.slice(0, -1)
}

function segmentText(s: Segment, spoken: boolean): string {
  if (s.kind === 'template') {
    // Boş kalıp: ekranda "___ istiyorum", seste yalnızca "istiyorum"
    return spoken ? s.label.replace('___', '').trim() : s.label
  }
  return s.text
}

function join(parts: string[]): string {
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return capitalizeTr(text)
}

export function displayText(segments: Segment[]): string {
  return join(segments.map((s) => segmentText(s, false)))
}

/** Sesli okuma için parçalar: her parçanın hazır kaydı ayrı çalınır. */
export function spokenParts(segments: Segment[]): string[] {
  return segments.map((s) => segmentText(s, true)).filter(Boolean)
}

export function spokenText(segments: Segment[]): string {
  return join(segments.map((s) => segmentText(s, true)))
}

/** Şeritteki son kartın kimliği; hazır cümle satırı bu karta göre dolar. */
export function lastItemId(segments: Segment[]): string | undefined {
  const last = segments.at(-1)
  if (!last || last.kind === 'template') return undefined
  return last.itemId
}
