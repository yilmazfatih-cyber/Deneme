---
baslik: Birim ekonomisi ve LTV
ozet: Müşteri ömür değerini formülle değil kohortla hesaplamak; edinme maliyeti (kanal, emek, gecikme), geri ödeme süresi, iskonto ve ufuk, karışımın yanılttığı kayıp oranı ve çarpık ortalamalar; çalışan SQL ve Python.
etiketler: [veri, birim-ekonomisi, ltv, cac, kohort, abonelik]
duzey: orta
guncellik: 2026-11
---

# Birim ekonomisi ve LTV

> Bu notu ne zaman okumalı: "bir müşteri bize kaç lira bırakıyor, onu kazanmaya kaç lira harcayabiliriz?" sorusunda;
> reklam bütçesi ya da kanal kararı verilecekken; bir sunumda LTV/CAC oranı görüldüğünde.
> **Mali danışmanlık değildir;** muhasebe ve vergi tanımları için mali müşavirinize danışın.

## Temel fikir

- **LTV (ömür değeri):** yeni bir müşterinin ömrü boyunca bıraktığı **brüt kâr** (KDV hariç gelir − doğrudan
  maliyetler). Ciro değil kârdır; tahmin değil kohort verisinden çıkar.
- **CAC (edinme maliyeti):** bir müşteriyi kazanmak için harcanan her şey ÷ kazanılan müşteri: reklam, satış ve
  tanıtım **emeği**, tavsiye ödülü, deneme sürecinin maliyeti.
- **Geri ödeme süresi:** müşteri başına birikimli brüt kârın CAC'ı geçtiği ay. Nakit sıkışıklığında LTV/CAC
  oranından önemlidir.

Hızlı formül (`aylık brüt kâr ÷ aylık kayıp oranı`, [fiyatlandırma](../95-urun/fiyatlandirma.md)) yalnız kayıp oranı
**herkes için ve her ay aynıysa** doğrudur. Gerçekte yeni müşterilerin bir kısmı ilk aylarda hızla ayrılır, kalanlar
yerleşir; formüle hangi oranı koyduğunuza göre sonuç üç kat aşağı ya da bir buçuk kat yukarı kayar. Doğru yol:
kohortun hayatta kalma eğrisini ay ay toplamak.

## Karar tablosu

| Soru | Hesap | Dikkat |
| --- | --- | --- |
| Yeni müşteri ortalama ne bırakır? | Kohort birikimli brüt kâr eğrisi; gözlenmeyen aylar için eğrinin kuyruğu | İlk ay kaybı dahil; olgunlaşmamış kohortu sıfır saymayın |
| Hangi kanala bütçe? | Kanal başına CAC ve kanal başına kohort eğrisi | Harmanlanmış CAC pahalı kanalı gizler |
| Bu ay nakit yeter mi? | Geri ödeme süresi (ay) | Uzun geri ödeme, büyüdükçe nakdi eritir |
| Fiyat değişikliği ya da yıllık plan | Senaryo: kayıp ve brüt kâr değişince LTV | Kur ve iskonto ([fiyatlandırma](../95-urun/fiyatlandirma.md)) |
| Yatırımcıya / ortaklara rapor | LTV'yi ufukla (24–36 ay) ve iskontolu ver; varsayımları tabloda yaz | Sınırsız ufuk büyük sayı üretir |
| Müşteri sayısı az (onlarca) | Tek sayı değil aralık; büyük hesapları ayrı segment | Bir büyük hesap ortalamayı çevirir |

## Karışım: hangi kayıp oranı?

Yeni müşterilerin yarısı "deneyip bırakan" (aylık %30 kayıp), yarısı "yerleşen" (aylık %3). Aylık brüt kâr 260 TL:

