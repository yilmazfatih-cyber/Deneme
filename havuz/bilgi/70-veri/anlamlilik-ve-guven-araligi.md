---
baslik: Anlamlılık ve güven aralığı
ozet: p değerinin ne söyleyip ne söylemediği, Wilson ve önyükleme güven aralıkları, etki büyüklüğü, istatistiksel ile pratik anlamlılık farkı ve p-avcılığı; çalışan benzetimlerle.
etiketler: [istatistik, p-degeri, guven-araligi, onyukleme, anlamlilik, analiz]
duzey: orta
guncellik: 2026-11
---

# Anlamlılık ve güven aralığı

> Bu notu ne zaman okumalı: bir raporda "anlamlı" kelimesini gördüğünüzde; iki oranı ya da ortalamayı
> karşılaştırırken; az veriyle oran raporlarken (%0, %100); bir modelin "p < 0,05, demek ki işe yarıyor"
> sonucunu denetlerken.

## Temel fikir

**p değeri:** "Gerçekte hiçbir fark olmasaydı, en az bu kadar uç bir sonuç görme olasılığı." Küçükse sonucu
şansla açıklamak zordur. Söylemedikleri: farkın büyüklüğü, önemi, "B'nin daha iyi olma olasılığı" ve sonucun
tekrarlanacağı.

**Güven aralığı (GA):** verinin desteklediği değerler aralığıdır. Aynı yöntem birçok örneklemde uygulansa
aralıkların yaklaşık %95'i gerçek değeri kapsar. GA hem büyüklüğü hem belirsizliği gösterdiği için p değerinden
fazlasını söyler: raporda farkın yanına GA yazılır, p değeri en çok onun yanında durur.

**İstatistiksel anlamlılık pratik önem değildir.** Çok veride önemsiz fark anlamlı çıkar; az veride büyük fark
anlamsız çıkabilir. Karar, GA'nın iş için önemli eşikle ilişkisinden verilir; eşik analizden önce yazılır.

**p-avcılığı** (p-hacking): birçok analiz deneyip anlamlı çıkanı raporlamak. Gürültüden "bulgu" üretir.

## Karar tablosu

| Durum | Kullanılacak | Neden |
| --- | --- | --- |
| Oran; n büyük, oran %5–%95 arası | Normal yaklaşım (Wald): p ± 1,96·SE | Basit ve yeterli |
| Oran; az veri ya da uçlarda (0/20, 19/20) | Wilson aralığı | Wald `[0, 0]` gibi saçma aralık verir, kapsaması düşer |
| İki oranın farkı | Fark ± 1,96·√(SE₁² + SE₂²) | Ayrı aralıkların örtüşmesine bakılmaz |
| Ortanca, yüzdelik, çarpık tutar | Önyükleme (bootstrap) GA | Formül gerekmez |
| Kullanıcı başına çok olay | Kullanıcı düzeyinde önyükleme | Olay düzeyi aralığı yapay daraltır |
| "Etki yok" demek istiyorsunuz | GA'nın iki ucu da önemsiz bölgede mi bakın | "Anlamlı değil" etki yok demek değildir |
| Hiç olay yok (0/n) | Üç kuralı: üst sınır ≈ 3/n | Hızlı akıl yürütme |

## p değeri ne söylemez

"p < 0,05 olan sonuçların %95'i doğrudur" yanlıştır. Doğru olanların payı, denediğiniz fikirlerin ne kadarının
gerçekten işe yaradığına ve deneylerin gücüne bağlıdır. Fikirlerin %10'u gerçekten işe yarasın, güç %50 olsun:

```python calistir
import random

r = random.Random(5)
FIKIR, GERCEK_PAY = 10000, 0.10
dogru = yanlis = 0
for _ in range(FIKIR):
    gercek = r.random() < GERCEK_PAY
    z = r.gauss(1.96 if gercek else 0.0, 1)  # gerçek etkide güç ≈ %50
    if abs(z) > 1.96:  # p < 0,05
        dogru += gercek
        yanlis += not gercek
print(f"anlamlı çıkan {dogru + yanlis} fikirden {yanlis} tanesi (%{100 * yanlis / (dogru + yanlis):.0f}) aslında işe yaramıyor")
assert 0.35 < yanlis / (dogru + yanlis) < 0.6
```

```cikti
anlamlı çıkan 984 fikirden 459 tanesi (%47) aslında işe yaramıyor
```

Anlamlı sonuçların neredeyse yarısı yanlış alarm. Ders: tek bir anlamlı sonuç, özellikle şaşırtıcıysa, kanıt
değil ipucudur; büyük karardan önce doğrulama deneyi yapılır.

