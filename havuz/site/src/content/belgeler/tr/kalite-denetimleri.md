---
title: Kalite denetimleri
description: npm run check, npm run e2e ve npm run shots komutlarının neyi denetlediği ve bir hata çıktığında ne yapılacağı.
group: Yayın ve kalite
order: 150
---

Siteyi yayınlamadan önce tek bir komut çalıştırın:

```bash title="Terminal"
npm run check
```

Komut sırasıyla şunları yapar ve ilk hatada durur:

| Adım | Ne denetler? |
| --- | --- |
| Tür denetimi (`astro check`) | Kodda ve içerik şemalarında tür hataları, eksik çeviri anahtarları |
| Kod kuralları (`eslint`) | Erişilebilirlik kuralları, Türkçe büyük/küçük harf yasağı, kullanılmayan kod |
| Biçim (`prettier`) | Dosyaların ortak biçime uyması (`npm run format` düzeltir) |
| Birim ve kural testleri (`vitest`) | Yardımcı işlevler, renk karşıtlığı, içerik kuralları, ayrılmış adresler |
| Site denetimi | Siteyi iki kez derler (kökte ve `/alt/klasor/` altında) ve her sayfayı denetler |

## Site denetiminin kuralları

Her sayfada: tek `h1`; doğru `lang`; başlık ve 50–160 karakterlik açıklama; canonical adres; Open Graph ve Twitter etiketleri; görsellerde alt metin ve boyut; geçerli yapısal veri (JSON-LD); yinelenmeyen `id` değerleri; kırık iç bağlantı ve çapa olmaması; karşılıklı `hreflang`; sayfa ağırlığı bütçesi (HTML 150 KB, CSS 60 KB, başlangıç betikleri 20 KB). Sitede: `robots.txt`, site haritası, RSS, 404 sayfası, simgeler ve arama dizini.

Hata iletisi, sorunun hangi dosyada olduğunu ve nasıl düzeltileceğini söyler:

```text
✗ 1 sorun:
  dist/blog/ornek/index.html
    [kirik-baglanti] a[href] "/belgeler/yok/" → hedef bulunamadı. Adresi düzeltin ya da sayfayı oluşturun.
```

## Tarayıcı testleri

```bash title="Terminal"
npm run e2e
```

Gerçek bir tarayıcıda (Chromium) üç ekran boyutunda (390×844, 360×800, 1280×800) menü, tema, arama, form, 404 ve dil değiştirme senaryolarını çalıştırır; her sayfayı açık ve koyu temada erişilebilirlik taramasından (axe) geçirir, dar ekranda yatay kaydırma olmadığını, sayfa yüklenirken düzenin kaymadığını (CLS) ve dış bir sunucuya istek gitmediğini denetler. Ayrıca aynı siteyi `/alt/klasor/` altında açıp form ve bülten gönderimini sahte bir uç noktayla sınar.

## Ekran görüntüleri

```bash title="Terminal"
npm run shots
```

Ana sayfa, blog, belge ve iletişim sayfalarının telefon ve masaüstü, açık ve koyu tema görüntülerini `docs/ekran/` klasörüne kaydeder. Tasarım değişikliklerini gözle karşılaştırmak için kullanın.