```python calistir
GROSS = 260.0  # hesap başına aylık brüt kâr, TL (KDV hariç, kurgusal)
SEGMENTS = {"deneyip bırakan": (0.5, 0.30), "yerleşen": (0.5, 0.03)}  # (pay, aylık kayıp oranı)


def survival(month):  # yeni bir müşterinin `month`. ayda hâlâ ödüyor olma olasılığı (karışım)
    return sum(share * (1 - churn) ** month for share, churn in SEGMENTS.values())


def ltv(months=600, monthly_discount=0.0):  # her ayın başında, hâlâ aboneyse öder
    return GROSS * sum(survival(m) / (1 + monthly_discount) ** m for m in range(months))


first_month_churn = 1 - survival(1) / survival(0)
mature_churn = 1 - survival(13) / survival(12)
print(f"kohorttan (gerçek) LTV:                      {ltv():6.0f} TL")
print(f"formül, ilk ay kaybıyla (%{100 * first_month_churn:.1f}):            {GROSS / first_month_churn:6.0f} TL")
print(f"formül, olgun kohort kaybıyla (%{100 * mature_churn:.1f}):        {GROSS / mature_churn:6.0f} TL")
print(f"36 ayla sınırlı, aylık %2 iskontolu:          {ltv(36, 0.02):6.0f} TL")
assert GROSS / first_month_churn < ltv() < GROSS / mature_churn
```

```cikti
kohorttan (gerçek) LTV:                        4767 TL
formül, ilk ay kaybıyla (%16.5):              1576 TL
formül, olgun kohort kaybıyla (%3.5):          7369 TL
36 ayla sınırlı, aylık %2 iskontolu:            2632 TL
```

Okuma:

- İlk ay kaybıyla formül LTV'yi üçte birine indiriyor (deneyip bırakanların oranı herkese uygulanmış); olgun kohort
  kaybıyla %55 şişiriyor (yeni müşterilerin yarısının ilk aylarda gideceği unutulmuş). Kohort eğrisi ikisini de
  doğru tartar. "Kayıp oranını olgun kohorttan alın" önerisi **var olan** müşterinin kalan değeri içindir; **yeni**
  müşterinin değeri için ilk aylar dahil edilir.
- Ufuk ve iskonto sonucu büyük ölçüde değiştirir: 36 ay ve aylık %2 iskontoyla 4.767 → 2.632 TL. Faizin yüksek
  olduğu ortamda bugünkü lira ile 30 ay sonraki lira aynı değildir ([finans matematiği](../92-matematik/finans-matematigi.md)).
  Hangi ufuk ve oranı kullandığınızı sayının yanına yazın.

## Kohortla hesap: SQL

Müşteri başına birikimli brüt kâr, kohort ve aya göre; CAC aynı kohortun edinme harcamasından; geri ödeme ayı
birikimli kârın CAC'ı geçtiği ilk ay. Gözlenmeyen aylar boş kalır (sıfır değil):

