# Sistematik hata ayıklama

## Ne zaman

Hata, başarısız test, beklenmeyen davranış ya da performans sorunu görüldüğünde; düzeltme önermeden önce.

## Adımlar

1. **Yeniden üret.** En kısa yeniden üretme yolunu yaz ve mümkünse başarısız bir teste çevir: {{TEK_TEST}}.
2. **Kanıt topla.** Hata mesajını ve yığın izini sonuna kadar oku. Son değişikliklere bak: `git log -p -5 -- <dosya>`
   ve `git diff`.
3. **Daralt.** Girdiyi küçült, iyi ve kötü sürüm arasında ikiye bölerek ara (`git bisect`), sınırlara geçici günlük
   ekle. Bu yığında araçlar: {{HATA_ARACLARI}}.
4. **Tek hipotez.** "Hata X'tir çünkü Y" diye yaz ve tek bir değişiklikle sına. Aynı anda birkaç şeyi değiştirme.
5. **Kök nedeni düzelt.** Belirtiyi değil nedeni düzelt. 1. adımdaki test yeşile dönmeli, {{TEST}} yeşil kalmalı.
6. **Temizle.** Geçici günlükleri kaldır; kök nedeni commit mesajına bir cümleyle yaz.

## Dur ve sor

- Üç düzeltme denemesi başarısız olduysa sorun büyük ihtimalle tasarımdadır: insana danış.
- Hata üretim ortamındaysa ya da veri kaybı riski varsa önce insana haber ver.

## Yapma

- "Belki bu düzeltir" diye rastgele değişiklik.
- Başarısız testi atlamak, susturmak ya da hatayı yakalayıp yutmak.
