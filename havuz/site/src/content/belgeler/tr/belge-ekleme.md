---
title: Belge ekleme
description: Belgeler bölümüne yeni sayfa ekleme; yan menüdeki sıra (order) ve grup (group) alanlarının kullanımı.
group: İçerik
order: 50
---

Belgeler bölümü, okuduğunuz bu kılavuz gibi yan menülü, sıralı sayfalardan oluşur. Her belge `src/content/belgeler/<dil>/` altında bir Markdown dosyasıdır.

## Üreteçle yeni belge

```bash title="Terminal"
npm run new -- belge "Randevu kuralları"
```

Üreteç, belgeyi son grubun sonuna ekler: `order` değerini en büyük değerin 10 fazlası yapar.

## Sıra ve gruplar

```md title="src/content/belgeler/tr/randevu-kurallari.md"
---
title: Randevu kuralları
description: İptal, erteleme ve kapora kurallarının nasıl ayarlanacağı ve müşterilere nasıl gösterileceği.
group: Kullanım
order: 160
---
```

- **`order`**: Yan menüdeki sıra. Küçük olan önce gelir. Değerleri 10, 20, 30 diye aralıklı verin; araya yeni belge eklemek kolaylaşır.
- **`group`**: Yan menüdeki başlık. Aynı grup adını taşıyan belgeler aynı başlık altında toplanır. Grupların sırası, içindeki ilk belgenin sırasıdır.

Önceki/Sonraki bağlantıları ve sayfa içindekiler listesi kendiliğinden oluşur. İçindekiler, belgedeki `##` ve `###` başlıklarından üretilir.

> [!TIP]
> Bir belgeyi geçici olarak gizlemek için ön bilgisine `draft: true` ekleyin. Belge geliştirme sunucusunda görünmeye devam eder ama yayınlanan siteye girmez.
