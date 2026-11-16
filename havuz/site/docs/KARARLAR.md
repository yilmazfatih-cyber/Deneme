# Kararlar

Kısa kayıtlar: ne seçildi, neden, neler elendi. Yeni bir karar alındığında sona ekleyin.

## 1. Astro 7, statik çıktı

- **Seçilen:** Astro 7.4.12, `output: 'static'`, `build.format: 'directory'`, `trailingSlash: 'always'`.
- **Neden:** İçerik ağırlıklı site, sunucu gerekmez; her statik barındırmada (GitHub Pages dâhil) çalışır. Dizin biçimi
  ve sonda "/" kuralı, GitHub Pages'in `/blog` → `/blog/` yönlendirmesiyle tutarlıdır; denetim, "/" ile bitmeyen sayfa
  bağlantısını hata sayar.
- **Not:** Astro 7'nin varsayılanı `compressHTML: 'jsx'` satır içi öğeler arasındaki boşluğu siler; HTML kuralına uyan
  `compressHTML: true` seçildi (daha az şaşırtıcı).

## 2. Markdown işlemcisi: Sätteri (Astro 7 varsayılanı)

- Eklentiler `src/markdown/plugins.ts` içinde Sätteri "hast" eklentisi olarak yazıldı (başlık kimlikleri, alt klasör
  bağlantıları, kod bloğu sarmalayıcısı, tablo kaydırma, `> [!TIP]` uyarıları, şekil, dipnot çevirisi). Eklentiler saf
  `markdownToHtml` ile birim testlidir.
- **Başlık kimlikleri** github-slugger yerine kendi Türkçe kısa ad üreticimizle (`slugify`) üretilir:
  "## Özellikler" → `#ozellikler`. Böylece menüdeki `/#ozellikler` gibi adresler ASCII kalır.
- **Elenen:** `@astrojs/markdown-remark` (unified) — ek bağımlılık; Sätteri ile gereken her şey yapılabildi.

## 3. Tailwind CSS 4, hazır palet kapalı

- Renkler `src/lib/theme.ts`'te üretilen CSS değişkenlerinden gelir; `@theme { --color-*: initial }` ile Tailwind'in hazır
  paleti kapatıldı. **Neden:** Küçük bir modelin `bg-blue-500` yazıp koyu temayı bozması imkânsız olsun.
- Uzun metin stilleri (`.prose`) `@tailwindcss/typography` yerine elle yazıldı: Türkçe tipografi, uyarı kutuları ve
  kod blokları üzerinde tam denetim; ek bağımlılık yok.

## 4. Tema: `light-dark()` + marka renginden türetilen tonlar

- Her renk değişkeni `light-dark(açık, koyu)` olarak tek `:root` bloğunda yazılır; tema `color-scheme` ile değişir.
  JS kapalıyken sistem teması kendiliğinden izlenir; "Sistem" seçimi için `matchMedia` dinleyicisi gerekmez.
