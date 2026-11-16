# Web sitesi temeli

Tanıtım sayfası + blog + belgeler + iletişim içeren, **tek bir ayar dosyası ve içerik dosyalarıyla** kişiselleştirilen
statik web sitesi temeli. [Astro 7](https://astro.build/) ile yazıldı; sunucu ya da veritabanı gerektirmez, GitHub Pages,
Netlify, Cloudflare Pages gibi her statik barındırma servisinde (alt klasör dâhil) çalışır.

Örnek marka **"Sedir"** (randevu yazılımı) ve sitedeki bütün kişi, firma, görüş ve rakamlar **kurgusaldır**. Belgeler
bölümü ise bu temelin gerçek kullanım kılavuzudur.

## 5 dakikada çalıştırma

Gerekenler: [Node.js](https://nodejs.org/) 22.23.4 ya da daha yenisi.

```bash
npm ci            # paketleri kilit dosyasından kur (bir kez)
npm run dev       # geliştirme sunucusu → http://localhost:4410/
```

Yayına hazır dosyalar ve önizleme:

```bash
npm run build     # dist/ klasörüne bütün site (paylaşım görselleri, arama dizini, site haritası dâhil)
npm run preview   # derlenmiş siteyi göster → http://localhost:4411/  (site içi arama yalnız burada çalışır)
```

Kendi siteniz için önce `src/site.config.ts` dosyasını (ad, adres, menü, iletişim, renkler), sonra `src/content/`
altındaki içerikleri değiştirin. Ayrıntılı kılavuz sitenin içinde: **Belgeler** bölümü (`/belgeler/`).

## Komutlar

| Komut                          | Ne yapar                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | Geliştirme sunucusu (kapı 4410)                                                                                      |
| `npm run build`                | Siteyi `dist/` klasörüne derler                                                                                      |
| `npm run preview`              | Derlenmiş siteyi gösterir (kapı 4411)                                                                                |
| `npm run new -- blog "Başlık"` | Yeni blog yazısı açar (`belge`, `sayfa` da olur; `--dil en`, `--mdx`)                                                |
| `npm run check`                | Tür denetimi + ESLint + Prettier + birim/kural testleri + iki derleme (kök ve `/alt/klasor/`) üzerinde site denetimi |
| `npm run e2e`                  | Chromium'da uçtan uca testler + axe erişilebilirlik taraması (390×844, 360×800, 1280×800)                            |
| `npm run shots`                | Ekran görüntüleri → `docs/ekran/`                                                                                    |
| `npm run format`               | Bütün dosyaları biçimler                                                                                             |

Önceden kurulu Chromium için: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome npm run e2e`.

## Neler var

- **Sayfalar:** ana sayfa (kahraman bölüm, özellikler, nasıl çalışır, referanslar, fiyatlar, SSS, çağrı), hakkında,
  sayfalı blog + yazı + etiket sayfaları, belgeler (yan menü, içindekiler, önceki/sonraki), iletişim, gizlilik / KVKK /
  çerez politikası **şablonları** (görünür "şablondur, hukuki danışmanlık değildir" uyarısıyla), 404, RSS, site haritası,
  `robots.txt`.
- **Tek ayar dosyası:** `src/site.config.ts` (şemayla doğrulanır; yanlış alan Türkçe hata iletisiyle durdurur).
- **İçerik şemaları:** blog, belgeler, sayfalar + ana sayfa, özellikler, SSS, fiyatlar, referanslar, ekip. Hatalı ön
  bilgi derlemeyi hangi alanın neden yanlış olduğunu söyleyen Türkçe bir iletiyle durdurur.
- **SEO:** title, description, canonical, Open Graph, Twitter, hreflang, JSON-LD (Organization, WebSite, BlogPosting,
  BreadcrumbList, FAQPage), her sayfa için derlemede üretilen paylaşım görseli (1200×630, Türkçe harfler doğru).
- **Erişilebilirlik:** atlama bağlantısı, klavyeyle çalışan mobil menü, odak yönetimi, erişilebilir form hataları,
  WCAG AA karşıtlığını kendiliğinden sağlayan tema renkleri.
- **Açık / koyu / sistem teması:** ilk boyamada titreme yok; JS kapalıyken sistem temasına uyar.
- **Çok dillilik:** Türkçe kökte, İngilizce `/en/` altında; arayüz metinleri tipli sözlüklerde.
- **Site içi arama:** Pagefind; Türkçe büyük/küçük harf ve "ç→c" katlamasıyla ("IĞDIR" = "ığdır" = "igdir").
- **İletişim formu:** sunucusuz; form servisi adresi varsa JSON gönderir, yoksa e-posta uygulamasını açar; bal küpü +
  süre tuzağı; JS kapalıyken de çalışır. İsteğe bağlı bülten kutusu.
- **Alt klasörde yayın:** `SITE_URL` / `SITE_BASE` ile GitHub Pages proje sitesinde kırık bağlantısız çalışır.
- **Performans:** istemci tarafında çatı yok; başlangıç JS'i sayfa başına ~5–9 KB (sıkıştırılmamış), yazı tipleri kendi
  sunucudan ve önceden yüklenir, görseller AVIF/WebP ve boyutlu (CLS yok). Bütçeler her derlemede denetlenir.
- **Kalite denetimleri:** derlenmiş her sayfada tek h1, lang, title, açıklama uzunluğu, canonical, OG, alt metin, geçerli
  JSON-LD, yinelenen id, kırık bağlantı/çapa, karşılıklı hreflang, sayfa ağırlığı bütçesi.

## Klasörler

```
src/site.config.ts      tek ayar dosyası
src/content/            içerik (yazılar, belgeler, sayfalar, ana sayfa JSON'ları)
src/i18n/               arayüz sözlükleri (tr.ts, en.ts)
src/pages/              adresler (ince dosyalar; asıl görünümler src/views/ içinde)
src/components/         yapı taşları (başlık, alt bilgi, form, arama…)
src/lib/                saf yardımcılar (adres, renk, metin, şemalar…) — birim testli
src/integrations/       derleme sonrası işler (paylaşım görselleri, arama dizini)
scripts/                üreteç, site denetimi, test sunucusu
tests/                  unit/ (mantık), rules/ (proje kuralları), e2e/ (tarayıcı), shots/ (ekran görüntüsü)
docs/                   KARARLAR.md, MIMARI.md, YAYINLAMA.md, yayin/ (kopyalanacak örnekler), ekran/
```

Model (yapay zekâ) için ayrıntılı talimatlar ve tarifler: [AGENTS.md](AGENTS.md).

## Yayınlama

Kısaca: GitHub Pages için `docs/yayin/github-pages.yml` dosyasını deponuzda `.github/workflows/` altına kopyalayın;
Netlify / Cloudflare Pages için derleme komutu `npm run build`, çıktı klasörü `dist`, ortam değişkeni `SITE_URL`.
Ayrıntılar: [docs/YAYINLAMA.md](docs/YAYINLAMA.md).

## Sınırlar

- **Gerçek barındırma servislerinde denenmedi.** GitHub Pages iş akışı, Netlify ve Cloudflare Pages ayarları bu
  ortamda çalıştırılamadı (dış servis yok). Alt klasörde yayın, aynı derlemenin `/alt/klasor/` altında sunulmasıyla
  yerelde denetlendi ve uçtan uca test edildi.
- **Form servisleriyle gerçek gönderim denenmedi.** Formun gönderdiği JSON ve hata/başarı davranışı, sahte bir uç
  noktayla (Playwright) sınandı. Gövdeye ek alan isteyen servisler (ör. erişim anahtarı) için betiğe alan eklemek gerekir.
- **Yalnız Chromium'da test edildi.** Firefox ve Safari'de uçtan uca test çalıştırılmadı. Kullanılan CSS özellikleri
  (`light-dark()`, `:has()`, `color-mix()`) 2024'ten bu yana üç tarayıcıda da var; sayfa geçişleri (`@view-transition`)
  ve bağlantı ön getirme (Speculation Rules) desteklemeyen tarayıcılarda sessizce devre dışı kalır.
- **Arama dizini derlemede üretilir;** `npm run dev` sırasında arama "yalnız derlenmiş sitede çalışır" iletisi verir.
  Arama sonuçlarında eşleşen cümle değil, sayfanın açıklaması gösterilir (Türkçe katlama nedeniyle; bkz. KARARLAR).
- **Yasal metinler şablondur,** hukuki danışmanlık değildir; yayından önce bir hukukçuya inceletilmelidir.
- **İçerik güvenlik politikası (CSP) tanımlı değil.** Tema betiği satır içidir; CSP eklenecekse karma (hash) gerekir.
- **`robots.txt` alt klasörde yayında etkisizdir** (arama motorları yalnız alan adı kökündekini okur).
- **Paylaşım görsellerinde** yazı tipinde olmayan karakterler (emoji, ₺ gibi) kutu olarak çizilir; derleme bu durumda
  uyarı verir, ₺ ve → için karşılık kullanılır.
- **Astro'nun kendi kullanım verisi:** Astro, geliştirme ve derleme sırasında anonim kullanım verisi gönderir (sitenin
  ziyaretçilerini etkilemez). Kapatmak için bir kez `npx astro telemetry disable` çalıştırın.
- **Yalnız iki dil hazır** (Türkçe, İngilizce). İngilizce içerik örnek düzeydedir (ana sayfa, bir yazı, bir belge,
  hakkında); yeni dil ekleme tarifi AGENTS.md'de.

## Lisanslar (üçüncü taraf)

- Yazı tipleri: Figtree ve Instrument Serif — SIL Open Font License 1.1 (Fontsource paketleri).
- Simgeler: Lucide (ISC; Feather kökenli olanlar MIT) ve Simple Icons (CC0) — ayrıntı `src/components/icons.ts`.
- Paketlerin lisansları `node_modules/<paket>/LICENSE` dosyalarındadır.
