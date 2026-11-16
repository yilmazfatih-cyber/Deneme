---
title: Blog yazısı ekleme
description: Üreteçle yeni yazı açma, ön bilgi alanları, etiketler, kapak görseli, yazar ve taslak olarak saklama.
group: İçerik
order: 40
---

## Üreteçle yeni yazı

```bash title="Terminal"
npm run new -- blog "Kış kampanyası için beş fikir"
```

Komut, başlıktan Türkçe karaktersiz bir dosya adı üretir ve dosyayı doğru klasörde, doldurulacak alanlarıyla açar:

```text
src/content/blog/tr/kis-kampanyasi-icin-bes-fikir.md
```

İngilizce yazı için `--dil en`, bileşen kullanacağınız yazılar için `--mdx` ekleyin. Yazının adresi dosya adından gelir: `/blog/kis-kampanyasi-icin-bes-fikir/`.

## Ön bilgi alanları

Dosyanın başındaki `---` çizgileri arasındaki bölüm, yazının ön bilgisidir:

```md title="src/content/blog/tr/kis-kampanyasi-icin-bes-fikir.md"
---
title: Kış kampanyası için beş fikir
description: Kış aylarında boş kalan randevu saatlerini doldurmak için küçük işletmelerin uygulayabileceği beş kampanya fikri.
date: 2026-12-01
tags: [Pazarlama]
draft: true
---
```

| Alan | Zorunlu mu? | Kural |
| --- | --- | --- |
| `title` | Evet | 10–70 karakter |
| `description` | Evet | 50–160 karakter; arama sonucunda görünür |
| `date` | Evet | `YYYY-AA-GG` |
| `updated` | Hayır | Son güncelleme tarihi |
| `tags` | Hayır | En fazla 5 etiket |
| `draft` | Hayır | `true` ise yazı yalnız geliştirme sunucusunda görünür |
| `cover`, `coverAlt` | Hayır | Kapak görseli ve açıklaması (ikisi birlikte) |
| `author` | Hayır | `src/content/ekip/<dil>.json` içindeki bir kişinin `id` değeri |
| `translationKey` | Hayır | Başka dildeki çevirisiyle aynı değer |

> [!WARNING]
> Üreteç, açıklamaya bir yer tutucu yazar ve yazıyı taslak (`draft: true`) olarak açar. Yer tutucu metin değiştirilmeden taslak kaldırılırsa `npm run check` uyarır.

## Kapak görseli

Görseli yazının yanındaki `gorseller/` klasörüne koyun ve ön bilgiye ekleyin:

```md
cover: ./gorseller/kis-kampanyasi.jpg
coverAlt: Vitrininde kış indirimi afişi asılı bir kuaför salonu.
```

Görsel derlemede küçültülür; AVIF ve WebP sürümleri birden çok genişlikte kendiliğinden üretilir. En az 1600 piksel genişliğinde bir görsel kullanın.

## Etiketler

Her etiketin kendi sayfası olur: `/blog/etiket/pazarlama/`. Aynı etiketi her yazıda aynı biçimde yazın; "SEO" ve "Seo" aynı sayfaya düşer ama listede ilk yazılan biçim görünür.

## Yayınlamak

`draft: true` satırını silin (ya da `false` yapın), sonra `npm run check` ile denetleyin. Yazı blog listesine, etiket sayfalarına, RSS akışına, site haritasına ve site içi aramaya kendiliğinden eklenir.
