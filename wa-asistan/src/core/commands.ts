/**
 * Slash commands: the command table (canonical names, aliases, Turkish one-liners), the parser
 * (Turkish-normalized so `/yardım` = `/yardim` = `/help`), the help text and the dispatcher.
 * Handlers talk only to the service interfaces in types.ts and never call the model.
 */
import { formatPerMillion, formatTl, formatUsd } from './cost.js'
import { clip, looksSecret, normalizeToken } from './text.js'
import type { AppContext, ChatState, CostSummary, FxRate, InboundMessage, ModelInfo } from './types.js'

export type KnownCommand =
  | 'yardim'
  | 'model'
  | 'modeller'
  | 'yeni'
  | 'sistem'
  | 'not'
  | 'maliyet'
  | 'butce'
  | 'kur'
  | 'durum'
  | 'izin'
  | 'altbilgi'
  | 'profil'
  | 'hatirla'
  | 'unut'

/** Canonical command name; 'unknown' for an unrecognized `/…` so the handler can answer with a hint. */
export type CommandName = KnownCommand | 'unknown'

export interface CommandSpec {
  name: KnownCommand
  aliases: readonly string[]
  /** the most useful invocation, without the leading slash */
  example: string
  /** one short Turkish line */
  description: string
}

export const COMMANDS: readonly CommandSpec[] = [
  { name: 'yardim', aliases: ['help', '?'], example: 'yardim', description: 'komut listesi' },
  {
    name: 'model',
    aliases: [],
    example: 'model gpt-5-mini',
    description: 'modeli göster / değiştir (/model varsayilan)',
  },
  {
    name: 'modeller',
    aliases: ['models'],
    example: 'modeller gemini',
    description: 'model ara; /modeller yenile listeyi tazeler',
  },
  { name: 'yeni', aliases: ['reset', 'new'], example: 'yeni', description: 'sohbet geçmişini temizle' },
  {
    name: 'sistem',
    aliases: [],
    example: 'sistem Kısa yanıt ver',
    description: 'bu sohbetin sistem mesajı (/sistem sil)',
  },
  {
    name: 'not',
    aliases: [],
    example: 'not ekle Kızım Ayşe 12 yaşında',
    description: 'notlar; /not, /not sil 2',
  },
  { name: 'maliyet', aliases: ['cost'], example: 'maliyet', description: 'bugün, bu ay ve toplam harcama' },
  { name: 'butce', aliases: ['bütçe'], example: 'butce 300', description: 'aylık bütçe, TL (0 = sınırsız)' },
  {
    name: 'kur',
    aliases: [],
    example: 'kur',
    description: 'dolar kuru; /kur 41.2 elle, /kur guncelle yeniler',
  },
  {
    name: 'durum',
    aliases: ['status'],
    example: 'durum',
    description: 'model, geçmiş, kur, bütçe, çalışma süresi',
  },
  {
    name: 'izin',
    aliases: [],
    example: 'izin ekle 905321234567',
    description: 'izinli numaralar (yalnızca sahip)',
  },
  { name: 'altbilgi', aliases: [], example: 'altbilgi', description: 'maliyet satırını aç / kapat' },
  {
    name: 'profil',
    aliases: [],
    example: 'profil ara annemin doğum günü',
    description: 'kişisel bilgiler; /profil ara <soru> modele ne gideceğini gösterir',
  },
  {
    name: 'hatirla',
    aliases: ['hatırla'],
    example: 'hatirla Park yeri B2 katı',
    description: 'kişisel bilgilere not ekle',
  },
  { name: 'unut', aliases: [], example: 'unut 2', description: '/hatirla notunu sil' },
]

/** normalized token → canonical name (canonical names included). */
const ALIASES: ReadonlyMap<string, KnownCommand> = new Map(
  COMMANDS.flatMap((c) => [c.name, ...c.aliases].map((a) => [normalizeToken(a), c.name] as const)),
)

export const MAX_NOTES = 20
export const MAX_NOTE_CHARS = 500
export const MAX_SYSTEM_PROMPT_CHARS = 4000
/** Soft cap for a single reply; longer text is cut at a line boundary. */
export const MAX_REPLY_CHARS = 1500
const LIST_LIMIT = 15
const AMBIGUOUS_LIMIT = 10
const TOP_MODELS = 5
const NOTE_PREVIEW_CHARS = 60

