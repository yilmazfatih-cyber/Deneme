// Ortam değişkenlerinden yapılandırma. Ayrıntılı liste: .env.example ve docs/KURULUM.md

export type Config = {
  port: number
  dbPath: string
  publicUrl: string
  /** Demo modu: tek kullanımlık giriş kodu ekranda gösterilir, test ödeme sayfası açıktır. */
  demo: boolean
  /** Veritabanı boşsa örnek veriyle doldur. */
  seedDemo: boolean
  sessionDays: number
  ai: {
    /** 'claude' ise Claude API, 'kural' ise kural tabanlı Türkçe motor. */
    engine: 'claude' | 'kural'
    model: string
    maskPii: boolean
  }
  whatsapp: { token?: string; phoneNumberId?: string; verifyToken?: string; appSecret?: string; apiVersion: string }
  netgsm: { usercode?: string; password?: string; header?: string; appName?: string }
  email: { resendApiKey?: string; from?: string }
  paytr: { merchantId?: string; merchantKey?: string; merchantSalt?: string; testMode: boolean }
  /** SMS / e-posta gelen kutusu webhook'ları için paylaşılan gizli anahtar (X-Kahya-Secret). */
  webhookSecret?: string
}

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'evet', 'acik', 'on'].includes(v.toLowerCase())

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)
  const aiPref = (env.KAHYA_AI ?? '').toLowerCase()
  const engine: 'claude' | 'kural' = aiPref === 'kural' ? 'kural' : aiPref === 'claude' || hasKey ? 'claude' : 'kural'
  const port = Number(env.PORT ?? 8787)
  return {
    port,
    dbPath: env.KAHYA_DB ?? './data/kahya.db',
    publicUrl: (env.KAHYA_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    // Güvenli varsayılan: canlı ortamda demo kapalıdır (npm run dev / npm run demo açar).
    demo: flag(env.KAHYA_DEMO, false),
    seedDemo: flag(env.KAHYA_SEED_DEMO, false),
    sessionDays: Number(env.KAHYA_SESSION_DAYS ?? 14),
    ai: {
      engine,
      model: env.KAHYA_AI_MODEL || 'claude-opus-5-5',
      maskPii: flag(env.KAHYA_AI_MASK_PII, true),
    },
    whatsapp: {
      token: env.WHATSAPP_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET,
      apiVersion: env.WHATSAPP_API_VERSION || 'v23.0',
    },
    netgsm: {
      usercode: env.NETGSM_USERCODE,
      password: env.NETGSM_PASSWORD,
      header: env.NETGSM_HEADER,
      appName: env.NETGSM_APPNAME,
    },
    email: { resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM },
    paytr: {
      merchantId: env.PAYTR_MERCHANT_ID,
      merchantKey: env.PAYTR_MERCHANT_KEY,
      merchantSalt: env.PAYTR_MERCHANT_SALT,
      testMode: flag(env.PAYTR_TEST_MODE, true),
    },
    webhookSecret: env.KAHYA_WEBHOOK_SECRET,
  }
}

/** Testler için: varsayılanların üzerine yazılmış yapılandırma. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({ KAHYA_AI: 'kural', KAHYA_DB: ':memory:' }), ...overrides }
}
