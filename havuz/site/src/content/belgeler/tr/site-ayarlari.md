---
title: Site ayarları
description: src/site.config.ts dosyasındaki her alanın anlamı; site adı, adres, açıklama, iletişim bilgileri ve sosyal hesaplar.
group: Başlangıç
order: 30
---

Sitenin kimliği tek bir dosyada durur: `src/site.config.ts`. Bir alanı yanlış yazarsanız (ör. kısa bir açıklama ya da eksik bir e-posta) derleme, hangi alanın neden yanlış olduğunu Türkçe olarak söyleyerek durur.

## Temel alanlar

```ts title="src/site.config.ts" {2,3}
export const siteConfig = defineSiteConfig({
  name: 'Sedir',
  url: 'https://sedir.example',
  defaultLocale: 'tr',
  // …
})
```

- **`name`**: Marka adı. Başlıkta, sekme başlığında ve paylaşım görsellerinde görünür.
- **`url`**: Sitenin yayınlanacağı adres. Yayın sırasında `SITE_URL` ortam değişkeni verilirse o kullanılır (bkz. Yayınlama).
- **`defaultLocale`**: Kök adreste yayınlanan dil. Diğer diller kendi klasöründe yayınlanır (`/en/`).

## Dil başına alanlar

`locales` altında her dil için şu alanlar bulunur:

| Alan | Anlamı | Kural |
| --- | --- | --- |
| `title` | Ana sayfanın sekme ve arama sonucu başlığı | 10–65 karakter |
| `description` | Açıklaması olmayan sayfalarda kullanılan özet | 50–160 karakter |
| `nav` | Üst menü bağlantıları | En fazla 7 |
| `cta` | Menünün sağındaki ana düğme | Yoksa `null` |
| `footer` | Alt bilgi sütunları ve yasal bağlantılar | En fazla 4 sütun |
| `announcement` | Sayfanın en üstündeki duyuru şeridi | Yoksa `null` |

Menü ve alt bilgi için ayrıntılı örnekler "Menü ve alt bilgi" belgesindedir.

## İletişim ve kurum bilgileri

`contact` alanındaki e-posta, telefon ve adres iletişim sayfasında görünür; ayrıca arama motorlarına kurum bilgisi (Organization yapısal verisi) olarak verilir. Telefon ya da adres kullanmıyorsanız o satırları silin.

## Sosyal hesaplar

```ts title="src/site.config.ts"
social: {
  instagram: 'https://www.instagram.com/hesabiniz',
  linkedin: 'https://www.linkedin.com/company/sirketiniz',
},
```

Yalnız kullandığınız hesapları bırakın; kullanılabilen anahtarlar: `github`, `x`, `linkedin`, `instagram`, `youtube`, `facebook`. Alt bilgideki simgeler buna göre kendiliğinden çizilir.

## Ziyaret ölçümü

`analytics` varsayılan olarak `null`dır: sitede hiçbir dış betik çalışmaz. Gizlilik dostu bir ölçüm servisi kullanmak isterseniz servisin verdiği betik adresini yazın:

```ts title="src/site.config.ts"
analytics: { src: 'https://servis.example/script.js', attributes: { 'data-domain': 'ornek.com' } },
```

> [!IMPORTANT]
> Ölçüm betiği eklediğinizde gizlilik ve çerez politikası sayfalarınızı da güncelleyin.
