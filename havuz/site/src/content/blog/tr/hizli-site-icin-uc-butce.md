---
title: 'Hızlı bir site için üç bütçe: görsel, yazı tipi, betik'
description: Sayfa ağırlığını görsel, yazı tipi ve betik olarak üç kalemde düşünmek; her biri için ölçülebilir bir sınır ve o sınırı korumanın yolları.
date: 2026-10-05
tags: [Performans, SEO]
author: elif-aydin
cover: ./gorseller/hiz-kapak.png
coverAlt: Farklı uzunlukta üç yatay çubuk ve hepsini aynı noktada kesen kesikli bir sınır çizgisi.
---

Bir sitenin hızı bir kez ayarlanıp unutulan bir şey değildir. Her yeni görsel, her yeni yazı tipi, her "küçük" betik sayfayı biraz daha ağırlaştırır. Bunu önlemenin en kolay yolu, ağırlığı bir bütçe gibi düşünmektir: her kalemin bir sınırı vardır ve sınır aşıldığında birisi uyarılır.

Bu sitenin temeli üç bütçe kullanır ve her derlemede bunları denetler.

| Kalem              | Sınır (sayfa başına, sıkıştırılmamış) | Neden önemli?                         |
| ------------------ | ------------------------------------- | ------------------------------------- |
| HTML               | 150 KB                                | İlk boyamayı geciktirir               |
| CSS                | 60 KB                                 | Sayfa, CSS yüklenmeden çizilmez       |
| Başlangıç betikleri | 20 KB                                | Telefonda işlemciyi meşgul eder       |

## Görsel bütçesi

Görseller çoğu sitede ağırlığın büyük bölümünü oluşturur. Üç kural işin çoğunu çözer:

1. **Doğru biçim:** Fotoğraflar için AVIF ya da WebP, logolar ve simgeler için SVG.
2. **Doğru boyut:** 400 piksel genişliğinde gösterilecek görsele 4000 piksellik dosya göndermeyin. Ekran genişliğine göre farklı boyutlar sunun (`srcset`).
3. **Boyut bilgisi:** Her `<img>` etiketinde `width` ve `height` bulunsun. Tarayıcı yeri önceden ayırır, görsel yüklenince sayfa kaymaz.

> [!TIP]
> Bu temelde görselleri `src/content/` altına koymanız yeterli. Astro derlemede AVIF ve WebP sürümlerini, birden çok genişlikte kendisi üretir.

## Yazı tipi bütçesi

Güzel bir yazı tipi siteye kişilik katar ama her ağırlık ve her stil ayrı bir dosyadır. Şunlara dikkat edin:

- **Az aile, az ağırlık:** Bir gövde, en fazla bir başlık yazı tipi. Değişken (variable) yazı tipi kullanıyorsanız tek dosya bütün ağırlıkları taşır.
- **Alt kümeler:** Türkçe için hem `latin` hem `latin-ext` alt kümesi gerekir; "ğ", "ş" ve "İ" ikincisindedir. Kiril ya da Yunan alt kümelerini yüklemeyin.
- **Kendi sunucunuzdan sunun:** Dış bir yazı tipi servisine gitmek fazladan bağlantı süresi ve gizlilik sorunu demektir.
- **Önceden yükleyin:** İlk ekranda kullanılan dosyaları `<link rel="preload">` ile erkenden isteyin; `font-display: swap` metnin yazı tipi gelmeden görünmesini sağlar.

## Betik bütçesi

Bir menüyü açıp kapatmak için yüzlerce kilobaytlık bir çatı yüklemek, en sık yapılan hız hatasıdır. Bu sitede her sayfanın başlangıçta yüklediği betik birkaç kilobayttır:

- Menü, tema seçici ve arama düğmesi küçük, bağımlılıksız betiklerdir.
- Arama motorunun asıl dosyaları yalnız arama penceresi açıldığında yüklenir.
- Kod renklendirme derleme sırasında yapılır; tarayıcıya hazır HTML gider.

```bash title="Bütçeleri denetlemek"
npm run check
```

Bütçe aşılırsa denetim hangi sayfanın hangi kalemde ne kadar aştığını söyler. Böylece sorun, kullanıcılar fark etmeden önce yakalanır.

## Ölçün, tahmin etmeyin

Gerçek kullanıcıların deneyimini görmek için tarayıcının geliştirici araçlarındaki Lighthouse raporunu ve Search Console'daki Core Web Vitals bölümünü düzenli aralıklarla açın. Rakamlar kötüleşmeye başladıysa son eklediğiniz şeyden başlayarak geriye doğru bakın.
