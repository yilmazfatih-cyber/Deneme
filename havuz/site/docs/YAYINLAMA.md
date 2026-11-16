# Yayınlama

`npm run build` yayına hazır her şeyi `dist/` klasörüne yazar: sayfalar, görseller (AVIF/WebP), paylaşım görselleri
(`og/`), arama dizini (`pagefind/`), `sitemap-index.xml`, `rss.xml`, `robots.txt`, `404.html`, simgeler. Bu klasörü
herhangi bir statik barındırma servisine yüklemek yeterlidir.

## 1. Adres ayarı

| Değişken                     | Örnek                         | Anlamı                                                                                                |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SITE_URL`                   | `https://www.ornek.com`       | Sitenin tam adresi. Yol içerirse alt klasör oradan anlaşılır: `https://kullanici.github.io/depo-adi/` |
| `SITE_BASE`                  | `/depo-adi/`                  | Alt klasör (SITE_URL'deki yoldan önceliklidir)                                                        |
| `PUBLIC_FORM_ENDPOINT`       | `https://formspree.io/f/xxxx` | İletişim formunun gönderileceği adres (yoksa e-posta yedeği)                                          |
| `PUBLIC_NEWSLETTER_ENDPOINT` | `https://…/abone`             | Bülten kaydı adresi (yoksa bülten kutusu görünmez)                                                    |

Değişkenler `.env` dosyasından (örnek: `.env.example`) ya da yayın servisinin ortam değişkenlerinden okunur; komut
satırındaki değer önceliklidir. Hiçbiri verilmezse `src/site.config.ts` → `url` kullanılır. Hatalı değer (ör. `https://`
olmadan yazılmış adres) derlemeyi Türkçe bir iletiyle durdurur.

Yerelde alt klasör derlemesini denemek için:

```bash
SITE_URL=https://kullanici.github.io/depo-adi/ npm run build
SITE_URL=https://kullanici.github.io/depo-adi/ npm run preview   # http://localhost:4411/depo-adi/
```

Önizlemeye de aynı `SITE_URL` verilmelidir; alt klasör yapılandırmadan okunur (denendi).

## 2. GitHub Pages

1. **Settings → Pages → Build and deployment → Source:** "GitHub Actions".
2. `docs/yayin/github-pages.yml` dosyasını deponuzda `.github/workflows/yayin.yml` olarak kopyalayın. Site deponun alt
   klasöründeyse dosyadaki `SITE_DIR` değerini o klasör yapın (ör. `havuz/site`).
3. `main` dalına gönderin. İş akışı: `npm ci` → `npm run check` (testler + iki derleme + denetim) → `npm run build` →
   yükleme → yayın. Adres `actions/configure-pages` çıktısından (`base_url`) gelir.
4. Form servisi için: **Settings → Secrets and variables → Actions → Variables** altında `PUBLIC_FORM_ENDPOINT`.

Kullanılan eylem sürümleri (Kasım 2026'da eylemlerin kendi belgelerinden doğrulandı): `actions/checkout@v7`,
`actions/setup-node@v7`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`.
İş akışı bu ortamda GitHub'da çalıştırılmadı.

**Alt klasör notları:** Proje sitesinde (`kullanici.github.io/depo-adi/`) bütün bağlantılar `/depo-adi/` ile üretilir;
`404.html` GitHub tarafından bu klasörde de kullanılır. `robots.txt` yalnız alan adı kökünde okunduğu için alt klasörde
etkisizdir; site haritasını Search Console'dan gönderin.

## 3. Kendi alan adı

1. `public/CNAME` dosyası oluşturun; içinde yalnız `www.ornek.com` yazsın.
2. DNS: `www` için CNAME → `kullanici.github.io`. Kök alan adı (`ornek.com`) için GitHub'ın belgelediği A/AAAA
   kayıtlarını kullanın (değerleri GitHub Pages belgelerinden alın).
3. **Settings → Pages → Custom domain:** alan adını yazın, **Enforce HTTPS**'i açın.

Özel alan adında `configure-pages` kök adresi verir; site kökte yayınlanır.

## 4. Netlify

- Panelde: Build command `npm run build`, Publish directory `dist`, ortam değişkenleri `SITE_URL`, `NODE_VERSION=22.23.4`.
- Ya da `docs/yayin/netlify.toml` → deponun köküne `netlify.toml`.
- 404: Netlify `dist/404.html`'i kendiliğinden kullanır.

## 5. Cloudflare Pages

- **Workers & Pages → Create → Pages → Connect to Git**; Build command `npm run build`, output `dist`,
  ortam değişkenleri `SITE_URL`, `NODE_VERSION=22.23.4`.
- 404: Pages kökteki `404.html`'i kendiliğinden kullanır.

Netlify ve Cloudflare Pages, `public/_headers` dosyasındaki başlıkları uygular; örnek: `docs/yayin/_headers`
(`/_astro/*` için bir yıllık önbellek, temel güvenlik başlıkları). Netlify ve Cloudflare adımları bu ortamda denenmedi.

## 6. Yayından önce denetim listesi

- [ ] `src/site.config.ts`: ad, adres, iletişim, sosyal hesaplar, `organization.legalName` sizin bilgileriniz.
- [ ] Örnek içerik (Sedir, kurgusal görüşler, ekip, fiyatlar) değiştirildi ya da kaldırıldı.
- [ ] Yasal şablonlar dolduruldu ve bir hukukçuya inceletildi (`legalTemplate: true` uyarısı ancak sonra kaldırılır).
- [ ] `npm run check` ve `npm run e2e` yeşil.
- [ ] Yayından sonra: paylaşım kartını bir bağlantı önizleme aracıyla, site haritasını Search Console'da denetleyin.