export interface ParsedCommand {
  /** canonical name, or 'unknown' for an unrecognized `/…` */
  name: CommandName
  /** everything after the command token, trimmed (inner newlines kept) */
  args: string
  /** the original text, trimmed */
  raw: string
}

/** `/Yardım` → yardim, `/bütçe 300` → butce + '300'; `/foo` → unknown; text not starting with '/' → undefined. */
export function parseCommand(text: string): ParsedCommand | undefined {
  const raw = (text ?? '').trim()
  if (!raw.startsWith('/')) return undefined
  const m = /^\/(\S*)\s*([\s\S]*)$/.exec(raw)
  const token = normalizeToken(m?.[1] ?? '')
  const args = (m?.[2] ?? '').trim()
  return { name: ALIASES.get(token) ?? 'unknown', args, raw }
}

/** One line per command with its most useful example. */
export function helpText(): string {
  const lines = COMMANDS.map((c) => `/${c.example} — ${c.description}`)
  return ['*Komutlar*', ...lines, 'Komut dışı her mesaj seçili modele gider.'].join('\n')
}

/** The one-line hint for an unrecognized `/…`; the handler and runCommand share it. */
export const UNKNOWN_COMMAND = 'Bilinmeyen komut. Komutlar için /yardim yaz.'

/** `Bilinmeyen komut: /foo. Komutlar için /yardim yaz.` (the typed token is clipped); the generic line without one. */
export function unknownCommandReply(raw: string): string {
  const typed = /^\/(\S*)/.exec((raw ?? '').trim())?.[1] ?? ''
  return typed ? `Bilinmeyen komut: /${clip(typed, 30)}. Komutlar için /yardim yaz.` : UNKNOWN_COMMAND
}

export interface CommandResult {
  reply: string
  /** the state to persist; the very same object as the input when nothing changed */
  state: ChatState
}

/** Runs a parsed command. Never throws: unexpected errors become a short Turkish notice. */
export async function runCommand(
  cmd: ParsedCommand,
  msg: InboundMessage,
  state: ChatState,
  ctx: AppContext,
): Promise<CommandResult> {
  try {
    const result = await dispatch(cmd, msg, state, ctx)
    return { reply: fit(result.reply), state: result.state }
  } catch (err) {
    ctx.log.warn({ err, command: cmd.name, chat: msg.chatJid }, 'command failed')
    return keep(state, 'Komut şu anda çalışmadı. Biraz sonra tekrar dene.')
  }
}

async function dispatch(
  cmd: ParsedCommand,
  msg: InboundMessage,
  state: ChatState,
  ctx: AppContext,
): Promise<CommandResult> {
  switch (cmd.name) {
    case 'yardim':
      return keep(state, helpText())
    case 'model':
      return cmdModel(cmd.args, state, ctx)
    case 'modeller':
      return cmdModeller(cmd.args, state, ctx)
    case 'yeni':
      return cmdYeni(state, ctx)
    case 'sistem':
      return cmdSistem(cmd.args, state, ctx)
    case 'not':
      return cmdNot(cmd.args, state, ctx)
    case 'maliyet':
      return cmdMaliyet(state, ctx)
    case 'butce':
      return cmdButce(cmd.args, state, ctx)
    case 'kur':
      return cmdKur(cmd.args, state, ctx)
    case 'durum':
      return cmdDurum(state, ctx)
    case 'izin':
      return cmdIzin(cmd.args, msg, state, ctx)
    case 'altbilgi':
      return cmdAltbilgi(cmd.args, state, ctx)
    case 'profil':
    case 'hatirla':
    case 'unut':
      return cmdProfile(cmd.name, cmd.args, msg, state, ctx)
    case 'unknown':
      return keep(state, unknownCommandReply(cmd.raw))
  }
}

// ---------------------------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------------------------

function keep(state: ChatState, reply: string): CommandResult {
  return { reply, state }
}

