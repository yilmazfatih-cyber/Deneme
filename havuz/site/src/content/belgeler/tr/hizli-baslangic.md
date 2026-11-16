---
title: Hızlı başlangıç
description: Siteyi bilgisayarınızda beş dakikada çalıştırın, ilk değişikliğinizi yapın ve yayına hazır dosyaları üretin.
group: Başlangıç
order: 10
translationKey: hizli-baslangic
---

Bu site temeli, yazılım bilgisi gerektirmeden kendi sitenizi yayınlamanız için hazırlandı. Siteyi kişiselleştirmek için **tek bir ayar dosyasını** ve `src/content/` altındaki içerik dosyalarını değiştirmeniz yeterli.

## Gerekenler

- [Node.js](https://nodejs.org/) 22.23.4 ya da daha yeni bir sürüm. Sürümünüzü öğrenmek için terminalde `node --version` yazın.
- Bir metin düzenleyici (ör. Visual Studio Code).

## Kurulum

Klasörün içinde bir terminal açıp şu komutları sırayla çalıştırın:

```bash title="Terminal"
npm ci
npm run dev
```

İlk komut gerekli paketleri kilit dosyasındaki sürümlerle kurar (bir kez yeterli). İkinci komut geliştirme sunucusunu başlatır. Tarayıcınızda **http://localhost:4410/** adresini açın.

> [!TIP]
> Geliştirme sunucusu açıkken bir dosyayı kaydettiğinizde sayfa kendiliğinden yenilenir. Durdurmak için terminalde `Ctrl+C` tuşlarına basın.

## İlk değişiklik

`src/site.config.ts` dosyasını açın ve `name: 'Sedir'` satırındaki adı kendi markanızla değiştirin. Kaydedin; başlıkta, alt bilgide ve sekme başlığında yeni adı görürsünüz.

## Yayına hazır dosyalar

```bash title="Terminal"
npm run build
npm run preview
```

`npm run build` bütün sayfaları `dist/` klasörüne üretir: paylaşım görselleri, site haritası, RSS ve arama dizini dâhil. `npm run preview` bu klasörü **http://localhost:4411/** adresinde gösterir. Site içi arama yalnız bu derlenmiş sürümde çalışır.

## Her şey yolunda mı?

```bash title="Terminal"
npm run check
```

Bu komut tür denetimini, kod kurallarını, birim testlerini çalıştırır; ardından siteyi iki kez (kök adreste ve bir alt klasörde) derleyip her sayfayı denetler. Bir sorun varsa hangi dosyada neyin yanlış olduğunu Türkçe olarak yazar.