## Güven aralığı: Wald, Wilson ve kapsama

"%95 GA" vaadini tutması gerekir: aralıkların %95'i gerçek değeri kapsamalı. Az veride Wald bunu tutmaz:

```python calistir
import math
import random

Z = 1.96


def wald(d: int, n: int) -> tuple[float, float]:
    p = d / n
    h = Z * math.sqrt(p * (1 - p) / n)
    return p - h, p + h


def wilson(d: int, n: int) -> tuple[float, float]:
    p, payda = d / n, 1 + Z * Z / n
    merkez = (p + Z * Z / (2 * n)) / payda
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / payda
    return max(0.0, merkez - h), min(1.0, merkez + h)


r = random.Random(3)
for n, gercek in ((400, 0.12), (20, 0.05)):
    kapsadi = {"Wald": 0, "Wilson": 0}
    for _ in range(4000):
        d = sum(r.random() < gercek for _ in range(n))
        for ad, aralik in (("Wald", wald), ("Wilson", wilson)):
            alt, ust = aralik(d, n)
            kapsadi[ad] += alt <= gercek <= ust
    print(f"n={n}, gerçek oran %{100 * gercek:g}: " + ", ".join(f"{ad} %{100 * k / 4000:.0f} kapsadı" for ad, k in kapsadi.items()))
(wa, wb), (va, vb) = wald(0, 20), wilson(0, 20)
print(f"0/20 dönüşüm → Wald %{100 * wa:.0f}–%{100 * wb:.0f} · Wilson %{100 * va:.0f}–%{100 * vb:.1f}".replace(".", ","))
```

```cikti
n=400, gerçek oran %12: Wald %95 kapsadı, Wilson %95 kapsadı
n=20, gerçek oran %5: Wald %65 kapsadı, Wilson %93 kapsadı
0/20 dönüşüm → Wald %0–%0 · Wilson %0–%16,1
```

Yeni bir özelliği 20 kişi denedi ve kimse kullanmadıysa "%0" değil "%0 ile %16 arası" yazılır. Pratik kural (üç
kuralı): sıfır olay görülen n denemede %95 üst sınır yaklaşık 3/n'dir (burada %15).

## Önyükleme ile güven aralığı

Formülü zor ölçütlerde (ortanca, kullanıcı başı harcama, oranların oranı) önyükleme kullanılır: veriyi yerine
koyarak yeniden örnekle, ölçütü her seferinde hesapla, dağılımın %2,5 ve %97,5 dilimlerini al.

```python calistir
import random
import statistics as st

r = random.Random(2)


def harcama(n: int, alim_orani: float) -> list[float]:
    return [round(r.lognormvariate(5, 1)) if r.random() < alim_orani else 0 for _ in range(n)]


a, b = harcama(1000, 0.08), harcama(1000, 0.10)  # B'nin gerçek alım oranı DAHA YÜKSEK
fark = st.fmean(b) - st.fmean(a)
ornek = sorted(st.fmean(r.choices(b, k=len(b))) - st.fmean(r.choices(a, k=len(a))) for _ in range(2000))
print(f"kullanıcı başı harcama: A {st.fmean(a):.1f} TL, B {st.fmean(b):.1f} TL, fark {fark:+.1f} TL".replace(".", ","))
print(f"%95 önyükleme GA: {ornek[49]:+.1f} … {ornek[1949]:+.1f} TL".replace(".", ","))
print(f"ortanca: A {st.median(a):g}, B {st.median(b):g}")
```

```cikti
kullanıcı başı harcama: A 24,8 TL, B 20,0 TL, fark -4,8 TL
%95 önyükleme GA: -17,2 … +6,0 TL
ortanca: A 0, B 0
```

Benzetimde B'nin alım oranını biz yüksek koyduk; yine de bu örneklemde B daha az harcamış görünüyor. GA'nın iki
yönü de kapsaması, verinin yönü bile söyleyemediğini dürüstçe gösterir: çarpık harcama verisi çok gürültülüdür.
Kullanıcıların yarısından çoğu sıfır harcadığında ortanca da işe yaramaz (0 ve 0). Önyüklemede örneklenen birim
analiz birimidir: kullanıcı başına çok satır varsa kullanıcılar yeniden örneklenir, satırlar değil.

## İstatistiksel ve pratik anlamlılık

