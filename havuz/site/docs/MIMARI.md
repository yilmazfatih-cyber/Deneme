# Mimari

## Parçalar

```
src/site.config.ts ─┐  (şema: src/lib/site-schema.ts)
src/content/** ─────┤  (şema: src/lib/content-schemas.ts, kayıt: src/content.config.ts)
src/i18n/*.ts ──────┤
                    ▼
src/pages/**  (ince adres dosyaları: getStaticPaths → src/lib/static-paths.ts)
      │
      ▼
src/views/*.astro  (sayfa görünümleri: içerik sorguları src/lib/content.ts)
      │
      ▼
src/layouts/BaseLayout.astro ── Seo.astro, Header, Footer, SearchDialog, tema betiği
      │
      ▼
astro build ──► dist/ (HTML, _astro/ CSS-JS-görsel-yazı tipi, sitemap, rss, robots, favicon)
      │
      ├─ astro:build:done → src/integrations/og-images.ts   → dist/og/**.png, apple-touch-icon.png
      └─ astro:build:done → src/integrations/search-index.ts → dist/pagefind/
                    │
                    ▼
scripts/check-site.ts ── iki derleme (dist/, dist-alt/) → scripts/audit/* ile her sayfa denetlenir
tests/e2e/** ────────── scripts/serve.ts (dist + /alt/klasor/ → dist-alt) üzerinde Playwright + axe
```

## Veri akışı

1. **Ayar:** `site.config.ts` içe aktarıldığı anda Zod şemasıyla doğrulanır; hata derlemeyi (ve testleri) durdurur.
2. **İçerik:** Astro'nun içerik katmanı `src/content/` dosyalarını okur, şemaya göre doğrular ve önbelleğe alır
   (`.astro/`). Markdown, Sätteri ile HTML'e çevrilir; bizim hast eklentilerimiz (`src/markdown/plugins.ts`) başlık
   kimliklerini, alt klasör bağlantılarını, kod bloklarını, uyarı kutularını üretir; Shiki renklendirir.
3. **Adresler:** Her şey önce "mantıksal yol"dur (`/blog/yazi/`, `src/lib/routes.ts`). HTML'e yazılırken `link()` alt
   klasörü ekler; tam adres (canonical, OG, JSON-LD) `absoluteUrl()` ile üretilir.
4. **Görünüm:** Görünüm bileşenleri sözlükten metin (`useTranslations`), içerikten veri alır; `BaseLayout` SEO
   etiketlerini, tema betiğini ve ortak iskeleti ekler. Sayfanın `searchSection` değeri `<main data-search-section>`
   olarak yazılır.
5. **Derleme sonrası:** OG tümleşimi her HTML'deki `og:image` yoluna kart çizer; arama tümleşimi
   `data-search-section` taşıyan sayfaları Pagefind'a özel kayıt olarak (özgün + katlanmış metin) ekler.
6. **İstemci:** Her sayfa yalnız kendi bileşenlerinin küçük modüllerini yükler (`src/scripts/*.ts`). Arama arayüzü ve
   Pagefind ancak arama penceresi açılınca yüklenir.

## Tema

`src/lib/theme.ts` → `buildThemeCss()` her rengi `--ad: light-dark(açık, koyu)` olarak `<head>`'e yazar.
`:root { color-scheme: light dark }` varsayılandır; tema düğmesi `<html data-theme="light|dark">` ile `color-scheme`'i
sabitler. `global.css` bu değişkenleri Tailwind adlarına bağlar (`--color-page: var(--page)` …).

## Denetim katmanları

| Katman         | Nerede                  | Ne yakalar                                                                   |
| -------------- | ----------------------- | ---------------------------------------------------------------------------- |
| Tür            | `astro check`           | Şema türleri, eksik sözlük anahtarı, yanlış prop                             |
| Kod kuralı     | `eslint.config.js`      | Erişilebilirlik (jsx-a11y katı), `toUpperCase` yasağı                        |
| Birim          | `tests/unit/`           | Saf mantık: adres, renk, metin, şema, eklenti, OG, üreteç, denetim kuralları |
| Proje kuralı   | `tests/rules/`          | İçerik düzeni, sözlük tutarlılığı, sayfa dosyaları, kaynak dosya kuralları   |
| Derlenmiş site | `scripts/check-site.ts` | SEO etiketleri, bağlantı/çapa, JSON-LD, hreflang, bütçe, site dosyaları      |
| Tarayıcı       | `tests/e2e/`            | Menü, tema, arama, form, 404, dil, taşma, axe (açık + koyu), dış istek       |
