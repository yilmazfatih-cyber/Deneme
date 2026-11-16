/**
 * Tarih ve fiyat biçimleme (saf). Tarihler UTC olarak biçimlenir: "2026-11-16" her makinede "16 Kasım 2026" olur.
 * Kim kullanır: kartlar, yazı başlıkları, fiyat tablosu, RSS; tests/unit/format.test.ts.
 * Genişletme: yeni dil için `intlLocale` içine eşleme ekleyin (ör. de → de-DE).
 */

/** Site dil kodundan (tr, en) Intl yerel ayarına. */
export function intlLocale(lang: string): string {
  if (lang === 'tr') return 'tr-TR'
  if (lang === 'en') return 'en-US'
  return lang
}

/** "16 Kasım 2026" / "November 16, 2026" */
export function formatDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** <time datetime="…"> için: "2026-11-16" */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Fiyat: TRY için "1.299 TL" (Türk lirası simgesi ₺ seçilen yazı tipinde bulunmadığından "TL" yazılır),
 * diğer para birimleri için Intl biçimi ("$19", "€19"). Kuruş gösterilmez.
 */
export function formatPrice(amount: number, currency: string, lang: string): string {
  if (currency === 'TRY') {
    return `${new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 0 }).format(amount)} TL`
  }
  return new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    amount,
  )
}