function change(state: ChatState, patch: Partial<ChatState>, reply: string, now: number): CommandResult {
  const next: ChatState = { ...state, ...patch, updatedAt: now }
  for (const key of ['model', 'systemPrompt'] as const) if (next[key] === undefined) delete next[key]
  return { reply, state: next }
}

/** Cuts a reply at a line boundary so it stays near MAX_REPLY_CHARS. */
function fit(reply: string): string {
  if (reply.length <= MAX_REPLY_CHARS) return reply
  const out: string[] = []
  let used = 0
  for (const line of reply.split('\n')) {
    if (used + line.length + 1 > MAX_REPLY_CHARS - 2) break
    out.push(line)
    used += line.length + 1
  }
  if (out.length === 0) return clip(reply, MAX_REPLY_CHARS)
  return `${out.join('\n')}\n…`
}

/** Budget in effect (TL, 0 = unlimited): the runtime setting wins over the .env value. */
export function effectiveBudget(ctx: Pick<AppContext, 'settings' | 'config'>): number {
  return ctx.settings.get().monthlyBudgetTl ?? ctx.config.monthlyBudgetTl
}

/** Cost footer in effect: the runtime setting wins over the .env value. */
export function effectiveFooter(ctx: Pick<AppContext, 'settings' | 'config'>): boolean {
  return ctx.settings.get().costFooter ?? ctx.config.costFooter
}

async function safeRate(ctx: AppContext): Promise<FxRate | undefined> {
  try {
    return await ctx.fx.rate()
  } catch (err) {
    ctx.log.warn({ err }, 'fx rate failed')
    return undefined
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** First whitespace-separated token and the rest (inner newlines of the rest kept). */
function splitFirst(args: string): [string, string] {
  const m = /^(\S+)\s*([\s\S]*)$/.exec(args)
  return [m?.[1] ?? '', (m?.[2] ?? '').trim()]
}

const INT_FORMAT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const SHORT_FORMAT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })
const PRICE_FORMAT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatInt(n: number): string {
  return INT_FORMAT.format(n)
}

/**
 * '300', '300,50', '41.2', '300 TL', '₺300' → number; anything else → undefined. With
 * `thousandsDot`, '1.500' and '1.250,75' read as Turkish grouping (1500, 1250.75).
 */
