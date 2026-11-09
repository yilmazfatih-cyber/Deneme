# DOSYA.md — hisse dosyası (her şirket için 2 yıllık gün-saat veritabanı) yönergesi

Amaç: Borsa İstanbul'daki her şirket için, 2024'ten bugüne **her gün-saat bir satır** olacak şekilde, o anda
bilinebilen sayısal/temel/olay sütunlarını ve ileriye dönük etiketleri tutan bir veritabanı; üstünde matematiksel
(koşullu istatistik, olay çalışması, kural taraması + Deflated Sharpe) ve metinsel (KAP/haber zaman çizelgesi, literatür)
araştırma. Önce KCHOL, sonra BIST 100, sonra tüm BIST. Yatırım tavsiyesi değildir.

## 1. Katmanlar ve dosyalar

| Katman                | Nerede                                                                                | Ne var                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ham veri              | `ajan-ciktilari:veri/dosya/ham/`                                                      | İş Yatırım günlük seri (PD, dolar bazlı fiyat, halka açık PD, AOF…), çeyreklik mali tablo kalemleri (XI_29/UFRS), Yahoo günlük (2024-01→), XU100, USDTRY |
| Saatlik çubuklar      | `ajan-ciktilari:veri/saatlik/`                                                        | 1 saat ve 5 dakika (Kas 2024→; Yahoo sınırı 730 gün)                                                                                                     |
| Olaylar (metin)       | `dosya_kaynak/olaylar_<HİSSE>.json` + bilgi veritabanı                                | KAP/haber zaman çizelgesi; şema `bilgi/sema.py:Olay`; yalnız `kaynak_tipi = metin` olaylar dosyaya girer                                                 |
| Literatür / formüller | `dosya_kaynak/bist_formuller.json`, `_ozet.md`                                        | 40 BIST faktörü/anomalisi: formül, kanıt gücü, kaynak, uygulanabilirlik                                                                                  |
| Omurga (veritabanı)   | `veri/dosya/dosya.sqlite` (yerelde kurulur), `veri/dosya/<HİSSE>_omurga.csv.gz`       | satır = (hisse, zaman); ~90 sütun; `formuller` tablosu her sütunun formülü/kaynağı; `literatur`, `olaylar`, `temel_ceyrek`, `meta`                       |
| Günlük özet           | `ajan-ciktilari:veri/dosya/gunluk/<HİSSE>.csv.gz`                                     | yalnız gün sonu satırları (tüm sütunlar) — her şirket için saklanan "veri"                                                                               |
| Analiz                | `ajan-ciktilari:veri/dosya/analiz/<HİSSE>.json`, `raporlar/dosya-<HİSSE>-YYYYMMDD.md` | koşullu istatistik, sat/al öncesi profil, olay etkisi, kural taraması, takvim, son durum                                                                 |

Omurga ham veriden **deterministik** kurulur; büyük olduğu için (BIST 100 saatlik ≈ 400 bin satır) tamamı git'e konmaz,
istenince tek komutla yeniden kurulur. Her şirket için saklanan kalıcı veri = ham veri + gün sonu satırları + olaylar + analiz.

## 2. Nokta-zamanlılık kuralları (kur.py)

- Geçmişe bakan sütunlar yalnız o satırdan önce kapanmış çubuklar + satırın kendi fiyatından hesaplanır
  (getiri*20g = P_t / C*{d-20} − 1; oynaklık, RSI, MA, hacim z önceki günün kapanışına kadar).
- Temel oranlar: F/K = PD / son 4 **açıklanmış** çeyrek net kârı; PD/DD = PD / ana ortaklık özkaynağı; FD/FAVÖK.
  Çeyrek kalemleri KAP açıklanma anından (olaylar tablosundaki `bilanco` kaydı; yoksa yasal son gün 18:30) itibaren geçerli.
