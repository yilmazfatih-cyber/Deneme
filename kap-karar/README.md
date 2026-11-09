# KAP Karar — bildirimleri karar ağacına dönüştüren yerel veritabanı

Bir KAP bildirimi ya da ekonomi haberi verildiğinde: **türünü bulur**, o türün **karar ağacında yürütür**
(hangi soruda hangi dala sapıldı, hangi sonuca varıldı, ne izlenecek), **veritabanındaki benzer geçmiş
olayları** gösterir ve olayı **diğer olaylara bağlar** (enflasyon verisi → PPK kararı → banka bilançosu gibi).

> Yatırım tavsiyesi değildir. Ağaçlar haberi okuma düzenidir; sonuçlar "olumlu / olumsuz / karışık / nötr"
> eğilim ve "ne yapılır, ne izlenir" notudur. Sayısal eşikler (ör. temettü verimi %6) tartışmaya açık varsayımlardır.

## Kurulum ve ilk çalıştırma

```bash
cd kap-karar
python3 -m kap_karar kur            # veri/*.json + yatirim-ajani/bilgi_kaynak → veri/kap_karar.sqlite
python3 -m kap_karar ozet
```

Bağımlılık yok (yalnız standart kütüphane, Python ≥ 3.11). Testler: `pip install pytest && python3 -m pytest -q`.

## Kullanım

```bash
# Haber metni ver, ağacı ve kararı al
python3 -m kap_karar analiz "TCMB politika faizini 100 baz puan indirerek yüzde 37'den yüzde 36'ya çekti; karar beklentilerle uyumlu, kurul temkinli." --agac

# Eksik parametreyi elle tamamla, hisseyi belirt, veritabanına kaydet ve bağla
python3 -m kap_karar analiz "Pay başına brüt 6,83 TL nakit temettü ..." --hisse KCHOL --param fiyat_tl=250 --param dagitim_orani=55 --kaydet --tarih 2026-02-19

# Ağaçları incele
python3 -m kap_karar agaclar
python3 -m kap_karar agac bedelli_sermaye_artirimi

# Veritabanında gez
python3 -m kap_karar olaylar --baslangic 2026-09-01 --tur piyasa_guven_sorusturma
python3 -m kap_karar olay 2026-09-17-spk-131-fon-tasfiye --esik 0.45     # karar + gelen/giden bağlar
python3 -m kap_karar zincir 2026-02-28-iran-savasi --derinlik 3          # olaydan ileriye bağ zinciri
python3 -m kap_karar disa-aktar --baslangic 2025-11-01 > olaylar.md      # Markdown tablo (--json ile JSON)
python3 -m kap_karar ekle --json yeni_olaylar.json                       # veri/*.json ile aynı biçim
```

`analiz` metinden çıkaramadığı parametreleri **"Eksik parametreler"** satırında listeler; `--param anahtar=deger`
ile verince karar netleşir ve güven puanı yükselir.

## Ağaçlar (33)

| Kapsam | Türler |
| --- | --- |
| Şirket (KAP) | `temettu`, `bedelli_sermaye_artirimi`, `bedelsiz_sermaye_artirimi`, `pay_geri_alim`, `birlesme_devralma`, `yeni_sozlesme`, `ihale`, `finansal_rapor`, `kredi_derecelendirme_sirket`, `ortaklik_yapisi`, `borclanma_araci`, `halka_arz`, `yonetim_degisikligi`, `dava_yaptirim`, `varlik_islemi`, `tesvik_belgesi`, `piyasa_hareketi` |
| Yerel makro | `tcmb_faiz_karari`, `tcmb_enflasyon_raporu`, `enflasyon_verisi`, `kredi_notu_ulke`, `siyasi_belirsizlik`, `piyasa_guven_sorusturma`, `endeks_saglayici_karari`, `kur_hareketi`, `buyume_verisi`, `maliye_butce_ovp`, `enerji_fiyat_duzenlemesi`, `sektor_duzenlemesi`, `genel_haber` |
| Küresel | `jeopolitik_sok`, `fed_karari`, `kuresel_ticaret` |

Her ağaç `kap_karar/agaclar.py` içinde tek bir sözlüktür: sorular (`anahtar` = parametre, `dallar` = koşul → sonraki
düğüm) ve yapraklar (`sonuc`, `egilim`, `eylem`, `gerekce`, `izlenecek`, `etkilenen`). Yeni ağaç eklemek için
sözlüğe bir giriş ve `sinif.py` içindeki `KURALLAR` listesine anahtar kelimeler yeter; `tum_agaclari_dogrula()`
kopuk dal ve erişilemeyen düğümleri yakalar.

