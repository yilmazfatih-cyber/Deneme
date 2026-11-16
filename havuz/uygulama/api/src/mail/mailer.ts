/**
 * E-posta gönderimi. Uygulama yalnız `Mailer` arayüzünü bilir; hangi sağlayıcının kullanılacağını ayar seçer:
 *  - `console` (varsayılan): e-posta GÖNDERİLMEZ; `mail_outbox` tablosuna yazılır. Geliştirmede içerik ayrıca
 *    terminale basılır (bağlantıya tıklayıp akışı deneyebilesiniz). Testler kutuyu tablodan okur.
 *    Üretimde içerik terminale BASILMAZ (bağlantıdaki belirteç günlüğe düşmesin), yalnız uyarı yazılır.
 *  - `http`: JSON gövdeli bir HTTP ucuna gönderir (Resend tarzı: `{from, to[], subject, text, html}` +
 *    `Authorization: Bearer <anahtar>`). Hiçbir gerçek sağlayıcıyla DENENMEDİ; bkz. docs/YAYINLAMA.md → "E-posta".
 *
 * Genişletme: başka biçim isteyen bir sağlayıcı (Postmark, Brevo…) için `createHttpMailer` örnek alınarak yeni bir
 * işlev yazılır ve `createMailer` içinde seçilir; testi test/mailer.test.ts'te sahte fetch ile yazılır.
 */
import type { Config } from '../config.ts'
import type { Db } from '../db/database.ts'
import type { Logger } from '../lib/logger.ts'
import type { Clock } from '../lib/random.ts'

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
}

export interface Mailer {
  readonly kind: 'console' | 'http'
  send(message: MailMessage): Promise<void>
}

export interface OutboxMailerOptions {
  readonly db: Db
  readonly clock: Clock
  readonly logger: Logger
  /** İçerik terminale basılsın mı (yalnız geliştirmede). */
  readonly print: boolean
  readonly write?: (text: string) => void
}

/** Göndermez: `mail_outbox` tablosuna yazar (geliştirme ve test). */
export function createOutboxMailer(options: OutboxMailerOptions): Mailer {
  const write = options.write ?? ((text: string) => process.stderr.write(text))
  return {
    kind: 'console',
    async send(message) {
      options.db.run(
        'INSERT INTO mail_outbox (created_at, to_address, subject, text_body, html_body) VALUES (?, ?, ?, ?, ?)',
        options.clock.now().toISOString(),
        message.to,
        message.subject,
        message.text,
        message.html ?? null,
      )
      if (options.print) {
        const line = '─'.repeat(60)
        write(
          `\n${line}\nE-posta (gönderilmedi; MAIL_PROVIDER=console)\nKime: ${message.to}\nKonu: ${message.subject}\n\n${message.text}\n${line}\n`,
        )
      } else {
        options.logger.warn('e-posta gönderilmedi (MAIL_PROVIDER=console); mail_outbox tablosuna yazıldı', {
          subject: message.subject,
        })
      }
    },
  }
}

export interface HttpMailerOptions {
  readonly url: string
  readonly apiKey: string
  readonly from: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

/** Resend tarzı JSON ucuna gönderir. Başarısızlıkta hata fırlatır (çağıran günlüğe yazar). */
export function createHttpMailer(options: HttpMailerOptions): Mailer {
  const doFetch = options.fetch ?? fetch
  return {
    kind: 'http',
    async send(message) {
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html === undefined ? {} : { html: message.html }),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`E-posta sağlayıcısı HTTP ${response.status} döndürdü.`)
      }
      await response.body?.cancel()
    },
  }
}

/** Ayara göre postacıyı kurar. */
export function createMailer(
  config: Config,
  deps: { db: Db; clock: Clock; logger: Logger; fetch?: typeof fetch },
): Mailer {
  if (config.mail.provider === 'http') {
    return createHttpMailer({
      url: config.mail.url,
      apiKey: config.mail.apiKey,
      from: config.mail.from,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    })
  }
  return createOutboxMailer({
    db: deps.db,
    clock: deps.clock,
    logger: deps.logger,
    print: config.env === 'development',
  })
}