- Olay sütunları yalnız `kamuya_acilma` satırdan önce olan olayları sayar; saat bilinmiyorsa bitiş günü 18:30 varsayılır.
- `*_ileri`, `sat_sinyali_20g`, `al_sinyali_20g`, `xu100_ileri_*` **geleceğe bakar**: yalnız etiket/değerlendirme; asla özellik değil.
- Test: `tests/test_dosya.py` — veriyi gelecekte kesince geçmiş satırların hiçbir özellik sütunu değişmez.

Etiket tanımları: `sat_sinyali_20g` = sonraki 20 işlem gününde kapanış ≥ %10 düştü; `al_sinyali_20g` = ≥ %10 yükseldi ve 20g getiri > 0.

## 3. Komutlar

```bash
# Ham veri (dış ağ gerekir → GitHub Actions "Yatırım ajanı" iş akışı, is=dosya-veri, hisseler=KCHOL,BIMAS,...)
python -m yatirim_ajani dosya-veri-cek --hisseler KCHOL --klasor veri/dosya/ham --baslangic 2024-01-01

# Omurga + veritabanı (yerel, saniyeler)
python -m yatirim_ajani dosya-kur --hisseler KCHOL --saatlik veri/saatlik --ham veri/dosya/ham --cikti veri/dosya \
  --bilgi-db veri/ajan.db --grup TUPRS,FROTO,TOASO,ARCLK,YKBNK,AYGAZ,OTKAR,TTRAK

# Analiz + rapor
python -m yatirim_ajani dosya-analiz --hisseler KCHOL --cikti veri/dosya --rapor-klasoru raporlar
```

## 4. Araştırma düzeni (Fable baş, alt ajanlar)

- **Stajyer (Haiku/Sonnet):** KAP/haber zaman çizelgesi toplar (`Olay` şeması, kaynak URL zorunlu, tarih doğrulanmış,
  saat biliniyorsa yazılır); endeks bileşen listeleri; literatür künyeleri.
- **Analist (Opus):** literatür taraması (formül + kanıt gücü + kaynak), olay anlamlandırma, rapor yorumu.
- **Baş (Fable):** veri doğrulama, dosyayı kurma, analiz, dürüstlük kontrolü (bağımsız bölüm sayısı, çoklu test, seviye
  sütunları, çeyreklik adım fonksiyonları), haftalık yönetim defterine aktarılabilecek bulguların seçimi.

Dürüstlük notları: tek hissede 2 yıl ≈ 700 gün, ≥%10 düşüş bölümleri ~25 → istatistikler zayıf; asıl güç kesit
(BIST 100 genelinde aynı sütunun davranışı). Seviye sütunları (piyasa değeri, dolar fiyatı) örneklem içi ortalamaya
dönüşü gösterir, öngörü değildir; çeyreklik adımlı sütunların bağımsız değer sayısı çeyrek sayısı kadardır.

## 5. Ölçekleme durumu ve kuyruk

1. KCHOL: tamam (3.979 satır, 92 sütun, 131 olay; 55 olay KCHOL ve iştirakleri için elle derlendi).
2. BIST 100 (ilk aşama, 2026-11-09): 74 hisse kuruldu (63'ü BIST 100 yedek listesinden + 40'lık evren; KOZAL veri yok, kodu
   değişmiş görünüyor: TRALT). 288.075 gün-saat satırı, 52.223 gün sonu satırı. F/K, PD/DD, FD/FAVÖK 64 hissede dolu;
   bankalar ve sigorta (AKBNK, GARAN, YKBNK, ISCTR, VAKBN, HALKB, TSKB, ALBRK, ANHYT) mali tablo biçimi farklı olduğu için
   temel sütunları boş. Temettü 52, bedelsiz/bölünme 19 hissede.
   Eksik: BIST 100 listesinin 37 kodu (canlı kaynaklar bu ortamda kapalı: İş Yatırım 401, TradingView/Vikipedi erişilemedi).
   Liste tamamlanınca `dosya_kaynak/bist100.json` güncellenir ve `dosya-veri` işi `hisseler=XU100` ile yeniden çalışır (≈5 dk).
3. Tüm BIST: aynı iş akışı, liste dosyası (`dosya_kaynak/bist_tum.json`) ile; saatlik veri 730 günle sınırlı.