- Tema tercihi `<head>` başındaki satır içi küçük betikle **ilk boyamadan önce** uygulanır (titreme yok).
- Marka tonları OKLCH uzayında türetilir ve metin/zemin çiftleri WCAG AA (4,5:1) karşıtlığa ulaşana dek koyultulur ya
  da açılır (`ensureContrast`). Kural tablosu (`contrastRules`) yedi farklı marka rengi çiftiyle iki temada testlidir.
  Renk dönüşümü bilinen değerlerle (beyaz/siyah, saf kırmızı/mavi OKLCH değerleri, #767676'nın 4,54 karşıtlığı) sınanır.

## 5. Yazı tipleri: Figtree + Instrument Serif, `fontProviders.local()`

- Türkçe glifleri (ğ, ş, ı, İ) tam; ikisi de OFL-1.1. Değişken Figtree (300–900) tek dosyada bütün ağırlıklar.
  Türkçe için `latin` + `latin-ext` alt kümelerinin ikisi de gerekir ("ğ", "ş", "İ" ikincisinde) ve önceden yüklenir
  (4 dosya, toplam 61,6 KB).
- **Elenen:** `fontProviders.npm()` — bu sürümde yerel dosyayı `file://` adresiyle `fetch` etmeye çalıştı ve
  `CannotFetchFontFile` hatası verdi (Node `fetch` `file:` desteklemiyor). `fontProviders.fontsource()` derlemede ağa
  çıkar (çevrimdışı derleme ve "dış istek yok" ilkesine aykırı). Yerel sağlayıcıya npm paketindeki dosya yolu verildi.
- "₺" glifi Figtree'de yok: fiyatlar "349 TL" biçiminde yazılır (`formatPrice`).

## 6. Paylaşım görselleri: Satori + sharp, derleme sonrası tümleşim

- `astro:build:done` aşamasında her sayfanın `og:image` etiketinin gösterdiği yola, `og:title`/`og:description`
  değerleriyle kart çizilir: yeni sayfalar için ek ayar gerekmez. Üst etiket kırıntı yolundan (BreadcrumbList) okunur.
- Satori metni yazı tipinden yollara çevirir (`<text>` yok); sistem yazı tipine bağımlılık yok. Aynı girdiden bayt bayt
  aynı PNG çıktığı testle doğrulandı. Satori WOFF2 okumadığı için `@fontsource/figtree` ve `@fontsource/instrument-serif`
  paketlerinin statik `.woff` dosyaları kullanılır; latin ve latin-ext ayrı aile adlarıyla yüklenir (aynı adla yüklenince
  Türkçe harfler kutu çıkıyordu — denenerek görüldü).
- İçerik özetine göre önbellek: `node_modules/.cache/havuz-site-og/` (ikinci derleme görselleri yeniden çizmez).
- **Elenen:** sayfa başına uç nokta (`og/[...slug].png.ts`) — her yeni sayfa türü için adres listesi tutmak gerekirdi.

## 7. Arama: Pagefind, özel kayıtlar + Türkçe katlama, kendi arayüzümüz

- Pagefind 1.6.0'ın Node API'si Astro 7'den bağımsız çalışır (doğrulandı). HTML'i doğrudan dizinlemek yerine
  `addCustomRecord` kullanılır: içerik = özgün metin + ASCII'ye katlanmış metin. Sorgu da iki biçimde aranır, sonuçlar
  birleştirilir.
- **Neden:** Denemede Pagefind'ın kendi küçük harfe çevirmesi Türkçe'de tutarsızdı: "ığdır" ve "ÇIĞ" sorguları 0 sonuç,
  "hatirlatma" (ı yerine i) 0 sonuç verdi. Katlamayla "IĞDIR" = "ığdır" = "igdir" (uçtan uca testli).
- Bedel: Pagefind'ın alıntı (excerpt) metni katlanmış metinden gelebileceği için sonuçta sayfa açıklaması gösterilir.
- Pagefind'ın hazır arayüzü (126–184 KB) kullanılmadı ve derlemeden silinir; kendi arayüzümüz pencere açılınca yüklenir.
- Sonuç adreslerine alt klasörü Pagefind ekler; kayıtlar mantıksal yolla yazılır, arayüz `baseUrl`'i açıkça verir.

## 8. İstemci JS: çatı yok, küçük modüller

- Menü, tema, arama tetikleyicisi, form, kopyala düğmesi, içindekiler vurgusu bağımsız TypeScript modülleridir.
  Ölçüm (`dist/`, sıkıştırılmamış / gzip -9): ana sayfa başlangıç JS ≈ 5,5 KB / 2,5 KB; en ağır sayfa (iletişim) 8,4 KB.
- **Sayfa geçişleri** JS'siz CSS `@view-transition` ile (hareket azaltma tercihine uyar). `<ClientRouter />` elendi:
  ek istemci JS'i getirir ve her sayfa betiğinin gezinmeden sonra yeniden başlatılmasını gerektirir.
- **Ön getirme** Speculation Rules ile (`<script type="speculationrules">`, JS çalıştırmaz). Astro `prefetch` betiği elendi.

## 9. Performans bütçesi

- Sınırlar (sayfa başına, sıkıştırılmamış): HTML 150 KB, CSS 60 KB, başlangıç JS 20 KB. Ölçülen en büyükler: HTML
  64,8 KB (ana sayfa), CSS 44,1 KB (39,6 KB ortak dosya + satır içi tema ve yazı tipi tanımları), JS 8,4 KB.
  Sınırlar, ölçülenin yaklaşık iki katı pay bırakır; büyüyen bir sayfa sınırı geçmeden önce fark edilsin diye.
- Ölçüm: `scripts/audit/budget.ts` sayfanın yüklediği modülleri ve onların durağan içe aktardıklarını toplar; dinamik
  `import()` parçaları ve JSON-LD sayılmaz.

## 10. Çok dillilik: ince sayfa dosyaları + paylaşılan görünümler

- Varsayılan dil kökte (`prefixDefaultLocale: false`), diğerleri `/en/` altında. Adres parçaları dile göre farklı
  (`belgeler` / `docs`) olduğu için her dil için `src/pages/` altında ince dosyalar var; asıl görünüm `src/views/`'da.
  Yeni dil: klasörü kopyala + dil kodunu değiştir (kural testi eksik dosyaları listeler).
- **Elenen:** tek `[...path].astro` ile bütün adresleri üretmek — küçük bir model için izlenmesi zor.
- Çeviriler `translationKey` ile bağlanır; hreflang yalnız gerçek karşılık varsa yazılır, denetim karşılıklılığı sınar.

## 11. İçerik şemaları: katı nesne + Türkçe, yol gösteren iletiler

- Her alanın kendi iletisi vardır ("En az 50 karakter olmalı (şu an 23). Arama sonuçlarında … görünen özet."). Şema
  düzeyindeki iletiler Astro'nun kendi (İngilizce) hata eşlemesinden önce gelir — denenerek doğrulandı.
- `z.strictObject`: bilinmeyen alan (yazım hatası) derlemeyi durdurur ve izinli alanları sayar.
- Veri koleksiyonları dil başına **tek JSON** (`ozellikler/tr.json`): sıralama dosyadaki sıradır, bütün liste tek
  bakışta görülür. YAML elendi: Türkçe metindeki ": " gibi işaretler sessiz ayrıştırma hatalarına yol açabiliyor.

## 12. İletişim formu: JSON uç noktası ya da mailto, bal küpü + süre tuzağı

- Sunucu yok. `PUBLIC_FORM_ENDPOINT` (astro:env, derlemede gömülür) varsa JSON `POST`; yoksa `mailto:`. JS kapalıyken
  form aynı adrese klasik biçimde gider. CAPTCHA elendi: görme engelliler için çoğu zaman aşılamaz.
- Uçtan uca testte iki kip ayrı derlemelerde sınanır: kök derleme e-posta yedeği, alt klasör derlemesi örnek uç
  noktalarla (`https://form.example/gonder`, istek Playwright'ta yakalanır).

## 13. Alt klasörde yayın: tek yardımcı + ikinci derleme

- Bütün iç adresler `link()` (`src/lib/url.ts`) ve Markdown eklentisinden geçer. `SITE_URL` bir yol içerirse alt klasör
  oradan çıkarılır (GitHub `configure-pages` çıktısı doğrudan kullanılabilsin diye).
- `npm run check` siteyi bir de `SITE_BASE=/alt/klasor/` ile derleyip denetler; e2e "alt-klasor" projesi aynı derlemeyi
  gerçek tarayıcıda gezer (stil, arama, form).
- `.env` dosyası yapılandırma dosyasında kendiliğinden okunmadığı için `astro.config.ts` Vite `loadEnv` kullanır;
  bu yüzden `vite` doğrudan bağımlılık olarak sabitlendi (Astro'nun kullandığı 8.3.8).

## 14. Araçlar ve sürümler

- TypeScript `~6.0.3` (typescript-eslint 8.72, `<6.1.0` destekliyor). `@astrojs/check` 0.9.12 TS 6 ile çalışıyor.
- ESLint 10 + `eslint-plugin-astro` + `eslint-plugin-jsx-a11y-x` (asıl `eslint-plugin-jsx-a11y` ESLint 10'u peer olarak
  desteklemiyor; eslint-plugin-astro ikisini de tanıyor).
- `parse5` derleme sonrası tümleşimler ve site denetimi için (sağlam HTML ayrıştırma); `yaml` üreteç ve kural testleri için.
- Playwright testleri boş kapıda kendi küçük sunucumuzla (`scripts/serve.ts`, 404.html'i 404 koduyla döner) koşar;
  `astro preview` alt klasör ve kök derlemelerini aynı anda sunamadığı için elendi.
- İşçi sayısı 2 (paylaşımlı makine); Vitest `maxWorkers: 2`.

## 15. Şartnameden bilinçli sapmalar

- **Ekran görüntüleri JPEG** (kalite 82): 20 görüntü 2,8 MB. PNG kayıpsız ama çok daha büyük olurdu (oran ölçülmedi);
  depoda büyük dosya bırakmamak için JPEG seçildi.
- **Arama sonuçlarında alıntı yerine açıklama** gösteriliyor (7. madde).
- **Başlık uzunluğu denetimi** en fazla 80 karakter (site adı eki dâhil); aynı dilde yinelenen başlık hata sayılıyor,
  farklı dillerde aynı başlık ("Blog") serbest.
