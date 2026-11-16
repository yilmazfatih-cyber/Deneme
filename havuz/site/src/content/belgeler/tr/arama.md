---
title: Site içi arama
description: Site içi aramanın nasıl çalıştığı, hangi sayfaların arandığı, Türkçe karakter desteği ve bir bölümü aramadan çıkarma.
group: Özellikler
order: 120
---

Başlıktaki "Ara" düğmesi, `/` tuşu ya da `Ctrl+K` arama penceresini açar. Arama tamamen tarayıcıda çalışır; bir sunucuya ya da dış servise istek gitmez.

## Nasıl çalışır?

Derleme sırasında [Pagefind](https://pagefind.app/) bütün sayfaların metninden küçük parçalara bölünmüş bir dizin üretir (`dist/pagefind/`). Ziyaretçi arama penceresini ilk kez açtığında yalnız gereken parçalar yüklenir. Bu yüzden arama, sayfa açılışını yavaşlatmaz.

> [!IMPORTANT]
> Dizin derlemede üretildiği için arama `npm run dev` sırasında çalışmaz. Denemek için `npm run build` ve ardından `npm run preview` çalıştırın.

## Türkçe karakterler

Türkçe'de büyük/küçük harf dönüşümü ("İ/i", "I/ı") ve Türkçe klavyesi olmayan ziyaretçiler arama için iki sorundur. Bu yüzden metin dizine iki biçimde girer: özgün hâliyle ve Türkçe karakterleri sadeleştirilmiş hâliyle. Arama kutusuna yazılan sorgu da aynı biçimde sadeleştirilir. Sonuç olarak "IĞDIR", "ığdır" ve "igdir" aynı sonuçları bulur.

## Hangi sayfalar aranır?

Ana sayfa, blog yazıları, belgeler, serbest sayfalar ve iletişim sayfası aranır. Blog listesi, etiket sayfaları ve 404 sayfası aranmaz. Her sonuçta sayfanın başlığı, açıklaması ve bölümü ("Blog", "Belgeler") görünür.

Bir sayfa türünü aramaya eklemek ya da çıkarmak için görünüm dosyasında `BaseLayout`'a verilen `searchSection` değerini ekleyin ya da kaldırın.

## Bir bölümü aramadan çıkarmak

Menüler, içindekiler ve sayfalama aramaya girmez. Kendi eklediğiniz bir bölümü dışarıda tutmak için öğeye `data-search-ignore` özniteliğini ekleyin:

```html
<aside data-search-ignore>Bu kutu aramada çıkmaz.</aside>
```
