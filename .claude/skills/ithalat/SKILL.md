---
name: ithalat
description: İthalat ajanını (ithalat-ajani/ klasörü) çalıştırır. Alibaba'da Türkiye'de satılabilecek hazır giyim ve aksesuar arar, tüm masraflarla birim maliyeti hesaplar, Türkiye fiyatının üçte birinin altında kalanları ve indirimdekileri raporlar. "/ithalat", "/ithalat eşarp", "/ithalat hesapla esarp-sal 2.8$ 0.06kg 599TL" gibi.
---

# /ithalat [kategori | ürün fikri | hesapla …]

Depo kökünden çalışır; komutları `cd ithalat-ajani &&` ile çalıştır. Paket kurulu değilse önce
`python3 -m pip install -e ithalat-ajani -q`.

- **Argümansız:** `ithalat-ajani/TARAMA.md` akışını 3 kategoriyle uygula.
- **Kategori ya da ürün fikri:** `python -m ithalat_ajani kategoriler` tablosundan en yakın kategoriyi seç ve
  TARAMA.md akışını yalnız o kategoriyle uygula.
- **`hesapla …`:** sayıları ayrıştır ve tek ürün hesabı yap:
  `python -m ithalat_ajani hesapla --kategori <anahtar> --fiyat-usd <$> --agirlik-kg <kg> --tr-fiyat <TL> [--tr-fiyat <TL> …] [--moq N] [--indirimsiz-usd <$>]`.
  Çıktıyı özetle: birim maliyet, kat, karar, doğrulanacaklar.

Elle çalıştırmada `ithalat-ciktilari` dalına push ve Issue açma yalnız kullanıcı isterse yapılır. İstemezse raporun
özetini sohbete yaz ve rapor dosyasının yolunu ver.
