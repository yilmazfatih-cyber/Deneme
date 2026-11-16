---
title: Renk ve yazı tipi
description: Marka renklerini değiştirme, açık ve koyu tema, okunabilirlik denetimi ve yazı tiplerini değiştirme adımları.
group: Görünüm
order: 90
---

## Marka renkleri

Sitenin bütün vurgu renkleri iki değerden türetilir:

```ts title="src/site.config.ts"
brand: {
  primary: '#1f5f4a',
  accent: '#b4532a',
},
```

- **`primary`**: Düğmeler, bağlantılar, rozetler ve vurgular.
- **`accent`**: İkincil vurgu (ör. alıntı işaretleri, bazı rozetler).

Bu iki rengi değiştirdiğinizde açık ve koyu temadaki bütün tonlar (düğme zemini, düğme yazısı, bağlantı rengi, yumuşak zeminler) kendiliğinden hesaplanır. Hesaplama, metnin zeminine karşı **en az 4,5:1 karşıtlıkta** (WCAG AA) okunmasını sağlayacak biçimde rengi gerekirse koyultur ya da açar.

> [!TIP]
> Seçtiğiniz renk çok açık (ör. sarı) olsa bile düğme yazısı okunur kalır: sistem bu durumda düğme yazısını koyu yapar. `npm run test` bu kuralları yedi farklı renk çiftiyle sınar.

## Açık, koyu ve sistem teması

Ziyaretçi başlıktaki düğmeyle açık, koyu ya da sistem temasını seçer; seçim tarayıcıda saklanır. Zemin, metin ve çizgi gibi nötr tonlar `src/lib/theme.ts` içindeki `neutrals` tablosundadır. Bu tabloyu değiştirirseniz `npm run test` okunabilirliği yeniden denetler.

## Yazı tipleri

Site iki yazı tipi kullanır: gövde için **Figtree**, başlıklar için **Instrument Serif**. İkisi de npm paketlerinden (Fontsource) gelir ve sitenizle birlikte sunulur; dış bir servise istek gitmez.

Yazı tipini değiştirmek için:

1. Paketi kurun: `npm install @fontsource-variable/inter`
2. `astro.config.ts` içindeki `fonts` bölümünde ilgili ailenin `name` ve `src` alanlarını yeni paketin dosyalarıyla değiştirin. Türkçe için hem `latin` hem `latin-ext` dosyasını tanımlayın; "ğ", "ş" ve "İ" ikincisindedir.
3. Paylaşım görsellerinde de aynı yazı tipini kullanmak için `src/integrations/og-render.ts` içindeki dosya adlarını güncelleyin (bu adım için `.woff` dosyaları gerekir).
4. `npm run check` ile denetleyin.

> [!NOTE]
> Yazı tipinin lisansını denetleyin. Fontsource'taki Google yazı tiplerinin çoğu SIL Open Font License (OFL) ile dağıtılır; bu lisans siteyle birlikte sunmaya izin verir.
