/**
 * Dil kayıt dosyası: hangi dil kodu hangi sözlüğü kullanır.
 * Kim kullanır: bütün bileşenler `useTranslations(locale)` ile metin alır; Markdown eklentileri de buradan okur (saf modül).
 * Genişletme: yeni dil eklerken sözlüğü içe aktarın ve aşağıdaki tabloya ekleyin (AGENTS.md → "Yeni dil ekleme").
 */
import { defaultLocale, locales, type Locale } from '../site.config.ts'
import { en } from './en.ts'
import { tr, type Dictionary } from './tr.ts'

// YENİ DİL BURAYA: src/site.config.ts → locales içindeki her anahtarın burada bir sözlüğü olmalı.
const dictionaries: Record<Locale, Dictionary> = { tr, en }

export type { Dictionary }

/** Verilen metin sitede tanımlı bir dil kodu mu? */
export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as string[]).includes(value)
}

/** Bilinmeyen ya da boş değer için varsayılan dili verir (ör. `Astro.currentLocale`). */
export function toLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale
}

/** Dilin arayüz sözlüğü: `const t = useTranslations(locale)` → `t.blog.title`. */
export function useTranslations(locale: Locale): Dictionary {
  return dictionaries[locale]
}