## Veritabanı (`veri/kap_karar.sqlite`)

| Tablo | İçerik |
| --- | --- |
| `olaylar` | kod, tarih, kaynak (kap/gundem/makro/kuresel), kapsam, tür, hisse, sektör, başlık, özet, yön, parametreler (JSON), etiketler, kaynak URL'leri, güven |
| `agaclar` | 33 ağacın tanımı (JSON) |
| `kararlar` | her olayın ağaçta izlediği yol, sonuç kodu, eğilim, eylem, izlenecekler, eksik parametreler, güven |
| `baglar` | kaynak → hedef olay, ilişki (`tetikler`, `girdi`, `guclendirir`, `zayiflatir`, `ardil`, `ayni_tema`, `aciklar`), açıklama, ağırlık, elle/otomatik |

Bağlar iki yoldan kurulur: JSON'daki `bagli` alanı (elle, ağırlık 0.9) ve `baglar.py` kuralları (tür çifti +
zaman penceresi, ör. `enflasyon_verisi → tcmb_faiz_karari ≤ 45 gün`; makro → şirket sektör kanalı; aynı hissede
ardışık olaylar; ortak etiket). `kur` ve `--kaydet` sonrası otomatik bağlar yeniden hesaplanır.

## Veri kapsamı (Kasım 2026 itibarıyla)

- `veri/makro_2025_2026.json` — Ekim 2025 → Kasım 2026 arası 59 makro/gündem olayı: tüm PPK kararları, aylık TÜFE
  verileri, Enflasyon Raporu revizyonları, Fitch/Moody's/S&P kararları, Fed kararları, İran savaşı ve Hürmüz
  kronolojisi (28 Şub, 4 Mar, 8 Nis, 20 Haz 2026), elektrik/doğalgaz zammı, ÖTV kararları, KKM'nin sonu, 2027–29 OVP,
  2Ç26 büyüme, fon soruşturması (19 Ağu → 17 Eyl → 14 Eki → 4 Kas), MSCI askıya alma, rezerv erimesi. Her olayda kaynak
  URL'si ve güven derecesi var; `guven ≤ 0.5` olanlar ikincil kaynaklı veya yaklaşık değer içerir.
- `veri/kap_sirket_2025_2026.json` — 15 şirket olayı (ASELS, KCHOL, TUPRS, ISCTR, HALKB, TKFEN, MEGMT, MERCN):
  sözleşme, temettü, bilanço, not artışı, ikincil halka arz, pay devri, bedelsiz. **KAP'ın tamamı değil**, örnek kümedir.
- `veri/kap_sirket_2026_ek.json` — 21 şirket olayı daha: Aselsan'ın Haziran–Kasım 2026 sözleşmeleri (1,1 milyar $ hava
  savunma dahil), Akçansa'da Heidelberg devri ve zorunlu pay alım teklifi, Peker GYO'da Tera'nın ertelenen çağrısı,
  THY 737 MAX siparişi, Koç'un Tüpraş blok satışı, Garanti/Turkcell/Akfen GYO geri alımları, Şekerbank/Karsu/CVK
  bedellileri, Akbank/Garanti/İş Bankası 3Ç26 bilançoları.
- `../yatirim-ajani/bilgi_kaynak/*.json` — ~800 fiyat hareketi ve anlatılı makro olay (Kas 2024 → Kas 2026),
  `piyasa_hareketi` ve ilgili makro ağaçlara eşlenerek içe aktarılır (kod öneki `YA-`).

**Sınır:** KAP sitesi (kap.org.tr) bulut ortamının ağ geçidinde engelli; tüm bildirimler otomatik çekilemedi.
KAP'a erişebilen bir bilgisayarda:

```bash
python3 scripts/kap_cek.py --baslangic 2025-11-08 --bitis 2026-11-08      # haftalık dilimlerle sorgular
python3 -m kap_karar ekle --json veri/kap_bildirimleri_2025-11-08_2026-11-08.json
```

KAP'ın API'si değişirse sitenin "Bildirim Sorgu" sayfasından dışa aktarılan dosya `--ham-dosya` ile verilir.
Tek haber için `analiz --kaydet` yeterlidir.