```sql calistir
CREATE TABLE musteri (id INTEGER, kohort TEXT, kanal TEXT, odedigi_ay INTEGER);  -- NULL: hâlâ ödüyor
CREATE TABLE harcama (kohort TEXT, kanal TEXT, tutar REAL);  -- edinme harcaması: reklam + emek + ödül
INSERT INTO musteri VALUES
  (1, '2026-01', 'reklam', 1), (2, '2026-01', 'reklam', 2), (3, '2026-01', 'reklam', NULL),
  (4, '2026-01', 'reklam', 3), (5, '2026-01', 'tavsiye', NULL), (6, '2026-01', 'tavsiye', NULL),
  (7, '2026-02', 'reklam', 1), (8, '2026-02', 'reklam', NULL), (9, '2026-02', 'reklam', 2),
  (10, '2026-02', 'tavsiye', NULL), (11, '2026-02', 'tavsiye', 4),
  (12, '2026-03', 'reklam', 1), (13, '2026-03', 'reklam', 1), (14, '2026-03', 'reklam', NULL),
  (15, '2026-03', 'reklam', NULL), (16, '2026-03', 'tavsiye', NULL);
INSERT INTO harcama VALUES ('2026-01', 'reklam', 2400), ('2026-01', 'tavsiye', 200), ('2026-02', 'reklam', 2100),
  ('2026-02', 'tavsiye', 200), ('2026-03', 'reklam', 2600), ('2026-03', 'tavsiye', 100);
-- Son veri ayı 2026-06; ödeyen her ay 260 TL brüt kâr bırakır.
WITH RECURSIVE ay(m) AS (SELECT 0 UNION ALL SELECT m + 1 FROM ay WHERE m < 5),
kohort AS (
  SELECT kohort, COUNT(*) AS n,
         (SELECT SUM(tutar) FROM harcama h WHERE h.kohort = u.kohort) / COUNT(*) AS cac,
         (2026 * 12 + 6) - (CAST(substr(kohort, 1, 4) AS INTEGER) * 12 + CAST(substr(kohort, 6, 2) AS INTEGER)) + 1 AS gozlenen
  FROM musteri u GROUP BY kohort
),
birikimli AS (
  SELECT k.kohort, a.m, k.cac,
         SUM(SUM(CASE WHEN u.odedigi_ay IS NULL OR a.m < u.odedigi_ay THEN 260 ELSE 0 END))
           OVER (PARTITION BY k.kohort ORDER BY a.m) * 1.0 / k.n AS kar
  FROM kohort k JOIN musteri u USING (kohort) JOIN ay a ON a.m < k.gozlenen
  GROUP BY k.kohort, a.m
)
SELECT kohort, round(cac),
       (SELECT round(kar) FROM birikimli b WHERE b.kohort = k.kohort AND m = 0) AS ay0,
       (SELECT round(kar) FROM birikimli b WHERE b.kohort = k.kohort AND m = 2) AS ay2,
       (SELECT round(kar) FROM birikimli b WHERE b.kohort = k.kohort AND m = 5) AS ay5,
       COALESCE((SELECT MIN(m) FROM birikimli b WHERE b.kohort = k.kohort AND kar >= b.cac), 'henüz yok') AS geri_odeme_ayi
FROM kohort k ORDER BY kohort;
-- Kanal bazında edinme maliyeti: harmanlanmış ortalama pahalı kanalı gizler
SELECT 'harmanlanmış', round(SUM(tutar) / (SELECT COUNT(*) FROM musteri)) FROM harcama;
SELECT kanal, round(SUM(tutar) / (SELECT COUNT(*) FROM musteri u WHERE u.kanal = h.kanal)) FROM harcama h GROUP BY kanal;
```

```cikti
2026-01|433.0|260.0|650.0|1040.0|1
2026-02|460.0|260.0|624.0||1
2026-03|540.0|260.0|572.0||2
harmanlanmış|475.0
reklam|645.0
tavsiye|100.0
```

Okuma: CAC kohorttan kohorta yükseliyor ve geri ödeme bir aydan iki aya uzuyor: büyüme pahalılaşıyor. Harmanlanmış
CAC 475 TL ama reklam kanalı 645 TL, tavsiye 100 TL; reklam müşterileri de daha erken ayrılıyor (bu küçük örnekte
kanal başına eğriyi aynı sorguya `kanal`ı ekleyerek çıkarın). Mart kohortunun 5. ayı **boş**: henüz gözlenmedi.
Kohort tablosunun genel kuralları (payda, olgunlaşmamış hücre): [analitik SQL kalıpları](analitik-sql-kaliplari.md).

## CAC'ı doğru saymak

| Kalem | Dahil mi | Not |
| --- | --- | --- |
| Reklam harcaması | Evet | Harcama ayı ile kazanma ayı arasında gecikme varsa (deneme süresi) kaydırarak eşleyin |
| Satış ve tanıtım emeği (kurucunun saati dahil) | Evet | Yazılmazsa erken dönemde her kanal "bedava" görünür |
| Tavsiye ödülü, ilk ay indirimi | Evet | İndirim gelirden düşülürse iki kez saymayın |
| Ücretsiz deneme kullanıcılarının sunucu/destek maliyeti | Evet | Ödeyene dönüşmeyenlerin maliyeti de dönüşenlere yüklenir |
| Ürün geliştirme | Hayır | Edinme değil, ürün maliyetidir |
| Organik (kendiliğinden gelen) müşteri | Ayrı raporlayın | Harmanlanmış CAC'ı düşürür; ücretli kanalın gerçek maliyetini gizler |

