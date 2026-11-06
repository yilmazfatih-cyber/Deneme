/**
 * Conversation assembly: the system prompt (base + user notes + today's date + a WhatsApp
 * formatting rule), the content of the current user turn (text, quote, voice transcript,
 * inlined document, image), the placeholder stored in history afterwards, and history trimming
 * by message count and by a character budget derived from the model's context length.
 */
import type { Config } from '../config.js'
import { clip, formatDateTr } from './text.js'
import type { ChatMessage, ChatState, ContentPart, ModelInfo } from './types.js'

/** Fixed rule appended to every system prompt; models tend to answer in Markdown otherwise. */
export const WHATSAPP_RULE =
  "WhatsApp'ta yazıyorsun: başlık ve tablo kullanma, vurgu için *kalın*, liste için • kullan, kısa tut."
/** What an image becomes in the stored history. */
export const IMAGE_PLACEHOLDER = '[resim]'
/** Weight of one image part when counting history characters. */
export const IMAGE_CHARS = 1000
/** Text sent with an image when the user wrote no caption. */
export const DEFAULT_IMAGE_PROMPT = 'Bu resmi incele.'
/** Text sent with a document when the user wrote no caption. */
export const DEFAULT_DOCUMENT_PROMPT = 'Bu dosyayı incele.'
/** Quoted messages are clipped to this many characters before they enter the prompt. */
export const MAX_QUOTE_CHARS = 1500
/** Share of the model's context left for the conversation (the rest is headroom for the answer). */
export const CONTEXT_SHARE = 0.6
/** Rough chars-per-token heuristic for Turkish and English mixed text. */
export const CHARS_PER_TOKEN = 3

export interface SystemPromptOptions {
  base: string
  notes: string[]
  now: number
  tz?: string
}

/** Base prompt, then a "Kullanıcı notları:" bullet block (when any), then the date and the WhatsApp rule. */
export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const blocks: string[] = []
  const base = opts.base.trim()
  if (base) blocks.push(base)
  const notes = opts.notes.map((n) => n.replace(/\s+/g, ' ').trim()).filter((n) => n !== '')
  if (notes.length > 0) blocks.push(['Kullanıcı notları:', ...notes.map((n) => `• ${n}`)].join('\n'))
  blocks.push(`Bugün: ${formatDateTr(opts.now, opts.tz)}.\n${WHATSAPP_RULE}`)
  return blocks.join('\n\n')
}

export interface UserContentInput {
  text: string
  quotedText?: string
  /** data:<mime>;base64,… */
  imageDataUrl?: string
  /** voice note transcript */
  transcript?: string
  /** text-like document to inline as a fenced block */
  documentText?: { name: string; text: string }
}

/** Picks a fence the document body cannot close early. */
function fenceFor(text: string): string {
  let fence = '```'
  while (text.includes(fence)) fence += '`'
  return fence
}

/**
 * Composes the user turn. Order: `Alıntı: "…"` (quoted message), `🎤 …` (transcript), the text,
 * then `Dosya <name>:` with a fenced block. With an image the result is a part list: the text part
 * first (or 'Bu resmi incele.' when there is nothing to say), then the image_url part.
 */
export function userContentFor(input: UserContentInput): string | ContentPart[] {
  const lines: string[] = []
  const quoted = input.quotedText?.trim()
  if (quoted) lines.push(`Alıntı: "${clip(quoted, MAX_QUOTE_CHARS)}"`)
  const transcript = input.transcript?.trim()
  if (transcript) lines.push(`🎤 ${transcript}`)
  const text = input.text.trim()
  if (text) lines.push(text)
  let body = lines.join('\n')
  const doc = input.documentText
  if (doc) {
    const fence = fenceFor(doc.text)
    const block = `Dosya ${doc.name.trim() || 'dosya'}:\n${fence}\n${doc.text.replace(/\s+$/, '')}\n${fence}`
    body = `${body || DEFAULT_DOCUMENT_PROMPT}\n\n${block}`
  }
  if (input.imageDataUrl) {
    return [
      { type: 'text', text: body || DEFAULT_IMAGE_PROMPT },
      { type: 'image_url', image_url: { url: input.imageDataUrl } },
    ]
  }
  return body
}

/** What goes into the stored history after the turn: text as is, image parts as '[resim]'. */
export function historyPlaceholder(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .map((p) => (p.type === 'text' ? p.text : IMAGE_PLACEHOLDER))
    .filter((s) => s !== '')
    .join('\n')
}

/** Character weight of a message content: text lengths, 1000 per image part. */
export function contentChars(content: string | ContentPart[]): number {
  if (typeof content === 'string') return content.length
  return content.reduce((n, p) => n + (p.type === 'text' ? p.text.length : IMAGE_CHARS), 0)
}

export interface HistoryLimits {
  maxMessages: number
  maxChars: number
}

/**
 * Keeps the most recent messages: first at most `maxMessages`, then drops from the front until
 * the character weight fits `maxChars`, in whole user+assistant pairs when the front is one.
 * System turns are dropped. A leading assistant turn is removed so the history starts with the user.
 */
export function trimHistory(history: ChatMessage[], limits: HistoryLimits): ChatMessage[] {
  const maxMessages = Math.max(0, Math.floor(limits.maxMessages))
  const maxChars = Math.max(0, limits.maxChars)
  const turns = history.filter((m) => m.role === 'user' || m.role === 'assistant')
  let start = Math.max(0, turns.length - maxMessages)
  let chars = 0
  for (let i = start; i < turns.length; i++) chars += contentChars(turns[i]?.content ?? '')
  while (start < turns.length && chars > maxChars) {
    const pair = turns[start]?.role === 'user' && turns[start + 1]?.role === 'assistant'
    const drop = pair ? 2 : 1
    for (let i = start; i < start + drop && i < turns.length; i++) chars -= contentChars(turns[i]?.content ?? '')
    start += drop
  }
  while (start < turns.length && turns[start]?.role === 'assistant') start++
  return turns.slice(start)
}

/** ~60 % of the model's context length × 3 chars per token; `fallbackContext` tokens when unknown. */
export function charBudgetFor(model: ModelInfo | undefined, fallbackContext = 32_000): number {
  const ctx = model?.contextLength
  const tokens = typeof ctx === 'number' && Number.isFinite(ctx) && ctx > 0 ? ctx : fallbackContext
  // Whole-percent integer arithmetic so 0.6 × 3 does not pick up floating-point noise.
  return Math.floor((tokens * Math.round(CONTEXT_SHARE * 100) * CHARS_PER_TOKEN) / 100)
}

export interface BuildMessagesOptions {
  state: ChatState
  config: Pick<Config, 'systemPrompt' | 'maxHistory'>
  model?: ModelInfo
  userContent: string | ContentPart[]
  now: number
  tz?: string
}

/**
 * [system, …trimmed history, user]. The history budget is the model's character budget minus the
 * system prompt and the current user content, so a long document does not push the request over.
 */
export function buildMessages(opts: BuildMessagesOptions): ChatMessage[] {
  const { state, config, model, userContent, now } = opts
  const system = buildSystemPrompt({
    base: state.systemPrompt?.trim() || config.systemPrompt,
    notes: state.notes,
    now,
    ...(opts.tz !== undefined ? { tz: opts.tz } : {}),
  })
  const budget = Math.max(0, charBudgetFor(model) - system.length - contentChars(userContent))
  const history = trimHistory(state.history, { maxMessages: config.maxHistory, maxChars: budget })
  return [{ role: 'system', content: system }, ...history, { role: 'user', content: userContent }]
}
