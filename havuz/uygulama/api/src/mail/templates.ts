/**
 * E-posta metinleri (Türkçe, tek yer). Her e-posta düz metin + basit HTML olarak iki biçimde hazırlanır.
 * Kullanıcıdan gelen her değer (ad vb.) HTML'e `escapeHtml` ile kaçışlanarak konur.
 *
 * Genişletme: yeni e-posta için TARIFLER.md → "Yeni e-posta ekle": buraya bir işlev, çağıran serviste
 * `jobs.run('…', () => mailer.send(...))`, testte `mail_outbox` tablosundan okuma.
 */
import type { MailMessage } from './mailer.ts'

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function html(paragraphs: string[]): string {
  const body = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n')
  return `<!doctype html><html lang="tr"><body style="font-family: sans-serif; line-height: 1.5">\n${body}\n</body></html>`
}

export function passwordResetMail(input: { to: string; name: string; link: string; ttlMinutes: number }): MailMessage {
  const hours = input.ttlMinutes % 60 === 0 ? `${input.ttlMinutes / 60} saat` : `${input.ttlMinutes} dakika`
  return {
    to: input.to,
    subject: 'Şifre sıfırlama bağlantınız',
    text: [
      `Merhaba ${input.name},`,
      '',
      `Şifrenizi sıfırlamak için bu bağlantıyı açın (${hours} geçerli, bir kez kullanılabilir):`,
      input.link,
      '',
      'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.',
    ].join('\n'),
    html: html([
      `Merhaba ${escapeHtml(input.name)},`,
      `Şifrenizi sıfırlamak için bu bağlantıyı açın (${hours} geçerli, bir kez kullanılabilir):`,
      `<a href="${escapeHtml(input.link)}">Şifremi sıfırla</a>`,
      'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.',
    ]),
  }
}

export function passwordChangedMail(input: { to: string; name: string; appUrl: string }): MailMessage {
  return {
    to: input.to,
    subject: 'Şifreniz değiştirildi',
    text: [
      `Merhaba ${input.name},`,
      '',
      'Hesabınızın şifresi az önce değiştirildi ve öteki cihazlardaki oturumlar kapatıldı.',
      `Bunu siz yapmadıysanız hemen "Şifremi unuttum" ile yeni şifre alın: ${input.appUrl}`,
    ].join('\n'),
    html: html([
      `Merhaba ${escapeHtml(input.name)},`,
      'Hesabınızın şifresi az önce değiştirildi ve öteki cihazlardaki oturumlar kapatıldı.',
      `Bunu siz yapmadıysanız hemen "Şifremi unuttum" ile yeni şifre alın: <a href="${escapeHtml(input.appUrl)}">${escapeHtml(input.appUrl)}</a>`,
    ]),
  }
}
