import { describe, expect, it } from 'vitest'
import { ConfigError, configWarnings, DEFAULT_PASSWORD_HASH, loadConfig } from '../src/config.ts'

function problemsOf(env: Record<string, string>): string[] {
  try {
    loadConfig(env, '/uygulama/api')
  } catch (error) {
    if (error instanceof ConfigError) return [...error.problems]
    throw error
  }
  return []
}

describe('ayar', () => {
  it('geliştirme varsayılanları güvenli ve çalışırdır', () => {
    const config = loadConfig({}, '/uygulama/api')
    expect(config).toMatchObject({
      env: 'development',
      isProduction: false,
      port: 8310,
      host: '127.0.0.1',
      databasePath: '/uygulama/api/.data/uygulama.db',
      appUrl: 'http://localhost:5310',
      appOrigin: 'http://localhost:5310',
      allowedOrigins: [],
      trustProxy: 0,
      sessionTtlDays: 30,
      rateLimit: true,
      mail: { provider: 'console' },
      passwordHash: DEFAULT_PASSWORD_HASH,
    })
    expect(config.webDist).toMatch(/web[\\/]dist$/)
  })

  it('üretim: APP_URL zorunlu, https olmalı; RATE_LIMIT kapatılamaz; HOST 0.0.0.0', () => {
    expect(problemsOf({ NODE_ENV: 'production' })).toEqual([expect.stringMatching(/^APP_URL: üretimde zorunludur/)])
    expect(problemsOf({ NODE_ENV: 'production', APP_URL: 'http://ornek.com' })).toEqual([
      expect.stringMatching(/^APP_URL: üretimde https/),
    ])
    expect(problemsOf({ NODE_ENV: 'production', APP_URL: 'https://ornek.com', RATE_LIMIT: 'off' })).toEqual([
      expect.stringMatching(/^RATE_LIMIT: üretimde kapatılamaz/),
    ])
    const config = loadConfig({ NODE_ENV: 'production', APP_URL: 'https://ornek.com/', PORT: '9000' })
    expect(config).toMatchObject({ host: '0.0.0.0', port: 9000, appUrl: 'https://ornek.com', isProduction: true })
    // Yerel deneme: localhost'ta http kabul edilir ama uyarı verilir.
    const local = loadConfig({ NODE_ENV: 'production', APP_URL: 'http://localhost:8310' })
    expect(configWarnings(local).some((warning) => warning.includes('https değil'))).toBe(true)
  })

  it('bütün sorunlar tek seferde, değişken adıyla ve ne yapılacağıyla bildirilir', () => {
    const problems = problemsOf({
      PORT: 'yetmiş',
      NODE_ENV: 'canli',
      ALLOWED_ORIGINS: '*, https://ornek.com/yol, https://iyi.ornek.com',
      ADMIN_EMAILS: 'yonetici',
      TRUST_PROXY: 'evet',
      SESSION_TTL_DAYS: '999',
    })
    const joined = problems.join('\n')
    for (const name of ['PORT', 'NODE_ENV', 'TRUST_PROXY', 'SESSION_TTL_DAYS']) expect(joined).toContain(`${name}:`)
    const error = new ConfigError(problems)
    expect(error.message).toContain('Ayarlar geçersiz; sunucu başlatılmadı')
    expect(error.message).toContain('docs/YAYINLAMA.md')
    // Çapraz kurallar yalnız tekil değerler geçerliyse koşar:
    const cross = problemsOf({
      ALLOWED_ORIGINS: '*, https://ornek.com/yol, https://iyi.ornek.com',
      ADMIN_EMAILS: 'yonetici',
    })
    expect(cross).toEqual([
      expect.stringContaining('ALLOWED_ORIGINS: * kullanılamaz'),
      expect.stringContaining('"https://ornek.com/yol" geçersiz'),
      expect.stringContaining('ADMIN_EMAILS: "yonetici"'),
    ])
  })

  it('MAIL_PROVIDER=http adres, anahtar ve gönderen ister', () => {
    expect(problemsOf({ MAIL_PROVIDER: 'http' }).map((problem) => problem.split(':')[0])).toEqual([
      'MAIL_HTTP_URL',
      'MAIL_HTTP_KEY',
      'MAIL_FROM',
    ])
    const config = loadConfig({
      MAIL_PROVIDER: 'http',
      MAIL_HTTP_URL: 'https://posta.example/gonder',
      MAIL_HTTP_KEY: 'anahtar',
      MAIL_FROM: 'Uygulama <bildirim@ornek.com>',
    })
    expect(config.mail).toEqual({
      provider: 'http',
      url: 'https://posta.example/gonder',
      apiKey: 'anahtar',
      from: 'Uygulama <bildirim@ornek.com>',
    })
  })

  it('TRUST_PROXY, ADMIN_EMAILS, ALLOWED_ORIGINS, DATABASE_PATH ayrıştırılır; boş değer yazılmamış sayılır', () => {
    const config = loadConfig(
      {
        TRUST_PROXY: 'true',
        ADMIN_EMAILS: ' Yonetici@Ornek.com , ikinci@ornek.com ',
        ALLOWED_ORIGINS: 'https://a.ornek.com,https://b.ornek.com',
        DATABASE_PATH: ':memory:',
        APP_URL: '',
        WEB_DIST: '../web/build',
      },
      '/uygulama/api',
    )
    expect(config.trustProxy).toBe(1)
    expect(config.adminEmails).toEqual(['yonetici@ornek.com', 'ikinci@ornek.com'])
    expect(config.allowedOrigins).toEqual(['https://a.ornek.com', 'https://b.ornek.com'])
    expect(config.databasePath).toBe(':memory:')
    expect(config.appUrl).toBe('http://localhost:5310')
    expect(config.webDist).toBe('/uygulama/web/build')
    expect(loadConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2)
    expect(loadConfig({ TRUST_PROXY: 'false' }).trustProxy).toBe(0)
  })

  it('üretim uyarıları: e-posta gönderilmiyor, vekil ayarı', () => {
    const config = loadConfig({ NODE_ENV: 'production', APP_URL: 'https://ornek.com' })
    const warnings = configWarnings(config)
    expect(warnings.some((warning) => warning.startsWith('MAIL_PROVIDER=console'))).toBe(true)
    expect(warnings.some((warning) => warning.startsWith('TRUST_PROXY=0'))).toBe(true)
    expect(configWarnings(loadConfig({}))).toEqual([])
  })
})
