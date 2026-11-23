/**
 * Arayüz metinleri. Kullanıcının gördüğü HER metin `tr.json` içindedir; bileşenler `t('anahtar')` ile okur.
 * Anahtarlar tiplidir: sözlükte olmayan anahtar derleme hatası verir.
 *
 * Genişletme: yeni metin → `tr.json`'a satır ekleyin (`alan.ad` biçiminde, ör. `tasks.empty.title`).
 * Değişken: metinde `{ad}` yazın, çağırırken `t('anahtar', { ad: 'Ayşe' })`.
 * Kural testi (test/rules/i18n.test.ts) kullanılmayan anahtarları ve dinamik anahtar kurmayı yakalar.
 */
import tr from './tr.json'

export type MessageKey = keyof typeof tr

export type MessageVars = Readonly<Record<string, string | number>>

/** Arayüz metni. `{ad}` yer tutucuları verilen değerlerle doldurulur. */
export function t(key: MessageKey, vars?: MessageVars): string {
  let text: string = tr[key]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/** Sözlüğün tamamı (yalnız kural testleri için). */
export const MESSAGES: Readonly<Record<string, string>> = tr
