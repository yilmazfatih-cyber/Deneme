import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/database.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { createMemoryLogger } from '../src/lib/logger.ts'
import { createHttpMailer, createMailer, createOutboxMailer } from '../src/mail/mailer.ts'
import { escapeHtml, passwordResetMail } from '../src/mail/templates.ts'
import { FakeClock, testConfig } from './support/harness.ts'

const message = { to: 'ayse@ornek.com', subject: 'Konu', text: 'Düz metin', html: '<p>HTML</p>' }

describe('e-posta kutusu (console)', () => {
  it('mail_outbox tablosuna yazar; geliştirmede içeriği basar, değilse yalnız uyarı yazar (içerik yok)', async () => {
    const db = openDatabase(':memory:')
    runMigrations(db)
    const printed: string[] = []
    const logger = createMemoryLogger()
    await createOutboxMailer({
      db,
      clock: new FakeClock(),
      logger,
      print: true,
      write: (text) => printed.push(text),
    }).send(message)
    await createOutboxMailer({ db, clock: new FakeClock(), logger, print: false }).send(message)
    expect(db.all('SELECT to_address, subject, text_body, html_body FROM mail_outbox')).toEqual([
      { to_address: 'ayse@ornek.com', subject: 'Konu', text_body: 'Düz metin', html_body: '<p>HTML</p>' },
      { to_address: 'ayse@ornek.com', subject: 'Konu', text_body: 'Düz metin', html_body: '<p>HTML</p>' },
    ])
    expect(printed.join('')).toContain('Düz metin')
    expect(logger.lines.join('\n')).not.toContain('Düz metin')
    expect(logger.lines.join('\n')).not.toContain('ayse@ornek.com')
    db.close()
  })
})

describe('HTTP sağlayıcı bağdaştırıcısı (sahte fetch)', () => {
  it('Resend tarzı JSON gövdeyi Bearer anahtarla gönderir', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        init: init ?? {},
      })
      return new Response('{"id":"1"}', { status: 200 })
    }
    const mailer = createHttpMailer({
      url: 'https://posta.example/emails',
      apiKey: 'gizli-anahtar',
      from: 'Uygulama <b@ornek.com>',
      fetch: fakeFetch,
    })
    await mailer.send(message)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://posta.example/emails')
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer gizli-anahtar')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      from: 'Uygulama <b@ornek.com>',
      to: ['ayse@ornek.com'],
      subject: 'Konu',
      text: 'Düz metin',
      html: '<p>HTML</p>',
    })
  })

  it('sağlayıcı hata dönerse ya da yanıt vermezse hata fırlatır', async () => {
    const failing = createHttpMailer({
      url: 'https://posta.example',
      apiKey: 'k',
      from: 'f@ornek.com',
      fetch: async () => new Response('kota doldu', { status: 429 }),
    })
    await expect(failing.send(message)).rejects.toThrow('E-posta sağlayıcısı HTTP 429 döndürdü.')
    const hanging = createHttpMailer({
      url: 'https://posta.example',
      apiKey: 'k',
      from: 'f@ornek.com',
      timeoutMs: 30,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('zaman aşımı')))
        }),
    })
    await expect(hanging.send(message)).rejects.toThrow('zaman aşımı')
  })

  it('createMailer ayara göre sağlayıcıyı seçer', () => {
    const db = openDatabase(':memory:')
    const logger = createMemoryLogger()
    const clock = new FakeClock()
    expect(createMailer(testConfig(), { db, clock, logger }).kind).toBe('console')
    const http = testConfig({
      env: {
        MAIL_PROVIDER: 'http',
        MAIL_HTTP_URL: 'https://posta.example',
        MAIL_HTTP_KEY: 'k',
        MAIL_FROM: 'a@ornek.com',
      },
    })
    expect(createMailer(http, { db, clock, logger }).kind).toBe('http')
    db.close()
  })
})

describe('şablonlar', () => {
  it("kullanıcı adı HTML'e kaçışlanarak konur; süre Türkçe yazılır", () => {
    const mail = passwordResetMail({
      to: 'a@ornek.com',
      name: '<b>Ayşe</b>',
      link: 'https://ornek.com/#/x?token=a&b',
      ttlMinutes: 60,
    })
    expect(mail.html).toContain('&lt;b&gt;Ayşe&lt;/b&gt;')
    expect(mail.html).toContain('href="https://ornek.com/#/x?token=a&amp;b"')
    expect(mail.text).toContain('1 saat geçerli')
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;')
  })
})