Çıktılar (`ajan-ciktilari`): `veri/dosya/ham/` (ham veri), `veri/dosya/gunluk/<HİSSE>.csv.gz` (gün sonu satırları, tüm sütunlar),
`veri/dosya/<HİSSE>_analiz.json`, `veri/dosya/kesit_analiz.json`, `raporlar/dosya-<HİSSE>-YYYYMMDD.md`, `raporlar/dosya-kesit-*.md`.
Tam gün-saat omurgası ve `dosya.sqlite` (≈250 MB) git'e konmaz; ham veriden saniyeler içinde yeniden kurulur (KCHOL örneği
`veri/dosya/KCHOL_omurga.csv.gz`).

Kesit bulguları (74 hisse, 2024-01 → 2026-11; evren eşit ağırlık al-tut +%39, Sharpe 0,62): gece getirisi 72 hissede
pozitif, gün içi 71 hissede negatif. 6 aylık momentum uzun-kısa portföyü aylık +%2,0 (Sharpe 1,40, t 2,2) ama
Deflated Sharpe 0,83 (58 deneme; 0,95 eşiğinin altında) ve kısa bacak bireyde fiilen uygulanamaz; yalnız uzun hali
Sharpe 0,69. Değer (PD/DD, FD/FAVÖK) ve kâr büyümesi kesitte doğru yönde ama çeyreklik adım sütunları, bağımsız gözlem az.

## 6. Araştırma katmanları (2026-11-09)

| Katman | Kaynak                                                                                                                          | Veritabanına girişi                                                                                            | Analiz komutu                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hisse  | 4 Sonnet ajanı + KCHOL çizelgesi: 40 hisse, 233 olay (`dosya_kaynak/olaylar_<HİSSE>.json`, hane alanlarıyla)                    | olay sütunları, olaylar tablosu                                                                                | `olay-calismasi` (tüm hisselerde tür ve büyüklüğe göre tepki; bot dal istatistiklerini günceller) |
| Sektör | 2 Opus ajanı: sektör olayları + sürücü profilleri (`dosya_kaynak/olaylar_sektor.json`, `sektor_profilleri.json`)                | sektör olayları kendi sektörünün hisselerine                                                                   | `sektor-analiz` (eşit ağırlıklı sektör endeksleri, rotasyon, sürücü duyarlılığı)                  |
| Piyasa | Fable ajanı: 28 PPK, 35 TÜFE, 18 not, 21 CDS, 65 olay, 10 rejim, 14 hipotez (`dosya_kaynak/makro_*.json`, `olaylar_makro.json`) | `politika_faizi`, `ppk_*`, `tufe_*`, `reel_faiz`; Brent, altın, VIX, ABD 10y, DXY, EEM, S&P 500, EUR/TRY (d−1) | `piyasa-analiz` (PPK/TÜFE günleri, rejimlere göre endeks/sektör/strateji)                         |

İlk bulgular (küçük örneklem, tanımlayıcı):

- Pay satışı/blok satış sonrası 20 günde ortalama −%10,4 anormal getiri (n=6, t −4,0); bedelli ilk gün −%2,8 (t −4,1);
  geri alım ilk gün +%2,1 (t 3,0); not kararları ilk gün −%1,0. Büyüme haberlerinde (sözleşme/yatırım) büyüklüğe göre
  tutarlı bir desen yok; piyasa değerinin %10'undan büyük haberlerde 5 gün +%1,9 (n=13).
- Temettü dalı geçmişte maliyet sonrası eksi (n=47) → bot temettü AL'ını artık İZLE'ye düşürür.
- PPK: beklenen indirim günlerinde bankalar endeksin %1,1 altında; TÜFE beklentinin altında gelince XU100 aynı gün +%1,2.
- Sektör rotasyonu (son 3 ayın en iyi 2 sektörü) 32 ayda +%104, eşit ağırlık +%29; fark anlamlı değil (t 1,3).
- Rejimler: gün içi getiri 10 rejimin hepsinde eksi, gece getirisi 9'unda artı.
