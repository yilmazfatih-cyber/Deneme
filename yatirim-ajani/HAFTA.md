# HAFTA.md — haftalık para yönetimi yönergesi (bot bu dosyayı her çalışmada okur)

Sanal hesap: **1.000.000 TL, başlangıç 9 Kasım 2026 (Pazartesi)**. Kullanıcı emirleri Midas'ta kendisi girer; bot
her emri **gün + saat penceresi + fiyat + adet** ile yazar, defter (`veri/defter/hafta.json`, `ajan-ciktilari` dalı) emri
**gerçek 5 dakikalık çubuklarla** doldurur. Geriye dönük emir yok (defter reddeder). Yatırım tavsiyesi değildir.

## 1. Strateji (Hafta 1: 9–13 Kasım 2026)

Veri (6 Kas kapanışı): XU100 11.470; 20 günde −%6, 60 günde −%19, MA50 ve MA200 altı (ayı rejimi) ama son 5 günde
+%6,4 tepki. 2 yıllık bulgu: getiri geceden geliyor, gün içi ortalama eksi; günlük gece çevirmesi maliyete yeniyor,
hiçbir model al-tutu sağlam biçimde geçmiyor. Bu yüzden:

- **Çok günlük tut, günlük al-sat yok.** Alım seansın son saatinde (17:00–17:50), satış açılışta (10:00–10:15).
  Gün içi ortalama eksi olduğu için alımı geç, satışı erken yapmak beklenen fiyatı lehimize çevirir.
- **Hisse seçimi:** (a) ekip oturumunun AL tezleri (olasılık ≥ 0,55): KCHOL, BIMAS, TUPRS; (b) trend filtresi:
  çekirdek listede MA50 ve MA200 üstünde olan tek hisse AHGAZ (kullanıcının yönetim tezi). Bankalar, bilanço
  günü olan hisseler (9 Kas: AKSEN, TCELL) ve 5 günde +%20 koşmuş hisseler (THYAO, PGSUS) bu hafta alınmaz.
- **Boyut:** pay = %0,35 / günlük ATR oranı, tavan %10 (`pay_hesapla`). Lot tam sayı. Başlangıç toplam ≈ %38 hisse,
  %62 nakit (ayı rejimi; tepki kırılırsa kayıp sınırlı).
- **İkinci dilim (koşullu):** Çarşamba 11 Kas 16:26 çalışmasında XU100 > 11.470 (Cuma kapanışı) VE dört pozisyondan
  en az üçü maliyetin üstündeyse her pozisyona +%5 eklenir (17:00–17:50 alım, limit = o anki fiyat +%0,5); toplam ≈ %58.
- **Çıkış kuralları (otomatik emir üretir):**
  - Zarar kes: gün kapanışı ≤ maliyet × 0,93 → ertesi gün 10:00–10:15 PİYASA SAT (tamamı).
  - Kâr al: gün kapanışı ≥ maliyet × 1,08 → ertesi gün 10:00–17:50 LİMİT SAT (yarısı, limit = maliyet × 1,08).
  - Portföy günlük −%2 → o gün yeni alım yok. Zirveden −%15 → tüm pozisyonlar ertesi açılış PİYASA SAT, hafta biter.
  - Cuma 13 Kas 20:26: haftalık değerlendirme. Tez bozulmadıysa pozisyon haftaya taşınır (tezler 30 günlük, bitiş
    9 Aralık); bozulduysa Pazartesi açılış SAT emri yazılır. Karar ve gerekçe raporda.
- **Nakit:** defterde faiz işlemez (temkinli varsayım). Gerçekte boş nakit Midas'ta para piyasası fonunda
  bekletilebilir; bu getiri rapora yazılmaz, kıyas al-tut XU100 ve "hepsi nakit" (1.000.000) ile yapılır.

## 2. Bot takvimi (Claude Code zamanlanmış görevleri, hafta içi, Europe/Istanbul)

| Saat  | Çalışma     | Ne yapar                                                                                             |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 09:36 | Sabah planı | Haber/KAP/takvim taraması; dünkü kapanışla zarar-kes / kâr-al emirleri; günün alım planı (taslak)    |
| 16:26 | Alım fiyatı | Güncel fiyatla 17:00–17:50 alım limitlerini yeniler (limit = güncel +%0,5, Cuma kapanış +%1'i aşmaz) |
| 20:26 | Gün sonu    | Emirleri gerçek çubuklarla doldurur, günü değerler, günlük raporu yazar, yarının emirlerini hazırlar |

Her çalışma sonunda kullanıcıya bu oturumda kısa Türkçe rapor verilir (aşağıdaki biçim). Veri ve defter yalnız
`ajan-ciktilari` dalına push edilir (kullanıcı 2026-11-08'de izin verdi). Kod dallarına dokunulmaz, PR açılmaz.

## 3. Çalışma adımları (her görev için)

1. Kodu al: oturum dalı `claude/lucid-mccarthy-ofpol0` (yoksa varsayılan dal). `pip install -e yatirim-ajani -q`.
2. Veriyi al: `git fetch origin ajan-ciktilari` → worktree `cikti/`. Son çubuk zamanına bak:
   - 16:26 çalışmasında son 1 saatlik çubuk 90 dakikadan eskiyse GitHub Actions "Yatırım ajanı" iş akışını `tara`
     girdisiyle tetikle, 3–4 dakika bekle, yeniden fetch et.
   - 20:26 çalışmasında bugünün 17:55 5 dk çubuğu yoksa `veri-egitim` tetikle, bitmesini bekle (≤ 20 dk).
3. Defter komutları (`--defter cikti/veri/defter/hafta.json --csv-klasoru cikti/veri/saatlik`):
   `defter-isle --degerle YYYY-MM-DD` (gün sonu), `defter-emir ...` (yeni emirler), `defter-iptal --id N`,
   `defter-rapor --gun YYYY-MM-DD`.
4. Kuralları (bölüm 1) mekanik uygula; takdir yalnız haber kaynaklı olay riskinde (bilanço, KAP, dava, kur şoku):
   o gün o hissede alım iptal edilir, gerekçe yazılır. Tez listesine hisse EKLEME; ekleme ancak ekip oturumu (tez-yukle) ile.
5. Raporu `cikti/raporlar/gunluk-YYYYMMDD-{sabah|ogle|aksam}.md` olarak yaz, `cikti/` içinde commit + push (`ajan-ciktilari`).
6. Kullanıcıya mesaj (en fazla 12 satır):
   - Tarih-saat, portföy değeri ve başlangıca göre %, XU100 aynı dönem %.
   - Emir tablosu: `Gün Saat · AL/SAT · HİSSE · adet · limit/PİYASA · neden`.
   - Dolan/dolmayan emirler (fiyatıyla).
   - Yarın için tetiklenmesi muhtemel kural (ör. "TUPRS 316,0 altı kapanırsa zarar-kes").
   - Dürüst not: sanal hesap; gerçekleşen fiyat Midas'ta farklı olabilir.

## 4. Değerlendirme (kullanıcı beni böyle puanlar)

- Haftalık getiri vs XU100 al-tut vs tamamı nakit (0).
- Her emrin saat+fiyat+adetle önceden yazılmış olması (defter `verildi` damgası pencereden önce).
- Kural dışı işlem sayısı (hedef 0) ve gerekçesiz değişiklik sayısı (hedef 0).
- Dolmayan emir oranı (limitler gerçekçi mi).
