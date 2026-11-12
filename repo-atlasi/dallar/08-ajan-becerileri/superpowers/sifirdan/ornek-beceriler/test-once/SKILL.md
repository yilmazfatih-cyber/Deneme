---
name: test-once
description: Bir özellik ya da hata düzeltmesi kodlarken, uygulama kodunu yazmadan önce kullan.
---

# Test önce

Bu beceri D08 dalının öğretim örneğidir. Biçimi superpowers'ın disiplin becerilerine benzer:
kısa bir kural, sıralı adımlar ve kaçış gerekçeleri tablosu.

## Kural

Önce başarısız bir test yaz. Testi çalıştır, kırmızıyı gör; ancak ondan sonra en küçük uygulamayı yaz.

## Adımlar

1. İstenen davranışı tek bir iddiayla anlatan bir test yaz.
2. Testi çalıştır. "Kaldı" görmediysen test yanlış şeyi ölçüyordur; düzelt.
3. Testi geçirecek en küçük kodu yaz.
4. Testleri çalıştırıp çıktıyı göster. Kanıt göstermeden bitti deme.
5. Yalnızca görevin dosyalarına dokun; yandaki kodu "iyileştirme", gördüğün sorunu not et.

## Kaçış gerekçeleri

| Düşünce                          | Gerçek                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------- |
| "Çok basit, testi sonra yazarım" | Sonradan yazılan test kodun ne yaptığını onaylar, ne yapması gerektiğini değil. |
| "Elle denedim, çalışıyor"        | Elle deneme tekrarlanmaz; test her değişiklikte yeniden koşar.                  |
| "Şu fonksiyonu da toparlayayım"  | Görev dışı değişiklik incelemeyi zorlaştırır ve hata riskini büyütür.           |
