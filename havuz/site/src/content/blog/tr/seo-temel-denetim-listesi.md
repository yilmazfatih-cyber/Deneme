---
title: 'SEO temel denetim listesi: yayına almadan önce 12 madde'
description: Yeni bir siteyi yayına almadan önce bakılacak 12 temel SEO maddesi; başlık ve açıklamadan site haritasına, hızdan yapısal veriye kadar.
date: 2026-11-12
tags: [SEO]
author: elif-aydin
cover: ./gorseller/seo-kapak.png
coverAlt: Arama sonuçlarını andıran üç kart ve yanında dört maddesi işaretlenmiş bir denetim listesi.
---

Arama motoru optimizasyonu (SEO) çoğu zaman gizemli bir iş gibi anlatılır. Oysa küçük bir sitenin arama sonuçlarında görünmesini engelleyen sorunların büyük bölümü birkaç basit maddeye dayanır. Aşağıdaki listeyi her yeni sayfada, yayından önce bir kez gözden geçirin.

> [!TIP]
> Bu sitenin temeli, listedeki maddelerin çoğunu her derlemede kendisi denetler: `npm run check` komutu başlık, açıklama, canonical, paylaşım etiketleri, görsel alt metni ve kırık bağlantı sorunlarını tek tek raporlar.

## 1. Her sayfanın kendine özgü bir başlığı olsun

`<title>` etiketi arama sonucundaki mavi bağlantıdır. Her sayfada farklı olmalı ve sayfanın konusunu ilk sözcüklerde söylemelidir. Uzunluk için kabaca 50–60 karakter iyi bir hedeftir; daha uzunu kesilerek gösterilir.

## 2. Açıklama yazın: 50–160 karakter

Meta açıklaması sıralamayı doğrudan etkilemez ama tıklanma oranını etkiler. Ziyaretçiye sayfada ne bulacağını tek cümleyle söyleyin.

| Öğe             | Önerilen uzunluk | Nerede görünür               |
| --------------- | ---------------- | ---------------------------- |
| Başlık (title)  | 50–60 karakter   | Arama sonucu, tarayıcı sekmesi |
| Açıklama        | 50–160 karakter  | Arama sonucunun alt satırı   |
| Sayfa başlığı (h1) | Sayfada bir tane | Sayfanın en üstü          |

## 3. Sayfada tek bir h1 olsun

Ana başlık (`h1`) sayfanın konusunu söyler. Birden çok h1, hem ekran okuyucu kullananları hem de arama motorlarını şaşırtır. Alt bölümler için `h2` ve `h3` kullanın, düzeyleri atlamayın.

## 4. Canonical adres verin

Aynı içerik birden çok adresten açılabiliyorsa (sonda eğik çizgili ve çizgisiz, `www`'li ve `www`'siz) arama motoru hangisini göstereceğini bilemez. Her sayfa kendi asıl adresini bildirmelidir:

```html title="Sayfanın <head> bölümü"
<link rel="canonical" href="https://www.ornek.com/blog/seo-temel-denetim-listesi/" />
```

## 5. Paylaşım kartlarını unutmayın

Bağlantınız WhatsApp'ta, LinkedIn'de ya da X'te paylaşıldığında görünen kart Open Graph etiketlerinden gelir: `og:title`, `og:description`, `og:image`. Görsel 1200×630 piksel olmalıdır. Bu temel her sayfa için bu görseli derlemede kendisi üretir.

## 6. Görsellere alt metin yazın

Alt metin, görseli göremeyen biri için görselin yerini tutar. "Görsel1.jpg" değil, "Kuaför koltuğunda saçı kesilen müşteri" gibi ne gördüğünüzü anlatın. Yalnızca süs amaçlı görsellerde alt metni boş bırakın (`alt=""`).

## 7. Adresler kısa ve okunur olsun

`/blog/seo-temel-denetim-listesi/` adresi, `/blog/?p=1832` adresinden hem insanlar hem de arama motorları için daha anlamlıdır. Türkçe karakterleri adresten çıkarın: "çığ" yerine "cig". Bu temelin `npm run new` komutu bunu kendisi yapar.

## 8. Site haritası ve robots.txt hazır olsun

Site haritası (`sitemap-index.xml`) arama motoruna bütün sayfalarınızın listesini verir; `robots.txt` hangi sayfaların taranabileceğini söyler ve site haritasını gösterir.

```text title="robots.txt"
User-agent: *
Allow: /

Sitemap: https://www.ornek.com/sitemap-index.xml
```

## 9. Kırık bağlantı bırakmayın

Bulunamayan sayfalara giden bağlantılar hem ziyaretçiyi hem de tarayıcı botları yarı yolda bırakır. Bir sayfanın adresini değiştirdiyseniz eski adrese giden bağlantıları da güncelleyin.

## 10. Hızlı açılsın

Yavaş açılan sayfa, özellikle telefonda, ziyaretçiyi kaçırır. Görselleri küçültün, gereksiz betikleri kaldırın, yazı tiplerini kendi sunucunuzdan sunun. Ayrıntılar için hız bütçeleri yazımıza bakabilirsiniz.

## 11. Yapısal veri ekleyin

Yapısal veri (JSON-LD), sayfanın bir blog yazısı mı, sık sorulan sorular listesi mi, bir şirket sayfası mı olduğunu makinenin anlayacağı biçimde söyler. Arama motorları bu bilgiyle zengin sonuçlar gösterebilir.

## 12. Search Console'a kaydolun

Google Search Console ve Bing Webmaster Tools ücretsizdir. Siteyi ekleyip site haritanızı gönderin; dizine eklenme sorunlarını ve hangi aramalarda göründüğünüzü buradan izlersiniz.

> [!NOTE]
> SEO bir kerelik bir iş değil, bir alışkanlıktır. Bu listeyi her yeni sayfada tekrar etmek, sonradan büyük bir temizlik yapmaktan çok daha kolaydır.
