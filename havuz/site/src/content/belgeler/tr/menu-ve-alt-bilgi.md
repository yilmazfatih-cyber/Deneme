---
title: Menü ve alt bilgi
description: Üst menüye bağlantı ekleme, ana düğmeyi değiştirme, alt bilgi sütunları, yasal bağlantılar ve duyuru şeridi.
group: Görünüm
order: 100
---

Menü ve alt bilgi, `src/site.config.ts` içinde her dil için ayrı tanımlanır. Bileşenlere dokunmanız gerekmez.

## Üst menü

```ts title="src/site.config.ts"
nav: [
  { label: 'Özellikler', href: '/#ozellikler' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Kariyer', href: '/kariyer/' },
],
cta: { label: 'Ücretsiz deneyin', href: '/iletisim/' },
```

- İç sayfalara `/` ile başlayan adres yazın; ana sayfadaki bir bölüme `/#bolum-adi` ile bağlanın.
- Dış adresler `https://` ile başlar.
- Bulunulan sayfanın menü öğesi kendiliğinden vurgulanır.
- Menüde en fazla yedi bağlantı olabilir. Telefonda bağlantılar "Menü" düğmesinin arkasında açılır.

`cta`, menünün sağındaki ana düğmedir. Kaldırmak için `cta: null` yazın.

## Alt bilgi

```ts title="src/site.config.ts"
footer: {
  tagline: 'Randevular dolsun, telefon sussun.',
  columns: [
    { title: 'Ürün', links: [{ label: 'Fiyatlar', href: '/#fiyatlar' }] },
  ],
  legal: [{ label: 'Gizlilik', href: '/gizlilik/' }],
},
```

En fazla dört sütun ve sütun başına sekiz bağlantı yazabilirsiniz. Telif satırındaki şirket adı `organization.legalName` alanından gelir.

## Duyuru şeridi

```ts title="src/site.config.ts"
announcement: {
  text: 'Kış kampanyası başladı: ilk üç ay yüzde 20 indirim.',
  href: '/blog/kis-kampanyasi/',
  linkLabel: 'Ayrıntılar',
},
```

Ziyaretçi şeridi kapatırsa tarayıcı bunu hatırlar; metni değiştirdiğinizde şerit yeniden görünür. Şeridi kaldırmak için `announcement: null` yazın.

> [!IMPORTANT]
> `npm run check`, menüdeki ve alt bilgideki her bağlantının gerçekten var olan bir sayfaya ya da bölüme gittiğini denetler. Bir sayfayı silerseniz bağlantısını da kaldırın.