## Çarpık dağılım: tek müşteri ortalamayı çevirir

12 aylık müşteri başı brüt kâr; fuar kanalında bir büyük kurumsal hesap var:

```python calistir
import random
import statistics

rng = random.Random(14)
# 12 aylık müşteri başı brüt kâr (TL): çoğu küçük, birkaç büyük hesap (çarpık dağılım)
channels = {
    "arama ilanı": [round(rng.lognormvariate(6.6, 0.8)) for _ in range(60)],
    "fuar": [round(rng.lognormvariate(6.4, 0.8)) for _ in range(19)] + [48_000],  # bir büyük kurumsal hesap
}


def bootstrap_mean(values, rounds=2000):
    means = sorted(statistics.fmean(rng.choices(values, k=len(values))) for _ in range(rounds))
    return means[int(0.025 * rounds)], means[int(0.975 * rounds)]


print("kanal         n   ortalama  ortanca  en büyüğü çıkarınca   ortalamanın %95 aralığı")
for name, values in channels.items():
    low, high = bootstrap_mean(values)
    trimmed = statistics.fmean(sorted(values)[:-1])
    print(f"{name:12s} {len(values):3d}   {statistics.fmean(values):7.0f}  {statistics.median(values):7.0f}"
          f"  {trimmed:12.0f}          {low:6.0f} – {high:6.0f}")
```

```cikti
kanal         n   ortalama  ortanca  en büyüğü çıkarınca   ortalamanın %95 aralığı
arama ilanı   60       936      705           898             766 –   1129
fuar          20      3135      664           773             578 –   8038
```

Bütçe kararında doğru nicelik ortalamadır (toplam değer = ortalama × müşteri sayısı); ama çarpık dağılımda ortalama
**kırılgandır**: fuarın "üç kat değerli" görünmesi tek hesaptan geliyor ve aralığı 578–8.038 TL. Kural: her LTV'nin
yanında n, ortanca, en büyük hesap çıkarılınca değer ve aralık. Büyük hesaplar (kurumsal) ayrı segment olarak
hesaplanır ([segmentasyon ve RFM](segmentasyon-ve-rfm.md)). Aktif müşteri başına gelirin zamanla "artması" çoğu
zaman az ödeyenlerin ayrılmasıdır (hayatta kalan yanlılığı: [korelasyon ve nedensellik](korelasyon-ve-nedensellik.md)).

## Genişleme ve net gelir tutma

