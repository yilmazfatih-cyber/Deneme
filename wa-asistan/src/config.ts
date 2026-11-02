/**
 * Configuration from environment variables (.env is loaded in main.ts).
 * Validation errors are reported in Turkish and stop the process: a half-configured bot
 * must not sit on a WhatsApp account doing nothing.
 */
import path from 'node:path'

export type Provider = 'openrouter' | 'modelflare' | 'generic'

export interface Config {
  llmBaseUrl: string
  llmApiKey: string
  provider: Provider
  defaultModel: string
  modelAliases: Record<string, string>
  appName: string
  ownerNumber?: string
  allowedNumbers: string[]
  replyInSelfChat: boolean
  triggerPrefix: string
  systemPrompt: string
  maxHistory: number
  maxOutputTokens: number
  llmTimeoutMs: number
  usdTry?: number
  fxRefreshHours: number
  monthlyBudgetTl: number
  costFooter: boolean
  stt?: { baseUrl: string; apiKey: string; model: string }
  dataDir: string
  pairingPhone?: string
  historyPersist: boolean
  logLevel: string
}

export const DEFAULT_SYSTEM_PROMPT = [
  'Sen WhatsApp üzerinden konuşan kişisel bir asistansın.',
  'Türkçe yaz; kullanıcı başka dilde yazarsa o dilde yanıt ver.',
  'Kısa ve net ol. Gereksiz giriş cümlesi kurma.',
  'Biçim: başlık ve tablo kullanma; vurgu için *kalın*, liste için "•" kullan.',
  'Emin olmadığın bilgiyi uydurma; bilmiyorsan söyle.',
].join(' ')

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** Digits only (E.164 without '+'); accepts "+90 532 123 45 67", "0532…" is left as is (user's job). */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, '')
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v.trim() === '') return fallback
  return !/^(0|false|hayır|hayir|no|kapalı|kapali|off)$/i.test(v.trim())
}

function num(name: string, v: string | undefined, fallback: number, opts: { min?: number; max?: number } = {}): number {
  if (v === undefined || v.trim() === '') return fallback
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n)) throw new ConfigError(`${name} sayı olmalı (verilen: "${v}").`)
  if (opts.min !== undefined && n < opts.min) throw new ConfigError(`${name} en az ${opts.min} olmalı.`)
  if (opts.max !== undefined && n > opts.max) throw new ConfigError(`${name} en fazla ${opts.max} olmalı.`)
  return n
}

export function detectProvider(baseUrl: string, explicit?: string): Provider {
  const e = explicit?.trim().toLowerCase()
  if (e === 'openrouter' || e === 'modelflare' || e === 'generic') return e
  if (e) throw new ConfigError(`LLM_PROVIDER "${explicit}" tanınmıyor; openrouter, modelflare veya generic yazın.`)
  const host = (() => {
    try {
      return new URL(baseUrl).hostname
    } catch {
      return ''
    }
  })()
  if (host.endsWith('openrouter.ai')) return 'openrouter'
  if (host.endsWith('modelflare.dev')) return 'modelflare'
  return 'generic'
}

function parseAliases(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ConfigError('MODEL_ALIASES geçerli JSON olmalı, örnek: {"hizli":"openai/gpt-5-mini"}')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError('MODEL_ALIASES bir JSON nesnesi olmalı (takma ad → model kimliği).')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string' || !v.trim()) throw new ConfigError(`MODEL_ALIASES: "${k}" için model kimliği metin olmalı.`)
    out[k.trim().toLocaleLowerCase('tr-TR')] = v.trim()
  }
  return out
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Config {
  const llmBaseUrl = (env.LLM_BASE_URL?.trim() || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  try {
    new URL(llmBaseUrl)
  } catch {
    throw new ConfigError(`LLM_BASE_URL geçerli bir adres değil: "${llmBaseUrl}"`)
  }
  const llmApiKey = env.LLM_API_KEY?.trim() ?? ''
  if (!llmApiKey) throw new ConfigError('LLM_API_KEY boş. .env dosyasına sağlayıcı anahtarınızı yazın (bkz. .env.example).')
  const provider = detectProvider(llmBaseUrl, env.LLM_PROVIDER)
  const defaultModel = env.DEFAULT_MODEL?.trim() || (provider === 'openrouter' ? 'openrouter/auto' : '')
  if (!defaultModel) throw new ConfigError('DEFAULT_MODEL boş. OpenRouter dışındaki sağlayıcılarda varsayılan modeli yazmalısınız.')

  const allowedNumbers = (env.ALLOWED_NUMBERS ?? '')
    .split(/[,;\s]+/)
    .map(normalizePhone)
    .filter((s) => s.length >= 7)
  const ownerNumber = env.OWNER_NUMBER?.trim() ? normalizePhone(env.OWNER_NUMBER) : undefined
  const pairingPhone = env.PAIRING_PHONE?.trim() ? normalizePhone(env.PAIRING_PHONE) : undefined
  if (pairingPhone !== undefined && pairingPhone.length < 7) throw new ConfigError('PAIRING_PHONE ülke koduyla, yalnızca rakamlardan oluşmalı (örnek: 905321234567).')

  const sttBase = env.STT_BASE_URL?.trim()
  const stt = sttBase
    ? {
        baseUrl: sttBase.replace(/\/+$/, ''),
        apiKey: env.STT_API_KEY?.trim() || llmApiKey,
        model: env.STT_MODEL?.trim() || 'whisper-1',
      }
    : undefined

  const usdTryRaw = env.USD_TRY?.trim()
  const usdTry = usdTryRaw ? num('USD_TRY', usdTryRaw, 0, { min: 0.0001 }) : undefined

  return {
    llmBaseUrl,
    llmApiKey,
    provider,
    defaultModel,
    modelAliases: parseAliases(env.MODEL_ALIASES),
    appName: env.APP_NAME?.trim() || 'WA Asistan',
    ...(ownerNumber ? { ownerNumber } : {}),
    allowedNumbers,
    replyInSelfChat: bool(env.REPLY_IN_SELF_CHAT, true),
    triggerPrefix: env.TRIGGER_PREFIX?.trim() ?? '',
    systemPrompt: env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
    maxHistory: Math.floor(num('MAX_HISTORY', env.MAX_HISTORY, 30, { min: 0, max: 500 })),
    maxOutputTokens: Math.floor(num('MAX_OUTPUT_TOKENS', env.MAX_OUTPUT_TOKENS, 2048, { min: 16 })),
    llmTimeoutMs: Math.floor(num('LLM_TIMEOUT_MS', env.LLM_TIMEOUT_MS, 180_000, { min: 1000 })),
    ...(usdTry !== undefined ? { usdTry } : {}),
    fxRefreshHours: num('FX_REFRESH_HOURS', env.FX_REFRESH_HOURS, 6, { min: 0.1 }),
    monthlyBudgetTl: num('MONTHLY_BUDGET_TL', env.MONTHLY_BUDGET_TL, 0, { min: 0 }),
    costFooter: bool(env.COST_FOOTER, true),
    ...(stt ? { stt } : {}),
    dataDir: path.resolve(cwd, env.DATA_DIR?.trim() || 'data'),
    ...(pairingPhone ? { pairingPhone } : {}),
    historyPersist: bool(env.HISTORY_PERSIST, true),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  }
}