function parseNumber(raw: string, thousandsDot = false): number | undefined {
  let s = raw
    .trim()
    .replace(/^[₺$]\s*/, '')
    .replace(/\s*(tl|₺|\$|lira)$/i, '')
    .trim()
  if (!/^\d[\d.,]*$/.test(s)) return undefined
  if (thousandsDot && /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function formatUptime(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `${d} gün ${h} saat`
  if (h > 0) return `${h} saat ${m} dk`
  return `${m} dk`
}

/** Age in hours: '2 saat önce', '2,5 saat önce', 'bir saatten yeni'. */
function ageText(ms: number): string {
  const hours = Math.max(0, ms) / 3_600_000
  if (hours < 1) return 'bir saatten yeni'
  return `${SHORT_FORMAT.format(hours)} saat önce`
}

const SOURCE_LABEL: Record<FxRate['source'], string> = {
  manual: 'elle',
  tcmb: 'TCMB',
  frankfurter: 'frankfurter',
  erapi: 'er-api',
  cache: 'önbellek',
}

function rateReport(fx: FxRate, now: number): string {
  return `1 $ = ${formatTl(fx.rate)}\nKaynak: ${SOURCE_LABEL[fx.source]} · ${ageText(now - fx.asOf)}`
}

// ---------------------------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------------------------

function canSeeImages(m: ModelInfo): boolean {
  return m.inputModalities.some((x) => normalizeToken(x) === 'image')
}

function isFree(m: ModelInfo): boolean {
  const p = m.pricing
  if (!p) return m.free === true
  return p.promptUsdPerToken === 0 && p.completionUsdPerToken === 0
}

/** Full price line for a single model: '1M giriş 12,50 TL · 1M çıkış 50,00 TL'. */
function priceOf(m: ModelInfo, rate: number | undefined): string {
  if (isFree(m)) return 'ücretsiz'
  return formatPerMillion(m.pricing, rate)
}

function priceNumber(n: number): string {
  return n > 0 && n < 0.005 ? '<0,01' : PRICE_FORMAT.format(n)
}

/** Compact price for list lines: '12,50 / 50,00 TL' (per 1M tokens, input / output), '$0.30 / $1.20' without a rate. */
function shortPrice(m: ModelInfo, rate: number | undefined): string {
  if (isFree(m)) return 'ücretsiz'
  const p = m.pricing
  if (!p) return 'fiyat yok'
  const input = p.promptUsdPerToken * 1_000_000
  const output = p.completionUsdPerToken * 1_000_000
  if (rate !== undefined && rate > 0) return `${priceNumber(input * rate)} / ${priceNumber(output * rate)} TL`
  return `$${input.toFixed(2)} / $${output.toFixed(2)}`
}

const PRICE_LEGEND = 'Fiyatlar 1M token için, giriş / çıkış.'

function modelLine(m: ModelInfo, rate: number | undefined): string {
  return `• ${m.id} — ${shortPrice(m, rate)}`
}

function describeModel(m: ModelInfo | undefined, id: string, rate: number | undefined, isDefault: boolean): string {
  const lines = [`Model: *${id}*${isDefault ? ' (varsayılan)' : ''}`]
  if (!m) {
    lines.push('Katalogda bulunamadı; fiyat ve bağlam bilinmiyor.')
    return lines.join('\n')
  }
  lines.push(`Fiyat: ${priceOf(m, rate)}`)
  lines.push(`Bağlam: ${m.contextLength ? `${formatInt(m.contextLength)} token` : 'bilinmiyor'}`)
  if (canSeeImages(m)) lines.push('🖼 resim görebilir')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

async function cmdModel(args: string, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const rate = (await safeRate(ctx))?.rate
  const current = state.model ?? ctx.config.defaultModel
  if (!args) {
    const body = describeModel(ctx.catalog.get(current), current, rate, state.model === undefined)
    return keep(state, `${body}\nDeğiştir: /model <ad> · Ara: /modeller <kelime>`)
  }
  if (normalizeToken(args) === 'varsayilan') {
    return change(state, { model: undefined }, `Model varsayılana döndü: *${ctx.config.defaultModel}*`, ctx.now())
  }
  const r = ctx.catalog.resolve(args)
  if (r.kind === 'ok') {
    const body = describeModel(r.model, r.model.id, rate, false)
    if (r.model.id === state.model) return keep(state, `Bu model zaten seçili.\n${body}`)
    return change(state, { model: r.model.id }, `Model seçildi.\n${body}`, ctx.now())
  }
  if (r.kind === 'ambiguous') {
    const shown = r.candidates.slice(0, AMBIGUOUS_LIMIT)
    const lines = [`"${clip(args, 40)}" için birden çok model uyuyor:`, ...shown.map((m) => modelLine(m, rate))]
    if (r.candidates.length > shown.length) lines.push(`… ve ${r.candidates.length - shown.length} model daha.`)
    lines.push(PRICE_LEGEND, `Biraz daha belirgin yaz, örnek: /model ${shown[0]?.id ?? '<tam ad>'}`)
    return keep(state, lines.join('\n'))
  }
  if (ctx.catalog.all().length === 0) {
    return keep(state, 'Model listesi henüz yüklenmedi. Yüklemek için: /modeller yenile')
  }
  return keep(state, `"${clip(args, 40)}" adında model bulunamadı. Ara: /modeller <arama>`)
}

async function cmdModeller(args: string, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const rate = (await safeRate(ctx))?.rate
  if (!args) {
    const featured = ctx.catalog.featured()
    const lines = featured.map(
      (f) => `• ${f.alias} → ${f.model ? `${f.model.id} — ${shortPrice(f.model, rate)}` : 'yok'}`,
    )
    const head = lines.length > 0 ? ['*Kısayollar*', ...lines, PRICE_LEGEND] : []
    const total = ctx.catalog.all().length
    return keep(
      state,
      [...head, `Toplam ${total} model. Ara: /modeller <kelime>`, 'Listeyi tazele: /modeller yenile'].join('\n'),
    )
  }
  if (normalizeToken(args) === 'yenile') {
    try {
      await ctx.catalog.refresh()
    } catch (err) {
      ctx.log.warn({ err }, 'catalog refresh failed')
      return keep(state, `Liste yenilenemedi: ${clip(errMessage(err), 120)}. Biraz sonra tekrar dene.`)
    }
    return keep(state, `Liste yenilendi: ${ctx.catalog.all().length} model`)
  }
  const found = ctx.catalog.search(args, LIST_LIMIT + 1)
  if (found.length === 0) {
    return keep(
      state,
      `"${clip(args, 40)}" için model bulunamadı. Başka bir kelime dene veya listeyi tazele: /modeller yenile`,
    )
  }
  const shown = found.slice(0, LIST_LIMIT)
  const more = found.length > LIST_LIMIT
  const lines = [
    `"${clip(args, 40)}" için ${more ? `ilk ${LIST_LIMIT}` : shown.length} sonuç:`,
    ...shown.map((m) => modelLine(m, rate)),
  ]
  if (more) lines.push('Daha fazlası var; aramayı daralt.')
  lines.push(PRICE_LEGEND, 'Seç: /model <ad>')
  return keep(state, lines.join('\n'))
}

function cmdYeni(state: ChatState, ctx: AppContext): CommandResult {
  const n = state.history.length
  if (n === 0) return keep(state, 'Geçmiş zaten boş.')
  return change(
    state,
    { history: [] },
    `Sohbet sıfırlandı (${n} mesaj silindi). Model, sistem mesajı ve notlar duruyor.`,
    ctx.now(),
  )
}

function cmdSistem(args: string, state: ChatState, ctx: AppContext): CommandResult {
  if (!args) {
    const own = state.systemPrompt?.trim()
    const lines = [
      `*Sistem mesajı* (${own ? 'bu sohbete özel' : 'varsayılan'}):`,
      clip(own || ctx.config.systemPrompt, 1000),
      'Değiştir: /sistem <metin> · Sıfırla: /sistem sil',
    ]
    return keep(state, lines.join('\n'))
  }
  const sub = normalizeToken(args)
  if (sub === 'sil' || sub === 'varsayilan') {
    return change(state, { systemPrompt: undefined }, 'Sistem mesajı varsayılana döndü.', ctx.now())
  }
  if (args.length > MAX_SYSTEM_PROMPT_CHARS) {
    return keep(state, `Sistem mesajı çok uzun (en fazla ${formatInt(MAX_SYSTEM_PROMPT_CHARS)} karakter).`)
  }
  return change(
    state,
    { systemPrompt: args },
    `Sistem mesajı bu sohbet için güncellendi:\n${clip(args, 300)}`,
    ctx.now(),
  )
}

function listNotes(state: ChatState): string {
  if (state.notes.length === 0) return 'Not yok. Eklemek için: /not ekle <metin>'
  const lines = state.notes.map((n, i) => `${i + 1}. ${clip(n.replace(/\s+/g, ' '), NOTE_PREVIEW_CHARS)}`)
  return ['*Notlar*', ...lines, 'Sil: /not sil <numara> · Ekle: /not ekle <metin>'].join('\n')
}

function cmdNot(args: string, state: ChatState, ctx: AppContext): CommandResult {
  const [subRaw, rest] = splitFirst(args)
  const sub = normalizeToken(subRaw)
  if (!args || sub === 'liste') return keep(state, listNotes(state))
  if (sub === 'ekle') {
    if (!rest) return keep(state, 'Not metni boş. Örnek: /not ekle Kızım Ayşe 12 yaşında')
    if (looksSecret(rest)) {
      return keep(
        state,
        'Bu not bir şifre, kod veya anahtara benziyor. Notlar her mesajda modele gönderilir; burada tutmak güvenli olmaz. Kaydetmedim.',
      )
    }
    const text = rest.replace(/\s+/g, ' ')
    if (text.length > MAX_NOTE_CHARS) {
      return keep(state, `Not çok uzun (en fazla ${MAX_NOTE_CHARS} karakter). Kısaltıp tekrar dene.`)
    }
    if (state.notes.length >= MAX_NOTES) {
      return keep(state, `En fazla ${MAX_NOTES} not tutulur. Önce bir not sil: /not sil <numara>`)
    }
    const notes = [...state.notes, text]
    return change(state, { notes }, `Not eklendi (${notes.length}): ${clip(text, 120)}`, ctx.now())
  }
  if (sub === 'sil') {
    const n = /^\d+$/.test(rest) ? Number.parseInt(rest, 10) : Number.NaN
    if (!Number.isInteger(n) || n < 1 || n > state.notes.length) {
      if (state.notes.length === 0) return keep(state, 'Silinecek not yok.')
      return keep(state, `Hangi not? 1 ile ${state.notes.length} arası bir numara yaz. Liste: /not`)
    }
    const removed = state.notes[n - 1] ?? ''
    const notes = state.notes.filter((_, i) => i !== n - 1)
    return change(state, { notes }, `Not silindi: ${clip(removed, 120)}`, ctx.now())
  }
  return keep(state, 'Kullanım: /not · /not ekle <metin> · /not sil <numara>')
}

/**
 * '12,50 TL ($0.30)' when a rate is known (a summary without recorded TL is converted at today's
 * rate); plain dollars when there is no rate at all.
 */
function amount(usd: number, tl: number, rate: number | undefined): string {
  if (rate === undefined) return formatUsd(usd)
  const tlShown = tl > 0 ? tl : usd * rate
  return `${formatTl(tlShown)} (${formatUsd(usd)})`
}

function summaryLine(s: CostSummary, rate: number | undefined): string {
  const unknown = s.unknownCount > 0 ? ` (${s.unknownCount} mesajın maliyeti bilinmiyor)` : ''
  return `${amount(s.usd, s.tl, rate)} · ${s.count} mesaj${unknown}`
}

async function cmdMaliyet(state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const now = ctx.now()
  const [today, month, all, fx] = await Promise.all([
    ctx.ledger.today(now),
    ctx.ledger.month(now),
    ctx.ledger.allTime(),
    safeRate(ctx),
  ])
  const rate = fx?.rate
  const lines = [
    '*Maliyet*',
    `Bugün: ${summaryLine(today, rate)}`,
    `Bu ay: ${summaryLine(month, rate)}`,
    `Toplam: ${summaryLine(all, rate)}`,
  ]
  const top = [...month.byModel].sort((a, b) => b.tl - a.tl || b.usd - a.usd || b.count - a.count).slice(0, TOP_MODELS)
  if (top.length > 0) {
    lines.push(
      'Bu ayın modelleri:',
      ...top.map((m) => `• ${m.model} — ${amount(m.usd, m.tl, rate)} · ${m.count} mesaj`),
    )
  }
  lines.push(
    fx
      ? `Kullanılan kur: 1 $ = ${formatTl(fx.rate)} (${SOURCE_LABEL[fx.source]})`
      : 'Kullanılan kur: bulunamadı — kur yok, yalnızca $ gösteriliyor.',
    'Rakamlar yaklaşıktır; kesin tutar sağlayıcı panelinde.',
  )
  return keep(state, lines.join('\n'))
}

function budgetReport(budget: number, spent: number): string {
  if (budget <= 0) return `Aylık bütçe: sınırsız\nBu ay: ${formatTl(spent)}`
  const pct = Math.round((spent / budget) * 100)
  const lines = [`Aylık bütçe: ${formatTl(budget)}`, `Bu ay: ${formatTl(spent)} (%${pct})`]
  if (spent >= budget) lines.push('Bütçe doldu. Model çağrıları yeni aya kadar veya bütçe artana kadar durur.')
  else lines.push(`Kalan: ${formatTl(budget - spent)}`)
  return lines.join('\n')
}

async function cmdButce(args: string, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const now = ctx.now()
  if (!args) {
    const month = await ctx.ledger.month(now)
    return keep(state, `${budgetReport(effectiveBudget(ctx), month.tl)}\nAyarla: /butce 300 (0 = sınırsız)`)
  }
  const sub = normalizeToken(args)
  const n = sub === 'sil' || sub === 'kaldir' || sub === 'sinirsiz' ? 0 : parseNumber(args, true)
  if (n === undefined || n < 0) {
    return keep(state, 'Bütçe TL olarak bir sayı olmalı. Örnek: /butce 300 (0 = sınırsız)')
  }
  await ctx.settings.set({ monthlyBudgetTl: n })
  const month = await ctx.ledger.month(now)
  const head = n === 0 ? 'Aylık bütçe kaldırıldı (sınırsız).' : `Aylık bütçe ayarlandı: ${formatTl(n)}.`
  return keep(state, `${head}\n${budgetReport(n, month.tl)}`)
}

async function cmdKur(args: string, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const now = ctx.now()
  if (!args) {
    const fx = await safeRate(ctx)
    if (!fx) return keep(state, 'Kur alınamadı. Elle girmek için: /kur 41.2 · Yeniden dene: /kur guncelle')
    return keep(state, `${rateReport(fx, now)}\nElle: /kur 41.2 · Yenile: /kur guncelle`)
  }
  const sub = normalizeToken(args)
  if (sub === 'guncelle' || sub === 'yenile') {
    let fx: FxRate | undefined
    try {
      fx = await ctx.fx.refresh()
    } catch (err) {
      ctx.log.warn({ err }, 'fx refresh failed')
    }
    if (!fx) return keep(state, 'Kur yenilenemedi; kaynaklara ulaşılamadı. Elle girmek için: /kur 41.2')
    return keep(state, `Kur yenilendi.\n${rateReport(fx, now)}`)
  }
  const n = parseNumber(args)
  if (n === undefined || !(n > 0)) {
    return keep(state, 'Kur pozitif bir sayı olmalı. Örnek: /kur 41.2 · Güncelle: /kur guncelle')
  }
  const fx = await ctx.fx.setManual(n)
  return keep(state, `Kur elle ayarlandı: 1 $ = ${formatTl(fx.rate)} (${SOURCE_LABEL[fx.source]}).`)
}

async function cmdDurum(state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const now = ctx.now()
  const [fx, month] = await Promise.all([safeRate(ctx), ctx.ledger.month(now)])
  const id = state.model ?? ctx.config.defaultModel
  const budget = effectiveBudget(ctx)
  const host = hostOf(ctx.config.llmBaseUrl)
  const lines = [
    '*Durum*',
    `Sağlayıcı: ${ctx.config.provider}${host ? ` (${host})` : ''}`,
    `Model: ${id}${state.model ? '' : ' (varsayılan)'}`,
    `Geçmiş: ${state.history.length} mesaj · Not: ${state.notes.length}`,
    `Katalog: ${ctx.catalog.all().length} model`,
    fx ? `Kur: 1 $ = ${formatTl(fx.rate)} (${SOURCE_LABEL[fx.source]})` : 'Kur: yok (yalnızca $)',
    budget > 0
      ? `Bütçe: bu ay ${formatTl(month.tl)} / ${formatTl(budget)}${month.tl >= budget ? ' · doldu' : ''}`
      : `Bütçe: sınırsız · bu ay ${formatTl(month.tl)}`,
    `Altbilgi: ${effectiveFooter(ctx) ? 'açık' : 'kapalı'}`,
    `Çalışma süresi: ${formatUptime(now - ctx.startedAt)}`,
  ]
  return keep(state, lines.join('\n'))
}

async function cmdIzin(args: string, msg: InboundMessage, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  if (!ctx.access.isOwner(msg.senderJid)) return keep(state, 'Bu komut yalnızca hesap sahibi için.')
  const [subRaw, rest] = splitFirst(args)
  const sub = normalizeToken(subRaw)
  const usage = 'Kullanım: /izin · /izin ekle <numara> · /izin sil <numara> (ülke koduyla, örnek 905321234567)'
  if (!args || sub === 'liste') {
    const list = ctx.access.list()
    if (list.length === 0) return keep(state, 'İzinli numara yok. Eklemek için: /izin ekle 905321234567')
    return keep(state, ['*İzinli numaralar*', ...list.map((p) => `• ${p}`), 'Sil: /izin sil <numara>'].join('\n'))
  }
  if (sub === 'ekle') {
    if (!rest) return keep(state, usage)
    try {
      const phone = await ctx.access.add(rest)
      return keep(state, `Eklendi: ${phone}. Bu numaradan gelen mesajlara artık yanıt verilir.`)
    } catch (err) {
      return keep(state, clip(errMessage(err), 200))
    }
  }
  if (sub === 'sil') {
    if (!rest) return keep(state, usage)
    const digits = rest.replace(/\D+/g, '')
    if (digits === '') return keep(state, usage)
    const ok = await ctx.access.remove(rest)
    if (ok) return keep(state, `Silindi: ${digits}. Bu numaraya artık yanıt verilmez.`)
    return keep(state, 'Bu numara listede yok. Sahip ve .env (ALLOWED_NUMBERS) numaraları buradan silinmez.')
  }
  return keep(state, usage)
}

async function cmdAltbilgi(args: string, state: ChatState, ctx: AppContext): Promise<CommandResult> {
  const sub = normalizeToken(args)
  const current = effectiveFooter(ctx)
  const next = sub === 'ac' || sub === 'acik' ? true : sub === 'kapat' || sub === 'kapali' ? false : !current
  await ctx.settings.set({ costFooter: next })
  return keep(
    state,
    next ? 'Maliyet altbilgisi açık. Her yanıtın sonunda yaklaşık tutar görünür.' : 'Maliyet altbilgisi kapalı.',
  )
}

// ---------------------------------------------------------------------------------------------
// Personal profile (/profil, /hatirla, /unut): owner only, never calls the model
// ---------------------------------------------------------------------------------------------

function cmdProfile(
  name: 'profil' | 'hatirla' | 'unut',
  args: string,
  msg: InboundMessage,
  state: ChatState,
  ctx: AppContext,
): CommandResult {
  if (!(msg.isSelfChat || ctx.access.isOwner(msg.senderJid))) return keep(state, 'Bu komut yalnızca hesap sahibi için.')
  const profile = ctx.profile
  if (!profile) return keep(state, 'Kişisel bilgi katmanı kapalı.')
  if (name === 'hatirla') {
    if (!args) {
      const notes = profile.listNotes()
      if (notes.length === 0) return keep(state, 'Not yok. Eklemek için: /hatirla <metin>')
      return keep(
        state,
        ['*Hatırlatmalar*', ...notes.map((n, i) => `${i + 1}. ${clip(n, 80)}`), 'Sil: /unut <numara>'].join('\n'),
      )
    }
    const r = profile.addNote(args)
    if (!r.ok) {
      return keep(state, `Bu metin ${r.reason}. Kaydetmedim. Şifre, TC kimlik, IBAN ve kart numarası burada tutulmaz.`)
    }
    return keep(state, `Kaydedildi (${r.n}).`)
  }
  if (name === 'unut') {
    const n = /^\d+$/.test(args) ? Number.parseInt(args, 10) : Number.NaN
    if (!Number.isInteger(n)) return keep(state, 'Hangi not? Numara yaz. Liste: /hatirla')
    const removed = profile.removeNote(n)
    return keep(state, removed ? `Silindi: ${clip(removed, 120)}` : 'Bu numarada not yok. Liste: /hatirla')
  }
  const [subRaw, rest] = splitFirst(args)
  if (normalizeToken(subRaw) === 'ara') {
    if (!rest) return keep(state, 'Örnek: /profil ara annemin doğum günü')
    const block = profile.contextFor(rest)
    return keep(
      state,
      block ? `Bu soruda modele gidecek bilgi:\n${block}` : 'Bu soru için profilden bir şey gönderilmez.',
    )
  }
  const st = profile.stats()
  if (st.files.length === 0) {
    return keep(
      state,
      'Profil boş. Bilgisayarında data/profil/ klasörüne Markdown dosyaları yaz (ör. temel.md, aile.md) ya da /hatirla kullan.',
    )
  }
  return keep(
    state,
    [
      '*Kişisel bilgiler* (yalnızca bu bilgisayarda)',
      ...st.files.map((f) => `• ${f.name}: ${formatInt(f.chars)} karakter`),
      `Hatırlatma: ${st.notes} · Etkinlik: ${st.events}`,
      'Modele yalnızca soruyla ilgili parçalar gider. Dene: /profil ara <soru>',
    ].join('\n'),
  )
}
