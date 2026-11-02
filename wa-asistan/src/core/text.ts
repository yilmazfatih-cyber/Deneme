/**
 * Text helpers: Turkish-aware casing and command normalization, Markdown → WhatsApp formatting,
 * chunking of long replies without breaking code fences, Turkish date formatting, and a secret
 * detector used to refuse saving credentials as notes.
 */

const TR_ASCII: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' }

export function trUpper(s: string): string {
  return s.toLocaleUpperCase('tr-TR')
}

export function trLower(s: string): string {
  return s.toLocaleLowerCase('tr-TR')
}

/**
 * Trim, lowercase with tr-TR (so 'İ' → 'i' and 'I' → 'ı'), drop a stray combining dot, then fold
 * ı ş ğ ü ö ç to ASCII: '/Yardım' and '/yardim' compare equal. Other characters are kept.
 */
export function normalizeToken(s: string): string {
  return foldTr(s.trim())
}

/** Lowercase with tr-TR, drop a stray combining dot (U+0307), fold ı ş ğ ü ö ç to ASCII. */
function foldTr(s: string): string {
  return trLower(s.normalize('NFC'))
    .replace(/\u0307/g, '')
    .replace(/[ışğüöç]/g, (c) => TR_ASCII[c] ?? c)
}

// ---------------------------------------------------------------------------------------------
// Markdown → WhatsApp
// ---------------------------------------------------------------------------------------------

const FENCE_OPEN = /^\s*(```|~~~)([^`~]*)$/
const BACKTICK_FENCE_CLOSE = /^\s*```\s*$/
const TILDE_FENCE_CLOSE = /^\s*~~~\s*$/
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const HRULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const CODE_SPAN = /(`+[^`\n]+?`+)/
const LINK = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
/** Placeholder for WhatsApp bold while single-star italic is being converted. */
const BOLD_MARK = '\u0001'

function tableCells(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|')
}

function isTableRow(line: string): boolean {
  return line.includes('|') && line.trim() !== ''
}

function isTableSeparator(line: string): boolean {
  if (!line.includes('|')) return false
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c))
}