```python calistir
import math
from statistics import NormalDist


def karsilastir(d_a: int, n_a: int, d_b: int, n_b: int) -> str:
    p_a, p_b = d_a / n_a, d_b / n_b
    se = math.sqrt(p_a * (1 - p_a) / n_a + p_b * (1 - p_b) / n_b)
    p_ort = (d_a + d_b) / (n_a + n_b)
    z = (p_b - p_a) / math.sqrt(p_ort * (1 - p_ort) * (1 / n_a + 1 / n_b))
    p = 2 * (1 - NormalDist().cdf(abs(z)))
    fark = 100 * (p_b - p_a)
    metin = f"fark {fark:+.2f} puan, %95 GA {fark - 196 * se:+.2f} … {fark + 196 * se:+.2f}, p = {p:.3f}"
    return metin.replace(".", ",")


print("çok veri   (1.000.000 + 1.000.000):", karsilastir(100_000, 1_000_000, 101_000, 1_000_000))
print("az veri    (50 + 50)              :", karsilastir(5, 50, 10, 50))
print("örtüşen GA (2.500 + 2.500)        :", karsilastir(250, 2_500, 300, 2_500))
```

```cikti
çok veri   (1.000.000 + 1.000.000): fark +0,10 puan, %95 GA +0,02 … +0,18, p = 0,019
az veri    (50 + 50)              : fark +10,00 puan, %95 GA -3,86 … +23,86, p = 0,161
örtüşen GA (2.500 + 2.500)        : fark +2,00 puan, %95 GA +0,27 … +3,73, p = 0,024
```

| GA'nın konumu (önemli eşik: +1 puan) | Yorum |
| --- | --- |
| Tamamı eşiğin üstünde | Önemli ve kanıtlı etki |
| Sıfırın üstünde ama eşiğin altında (1. satır: +0,02 … +0,18) | Gerçek ama önemsiz etki; "anlamlı" kelimesine kanmayın |
| Sıfırı ve eşiği birlikte kapsıyor (2. satır: −3,9 … +23,9) | Karar için veri yetersiz; "etki yok" denemez |
| Tamamı eşiğin altında ve sıfıra yakın | Önemli bir etki olmadığı söylenebilir |

Üçüncü satır sık bir hatayı gösterir: A'nın GA'sı %8,8–%11,2, B'ninki %10,7–%13,3; aralıklar örtüşüyor ama
farkın GA'sı sıfırı içermiyor. **Ayrı aralıkların örtüşmesine bakarak "fark yok" denmez; farkın aralığına bakılır.**

## p-avcılığı: çatallanan yollar

Gerçek fark olmayan bir veride analist "son 1, 2, 3 ya da 4 hafta", "aykırıları kırp ya da kırpma", "dönüşüm mü
harcama mı" seçeneklerini dener ve anlamlı çıkanı raporlar:

```python calistir
import math
import random

r = random.Random(11)


def p_ortalama(a: list[float], b: list[float]) -> float:
    """İki ortalamanın farkı için yaklaşık z testi."""
    def ort_var(x: list[float]) -> tuple[float, float]:
        m = sum(x) / len(x)
        return m, sum((v - m) ** 2 for v in x) / (len(x) - 1)
    (ma, va), (mb, vb) = ort_var(a), ort_var(b)
    se = math.sqrt(va / len(a) + vb / len(b))
    return math.erfc(abs(mb - ma) / se / math.sqrt(2)) if se else 1.0


def grup(n: int) -> list[tuple[int, float]]:  # (gün, harcama); %8'i alıcı
    return [(r.randrange(28), r.lognormvariate(5, 1) if r.random() < 0.08 else 0.0) for _ in range(n)]


VERI, bulundu = 200, 0
for _ in range(VERI):
    a, b = grup(500), grup(500)  # A/A: gerçek fark YOK
    p_ler = []
    for son_gun in (7, 14, 21, 28):
        xa, xb = [t for g, t in a if g < son_gun], [t for g, t in b if g < son_gun]
        p_ler.append(p_ortalama([t > 0 for t in xa], [t > 0 for t in xb]))  # dönüşüm
        for kirp in (1.0, 0.99, 0.95):  # aykırı kırpma: yok, %99, %95
            esik = sorted(xa + xb)[int(kirp * (len(xa) + len(xb))) - 1]
            p_ler.append(p_ortalama([min(t, esik) for t in xa], [min(t, esik) for t in xb]))
    bulundu += min(p_ler) < 0.05
print(f"{len(p_ler)} analiz yolu; en az birinde p < 0,05 çıkan veri: %{100 * bulundu / VERI:.0f}")
assert bulundu / VERI > 0.1
```

```cikti
16 analiz yolu; en az birinde p < 0,05 çıkan veri: %20
```

