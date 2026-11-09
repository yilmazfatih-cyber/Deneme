# MIMARI.md — strateji mimarisi: KAP olayı → ajan (haneler) → Py botu (dallanma) → emir

Sanal hesap içindir; yatırım tavsiyesi değildir. Emirleri kullanıcı Midas'ta kendisi girer.

## 1. Akış

```
KAP bildirimi / haber            (rutin 09:36 · 16:26 · 20:26, WebSearch)
        │  ajan okur
        ▼
HANELER (KapHane JSON)           tür=yatırım · tutar=20.000.000 · para_birimi=USD · süre=18 ay · yön · güven
        │  zenginleştir (hisse dosyası satırı, kur, piyasa değeri, satış, özkaynak)
        ▼
TÜRETİLMİŞ HANELER               tutar_tl ≈ 1,0 mlr TL · PD'ye oran %0,19 · büyüklük = çok küçük
        │  Py botu tetiklenir (bot-olay)
        ▼
DALLANMA AĞACI                   Kök → Büyüme haberi → Önemsiz → İŞLEM YOK
        │  genel kapılar: portföy −%2 gün / −%15 zirve, istatistik kapısı, Tera hariç
        ▼
EMİR                             gün · saat penceresi · limit (fiyat adımı) · adet (ATR boyutu) · stop · hedef · en geç çıkış
        │  defter (ileriye dönük; geçmiş pencere reddedilir)
        ▼
GERÇEK ÇUBUKLARLA DOLUM → değerleme → karar günlüğü (bot_kararlari.jsonl) → istatistik → dalların "suyu"
```

## 2. Haneler (yatirim_ajani/mimari/haneler.py)

| Hane                                                        | Anlam                                                  | Kim doldurur   |
| ----------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| hisse, kamuya_acilma, tur, baslik, metin, kaynak            | kimlik; kamuya açılma anı saatli olmalı                | ajan / okuyucu |
| tutar, para_birimi                                          | ana tutar (yatırım, sözleşme, ihale, geri alım, ceza…) | ajan / okuyucu |
| oran                                                        | bedelsiz/bedelli/pay satışı/devralma oranı (0,01 = %1) | ajan / okuyucu |
| pay_basi_tl, islem_fiyati_tl                                | temettü pay başı brüt; satış/rüçhan fiyatı             | ajan / okuyucu |
| sure_ay, karsi_taraf, not_eski, not_yeni, net_kar, beklenti | ayrıntı                                                | ajan / okuyucu |
| yon, guven, okuyan                                          | olumlu/olumsuz/nötr; 0–1; regex veya ajan:model        | ajan / okuyucu |
| usdtry, kur, tutar_tl                                       | TL karşılığı (haber öncesi son satırın kuru)           | `zenginlestir` |
| piyasa_degeri_tl, pd_orani, satis_orani, ozkaynak_orani     | büyüklük ölçüleri                                      | `zenginlestir` |
| temettu_verimi, kar_surprizi, buyukluk                      | türev                                                  | `zenginlestir` |

Büyüklük sınıfı (tutar / piyasa değeri): < %0,25 çok küçük · < %1 küçük · < %3 orta · < %10 büyük · üstü çok büyük.

Okuyucu iki yollu: **ajan yolu** (rutin bildirimi okur, şemaya göre JSON yazar; asıl yol) ve **düzenli ifade yolu**
(`hane-oku`; "20 milyon ABD Doları", "7.000.000 USD", "%100 bedelsiz", "pay başına brüt 0,59952 TL", "B+'dan B'ye").

## 3. Dallanma ağacı (`python -m yatirim_ajani bot-agac`)