Yükseltme (daha büyük paket, ek kullanıcı) olan üründe kohortun geliri zamanla artabilir. **Net gelir tutma**
(net revenue retention): bir kohortun bu dönemki geliri ÷ aynı kohortun başlangıç geliri; yükseltme dahil,
yeni müşteri hariç. %100'ün üstü, kayba rağmen kohortun büyüdüğü demektir. İki ayrı sayı raporlayın: müşteri sayısıyla
tutma (kaç kişi kaldı) ve gelirle tutma (ne kadar para kaldı); biri ötekini gizler ([ürün ölçütleri](urun-olcutleri.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| LTV tablosu harika, kasada para yok | Ciro ya da KDV dâhil gelir; geri ödeme süresi uzun | Brüt kâr, KDV hariç; geri ödeme ayını raporlayın |
| LTV her ay değişiyor, kimse güvenmiyor | Formüle o ayın kayıp oranı konuyor | Kohort eğrisi; ufuk ve iskonto sabit |
| Yeni kanal mükemmel görünüyor | Kohortlar olgunlaşmamış; boş aylar sıfır ya da tahminle dolduruldu | Gözlenmeyen ay boş; aynı yaştaki kohortları karşılaştırın |
| Harmanlanmış CAC düşük, büyüme bütçesi artınca maliyet patladı | Organik ve ucuz kanal ortalamayı düşürüyordu | Kanal başına ve ücretli CAC |
| CAC çok düşük | Emek ve ödüller dahil edilmemiş | Kalem tablosu; kurucunun saati dahil |
| Bir kanal "en değerli" çıktı | Tek büyük hesap | Ortanca, en büyüğü çıkarınca değer, aralık; kurumsal ayrı segment |
| LTV/CAC 8, yatırımcı ikna olmadı | Sınırsız ufuk, iskontosuz, varsayım yazılmamış | 24–36 ay, iskontolu; varsayım tablosu |
| Aktif müşteri başına gelir yükseliyor | Az ödeyenler ayrıldı | Kohort bazında, ayrılanlar dahil |

## Denetim listesi

- [ ] LTV brüt kârla (KDV hariç, doğrudan maliyetler düşülmüş) hesaplandı; tanım sayının yanında yazılı.
- [ ] LTV kohort hayatta kalma eğrisinden; ilk aylar dahil; gözlenmeyen aylar boş bırakıldı.
- [ ] Ufuk (ay) ve aylık iskonto oranı yazıldı; senaryo olarak iki farklı değerle de verildi.
- [ ] CAC kalem tablosuna göre (emek, ödül, deneme maliyeti dahil); kanal başına ve harmanlanmış ayrı.
- [ ] Geri ödeme ayı kohort bazında raporlandı.
- [ ] Her LTV'nin yanında n, ortanca ve en büyük hesap çıkarılınca değer var; büyük hesaplar ayrı segment.
- [ ] Müşteri sayısıyla tutma ve gelirle tutma ayrı raporlandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "LTV'yi formülle değil kohort tablosundan hesapla: müşteri başına birikimli brüt kâr, kohort × ay.
  Gözlenmeyen ayları boş bırak. CAC'ı kanal başına ver; emek ve ödülleri dahil et. Ufuk 36 ay, aylık iskonto
  oranını parametre yap. Para hesaplarında Decimal kullan. Varsayımları en üstte tablo olarak yaz; eksik rakamı
  uydurma, sor."
- **Modelin tipik hatası:** `aylık gelir / kayıp oranı` formülünü ciroyla ve o ayın kayıp oranıyla uygular; olgunlaşmamış
  kohortu sıfırla doldurur ya da doğrusal uzatır; harmanlanmış CAC verir; ortalama LTV'yi aralıksız ve tek büyük
  hesaba duyarlılığını göstermeden raporlar; "sektör ortalaması LTV/CAC 3" gibi kaynaksız rakam ekler.
- **Çıktıda denetleyin:** gelirin KDV hariç ve kâr olduğu; kohort tablosunda boş hücreler; CAC kalemleri; ufuk ve
  iskonto satırı; her ortalamanın yanında n ve ortanca.
- **Sorun:** "Bu LTV'yi elde etmek için yeni bir müşterinin kaç ay kalması gerekiyor ve bunu hangi kohorttan biliyoruz?"

## İlgili

- [Fiyatlandırma](../95-urun/fiyatlandirma.md) — hızlı formül, KDV, kur riski · [Tutma ve iptal akışı](../95-urun/tutma-ve-iptal-akisi.md)
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — kohort tablosu ve payda · [Ürün ölçütleri](urun-olcutleri.md)
  — kayıp ve tutma tanımları
- [Betimsel istatistik](betimsel-istatistik.md) — ortalama, ortanca, çarpıklık · [Anlamlılık ve güven aralığı](anlamlilik-ve-guven-araligi.md)
  — önyükleme
- [Finans matematiği](../92-matematik/finans-matematigi.md) — iskonto, net bugünkü değer · [Segmentasyon ve RFM](segmentasyon-ve-rfm.md)
- [Fiyat deneyleri](../95-urun/fiyat-deneyleri.md) — fiyatın LTV'ye etkisini sınamak
- Havuz: kuruş temelli para tipi [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py); örnek sipariş
  verisi [`veri/ornekler/eticaret`](../../veri/ornekler/eticaret/VERI_KARTI.md)