/** Emphasis and code markers cannot render inside a ``` block, so table rows are flattened. */
function plainInline(s: string): string {
  return s
    .replace(LINK, (_m, label: string, url: string) => (label ? `${label} (${url})` : url))
    .replace(/\*\*\*(\S(?:.*?\S)?)\*\*\*/g, '$1')
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1')
    .replace(/__(\S(?:.*?\S)?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

function inlineText(s: string, starItalic: boolean): string {
  let t = s
    .replace(LINK, (_m, label: string, url: string) => (label ? `${label} (${url})` : url))
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '~$1~')
    .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, `${BOLD_MARK}_$1_${BOLD_MARK}`)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, `${BOLD_MARK}$1${BOLD_MARK}`)
    .replace(/(?<![\p{L}\p{N}])__(?=\S)(.+?)(?<=\S)__(?![\p{L}\p{N}])/gu, `${BOLD_MARK}$1${BOLD_MARK}`)
  if (starItalic) {
    t = t.replace(/(?<![\p{L}\p{N}*\\])\*(?=\S)([^*]+?)(?<=\S)\*(?![\p{L}\p{N}*])/gu, '_$1_')
  }
  return t.replace(/\u0001/g, '*').replace(/\\([\\*_~`#[\]])/g, '$1')
}

/** Inline conversion that leaves `code spans` untouched. */
function inline(s: string, starItalic: boolean): string {
  return s
    .split(CODE_SPAN)
    .map((seg, i) => (i % 2 === 1 ? seg : inlineText(seg, starItalic)))
    .join('')
}

function headingLine(text: string, starItalic: boolean): string {
  const t = inline(text, starItalic)
    .replace(/\*(\S(?:[^*]*?\S)?)\*/g, '$1')
    .trim()
  return t ? `*${t}*` : ''
}

/** True when the text (outside code fences) uses Markdown's `**bold**`, so a single `*x*` means italic. */
function usesMarkdownBold(lines: string[]): boolean {
  let fence: '`' | '~' | null = null
  for (const line of lines) {
    if (fence) {
      if ((fence === '`' && BACKTICK_FENCE_CLOSE.test(line)) || (fence === '~' && TILDE_FENCE_CLOSE.test(line)))
        fence = null
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open) {
      fence = open[1] === '```' ? '`' : '~'
      continue
    }
    if (/\*\*\S/.test(line)) return true
  }
  return false
}

/** Keeps at most two consecutive blank lines outside ``` blocks (lines are already converted). */
function collapseBlankLines(lines: string[]): string[] {
  const out: string[] = []
  let inFence = false
  let blanks = 0
  for (const line of lines) {
    if (line === '```') {
      inFence = !inFence
      blanks = 0
      out.push(line)
      continue
    }
    if (!inFence && line.trim() === '') {
      blanks++
      if (blanks > 2) continue
      out.push('')
      continue
    }
    blanks = 0
    out.push(line)
  }
  return out
}

/**
 * Converts model Markdown to WhatsApp formatting. Headings become bold lines, `**x**` → `*x*`,
 * `*x*` → `_x_` only when the text also uses `**bold**` (otherwise a single star is taken as
 * WhatsApp's own bold and kept), `~~x~~` → `~x~`, bullets → "•", links → "label (url)", tables
 * and fenced code → ``` blocks (language tag dropped), horizontal rules removed, blank runs capped.
 * Text inside code fences is never touched.
 */
export function markdownToWhatsApp(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const starItalic = usesMarkdownBold(lines)
  const out: string[] = []
  let fence: '`' | '~' | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (fence) {
      if ((fence === '`' && BACKTICK_FENCE_CLOSE.test(line)) || (fence === '~' && TILDE_FENCE_CLOSE.test(line))) {
        out.push('```')
        fence = null
      } else {
        out.push(line)
      }
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open) {
      fence = open[1] === '```' ? '`' : '~'
      out.push('```')
      continue
    }
    if (isTableRow(line) && isTableSeparator(lines[i + 1] ?? '')) {
      out.push('```')
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        out.push(plainInline((lines[i] ?? '').trim()))
        i++
      }
      i--
      out.push('```')
      continue
    }
    if (HRULE.test(line)) {
      // Drop the rule; also drop one of the two blank lines that would now touch.
      if (out.length > 0 && out[out.length - 1] === '' && (lines[i + 1] ?? '').trim() === '') i++
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      out.push(headingLine(heading[1] ?? '', starItalic))
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      out.push(`${bullet[1] ?? ''}• ${inline(bullet[2] ?? '', starItalic)}`.trimEnd())
      continue
    }
    out.push(inline(line, starItalic).trimEnd())
  }
  if (fence) out.push('```')
  return collapseBlankLines(out)
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

// ---------------------------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------------------------

const FENCE = '```'
/** A line that opens or closes a ``` block (an inline ```code``` on one line does not count). */
const FENCE_LINE = /^\s*```[^`]*$/

function fenceOpenAfter(piece: string, open: boolean): boolean {
  let o = open
  for (const line of piece.split('\n')) if (FENCE_LINE.test(line)) o = !o
  return o
}

/** Picks the cut: paragraph, then line, then space boundary in the second half; else the latest boundary; else hard. */
function findCut(s: string, budget: number): { cut: number; next: number } {
  const half = Math.floor(budget / 2)
  const para = s.lastIndexOf('\n\n', budget)
  if (para >= half) return { cut: para, next: para + 2 }
  const nl = s.lastIndexOf('\n', budget)
  if (nl >= half) return { cut: nl, next: nl + 1 }
  const sp = s.lastIndexOf(' ', budget)
  if (sp >= half) return { cut: sp, next: sp + 1 }
  const best = Math.max(para, nl, sp)
  if (best > 0) return best === para ? { cut: para, next: para + 2 } : { cut: best, next: best + 1 }
  return { cut: budget, next: budget }
}

/**
 * Splits text into pieces of at most `max` characters at paragraph, line, space or (last resort)
 * character boundaries. A ``` block cut in two is closed at the end of the chunk and reopened at
 * the start of the next one, so every chunk renders on its own. Empty input → [].
 */
export function chunkText(text: string, max = 3500): string[] {
  if (!text || text.trim() === '') return []
  const limit = Math.max(16, Math.floor(max))
  const chunks: string[] = []
  let rest = text
  let open = false
  while (rest.length > 0) {
    const prefix = open ? `${FENCE}\n` : ''
    if (prefix.length + rest.length <= limit) {
      chunks.push(prefix + rest)
      break
    }
    const budget = limit - prefix.length - FENCE.length - 1
    let { cut, next } = findCut(rest, budget)
    let piece = rest.slice(0, cut)
    let endsOpen = fenceOpenAfter(piece, open)
    if (endsOpen) {
      // Do not end a chunk with a bare fence opener; move that line to the next chunk.
      const lastNl = piece.lastIndexOf('\n')
      if (lastNl > 0 && FENCE_LINE.test(piece.slice(lastNl + 1))) {
        cut = lastNl
        next = lastNl + 1
        piece = rest.slice(0, cut)
        endsOpen = fenceOpenAfter(piece, open)
      }
    }
    const body = piece.trimEnd()
    if (body !== '') chunks.push(prefix + body + (endsOpen ? `\n${FENCE}` : ''))
    open = endsOpen
    rest = rest.slice(next)
    if (open) {
      // The block was closed at the chunk end; if the original closes it right here, do not reopen.
      const close = /^\s*```[ \t]*(?:\n|$)/.exec(rest)
      if (close) {
        rest = rest.slice(close[0].length)
        open = false
      }
    }
    if (!open) rest = rest.replace(/^\n+/, '')
  }
  return chunks
}

/** Cuts to at most `n` characters (code points) with a trailing '…' when the text is longer. */
export function clip(s: string, n: number): string {
  const cps = Array.from(s)
  if (cps.length <= n) return s
  return `${cps
    .slice(0, Math.max(0, n - 1))
    .join('')
    .trimEnd()}…`
}

/** "2 Kasım 2026 Pazartesi, 14:05" in the given time zone. */
export function formatDateTr(ms: number, tz = 'Europe/Istanbul'): string {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')} ${get('weekday')}, ${get('hour')}:${get('minute')}`
}

// ---------------------------------------------------------------------------------------------
// Secret detection
// ---------------------------------------------------------------------------------------------

const KNOWN_TOKENS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // OpenAI / OpenRouter / Stripe style
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google API key
  /\bhf_[A-Za-z0-9]{20,}/, // Hugging Face
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?<!\d)\d{15,}(?!\d)/, // bare card-like digit run
  /(?<!\d)\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}(?!\d)/, // card number in groups of four
]

