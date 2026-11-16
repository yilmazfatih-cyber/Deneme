---
title: Yayınlama
description: Siteyi GitHub Pages (alt klasör dâhil), Netlify, Cloudflare Pages ya da kendi alan adınızda yayınlama adımları.
group: Yayın ve kalite
order: 140
---

`npm run build`, yayınlanmaya hazır her şeyi `dist/` klasörüne yazar. Bu klasör herhangi bir statik barındırma servisine yüklenebilir; sunucu ya da veritabanı gerekmez.

## Adres ayarı: SITE_URL ve SITE_BASE

Canonical adresler, site haritası, RSS ve paylaşım kartları tam adres ister. Derleme sırasında iki ortam değişkeni okunur:

| Değişken | Örnek | Anlamı |
| --- | --- | --- |
| `SITE_URL` | `https://www.ornek.com` | Sitenin tam adresi |
| `SITE_BASE` | `/depo-adi/` | Site bir alt klasörde yayınlanıyorsa o klasör |

İkisi de verilmezse `src/site.config.ts` → `url` kullanılır. `SITE_URL` bir yol içeriyorsa (`https://kullanici.github.io/depo-adi/`) alt klasör oradan da anlaşılır.

## GitHub Pages

1. Depoda **Settings → Pages → Build and deployment → Source** olarak **GitHub Actions** seçin.
2. Bu klasördeki `docs/yayin/github-pages.yml` dosyasını deponuzda `.github/workflows/yayin.yml` olarak kopyalayın.
3. Değişiklikleri `main` dalına gönderin. İş akışı siteyi derler, denetler ve yayınlar.

İş akışı adresi GitHub'dan alır: proje sitesinde (`kullanici.github.io/depo-adi/`) alt klasör kendiliğinden ayarlanır, bütün bağlantılar buna göre üretilir.

> [!NOTE]
> Alt klasörde yayınlanan bir sitede `robots.txt` arama motorlarınca okunmaz; robots.txt yalnız alan adının kökünde geçerlidir. Site haritasını Search Console'dan elle gönderebilirsiniz.

## Kendi alan adınız

1. `public/CNAME` adında bir dosya oluşturun ve içine yalnız alan adınızı yazın (`www.ornek.com`).
2. Alan adı sağlayıcınızda `www` için GitHub Pages'i gösteren bir CNAME kaydı ekleyin (`kullanici.github.io`).
3. GitHub'da **Settings → Pages → Custom domain** alanına alan adınızı yazın ve **Enforce HTTPS** seçeneğini açın.

Özel alan adında site kökte yayınlanır; iş akışı bunu kendisi algılar.

## Netlify

**Add new site → Import an existing project** ile deponuzu seçin ve şu ayarları girin:

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `SITE_URL` = sitenizin adresi, `NODE_VERSION` = `22`

Örnek ayar dosyası: `docs/yayin/netlify.toml` (deponun köküne `netlify.toml` olarak kopyalayın).

## Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git** ile deponuzu seçin:

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables: `SITE_URL`, `NODE_VERSION` = `22`

Netlify ve Cloudflare Pages, `public/_headers` dosyasındaki önbellek kurallarını uygular; örnek: `docs/yayin/_headers`.

> [!IMPORTANT]
> Astro 7, Node.js 22.23.4 ya da daha yeni bir sürüm ister. Yayın servisinin Node sürümünü bu sürümden eski olmayacak biçimde ayarlayın.
