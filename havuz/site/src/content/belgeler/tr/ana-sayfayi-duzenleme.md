---
title: Ana sayfayı düzenleme
description: Ana sayfanın başlıkları, özellikler, fiyatlar, sık sorulan sorular ve referanslar; bölümlerin sırasını değiştirme ve yeni bölüm ekleme.
group: İçerik
order: 80
---

Ana sayfanın bütün metinleri JSON dosyalarındadır; kodu değiştirmeden metinleri güncelleyebilirsiniz.

| Dosya | İçerik |
| --- | --- |
| `src/content/anasayfa/<dil>.json` | Kahraman bölüm, bölüm başlıkları, adımlar, sayfa sonu çağrısı |
| `src/content/ozellikler/<dil>.json` | Özellik kartları (simge, başlık, metin) |
| `src/content/fiyatlar/<dil>.json` | Paketler, para birimi, fiyat dönemi |
| `src/content/sss/<dil>.json` | Sık sorulan sorular |
| `src/content/referanslar/<dil>.json` | Müşteri görüşleri |
| `src/content/ekip/<dil>.json` | Ekip (Hakkında sayfası ve yazı yazarları) |

## Bir özellik eklemek

```json title="src/content/ozellikler/tr.json"
{
  "icon": "shield-check",
  "title": "Güvenli ödeme",
  "text": "Kapora ödemeleri güvenli bağlantıyla alınır; kart bilgileri sizin sunucunuza hiç uğramaz."
}
```

`icon` alanına yazılabilecek simge adları `src/components/icons.ts` dosyasındadır. Bilinmeyen bir ad yazarsanız derleme, kullanılabilen adları listeleyerek durur.

## Fiyatlar

`price` alanına sayı yazın (`0` yazılan paket "Ücretsiz" görünür). `currency` için `TRY`, `USD`, `EUR` gibi kodlar kullanılır; Türk lirası fiyatlar "349 TL" biçiminde gösterilir. En fazla bir pakete `"highlighted": true` yazarak öne çıkarabilirsiniz.

## Sık sorulan sorular

Sorular ana sayfada açılır-kapanır liste olarak görünür ve arama motorlarına FAQPage yapısal verisi olarak verilir. Yanıtları düz metin olarak yazın.

> [!WARNING]
> Örnek sitedeki müşteri görüşleri ve ekip kurgusaldır. Kendi sitenizi yayınlamadan önce gerçek görüşlerle değiştirin ya da `src/views/HomeView.astro` içinden referanslar bölümünü kaldırın.

## Bölümlerin sırası

Bölümler `src/views/HomeView.astro` dosyasında yukarıdan aşağıya yazıldığı sırayla çizilir. Sırayı değiştirmek için satırların yerini değiştirin; bir bölümü kaldırmak için satırını silin.

## Yeni bölüm eklemek

1. `src/components/home/` altındaki bir bölümü (ör. `Steps.astro`) kopyalayıp yeni adla kaydedin.
2. Metinleri için `src/content/anasayfa/<dil>.json` dosyasına yeni bir alan ve `src/lib/content-schemas.ts` içindeki `homeSchema`'ya karşılığını ekleyin.
3. Bileşeni `src/views/HomeView.astro` içinde istediğiniz yere yazın.
4. `npm run check` ile denetleyin.
