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

## 5. Ölçekleme planı ve kuyruk

1. KCHOL (tamamlandı: 3.975 satır, 86 sütun, 134 olay).
2. BIST 100: `dosya_kaynak/bist100.json` listesi; Actions `dosya-veri` gece işi tüm listeyi çeker; gece araştırmacı görevi
   her gece N hisse için omurga + analiz kurar, gün sonu satırlarını ve analizleri `ajan-ciktilari`ya yazar; kesit özeti.
   Olay çizelgesi yalnız önemli türler (bilanço, temettü, sermaye, pay satışı, derecelendirme) için stajyer ajanlarla.
3. Tüm BIST: günlük çözünürlük (saatlik veri 730 günle sınırlı ve hacimli), aynı sütunlar.

Kuyruk: `ajan-ciktilari:veri/dosya/kuyruk.json` → `{"bekleyen": [...], "biten": {"KCHOL": "2026-11-09"}}`.