Her yol tek başına makuldür; hepsini deneyip birini seçmek yanlış alarm oranını %5'ten dört katına çıkarır.
Önlem: analiz planı (dönem, ölçüt, aykırı kuralı) veriye bakmadan yazılır; denenen her şey rapora yazılır.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "p = 0,03, yani %97 olasılıkla B daha iyi" | p değeri yanlış okunmuş | Farkı ve GA'yı yazın; p yalnız "şansla açıklama güçlüğü" |
| "Anlamlı değil, demek ki etkisi yok" | Güç düşük; GA geniş | "Etki −2 ile +5 puan arasında; karar için veri yetersiz" |
| "%0 dönüşüm" (0/15) | Az veride nokta tahmini | Wilson aralığı: %0–%20 |
| GA inanılmayacak kadar dar | Olay düzeyinde hesap; satırlar bağımsız değil | Kullanıcı düzeyinde topla ya da önyükle |
| p = 0,049 kutlanıyor, p = 0,051 gömülüyor | Eşik büyüsü | GA ve etki büyüklüğünü yorumlayın |
| Çok büyük veride her fark "anlamlı" | Pratik eşik tanımlanmamış | "Önemli fark" eşiğini önceden yazın |
| İki aralık örtüşüyor, "fark yok" denildi | Ayrı GA'lara bakılmış | Farkın GA'sı |
| Bulgu ikinci veride tekrarlanmıyor | p-avcılığı, kazananın laneti | Önceden yazılı plan; doğrulama |
| Ortanca harcama iki grupta da 0 | Kullanıcıların çoğu harcamıyor | Kullanıcı başı ortalama + önyükleme; ya da alım oranı × alıcı başı tutar |
| Önyükleme sonucu her çalıştırmada değişiyor | Tohum yok; örnek sayısı az | Tohum verin; ≥ 2000 yeniden örnek |

## Denetim listesi

- [ ] Her karşılaştırma fark + %95 GA + n ile raporlandı; p değeri en çok yanında.
- [ ] Az veride ya da uç oranlarda Wilson aralığı kullanıldı.
- [ ] GA analiz birimine göre (kullanıcı düzeyi) hesaplandı.
- [ ] "Pratikte önemli" eşik analizden önce yazıldı; sonuç ona göre yorumlandı.
- [ ] "Anlamlı değil" sonuçlar GA ile, olabilecek en büyük etki söylenerek yazıldı.
- [ ] Denenen analiz sayısı yazıldı; birden çoksa düzeltme yapıldı ya da "keşif" dendi.
- [ ] İki grubun ayrı aralıklarına değil, farkın aralığına bakıldı.
- [ ] Önyüklemede tohum ve yeniden örnek sayısı yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her karşılaştırmada farkı, %95 güven aralığını ve n'yi ver. Oranda az veri varsa Wilson
  aralığı; ortanca ya da çarpık tutar için 2000 yeniden örneklemli önyükleme (tohum 0) kullan. p değerini
  'şansla açıklamanın güçlüğü' diye yorumla; 'olasılıkla doğru' ya da 'kanıtladı' deme. Anlamlı olmayan sonucu
  'etki yok' diye değil, GA ile yaz. Pratik önem eşiği: (eşik)."
- **Modelin tipik hatası:** p değerini "B'nin daha iyi olma olasılığı" sanır; "anlamlı değil"i "etki yok" yazar;
  0/20'de Wald aralığı verir; iki aralığın örtüşmesinden sonuç çıkarır; olay düzeyinde önyükler; tohum vermez.
- **Çıktıda denetleyin:** "olasılıkla", "kanıtladı", "etkisi yok" sözcüklerini arayın; GA ve n var mı; kaç
  analiz denendi.
- **Sorun:** "Güven aralığının alt ucu doğruysa yine de bu kararı verir miydik?"

## İlgili

- [A/B testi](ab-testi.md) — örneklem büyüklüğü, erken bakma, çoklu karşılaştırma
- [Betimsel istatistik](betimsel-istatistik.md) — ortalama, ortanca, çarpık dağılım
- [Korelasyon ve nedensellik](korelasyon-ve-nedensellik.md) — anlamlı ilişki neden değildir
- [Analiz raporu yazma](analiz-raporu-yazma.md) — belirsizliği raporda söylemek
- Önyükleme güven aralığı (katmanlı, gruplu, iki modelin farkı): [`ml-temel/ml_temel/olcut/bootstrap.py`](../../ml-temel/ml_temel/olcut/bootstrap.py);
  okuma kuralları: [`ml-temel/docs/DEGERLENDIRME.md`](../../ml-temel/docs/DEGERLENDIRME.md) (4. bölüm)
