# Site temeli — model talimatları

## Bu temel ne yapar

Astro 7 ile statik bir web sitesi: tanıtım sayfası, blog, belgeler, iletişim, yasal şablonlar; Türkçe kökte, İngilizce
`/en/` altında. Kişiselleştirme **yalnız** `src/site.config.ts` ve `src/content/` ile yapılır; bileşenlere ancak yeni bir
yapı gerektiğinde dokunulur. Her değişiklikten sonra `npm run check` yeşil olmalıdır: o komut tür, kod kuralı, birim ve
kural testlerini çalıştırır, siteyi iki kez (kökte ve `/alt/klasor/` altında) derleyip her sayfayı denetler.

## Komutlar

Hepsi bu klasörden çalışır.

| Komut                                                                         | Ne yapar                                                                           | Süre (bu makinede) |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| `npm ci`                                                                      | Paketleri kilit dosyasından kurar                                                  | ~30 sn             |
| `npm run dev`                                                                 | Geliştirme sunucusu, http://localhost:4410/                                        | —                  |
| `npm run build` / `npm run preview`                                           | `dist/` üretir / onu 4411'de sunar                                                 | ~6 sn              |
| `npm run new -- blog\|belge\|sayfa "Başlık" [--dil en] [--mdx] [--grup "Ad"]` | Doğru klasörde taslak içerik açar                                                  | anında             |
| `npm run check`                                                               | `astro check` + `eslint` + `prettier --check` + `vitest` + `scripts/check-site.ts` | ~30 sn             |
| `npm run test`                                                                | Yalnız birim ve kural testleri (`tests/unit`, `tests/rules`)                       | ~3 sn              |
| `node scripts/check-site.ts --no-build`                                       | Var olan `dist/` ve `dist-alt/` üzerinde yalnız denetim                            | ~2 sn              |
| `npm run e2e`                                                                 | İki derleme + Playwright (4 proje, axe dâhil)                                      | ~2 dk              |
| `npm run shots`                                                               | `docs/ekran/*.jpg` ekran görüntüleri                                               | ~30 sn             |
| `npm run format`                                                              | Prettier ile biçimler (check'ten önce çalıştırın)                                  | ~5 sn              |

E2E için önceden kurulu Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run e2e`.

**Ajanlar için önemli:** Astro 7, bir yapay zekâ ajanı tarafından çalıştırıldığını algılarsa (macOS ve Linux)
`npm run dev` ve `npm run preview` sunucusunu **arka planda** başlatır ve hemen döner (çıktı JSON). Durum:
`npx astro dev status` / `npx astro preview status`; durdurmak: `npx astro dev stop` / `npx astro preview stop`.
İş bitince sunucuyu mutlaka durdurun. Testler bu sunucuları kullanmaz (`scripts/serve.ts`).

## Harita

| Şunu değiştireceksen                                                                              | Şuraya bak                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Site adı, adres, menü, alt bilgi, iletişim, sosyal hesaplar, marka renkleri, duyuru, ölçüm betiği | `src/site.config.ts` (şema: `src/lib/site-schema.ts`)                                                                   |
| Blog yazısı / belge / serbest sayfa                                                               | `src/content/blog\|belgeler\|sayfalar/<dil>/<kisa-ad>.md(x)`                                                            |
| Ana sayfa metinleri, özellikler, SSS, fiyatlar, referanslar, ekip                                 | `src/content/<koleksiyon>/<dil>.json`                                                                                   |
| İçerik alanları ve hata iletileri                                                                 | `src/lib/content-schemas.ts`; koleksiyon kaydı `src/content.config.ts`                                                  |
| Düğme, etiket, hata iletisi gibi arayüz metinleri                                                 | `src/i18n/tr.ts` (+ aynı anahtar `src/i18n/en.ts`)                                                                      |
| Ana sayfa bölümlerinin sırası                                                                     | `src/views/HomeView.astro`; bölümler `src/components/home/`                                                             |
| Sayfa görünümleri (yazı, belge, liste, iletişim…)                                                 | `src/views/*.astro`; adres dosyaları `src/pages/` (ince sarmalayıcı)                                                    |
| Adres parçaları (`blog`, `belgeler`, `docs`…) ve ayrılmış adlar                                   | `src/lib/routes.ts`                                                                                                     |
| İç bağlantı üretimi (alt klasör)                                                                  | `src/lib/url.ts` → `link()`, saf karşılığı `src/lib/paths.ts`                                                           |
| Başlık / alt bilgi / menü / tema / arama                                                          | `src/components/Header.astro`, `Footer.astro`, `ThemeToggle.astro`, `SearchDialog.astro`; davranışlar `src/scripts/`    |
| SEO etiketleri, JSON-LD                                                                           | `src/components/Seo.astro`, `src/lib/structured-data.ts`                                                                |
| Renk üretimi ve okunabilirlik kuralları                                                           | `src/lib/theme.ts` (renk matematiği `src/lib/color.ts`)                                                                 |
| Ortak görünümler (düğme, kart, rozet, uzun metin)                                                 | `src/styles/global.css`                                                                                                 |
| Yazı tipleri                                                                                      | `astro.config.ts` → `fonts`; paylaşım görseli yazı tipi `src/integrations/og-render.ts`                                 |
| Markdown dönüşümleri (başlık kimliği, uyarı kutusu, kod bloğu…)                                   | `src/markdown/plugins.ts`, `src/markdown/shiki.ts`                                                                      |
| MDX içinde içe aktarmasız kullanılan bileşenler                                                   | `src/components/mdx/index.ts`                                                                                           |
| Simgeler                                                                                          | `src/components/icons.ts` (`<Icon name="…" />`)                                                                         |
| İletişim formu / bülten                                                                           | `src/components/ContactForm.astro`, `Newsletter.astro`; `src/scripts/contact-form.ts`; saf `src/lib/form-validation.ts` |
| Paylaşım görselleri, arama dizini (derleme sonrası)                                               | `src/integrations/og-images.ts`, `src/integrations/search-index.ts`                                                     |
| Site denetimi kuralları ve bütçeler                                                               | `scripts/audit/rules.ts`, `links.ts`, `budget.ts`, `audit.ts`                                                           |
| Üreteç                                                                                            | `scripts/new.ts`                                                                                                        |

## Değişmez kurallar

1. **İç adresler `link()` ile yazılır** (`href={link('/blog/')}`); `.astro` dosyasına `href="/…"` yazılmaz. Markdown'da
   `/` ile başlayan adresler kendiliğinden düzeltilir. → `tests/rules/source.test.ts` + alt klasör derlemesinin denetimi.
2. **Görünen arayüz metni sözlükte durur**, `.astro` şablonuna gömülmez; yeni anahtar her dilin sözlüğüne eklenir.
   → `tests/rules/source.test.ts` (şablonda Türkçe harf), `astro check` (eksik anahtar), `tests/rules/i18n.test.ts`.
3. **`toUpperCase()` / `toLowerCase()` yasak**; `src/lib/text.ts` → `upperTr`, `lowerTr`, `upperFor`, `lowerFor`. CSS'te
   `text-transform: uppercase` kullanmayın. → ESLint `no-restricted-syntax`.
4. **Yalnız tema renkleri** (`bg-page`, `text-ink`, `bg-brand`, `text-brand-ink`, `border-line`…). Tailwind'in hazır
   paleti kapalıdır; `bg-blue-500` gibi sınıflar hiçbir CSS üretmez. Yeni renk `src/lib/theme.ts`'e eklenir.
   → `tests/unit/theme.test.ts` (karşıtlık), e2e axe taraması (açık + koyu).
5. **İçerik dosyası dil klasöründedir ve adı ASCII'dir** (`src/content/blog/tr/kis-kampanyasi.md`). Dosyayı elle değil
   üreteçle açın. → `tests/rules/content.test.ts`.
6. **Ön bilgide bilinmeyen alan olmaz**; yeni alan önce `src/lib/content-schemas.ts`'e eklenir. → `astro check` / derleme.
7. **Her sayfa `BaseLayout` kullanır, tek `h1` taşır, açıklaması 50–160 karakterdir.** → `scripts/check-site.ts`.
8. **Görseller `astro:assets` ile** (Markdown görseli, `<Figure>`, `<Picture>`): boyutsuz `<img>` yok. → site denetimi
   (`gorsel-boyut`, `gorsel-alt`).
9. **Dış sunucuya istek yok**: CDN, dış yazı tipi, izleyici eklenmez (ölçüm yalnız `site.config.ts` → `analytics`).
   → `tests/e2e/pages.spec.ts` (dış istek testi).
10. **Çeviriler `translationKey` ile bağlanır**; hreflang karşılıklı olmalıdır. → site denetimi (`hreflang`).
11. **Sayfa ağırlığı bütçesi**: HTML 150 KB, CSS 60 KB, başlangıç JS 20 KB (sıkıştırılmamış). Ağır betik dinamik
    `import()` ile yüklenir. → site denetimi (`butce`).
12. **Her kaynak dosya `/** … */` başlık yorumuyla açılır; `TODO`/`FIXME` bırakılmaz.** → `tests/rules/source.test.ts`.
13. **Sayfa/yazı adı ayrılmış adlarla çakışmaz** (`blog`, `belgeler`, `en`, `og`…; liste `src/lib/routes.ts`).
    → `tests/rules/content.test.ts`, üreteç.
14. **Kaynak dosyalar küçük kalır** (~300 satır); büyüyen dosyayı bileşenlere bölün.

## Tarifler

### 1. Yeni blog yazısı

1. `npm run new -- blog "Yazının başlığı"` (İngilizce: `--dil en`; bileşen kullanılacaksa `--mdx`).
2. Açılan dosyada `description` (50–160 karakter) ve `YAZIN:` ile başlayan yerleri doldurun; `tags` ekleyin.
3. Kapak isteğe bağlı: görseli `src/content/blog/<dil>/gorseller/` altına koyun, `cover: ./gorseller/ad.jpg` ve
   `coverAlt: …` yazın. Yazar: `author: <ekip id>`.
4. Yayına hazırsa `draft: true` satırını silin. Doğrulama: `npm run check`.

### 2. Yeni sayfa (Hakkında gibi) ve menüye ekleme

1. `npm run new -- sayfa "Kariyer"` → `src/content/sayfalar/tr/kariyer.md`, adres `/kariyer/`.
2. Metni yazın; `draft: true` satırını silin. Yasal metinse `legalTemplate: true`, ekip listesi için `showTeam: true`.
3. Menüye: `src/site.config.ts` → `locales.tr.nav` (ya da `footer.columns[…].links`) listesine
   `{ label: 'Kariyer', href: '/kariyer/' }`. Doğrulama: `npm run check` (kırık bağlantıyı yakalar).

### 3. Yeni belge

1. `npm run new -- belge "Başlık" [--grup "Grup"]` (sırayı son belgenin 10 fazlası yapar).
2. `order` ile sırayı, `group` ile yan menü başlığını ayarlayın. Doğrulama: `npm run check`.

### 4. Ana sayfaya yeni bölüm

1. `src/components/home/Steps.astro`'yu kopyalayın (ör. `Logos.astro`); `anchor` ve `aria-labelledby` kalıbını koruyun.
2. Metinleri `src/content/anasayfa/tr.json` ve `en.json` dosyalarına yeni bir alan olarak ekleyin
   (ör. `"logos": { "eyebrow": …, "title": …, "items": [...] }`).
3. Alanı `src/lib/content-schemas.ts` → `homeSchema` içine `strict({...})` ile ekleyin (her alana `text(min, max, ipucu)`).
4. Bölümün adresi için `src/i18n/tr.ts` ve `en.ts` → `home.sections` içine kimlik ekleyin (ör. `logos: 'referans-logolari'`).
5. `src/views/HomeView.astro` içinde istediğiniz sıraya `<Logos anchor={sections.logos} … />` yazın.
6. Menüden bağlanacaksa `site.config.ts` → `nav`: `{ label: '…', href: '/#referans-logolari' }`.
7. Doğrulama: `npm run check` (çapayı da denetler), `npm run e2e` (axe + 360 px taşma).

Yeni bir **liste** (ör. iş ortakları) ayrı veri koleksiyonu olacaksa: `src/content/<ad>/tr.json` + `en.json`, şemayı
`content-schemas.ts`'e, kaydı `src/content.config.ts`'e (`// YENİ KOLEKSİYON BURAYA`) ekleyin, okumak için
`getData('<ad>', locale)` kullanın; `tests/rules/content.test.ts` → `DATA` listesine adını yazın.

### 5. Menü, ana düğme, alt bilgi, duyuru

Yalnız `src/site.config.ts`: `nav` (en fazla 7), `cta` (`null` ile kaldırılır), `footer.columns` (en fazla 4),
`footer.legal`, `announcement` (`null` ile kaldırılır). Her dil için ayrı. Doğrulama: `npm run check`.

### 6. Renk ve yazı tipi

- Renk: `site.config.ts` → `brand.primary` / `brand.accent` (`#rrggbb`). Tonlar ve karşıtlık otomatik. Nötr tonlar
  `src/lib/theme.ts` → `neutrals`. Doğrulama: `npm run test` (karşıtlık kuralları), `npm run shots` ile gözle bakın.
- Yazı tipi: `npm install @fontsource-variable/<ad>`; `astro.config.ts` → `fonts` içinde `name` ve iki `src` yolunu
  (latin + latin-ext) değiştirin; paylaşım görseli için `src/integrations/og-render.ts` → `FONTS` dosyalarını
  (`@fontsource/<ad>` paketinin `.woff` dosyaları) değiştirip `TEMPLATE_VERSION`'ı bir artırın.

### 7. Yeni dil (ör. `de`)

1. `src/site.config.ts` → `locales.de` (en bloğunu kopyalayıp çevirin; `lang: 'de'`, `ogLocale: 'de_DE'`).
2. `src/i18n/en.ts` → `de.ts` (çevirin); `src/i18n/index.ts` tablosuna `de` ekleyin.
3. `src/lib/routes.ts` → `SEGMENTS.de` (ör. `{ blog: 'blog', tag: 'tag', docs: 'docs', contact: 'kontakt' }`).
4. `src/pages/en/` → `src/pages/de/` kopyalayın; dosyalardaki `'en'` değerlerini `'de'` yapın, klasör/dosya adlarını 3. adımdaki parçalarla eşleyin (`contact.astro` → `kontakt.astro`).
5. Her veri koleksiyonu için `src/content/<koleksiyon>/de.json`; en az bir blog yazısı ve bir belge (`…/de/`).
6. `src/lib/format.ts` → `intlLocale` (`de → de-DE`).
7. `npm run check` — eksikleri `tests/rules/routes.test.ts`, `tests/rules/i18n.test.ts`, `tests/rules/content.test.ts`
   tek tek listeler.

### 8. Formu bir servise bağlama

1. `.env.example` → `.env` kopyalayın; `PUBLIC_FORM_ENDPOINT=https://…` yazın (bülten için `PUBLIC_NEWSLETTER_ENDPOINT`).
2. Form o adrese `POST` + JSON `{ name, email, message, page, lang }` gönderir (`Accept: application/json`); 2xx başarı
   sayılır. Servis ek alan istiyorsa `src/scripts/contact-form.ts` → `fetch` gövdesine ekleyin ve
   `tests/e2e/alt-klasor.spec.ts`'teki beklentiyi güncelleyin.
3. Yayın servisinde aynı değişkeni tanımlayın (GitHub: depo değişkeni `vars.PUBLIC_FORM_ENDPOINT`). Doğrulama: `npm run e2e`.

### 9. Kendi alan adında yayın

`public/CNAME` dosyasına yalnız alan adını yazın (GitHub Pages için); DNS'te CNAME kaydı; yayın servisinde
`SITE_URL=https://www.alanadi.com`. Ayrıntı: `docs/YAYINLAMA.md`.

### 10. GitHub Pages alt klasöründe yayın

`docs/yayin/github-pages.yml` → deponun `.github/workflows/yayin.yml`; Settings → Pages → Source: GitHub Actions.
İş akışı `SITE_URL`'i `configure-pages` çıktısından verir; alt klasör (`/depo-adi/`) oradan çıkarılır. Site deponun bir
alt klasöründeyse dosyadaki `SITE_DIR` değerini değiştirin.

### 11. Netlify / Cloudflare Pages

Derleme komutu `npm run build`, çıktı `dist`, ortam değişkenleri `SITE_URL` ve `NODE_VERSION=22.23.4`. Netlify için
`docs/yayin/netlify.toml` → kök `netlify.toml`. Önbellek başlıkları: `docs/yayin/_headers` → `public/_headers`.

### 12. Yeni MDX bileşeni

1. `src/components/<Ad>.astro` yazın (başlık yorumu, `interface Props`, metinler sözlükten `toLocale(Astro.currentLocale)` ile).
2. `src/components/mdx/index.ts` içine içe aktarıp `// YENİ MDX BİLEŞENİ BURAYA` altına ekleyin.
3. `.mdx` dosyasında içe aktarmadan `<Ad … />` yazın. Doğrulama: `npm run check`.

### 13. Yeni arayüz metni / yeni simge

- Metin: `src/i18n/tr.ts` içine anahtar, aynısını `en.ts`'e; bileşende `t.bolum.anahtar`. `{ad}` yer tutucusu için `fill()`.
- Simge: lucide.dev'den `<svg>` içindeki öğeleri `src/components/icons.ts` → `lineIcons` (`// YENİ SİMGE BURAYA`);
  kullanım `<Icon name="ad" />`. Simge, `ozellikler` JSON'unda da kendiliğinden seçilebilir olur.

## Sık yapılan hatalar

| Belirti                                                                | Neden                                             | Çözüm                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `InvalidContentEntryDataError … description: En az 50 karakter olmalı` | Açıklama kısa                                     | 50–160 karakter yazın                                                      |
| `Bilinmeyen alan: etiketler`                                           | Ön bilgide yanlış alan adı                        | Doğru ad `tags`; izinli alanlar iletide yazar                              |
| `[baglanti] … alt klasörle ("/alt/klasor/") başlamıyor`                | `.astro` içinde elle `href="/…"`                  | `href={link('/…')}`                                                        |
| `[kirik-baglanti] … hedef bulunamadı`                                  | Silinen/yeniden adlandırılan sayfaya bağlantı     | Bağlantıyı düzeltin ya da sayfayı geri ekleyin                             |
| `[kirik-capa] … id="…" yok`                                            | `/#bolum` adresi bölüm kimliğiyle eşleşmiyor      | `src/i18n/*.ts` → `home.sections` ile `nav` adresini eşleyin               |
| `[yinelenen-baslik]`                                                   | Aynı dilde iki sayfanın başlığı aynı              | Başlıklardan birini değiştirin                                             |
| `[butce] JS … sınır 20.0 KB`                                           | Sayfaya ağır betik eklendi                        | Betiği dinamik `import()` ile yükleyin                                     |
| `Property 'x' is missing in type … en.ts`                              | Sözlüğe anahtar yalnız `tr.ts`'e eklendi          | Aynı anahtarı `en.ts`'e de ekleyin                                         |
| `ReferenceError: x is not defined` (MDX)                               | MDX metninde `{x}` süslü ayraç                    | `.md` kullanın ya da kod biçiminde yazın                                   |
| `Expected component Ad to be defined`                                  | MDX bileşeni kayıtlı değil                        | `src/components/mdx/index.ts`'e ekleyin                                    |
| `bg-blue-500` gibi sınıf etkisiz                                       | Tailwind paleti bilerek kapalı                    | Tema rengi kullanın (`bg-brand`, `text-muted`…)                            |
| Arama "yalnız derlenmiş sitede çalışır" diyor                          | `npm run dev` sırasında dizin yok                 | `npm run build && npm run preview`                                         |
| `.env` değeri etkisiz                                                  | Sunucu yeniden başlatılmadı / `PUBLIC_` öneki yok | Sunucuyu yeniden başlatın; istemci değişkeni `PUBLIC_` ile başlar          |
| `paylaşım görselinde gösterilemeyen karakter` uyarısı                  | Başlıkta emoji ya da yazı tipinde olmayan simge   | Başlıktan çıkarın ya da `og-render.ts` → `REPLACEMENTS`                    |
| `Yazar bulunamadı: "…"`                                                | `author` ekip dosyasında yok                      | `src/content/ekip/<dil>.json` içindeki `id`'yi yazın                       |
| E2E: `Executable doesn't exist`                                        | Playwright tarayıcısı kurulu değil                | `PLAYWRIGHT_CHROMIUM_EXECUTABLE=…` ya da `npx playwright install chromium` |
| `npm run dev` kapı 4410 dolu                                           | Başka bir süreç kullanıyor                        | `npm run dev -- --port 4420`                                               |
| `npm run dev` hemen dönüyor, JSON yazıyor                              | Astro ajan algıladı, sunucu arka planda           | `npx astro dev status`; bitince `npx astro dev stop`                       |
| Alt klasör derlemesi önizlemede 404                                    | Önizlemeye `SITE_URL` verilmedi                   | Derlemedeki `SITE_URL`'i `npm run preview`'a da verin                      |

## Bitti tanımı

- [ ] `npm run format` sonrası `npm run check` yeşil (tür, lint, biçim, testler, iki derleme + site denetimi).
- [ ] Arayüz değiştiyse `npm run e2e` yeşil (390×844, 360×800, 1280×800; açık + koyu axe; 360 px'te taşma yok).
- [ ] Yeni saf mantığın birim testi var (`tests/unit/`); yeni proje kuralının kural testi var (`tests/rules/`).
- [ ] Yeni metinler her dilin sözlüğünde; yeni içerik her dilde ya da bilerek tek dilde (çeviriler `translationKey` ile bağlı).
- [ ] Yeni/değişen dosyaların başlık yorumu güncel; `TODO` yok.
- [ ] Görsel değişiklikte `npm run shots` ile `docs/ekran/` görüntülerine bakıldı.
- [ ] Teknoloji/kapsam kararı alındıysa `docs/KARARLAR.md`'ye, yapılamayan iş README → "Sınırlar"a yazıldı.