```
KÖK — Yeni KAP hanesi geldi
   Okuma güvensiz — hane güveni < 0,5  ⇒ IZLE [veri_kapisi]
   Hariç hisse — Tera hisseleri (kullanıcı kuralı)  ⇒ ISLEM_YOK [haric]
   Dosya yok — hissenin dosya satırı yok  ⇒ IZLE [veri_kapisi]
   Büyüme haberi — tür ∈ {yatırım, iş ilişkisi, ihale, yeni iş}
      Büyüklük ölçülemedi — tutar ya da piyasa değeri yok  ⇒ IZLE [olay_buyume]
      Önemsiz — tutar < piyasa değerinin %0,25'i  ⇒ ISLEM_YOK [olay_buyume]
      Fiyat kaçtı — haber sonrası ≥ +%6 ya da tavan  ⇒ IZLE [olay_buyume]
      Büyük — tutar ≥ PD'nin %3'ü
         Rejim destekli — XU100 MA200 üstü ya da hisse MA50 üstü  ⇒ AL [olay_buyume_buyuk] boyut×1.0, stop -5%, hedef +10%, 5g, sonraki_saat
         Rejim zayıf — aksi  ⇒ AL [olay_buyume_buyuk] boyut×0.5, stop -4%, hedef +8%, 3g, sonraki_saat
      Orta — PD'nin %1–3'ü
         Hacim teyidi — haber sonrası hacim ≥ 1,5× ve fiyat artıda  ⇒ AL [olay_buyume_orta] boyut×0.5, stop -3%, hedef +6%, 3g, sonraki_saat
         Teyit yok — aksi  ⇒ IZLE [olay_buyume_orta]
      Küçük — PD'nin %0,25–1'i  ⇒ IZLE [olay_buyume_kucuk]
   Satın alma/birleşme — tür = birleşme/devralma (şirket alan taraf)
      Büyük ve teyitli — bedel ≥ PD'nin %3'ü, haber sonrası hacim ≥ 1,5× ve fiyat artıda  ⇒ AL [satin_alma] boyut×0.5, stop -4%, hedef +8%, 5g, sonraki_saat
      Teyitsiz — aksi  ⇒ IZLE [satin_alma]
   Bedelsiz — tür = bedelsiz sermaye artırımı
      Yüksek oran — oran ≥ %100  ⇒ AL [bedelsiz_beklenti] boyut×0.5, stop -7%, hedef +15%, 20g, gun_sonu
      Düşük oran — aksi  ⇒ IZLE [bedelsiz_beklenti]
   Temettü — tür = kâr payı
      Yüksek verim — pay başı brüt / fiyat ≥ %5  ⇒ AL [temettu_yakalama]
      Düşük verim — aksi  ⇒ IZLE [temettu_yakalama]
   Geri alım — tür = pay geri alımı
      Anlamlı tutar — tutar ≥ PD'nin %1'i  ⇒ AL [geri_alim] boyut×0.5, stop -5%, hedef +8%, 20g, gun_sonu
      Sembolik — aksi  ⇒ IZLE [geri_alim]
   Arz baskısı — tür ∈ {pay satışı, bedelli}
      Elde var — portföyde pozisyon var  ⇒ SAT [arz_baskisi]
      Elde yok — aksi  ⇒ ISLEM_YOK [arz_baskisi]
   Risk haberi — tür = dava/ceza
      Büyük ve elde var — tutar ≥ özkaynağın %2'si ve pozisyon var  ⇒ SAT [risk_haberi]
      Diğer — aksi  ⇒ IZLE [risk_haberi]
   Derecelendirme — tür = kredi notu
      Düşürme, elde var — yön olumsuz ve pozisyon var  ⇒ SAT [derecelendirme]
      Diğer — aksi  ⇒ IZLE [derecelendirme]
   Bilanço — tür = finansal rapor
      Olumlu sürpriz — net kâr beklentiyi ≥ %20 aştı  ⇒ AL [pead] boyut×0.5, stop -5%, hedef +10%, 20g, gun_sonu
      Olumsuz sürpriz, elde var — beklentinin ≥ %20 altı ve pozisyon var  ⇒ SAT [pead]
      Sürpriz yok/bilinmiyor — aksi  ⇒ IZLE [pead]
   Diğer — kalan türler  ⇒ IZLE [diger]
```

