# Başvuru verileri: ne var, nasıl doğrulandı, ne neden yok

Kural: veri ancak üç yoldan biriyle doğrulanırsa `tr/`ye girer — (a) algoritmayla üretilen/denetlenen,
(b) yeniden dağıtıma izin veren en az bir bağımsız kaynakla karşılaştırılan, (c) kapalı ve kesin
bilinen küme. Her tablonun ayrıntılı kaydı `tr/<ad>.meta.json`dadır; bu belge özetidir.
Yeniden karşılaştırma: `python scripts/verify_reference.py` (ağ ister; kitaplık denetimleri için
`.[dogrulama]` ekstrası). Son çalıştırma: 2026-11-16, "tüm karşılaştırmalar uyumlu (bilinen farklar hariç)".

## Var olanlar

| Tablo | Doğrulama | Kaynaklar | Bilinen farklar ve kararlar |
| --- | --- | --- | --- |
| `iller` | çapraz kaynak | turkiye-api (MIT), Memleketim/HF (MIT), turkey-neighbourhoods (MIT), enisbt (MIT), pycountry, phonenumbers | turkiye-api Çankırı'yı Marmara, Hakkari'yi Güneydoğu yazıyor (yanlış); "Hakkari" yazımı kullanıldı, "Hakkâri" `diger_adlar`da |
| `ilceler` | çapraz kaynak | turkiye-api (veri), turkey-neighbourhoods ve Memleketim (harfi harfine aynı) | turkey-location-data'da 2, enisbt'de 6 yazım/eksik farkı (o kaynakların hatası) |
| `aylar`, `gunler` | çapraz kaynak | Unicode CLDR (babel) | — |
| `alfabe`, `sayi_sozcukleri` | bilinen küme | — | sayı sözcükleri `numwords.py` ile gidiş-dönüş testli; num2words kitaplığı başvuru alınmadı (841235 için yanlış çıktı veriyor) |
| `resmi_tatiller` | çapraz kaynak | holidays (MIT) | yalnız sabit tarihliler; 28 Ekim yarım gün |
| `para_birimleri` | çapraz kaynak | datasets/currency-codes, pycountry, CLDR | BGN 2026-01'de geri çekildiği için yok; IRR/IQD küsuratı ISO değeri |
| `durak_sozcukler` | çapraz kaynak | spaCy, stopwords-iso | tasarım seçimi; "hala" bilerek yok |
| `banka_kodlari` | çapraz kaynak | schwifty | yalnız 12 büyük banka |
| `adlar`, `soyadlar` | bilinen küme (derleyen bilgisi) | — | istatistik DEĞİL; bağımsız kaynakla doğrulanamadı → güven "orta" |
| kalıp tabloları | tasarım | — | olgu iddiası yok (adres, sektör, ürün, marka, destek kalıpları) |

## Bilerek DIŞARIDA bırakılanlar

| Veri | Neden yok | Ne yapılabilir |
| --- | --- | --- |
| Ramazan ve Kurban Bayramı tarihleri | Hicrî takvime bağlı, her yıl ~11 gün geri gelir ve Diyanet/Resmî Gazete ilanıyla kesinleşir; hesapla üretilen tarih bir gün yanılabilir. Arife yarım günleri ve "köprü" idari izinleri de yıllık kararla belirlenir. | Gerekirse resmî ilandan yıllık elle girilen ayrı bir tablo (`.meta.json`da ilan kaynağıyla) |
| Mahalle listesi ve gerçek posta kodları | ~73 bin satır; PTT kaynağının yeniden dağıtım koşulu denetlenmedi; sık değişir | Yalnız "ilk iki hane = plaka" kuralı var (`geo.is_postal_code`) |
| Nüfus, yüz ölçümü, rakım, koordinat | Yıllık değişir; TÜİK/HGM verisinin yeniden dağıtım koşulları denetlenmedi; koordinatta kaynaklar ayrışıyor | Kaynağıyla tarihli ayrı tablo |
| GSM operatör önekleri | Numara taşınabilirliği nedeniyle önek operatörü göstermez; doğrulanmış kaynak yok | — |
| Tam banka listesi (katılım bankaları dahil) | Resmî listeye (BKM/TCMB) erişilemedi | `banka_kodlari` genişletilebilir (kaynakla) |
| KDV oranları | Kararla değişebilir; resmî metin okunamadı | Yalnız üreteç ayarında varsayılan (`sentetik/config.py`) |
| İBBS (NUTS) bölgeleri | Doğrulanmadı | — |

## Bilinen kurallar (kodda)

- Posta kodu 5 hanedir ve ilk iki hanesi plakadır: turkey-neighbourhoods'taki 73.305 mahalle kaydının
  tamamında doğrulandı (`geo.is_postal_code`, `geo.postal_code_matches_province`).
- Sabit hat alan kodu ↔ il: 82 kod, üç kaynakla doğrulandı (`geo.province_of_area_code`).
- 51 ilde "Merkez" adlı ilçe var; 30 büyükşehirde yok (test korur).