// Matched against ASCII-folded, lowercased text (see foldTr), so 'Şifre', 'PIN' and 'API' all match.
const SECRET_KEY =
  '(?:sifre|parola|pin kodu|pin|cvv2|cvv|cvc|password|passwd|pwd|token|secret|otp' +
  '|api[ _-]?key|api anahtari|gizli anahtar|erisim anahtari|dogrulama kodu|sms kodu' +
  '|tek kullanimlik (?:kod|sifre))'
/** Turkish possessive endings after folding: şifrem, şifresi, parolamız, pin kodum, şifreleri … */
const SECRET_SUFFIX = '(?:[mn]|[iu][mnz]?|s[iu]|m[iu]z|n[iu]z|l[ae]ri)?'
const KEY_BOUNDARY = `(?<![\\p{L}\\p{N}])${SECRET_KEY}${SECRET_SUFFIX}(?![\\p{L}\\p{N}])`
/** "şifrem: abc123", "password is hunter2", "pin = 1234", "parola şu: x". */
const HANDOVER = new RegExp(
  `${KEY_BOUNDARY}(?:\\s*[:=]\\s*|\\s+(?:is|su|sudur|bu|budur)(?:\\s*[:=]\\s*|\\s+))\\S{3,}`,
  'u',
)
/** "şifrem 1234'tür", "pin kodum 4521dir" (needs a digit or an apostrophe so "şifre değiştir" passes). */
const HANDOVER_SUFFIX = new RegExp(
  `${KEY_BOUNDARY}\\s+(?:\\S*\\d\\S*?|\\S+?['’])(?:d[iu]r|t[iu]r)(?![\\p{L}\\p{N}])`,
  'u',
)

/**
 * True when the text looks like it carries a credential: a known API key / token shape, a long
 * mixed-case base64-ish run (outside URLs), a phrase that hands over a password / PIN / OTP / CVV,
 * or a bare digit run long enough to be a card number. Used to refuse saving such notes.
 */
export function looksSecret(text: string): boolean {
  if (!text) return false
  if (KNOWN_TOKENS.some((re) => re.test(text))) return true
  const noUrls = text.replace(/\bhttps?:\/\/\S+/g, ' ')
  for (const run of noUrls.match(/[A-Za-z0-9+=_-]{32,}/g) ?? []) {
    const upper = (run.match(/[A-Z]/g) ?? []).length
    const lower = (run.match(/[a-z]/g) ?? []).length
    const digits = (run.match(/\d/g) ?? []).length
    if (upper >= 3 && lower >= 3 && digits >= 3) return true
  }
  const folded = foldTr(text)
  return HANDOVER.test(folded) || HANDOVER_SUFFIX.test(folded)
}
