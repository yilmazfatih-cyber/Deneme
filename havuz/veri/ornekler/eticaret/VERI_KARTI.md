# Veri kartı: eticaret

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

İlişkisel e-ticaret: müşteri → sipariş → kalem → iade (+ ürünler).

## Üretim

- Komut: `python -m verihavuzu uret eticaret --adet 300 --tohum 42 --sema --cikti ornekler/eticaret`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `iadeler.csv` | 176 | 12034 |
| `iadeler.sema.json` | - | 1089 |
| `musteriler.csv` | 300 | 49055 |
| `musteriler.sema.json` | - | 1866 |
| `siparis_kalemleri.csv` | 4330 | 217883 |
| `siparis_kalemleri.sema.json` | - | 1029 |
| `siparisler.csv` | 2643 | 299607 |
| `siparisler.sema.json` | - | 1783 |
| `urunler.csv` | 120 | 10477 |
| `urunler.sema.json` | - | 1379 |

## Bilinen yapı ve doğru cevaplar

- siparisler.ara_toplam = Σ siparis_kalemleri.tutar; toplam = ara_toplam + kargo_ucreti.
- Kampanya günlerinde sipariş sayısı belirgin yüksektir (Kasım kampanyası ×4).
- Ürün popülerliği Zipf dağılımlıdır (populerlik_sirasi 1 en çok satan).
- Haftalık desen: Cumartesi en yoğun gün; aylık desen: Kasım–Aralık en yoğun aylar.
- İade yalnız teslim edilmiş siparişte olur; iade_tarihi > teslim_tarihi.

## Sütunlar

### iadeler

İadeler (kalem düzeyinde).

Birincil anahtar: `iade_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `iade_id` | metin | evet | benzersiz; desen `^IA\d{6}$` |  |
| `siparis_id` | metin | evet | desen `^SP\d{7}$` |  |
| `kalem_id` | metin | evet | benzersiz; desen `^KL\d{8}$` |  |
| `iade_tarihi` | tarih | evet |  |  |
| `adet` | tam sayı | evet | [1, ∞] |  |
| `tutar` | ondalık | evet | [0, ∞] |  |
| `neden` | metin | evet | değerler: beden uymadı, hasarlı ürün, beklentiyi karşılamadı, yanlış ürün, vazgeçtim |  |

### musteriler

Uydurma müşteriler (kişi alanları + kayıt tarihi).

Birincil anahtar: `musteri_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `musteri_id` | metin | evet | benzersiz; desen `^M\d{6}$` |  |
| `ad` | metin | evet |  |  |
| `soyad` | metin | evet |  |  |
| `cinsiyet` | metin | evet | değerler: K, E | K: kadın, E: erkek |
| `dogum_tarihi` | tarih | evet | 1930-01-01 – 2026-01-01 |  |
| `tckn` | metin | evet | benzersiz; T.C. kimlik numarası (11 hane, sağlamalı) | uydurma |
| `telefon` | metin | evet | cep telefonu numarası (+905 ile, 13 karakter) | uydurma cep numarası |
| `eposta` | metin | evet | benzersiz; e-posta adresi |  |
| `il` | metin | evet | il adı |  |
| `ilce` | metin | evet |  |  |
| `plaka` | tam sayı | evet | [1, 81] |  |
| `posta_kodu` | metin | evet | posta kodu (5 hane, ilk ikisi plaka kodu) |  |
| `adres` | metin | evet |  | uydurma açık adres (mahalle, cadde/sokak, no) |
| `kayit_tarihi` | tarih | evet |  |  |

### siparis_kalemleri

Sipariş kalemleri.

Birincil anahtar: `kalem_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `kalem_id` | metin | evet | benzersiz; desen `^KL\d{8}$` |  |
| `siparis_id` | metin | evet | desen `^SP\d{7}$` |  |
| `urun_id` | metin | evet | desen `^U\d{4}$` |  |
| `adet` | tam sayı | evet | [1, ∞] |  |
| `liste_fiyati` | ondalık | evet | [0, ∞] |  |
| `birim_fiyat` | ondalık | evet | [0, ∞] | indirimli satış fiyatı |
| `tutar` | ondalık | evet | [0, ∞] | birim_fiyat × adet |

### siparisler

Siparişler. Tutarlar TL, KDV dahil.

Birincil anahtar: `siparis_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `siparis_id` | metin | evet | benzersiz; desen `^SP\d{7}$` |  |
| `musteri_id` | metin | evet | desen `^M\d{6}$` |  |
| `siparis_zamani` | zaman | evet |  |  |
| `kanal` | metin | evet | değerler: mobil_uygulama, web |  |
| `odeme_yontemi` | metin | evet | değerler: kredi_karti, banka_karti, havale_eft, kapida_odeme |  |
| `kampanya` | metin | hayır |  | kampanya adı ya da boş |
| `ara_toplam` | ondalık | evet | [0, ∞] |  |
| `indirim` | ondalık | evet | [0, ∞] | liste fiyatına göre indirim |
| `kargo_ucreti` | ondalık | evet | [0, ∞] |  |
| `toplam` | ondalık | evet | [0, ∞] |  |
| `durum` | metin | evet | değerler: teslim_edildi, iptal, iade_edildi, kismi_iade |  |
| `teslim_tarihi` | tarih | hayır |  |  |

### urunler

Kurgusal ürün kataloğu (fiyatlar piyasa verisi değildir).

Birincil anahtar: `urun_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `urun_id` | metin | evet | benzersiz; desen `^U\d{4}$` |  |
| `urun_adi` | metin | evet |  |  |
| `marka` | metin | evet |  |  |
| `kategori` | metin | evet |  |  |
| `alt_kategori` | metin | evet |  |  |
| `fiyat` | ondalık | evet | [0.01, ∞] | KDV dahil etiket fiyatı (TL) |
| `kdv_grubu` | metin | evet | değerler: dusuk, indirimli, genel |  |
| `kdv_orani` | tam sayı | evet | [0, 100] | yüzde |
| `stok` | tam sayı | evet | [0, ∞] |  |
| `populerlik_sirasi` | tam sayı | evet | benzersiz; [1, ∞] |  |
| `aktif` | mantıksal | evet |  |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