Gezinti: koşulu doğru olan ilk çocuğa inilir; yaprak eylemdir. Pencereler: `sonraki_saat` (haber seans içindeyse bir
sonraki tam saat, değilse ertesi işlem günü 10:00–10:50), `gun_sonu` (17:00–17:50), `ertesi_acilis` (10:00–10:15).
AL limiti = min(son fiyat × 1,01; haber öncesi fiyat × 1,05) → fiyat kaçtıysa kovalanmaz. Boyut = %0,35 / ATR (tavan %10) × dal çarpanı.

## 4. Saatlik strateji kütüphanesi ve durum haritası

27 strateji (`mimari/kutuphane.py`): Fable araştırma ajanının BIST saatlik yatırımcı araştırmasından (popülerlik:
`dosya_kaynak/strateji_kayit.json`, özet `strateji_ozet.md`) ve yaygın gösterge kurallarından. Her biri 74 hissenin
2 yıllık saatlik verisinde sıralı işlem olarak simüle edilir (`strateji-istatistik`): sıklık (hisse/ay), isabet,
maliyet sonrası ortalama (%0,30 temkinli ve %0,10 likit senaryo), gün kümelemeli t, iki yarı tutarlılığı, ve durum
kırılımı (XU100 MA200 üstü/altı × oynaklık × saat × haber). Rapor: `ajan-ciktilari:raporlar/strateji-haritasi-*.md`.

Ana bulgu (2024-11 → 2026-11, 74 hisse, 71.662 sanal işlem): en sık tetiklenen popüler saatlik kurallar (gece taşıma,
açılış kırılımı, AOF dönüşü, saatlik RSI, hacim patlaması, açılış ilk saat momentumu) maliyet sonrası **eksi**;
güvenilir artı yalnız seyrek olay/takvim kurallarında ve küçük örneklemle. Bot bu yüzden olay dallarında yarım boyut ve
istatistik kapısı kullanır: bir dalın geçmiş vekil stratejisi n ≥ 20 ve maliyet sonrası eksi ise AL → İZLE'ye düşer.

## 5. Komutlar

```bash
python -m yatirim_ajani hane-oku --hisse KCHOL --zaman 2026-11-09T14:12 --metin "… 20 milyon ABD Doları tutarında yatırım …"
python -m yatirim_ajani bot-olay --hane haneler.json --dosya-db veri/dosya/dosya.sqlite --defter veri/defter/hafta.json --istatistik veri/mimari/strateji_istatistik.json
python -m yatirim_ajani bot-olay --hane haneler.json --dosya-db veri/dosya/dosya.sqlite --defter veri/defter/hafta.json --yaz   # deftere yaz
python -m yatirim_ajani bot-agac [--json]
python -m yatirim_ajani strateji-istatistik --dosya-db veri/dosya/dosya.sqlite --ham veri/dosya/ham --rapor raporlar/strateji-haritasi.md
```

Rutin entegrasyonu: 09:36 / 16:26 / 20:26 görevleri portföy ve emir listesindeki hisseler için KAP bildirimlerini okur,
haneleri `veri/mimari/haneler-*.json`'a yazar, botu önce deneme modunda çalıştırır; öneri HAFTA.md risk kurallarıyla
çelişmiyorsa `--yaz` ile deftere işler. Her karar yol ve gerekçesiyle `veri/mimari/bot_kararlari.jsonl`'e düşer.

## 6. Dürüstlük notları

- KAP'a bu ortamdan doğrudan erişim yok; bildirimler web aramasıyla okunur, saat çoğu zaman haber saatidir.
- Olay stratejilerinin istatistiği seyrek (metin olay tablosunda hisse başına birkaç olay; KCHOL hariç). Eşikler
  (%0,25 / %1 / %3, %100 bedelsiz, %5 temettü verimi) literatür ve uzman öncülüdür; veri biriktikçe kapı devreye girer.
- Maliyet varsayımı sonuçları belirler: likit hisselerde %0,10 gidiş-dönüş için birkaç kural sıfıra yaklaşır; tablo
  "başabaş maliyet" sütununu verir.
