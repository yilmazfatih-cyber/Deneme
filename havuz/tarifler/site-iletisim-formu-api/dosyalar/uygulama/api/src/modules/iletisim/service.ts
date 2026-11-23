/**
 * İletişim formu iş kuralı: bal küpü doluysa iletiyi sessizce atar (bot "başarılı" sanar, yeniden denemez);
 * değilse yöneticiye e-posta gönderir (yanıtı bekletmeden, arka planda). MAIL_PROVIDER=console iken e-posta
 * `mail_outbox` tablosuna yazılır (geliştirme ve testlerin posta kutusu). İleti veritabanında AYRICA saklanmaz.
 *
 * Genişletme: iletiler panelde de görünsün isteniyorsa yeni migrasyonla `contact_messages` tablosu açıp burada
 * yazın (TARIFLER.md → "Yeni tablo"); kişisel veri olduğu için saklama süresini maintenance.ts'e ekleyin.
 */
import type { ContactRequest } from '@uygulama/shared'
import type { ContactConfig } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { contactMail } from '../../mail/templates.ts'

export type ContactOutcome = 'sent' | 'trapped'

export function submitContact(ctx: AppContext, contact: ContactConfig, form: ContactRequest): ContactOutcome {
  if (form._gotcha) {
    ctx.logger.info('iletişim formu: bal küpü dolu, ileti atıldı')
    return 'trapped'
  }
  const mail = contactMail({
    to: contact.to,
    name: form.name,
    email: form.email,
    message: form.message,
    page: form.page,
    lang: form.lang,
    receivedAt: ctx.clock.now().toISOString(),
  })
  ctx.jobs.run('iletişim e-postası', () => ctx.mailer.send(mail))
  return 'sent'
}
