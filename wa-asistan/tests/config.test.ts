import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, DEFAULT_SYSTEM_PROMPT, detectProvider, loadConfig, normalizePhone } from '../src/config.js'

const KEY = 'sk-test-anahtar'
const CWD = path.resolve('/srv/wa-asistan')

/** loadConfig with a minimal valid environment plus overrides; never touches process.env. */
function load(env: Record<string, string | undefined> = {}, cwd = CWD) {
  return loadConfig({ LLM_API_KEY: KEY, ...env } as NodeJS.ProcessEnv, cwd)
}

/** The ConfigError message for an environment that must be rejected. */
function failure(env: Record<string, string | undefined>): string {
  try {
    load(env)
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError)
    return (err as ConfigError).message
  }
  throw new Error('loadConfig did not throw')
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

describe('loadConfig: defaults', () => {
  it('needs only the API key; everything else has the documented default', () => {
    const c = load()
    expect(c).toEqual({
      llmBaseUrl: 'https://openrouter.ai/api/v1',
      llmApiKey: KEY,
      provider: 'openrouter',
      defaultModel: 'openrouter/auto',
      modelAliases: {},
      appName: 'WA Asistan',
      extraHeaders: {},
      allowedNumbers: [],
      replyInSelfChat: true,
      triggerPrefix: '',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxHistory: 30,
      maxOutputTokens: 2048,
      llmTimeoutMs: 180_000,
      fxRefreshHours: 6,
      tlMultiplier: 1,
      monthlyBudgetTl: 0,
      costFooter: true,
      dataDir: path.join(CWD, 'data'),
      historyPersist: true,
      logLevel: 'info',
    })
  })

  it('leaves the optional values out entirely instead of setting them to undefined', () => {
    const c = load()
    for (const key of ['ownerNumber', 'usdTry', 'stt', 'pairingPhone']) expect(key in c).toBe(false)
  })

  it('treats blank values like unset ones', () => {
    const c = load({
      LLM_BASE_URL: '  ',
      DEFAULT_MODEL: ' ',
      APP_NAME: '',
      MAX_HISTORY: ' ',
      MONTHLY_BUDGET_TL: '',
      USD_TRY: ' ',
      OWNER_NUMBER: ' ',
      PAIRING_PHONE: '',
      STT_BASE_URL: ' ',
      SYSTEM_PROMPT: '   ',
      DATA_DIR: '',
      LOG_LEVEL: ' ',
    })
    expect(c.llmBaseUrl).toBe('https://openrouter.ai/api/v1')
    expect(c.defaultModel).toBe('openrouter/auto')
    expect(c.appName).toBe('WA Asistan')
    expect(c.maxHistory).toBe(30)
    expect(c.monthlyBudgetTl).toBe(0)
    expect(c.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(c.dataDir).toBe(path.join(CWD, 'data'))
    expect(c.logLevel).toBe('info')
    for (const key of ['usdTry', 'ownerNumber', 'pairingPhone', 'stt']) expect(key in c).toBe(false)
  })

  it('the default system prompt is Turkish and asks for WhatsApp-friendly formatting', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/WhatsApp/)
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Türkçe/)
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/\*kalın\*/)
  })

  it('reads plain overrides, trimming the text values', () => {
    const c = load({
      APP_NAME: '  Benim Asistan ',
      TRIGGER_PREFIX: ' ! ',
      SYSTEM_PROMPT: '  Kısa yaz.  ',
      LOG_LEVEL: ' debug ',
      REPLY_IN_SELF_CHAT: 'false',
      HISTORY_PERSIST: 'false',
      COST_FOOTER: 'false',
    })
    expect(c).toMatchObject({
      appName: 'Benim Asistan',
      triggerPrefix: '!',
      systemPrompt: 'Kısa yaz.',
      logLevel: 'debug',
      replyInSelfChat: false,
      historyPersist: false,
      costFooter: false,
    })
  })

  it('resolves DATA_DIR against the given cwd, and keeps an absolute path', () => {
    expect(load({ DATA_DIR: 'depo/veri' }).dataDir).toBe(path.join(CWD, 'depo', 'veri'))
    const abs = path.resolve('/var/lib/wa')
    expect(load({ DATA_DIR: abs }).dataDir).toBe(abs)
  })

  it('does not read process.env when an environment is passed in', () => {
    const before = process.env.LLM_API_KEY
    process.env.LLM_API_KEY = 'dis-ortamdan'
    try {
      expect(load().llmApiKey).toBe(KEY)
    } finally {
      if (before === undefined) delete process.env.LLM_API_KEY
      else process.env.LLM_API_KEY = before
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------------------------

describe('detectProvider', () => {
  it.each([
    ['https://openrouter.ai/api/v1', 'openrouter'],
    ['https://eu.openrouter.ai/api/v1', 'openrouter'],
    ['https://modelflare.dev/v1', 'modelflare'],
    ['https://api.modelflare.dev/v1', 'modelflare'],
    ['http://localhost:11434/v1', 'generic'],
    ['https://api.example.com/v1', 'generic'],
    ['https://notopenrouter.ai.example.com/v1', 'generic'],
    ['bu bir adres degil', 'generic'],
  ])('%s → %s', (url, expected) => {
    expect(detectProvider(url)).toBe(expected)
  })

  it('an explicit provider wins over the address, in any letter case', () => {
    expect(detectProvider('https://api.example.com/v1', 'OpenRouter')).toBe('openrouter')
    expect(detectProvider('https://openrouter.ai/api/v1', ' generic ')).toBe('generic')
    expect(detectProvider('https://api.example.com/v1', 'modelflare')).toBe('modelflare')
  })

  it('an unknown explicit provider is a Turkish ConfigError naming the allowed values', () => {
    expect(() => detectProvider('https://api.example.com/v1', 'azure')).toThrow(ConfigError)
    expect(() => detectProvider('https://api.example.com/v1', 'azure')).toThrow(
      /LLM_PROVIDER "azure" tanınmıyor; openrouter, modelflare veya generic yazın\./,
    )
  })
})

describe('loadConfig: provider and model', () => {
  it('detects the provider from LLM_BASE_URL and strips trailing slashes', () => {
    const c = load({ LLM_BASE_URL: 'https://modelflare.dev/v1//', DEFAULT_MODEL: 'gpt-5-mini' })
    expect(c.llmBaseUrl).toBe('https://modelflare.dev/v1')
    expect(c.provider).toBe('modelflare')
    expect(c.defaultModel).toBe('gpt-5-mini')
  })

  it('LLM_PROVIDER overrides the detection and brings the OpenRouter default model along', () => {
    const c = load({ LLM_BASE_URL: 'https://gateway.example.com/v1', LLM_PROVIDER: 'openrouter' })
    expect(c.provider).toBe('openrouter')
    expect(c.defaultModel).toBe('openrouter/auto')
  })

  it('a configured DEFAULT_MODEL beats the OpenRouter default', () => {
    expect(load({ DEFAULT_MODEL: ' openai/gpt-5-mini ' }).defaultModel).toBe('openai/gpt-5-mini')
  })

  it('outside OpenRouter the default model is required', () => {
    const msg = failure({ LLM_BASE_URL: 'http://localhost:11434/v1' })
    expect(msg).toContain('DEFAULT_MODEL boş')
    expect(msg).toContain('OpenRouter dışındaki')
    expect(failure({ LLM_BASE_URL: 'https://modelflare.dev/v1' })).toContain('DEFAULT_MODEL')
  })
})

// ---------------------------------------------------------------------------------------------
// Turkish error messages
// ---------------------------------------------------------------------------------------------

describe('loadConfig: errors are Turkish ConfigErrors', () => {
  it('ConfigError carries its name', () => {
    const err = new ConfigError('x')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ConfigError')
  })

  it.each([
    [{ LLM_API_KEY: undefined }, 'LLM_API_KEY boş. .env dosyasına sağlayıcı anahtarınızı yazın (bkz. .env.example).'],
    [{ LLM_API_KEY: '   ' }, 'LLM_API_KEY boş.'],
    [{ LLM_BASE_URL: 'adres degil' }, 'LLM_BASE_URL geçerli bir adres değil: "adres degil"'],
    [{ LLM_PROVIDER: 'azure' }, 'LLM_PROVIDER "azure" tanınmıyor'],
    [{ MAX_HISTORY: 'çok' }, 'MAX_HISTORY sayı olmalı (verilen: "çok").'],
    [{ MAX_HISTORY: '-1' }, 'MAX_HISTORY en az 0 olmalı.'],
    [{ MAX_HISTORY: '501' }, 'MAX_HISTORY en fazla 500 olmalı.'],
    [{ MAX_OUTPUT_TOKENS: '8' }, 'MAX_OUTPUT_TOKENS en az 16 olmalı.'],
    [{ LLM_TIMEOUT_MS: '500' }, 'LLM_TIMEOUT_MS en az 1000 olmalı.'],
    [{ FX_REFRESH_HOURS: '0' }, 'FX_REFRESH_HOURS en az 0.1 olmalı.'],
    [{ MONTHLY_BUDGET_TL: '-5' }, 'MONTHLY_BUDGET_TL en az 0 olmalı.'],
    [{ MONTHLY_BUDGET_TL: 'iki yüz' }, 'MONTHLY_BUDGET_TL sayı olmalı (verilen: "iki yüz").'],
    [{ USD_TRY: '0' }, 'USD_TRY en az 0.0001 olmalı.'],
    [{ USD_TRY: 'kırk' }, 'USD_TRY sayı olmalı'],
    [{ TL_CARPAN: '0' }, 'TL_CARPAN en az 0.1 olmalı.'],
    [{ TL_CARPAN: '11' }, 'TL_CARPAN en fazla 10 olmalı.'],
    [{ PAIRING_PHONE: '12345' }, 'PAIRING_PHONE ülke koduyla, yalnızca rakamlardan oluşmalı (örnek: 905321234567).'],
    [{ MODEL_ALIASES: '{bozuk' }, 'MODEL_ALIASES geçerli JSON olmalı'],
    [{ LLM_EXTRA_HEADERS: '{bozuk' }, 'LLM_EXTRA_HEADERS geçerli JSON olmalı'],
  ])('%j → "%s"', (env, expected) => {
    expect(failure(env)).toContain(expected)
  })

  it('every message names its setting, is Turkish prose and never uses a red cross', () => {
    const envs: Array<Record<string, string | undefined>> = [
      { LLM_API_KEY: '' },
      { LLM_BASE_URL: 'x y' },
      { LLM_PROVIDER: 'azure' },
      { MAX_HISTORY: 'x' },
      { MONTHLY_BUDGET_TL: '-1' },
      { PAIRING_PHONE: '1' },
      { MODEL_ALIASES: '[]' },
      { LLM_EXTRA_HEADERS: '[]' },
    ]
    for (const env of envs) {
      const msg = failure(env)
      const [name] = Object.keys(env)
      expect(msg, name).toContain(name as string)
      expect(msg, name).toMatch(/olmalı|oluşmalı|boş|geçerli|tanınmıyor/)
      expect(msg, name).not.toMatch(/[❌✖✗]|must|invalid|required/i)
    }
  })
})

// ---------------------------------------------------------------------------------------------
// Aliases and extra headers (JSON)
// ---------------------------------------------------------------------------------------------

describe('loadConfig: MODEL_ALIASES', () => {
  it('parses a JSON object, trims the ids and lower-cases the aliases with tr-TR rules', () => {
    const c = load({
      MODEL_ALIASES: JSON.stringify({
        HIZLI: ' openai/gpt-5-mini ',
        'IŞIK ': 'acme/isik',
        Akıllı: 'anthropic/claude-sonnet-4.5',
      }),
    })
    expect(c.modelAliases).toEqual({
      hızlı: 'openai/gpt-5-mini', // "HIZLI" → "hızlı"; the catalog folds ı→i again when it matches
      ışık: 'acme/isik',
      akıllı: 'anthropic/claude-sonnet-4.5',
    })
  })

  it('an empty or blank value means no aliases; an empty object too', () => {
    expect(load({ MODEL_ALIASES: '' }).modelAliases).toEqual({})
    expect(load({ MODEL_ALIASES: '  ' }).modelAliases).toEqual({})
    expect(load({ MODEL_ALIASES: '{}' }).modelAliases).toEqual({})
  })

  it('rejects text that is not JSON, with a Turkish example', () => {
    const msg = failure({ MODEL_ALIASES: 'hizli=openai/gpt-5-mini' })
    expect(msg).toBe('MODEL_ALIASES geçerli JSON olmalı, örnek: {"hizli":"openai/gpt-5-mini"}')
  })

  it.each(['[]', '"metin"', '42', 'null', 'true'])('rejects %s because it is not an object', (raw) => {
    expect(failure({ MODEL_ALIASES: raw })).toBe('MODEL_ALIASES bir JSON nesnesi olmalı (takma ad → model kimliği).')
  })

  it.each([
    ['{"hizli":42}', 'hizli'],
    ['{"hizli":""}', 'hizli'],
    ['{"hizli":"  "}', 'hizli'],
    ['{"a":"x/y","b":null}', 'b'],
  ])('rejects %s because the id of "%s" is not text', (raw, alias) => {
    expect(failure({ MODEL_ALIASES: raw })).toBe(`MODEL_ALIASES: "${alias}" için model kimliği metin olmalı.`)
  })
})

describe('loadConfig: LLM_EXTRA_HEADERS', () => {
  it('parses a JSON object of header names to values, keeping the names as written', () => {
    expect(load({ LLM_EXTRA_HEADERS: '{"X-Hermes-Session-Id":"wa"}' }).extraHeaders).toEqual({
      'X-Hermes-Session-Id': 'wa',
    })
  })

  it('is empty when unset or blank', () => {
    expect(load({ LLM_EXTRA_HEADERS: ' ' }).extraHeaders).toEqual({})
  })

  it('rejects non-JSON, non-objects and non-text values', () => {
    expect(failure({ LLM_EXTRA_HEADERS: 'X-A: b' })).toContain('LLM_EXTRA_HEADERS geçerli JSON olmalı')
    expect(failure({ LLM_EXTRA_HEADERS: '["a"]' })).toBe(
      'LLM_EXTRA_HEADERS bir JSON nesnesi olmalı (başlık adı → değer).',
    )
    expect(failure({ LLM_EXTRA_HEADERS: '{"X-A":1}' })).toBe('LLM_EXTRA_HEADERS: "X-A" değeri metin olmalı.')
  })
})

// ---------------------------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------------------------

describe('normalizePhone', () => {
  it.each([
    ['905321234567', '905321234567'],
    ['+90 532 123 45 67', '905321234567'],
    ['+90 (532) 123-45-67', '905321234567'],
    ['00 90 532 123 45 67', '00905321234567'],
    ['0532 123 45 67', '05321234567'],
    ['yok', ''],
    ['', ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })
})

describe('loadConfig: phone settings', () => {
  it('OWNER_NUMBER and PAIRING_PHONE are reduced to digits', () => {
    const c = load({ OWNER_NUMBER: '+90 532 123 45 67', PAIRING_PHONE: ' +90 (533) 111 22 33 ' })
    expect(c.ownerNumber).toBe('905321234567')
    expect(c.pairingPhone).toBe('905331112233')
  })

  it('ALLOWED_NUMBERS takes commas, semicolons and new lines, and drops entries too short to be a phone', () => {
    const c = load({ ALLOWED_NUMBERS: '905321234567, +905331112233;\n905441112233 ,123, ,abc' })
    expect(c.allowedNumbers).toEqual(['905321234567', '905331112233', '905441112233'])
  })

  it('ALLOWED_NUMBERS accepts a number written with spaces or brackets', () => {
    const c = load({ ALLOWED_NUMBERS: '+90 532 123 45 67, +90 (533) 111-22-33' })
    expect(c.allowedNumbers).toEqual(['905321234567', '905331112233'])
  })

  it('ALLOWED_NUMBERS accepts full numbers separated by spaces only, and lists each once', () => {
    const c = load({ ALLOWED_NUMBERS: '905321234567 905331112233  905321234567' })
    expect(c.allowedNumbers).toEqual(['905321234567', '905331112233'])
  })

  it('an unset or empty ALLOWED_NUMBERS is an empty list', () => {
    expect(load({ ALLOWED_NUMBERS: undefined }).allowedNumbers).toEqual([])
    expect(load({ ALLOWED_NUMBERS: ' , ; ' }).allowedNumbers).toEqual([])
  })

  it('a PAIRING_PHONE of only a few digits is refused', () => {
    expect(failure({ PAIRING_PHONE: '+90 5' })).toContain('PAIRING_PHONE ülke koduyla')
  })
})

// ---------------------------------------------------------------------------------------------
// Booleans
// ---------------------------------------------------------------------------------------------

describe('loadConfig: boolean parsing', () => {
  const NO = [
    '0',
    'false',
    'FALSE',
    'False',
    'no',
    'No',
    'hayır',
    'Hayır',
    'HAYIR',
    'hayir',
    'HAYİR',
    'kapalı',
    'KAPALI',
    'Kapalı',
    'kapali',
    'off',
    'OFF',
    '  hayır  ',
  ]
  const YES = ['1', 'true', 'TRUE', 'yes', 'evet', 'Evet', 'EVET', 'açık', 'acik', 'on', 'ON', 'banane']

  it.each(NO)('COST_FOOTER=%j switches the footer off', (v) => {
    expect(load({ COST_FOOTER: v }).costFooter).toBe(false)
  })

  it.each(YES)('COST_FOOTER=%j keeps the footer on', (v) => {
    expect(load({ COST_FOOTER: v }).costFooter).toBe(true)
  })

  it('the default applies when the value is missing or blank', () => {
    expect(load({ COST_FOOTER: undefined }).costFooter).toBe(true)
    expect(load({ COST_FOOTER: '  ' }).costFooter).toBe(true)
    expect(load({ REPLY_IN_SELF_CHAT: '' }).replyInSelfChat).toBe(true)
    expect(load({ HISTORY_PERSIST: undefined }).historyPersist).toBe(true)
  })

  it('REPLY_IN_SELF_CHAT and HISTORY_PERSIST read the same words', () => {
    expect(load({ REPLY_IN_SELF_CHAT: 'hayır', HISTORY_PERSIST: 'kapalı' })).toMatchObject({
      replyInSelfChat: false,
      historyPersist: false,
    })
    expect(load({ REPLY_IN_SELF_CHAT: 'evet', HISTORY_PERSIST: 'açık' })).toMatchObject({
      replyInSelfChat: true,
      historyPersist: true,
    })
  })
})

// ---------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------

describe('loadConfig: numeric settings', () => {
  it('reads numbers with a dot or a Turkish decimal comma', () => {
    const c = load({ MONTHLY_BUDGET_TL: '300,50', USD_TRY: '41,5', TL_CARPAN: '1.09', FX_REFRESH_HOURS: '0,5' })
    expect(c.monthlyBudgetTl).toBe(300.5)
    expect(c.usdTry).toBe(41.5)
    expect(c.tlMultiplier).toBe(1.09)
    expect(c.fxRefreshHours).toBe(0.5)
  })

  it('whole-number settings are floored', () => {
    const c = load({ MAX_HISTORY: '12,9', MAX_OUTPUT_TOKENS: '1024.7', LLM_TIMEOUT_MS: '90000.5' })
    expect(c).toMatchObject({ maxHistory: 12, maxOutputTokens: 1024, llmTimeoutMs: 90_000 })
  })

  it('accepts the boundaries: 0 history messages, 500 messages, 16 tokens, a zero budget', () => {
    expect(load({ MAX_HISTORY: '0' }).maxHistory).toBe(0)
    expect(load({ MAX_HISTORY: '500' }).maxHistory).toBe(500)
    expect(load({ MAX_OUTPUT_TOKENS: '16' }).maxOutputTokens).toBe(16)
    expect(load({ MONTHLY_BUDGET_TL: '0' }).monthlyBudgetTl).toBe(0)
  })

  it('USD_TRY is optional and only present when set', () => {
    expect(load({ USD_TRY: '41.2' }).usdTry).toBe(41.2)
    expect('usdTry' in load({ USD_TRY: '' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------
// Speech to text
// ---------------------------------------------------------------------------------------------

describe('loadConfig: STT', () => {
  it('is off without STT_BASE_URL', () => {
    expect('stt' in load({ STT_API_KEY: 'x', STT_MODEL: 'y' })).toBe(false)
  })

  it('falls back to the LLM key and whisper-1, and strips trailing slashes', () => {
    expect(load({ STT_BASE_URL: 'https://api.openai.com/v1/' }).stt).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: KEY,
      model: 'whisper-1',
    })
  })

  it('uses its own key and model when given', () => {
    expect(
      load({ STT_BASE_URL: 'https://stt.example.com/v1', STT_API_KEY: ' stt-key ', STT_MODEL: ' small ' }).stt,
    ).toEqual({
      baseUrl: 'https://stt.example.com/v1',
      apiKey: 'stt-key',
      model: 'small',
    })
  })
})
