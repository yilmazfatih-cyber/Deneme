---
title: Çok dillilik
description: Varsayılan dil ve İngilizce sürüm, çevirileri birbirine bağlama, arayüz sözlükleri ve yeni bir dil ekleme adımları.
group: Özellikler
order: 130
---

Varsayılan dil Türkçe'dir ve kök adreste yayınlanır (`/`). İngilizce sürüm `/en/` altındadır. Başlıktaki dil bağlantısı, bulunduğunuz sayfanın çevirisi varsa ona, yoksa o dilin ana sayfasına gider.

## Ne nereden çevrilir?

| Ne | Nerede |
| --- | --- |
| Menü, alt bilgi, ana sayfa başlığı | `src/site.config.ts` → `locales.en` |
| Düğme, etiket, hata iletisi | `src/i18n/en.ts` |
| Ana sayfa metinleri ve listeler | `src/content/<koleksiyon>/en.json` |
| Yazılar, belgeler, sayfalar | `src/content/<koleksiyon>/en/` |
| Adres parçaları (`docs`, `contact`) | `src/lib/routes.ts` |

## Çevirileri birbirine bağlamak

Bir yazının çevirisi farklı bir dosya adına sahip olabilir. İkisini bağlamak için iki dosyanın ön bilgisine de **aynı** `translationKey` değerini yazın:

```md
translationKey: ana-sayfa
```

Bağlı sayfalar birbirine `hreflang` etiketiyle işaret eder; arama motorları her ziyaretçiye kendi dilindeki sürümü gösterebilir. `npm run check` bu işaretlerin karşılıklı olduğunu denetler.

## Yeni bir dil eklemek

Örneğin Almanca (`de`) eklemek için:

1. `src/site.config.ts` → `locales` içine `de` bloğunu ekleyin (`en` bloğunu kopyalayıp çevirin; `lang: 'de'`, `ogLocale: 'de_DE'`).
2. `src/i18n/en.ts` dosyasını `de.ts` olarak kopyalayıp çevirin; `src/i18n/index.ts` içindeki tabloya ekleyin.
3. `src/lib/routes.ts` → `SEGMENTS` tablosuna `de` için adres parçalarını yazın.
4. `src/pages/en/` klasörünü `src/pages/de/` olarak kopyalayın; dosyalardaki `'en'` değerlerini `'de'` yapın ve klasör adlarını 3. adımdaki parçalarla eşleyin.
5. Her veri koleksiyonu için `de.json` dosyasını ve en az bir içerik dosyasını ekleyin.
6. `src/lib/format.ts` → `intlLocale` içine `de → de-DE` eşlemesini ekleyin.
7. `npm run check` çalıştırın; eksik çeviri anahtarları tür hatası olarak, eksik dosyalar Türkçe iletiyle bildirilir.
