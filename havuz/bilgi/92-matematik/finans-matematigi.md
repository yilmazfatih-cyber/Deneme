---
baslik: Finans matematiği
ozet: Yüzde ve yüzde puan, bileşik faiz ve efektif yıllık oran, enflasyon ve reel getiri, kuruş yuvarlamalı eşit taksitli kredi planı, net bugünkü değer ve iç verim oranı, KDV dahil/hariç hesabı; çalışan Decimal örnekleriyle.
etiketler: [finans, faiz, kredi, enflasyon, kdv, para]
duzey: temel
guncellik: 2026-11
---

# Finans matematiği

> Bu notu ne zaman okumalı: faiz, taksit, zam, indirim, enflasyon ya da KDV hesaplayan bir ekran veya rapor
> yaparken; bir kredi/yatırım teklifini karşılaştırırken; uygulamanın hesabı bankanın ya da muhasebenin hesabıyla
> kuruşuna kadar tutmadığında.
>
> **Not:** Bu not hesap yöntemini anlatır; yatırım, kredi ya da vergi danışmanlığı değildir. Oranlar örnektir;
> güncel oran ve kuralları ilgili kurumdan doğrulayın.

## Temel fikir

- **Yüzde** orandır, **yüzde puan** iki oranın farkıdır. Faiz %40'tan %45'e çıktıysa artış 5 puan, ama %12,5'tir.
- Yüzde değişimler **çarpılır**, toplanmaz: %50 düşüş ardından %50 artış başa döndürmez (%25 kayıp).
- **Bileşik faiz**: faiz faize de işler; `son = ana para · (1 + r)^n`. Aylık oranın 12 katı (nominal) ile yıllık
  gerçek maliyet (efektif) farklıdır; yüksek oranlarda fark büyüktür.
- **Reel getiri** enflasyondan arındırılmış getiridir: `(1 + nominal) / (1 + enflasyon) − 1`. "Nominal eksi
  enflasyon" yalnız küçük oranlarda yaklaşıktır.
- **Bugünkü değer**: gelecekteki para bugün daha az eder; iskonto oranıyla bugüne çekilir. Bir yatırımın net
  bugünkü değeri (NBD) sıfırdan büyükse, iskonto oranından fazla kazandırır.
- Para hesabı **Decimal ya da tam sayı kuruşla** yapılır; yuvarlama kuralı (kip, satır mı toplam mı, son taksit
  farkı) iş kuralıdır ve yazılır ([sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md)).

## Karar tablosu

| Soru                                     | Hesap                                                | Tuzak                                                         |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Oran iki dönem arasında ne kadar değişti | Yüzde puan (fark) ve yüzde (göreli) **ikisi birden** | "%5 arttı" belirsizdir                                        |
| Ardışık zam/indirim                      | Çarpanları çarpın: `(1 + a)(1 + b) − 1`              | Toplamak yanlış                                               |
| Aylık oranlı teklifin yıllık maliyeti    | Efektif: `(1 + r_ay)^12 − 1`                         | `r_ay · 12` maliyeti küçük gösterir                           |
| Getiri enflasyonu yendi mi               | Reel: `(1 + n)/(1 + e) − 1`                          | `n − e` yüksek enflasyonda yanıltır                           |
| Eşit taksit tutarı                       | `A = P · r / (1 − (1 + r)^(−n))`                     | Kuruş yuvarlaması: son taksit farkı                           |
| Yatırım kârlı mı                         | NBD (iskonto oranıyla)                               | Oran seçimi sonucu belirler                                   |
| Yatırımın getiri oranı                   | İç verim oranı (NBD = 0), ikiye bölmeyle             | Nakit akışı birden çok kez işaret değiştirirse birden çok kök |
| KDV dahil fiyattan KDV hariç tutar       | `dahil / (1 + oran)`                                 | `dahil · (1 − oran)` yanlış                                   |

## Yüzde ve yüzde puan

```python calistir
from decimal import Decimal

old_rate, new_rate = Decimal("0.40"), Decimal("0.45")
assert new_rate - old_rate == Decimal("0.05")  # 5 yüzde puan
assert (new_rate - old_rate) / old_rate == Decimal("0.125")  # %12,5 artış

price = Decimal("100")
assert price * Decimal("0.5") * Decimal("1.5") == 75  # %50 düşüş + %50 artış = %25 kayıp
assert price * Decimal("0.8") * Decimal("1.2") == 96  # %20 indirim + %20 zam = %4 kayıp
# Bir düşüşü geri almak için gereken artış: 1/(1 − d) − 1
assert Decimal(1) / (1 - Decimal("0.5")) - 1 == 1  # %50 düşüşü telafi: %100 artış
print("tamam")
```

## Bileşik faiz ve efektif oran

```python calistir
import math
from decimal import Decimal

monthly = Decimal("0.03")
effective = (1 + monthly) ** 12 - 1
assert round(effective, 4) == Decimal("0.4258")  # yıllık gerçek maliyet %42,58
assert monthly * 12 == Decimal("0.36")  # "yıllık %36" demek maliyeti küçük gösterir

# 10 000 TL, aylık %3, 24 ay
final = Decimal("10000") * (1 + monthly) ** 24
assert round(final, 2) == Decimal("20327.94")


# 72 kuralı: ikiye katlanma ≈ 72 / (yüzde oran). Yüksek oranda bozulur
def doubling_years(rate):
    return math.log(2) / math.log(1 + rate)


assert abs(72 / 10 - doubling_years(0.10)) < 0.1  # %10: 7,2 vs 7,27
assert doubling_years(0.45) - 72 / 45 > 0.25  # %45: 1,6 vs 1,87 yıl
print("tamam")
```

Faiz bileşikleşme sıklığını (aylık, günlük) ve oranın nominal mi efektif mi olduğunu sözleşme belirler; hesap
yazmadan önce bunu öğrenin. Türkiye'de tüketici kredilerinde faiz tutarına ek olarak KKDF ve BSMV gibi
kesintiler uygulanabilir; oranları değişir (Kasım 2026, burada oran verilmedi). Hesabınızı her zaman bankanın
ödeme planıyla karşılaştırın.

## Enflasyon ve reel getiri

```python calistir
from decimal import Decimal

nominal, inflation = Decimal("0.45"), Decimal("0.40")
real = (1 + nominal) / (1 + inflation) - 1
assert round(real, 4) == Decimal("0.0357")  # gerçek reel getiri %3,57
assert nominal - inflation == Decimal("0.05")  # kaba yaklaşım %5: yüksek enflasyonda çok yanlış

# Düşük oranlarda yaklaşım işe yarar
low = (1 + Decimal("0.05")) / (1 + Decimal("0.03")) - 1
assert abs(low - Decimal("0.02")) < Decimal("0.001")  # %1,94 ile %2: yakın

# Satın alma gücü: 3 yıl %40 enflasyonda 100 000 TL bugünün kaç TL'si eder
assert round(Decimal("100000") / (1 + inflation) ** 3, 0) == Decimal("36443")
print("tamam")
```

## Eşit taksitli kredi: kuruşuna kadar

Taksit formülü `A = P · r / (1 − (1 + r)^(−n))`. Her ay faiz `kalan · r` kuruşa yuvarlanır; anapara payı
`taksit − faiz`. Yuvarlama artığı **son taksitte** kapanır, böylece anapara toplamı tam tutar.

```python calistir
from decimal import ROUND_HALF_UP, Decimal

KURUS = Decimal("0.01")


def to_kurus(x):
    return x.quantize(KURUS, rounding=ROUND_HALF_UP)


def payment_plan(principal, monthly_rate, months):
    payment = to_kurus(principal * monthly_rate / (1 - (1 + monthly_rate) ** -months))
    balance, rows = principal, []
    for month in range(1, months + 1):
        interest = to_kurus(balance * monthly_rate)
        part = balance if month == months else payment - interest  # son ay: kalanın tamamı
        balance -= part
        rows.append({"ay": month, "taksit": part + interest, "faiz": interest, "anapara": part, "kalan": balance})
    return rows


plan = payment_plan(Decimal("100000"), Decimal("0.03"), 12)
assert plan[0]["taksit"] == Decimal("10046.21") and plan[0]["faiz"] == Decimal("3000.00")
assert plan[-1]["taksit"] == Decimal("10046.19")  # son taksit 2 kuruş farklı: yuvarlama artığı
assert sum(r["anapara"] for r in plan) == Decimal("100000")  # anapara tam kapanıyor
assert plan[-1]["kalan"] == 0
assert sum(r["faiz"] for r in plan) == Decimal("20554.50")
print("toplam geri ödeme:", sum(r["taksit"] for r in plan))
```

```cikti
toplam geri ödeme: 120554.50
```

Bankalar yuvarlama farkını ilk ya da son taksite koyabilir, faizi günlük işletebilir; tek bir doğru yoktur.
Uygulamanız bir bankanın planını gösterecekse **onun planıyla birebir karşılaştıran bir test** yazın; uymuyorsa
farkın kuralını öğrenin, toleransla geçiştirmeyin.

## Net bugünkü değer ve iç verim oranı

```python calistir
def npv(rate, flows):
    """flows[0] bugün (genellikle eksi: yatırım), flows[t] t. yıl sonu."""
    return sum(cf / (1 + rate) ** t for t, cf in enumerate(flows))


def irr(flows, lo, hi, tol=1e-10, max_iter=200):
    """NBD = 0 yapan oran, ikiye bölmeyle; aralıkta işaret değişimi şart."""
    f_lo = npv(lo, flows)
    if f_lo * npv(hi, flows) > 0:
        raise ValueError("aralıkta kök yok")
    for _ in range(max_iter):
        mid = (lo + hi) / 2
        if (npv(mid, flows) > 0) == (f_lo > 0):
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            return (lo + hi) / 2
    raise RuntimeError("yakınsamadı")


flows = [-100_000, 30_000, 40_000, 50_000, 20_000]
assert round(npv(0.10, flows)) == 11_557  # %10 iskontoyla kârlı
assert npv(0.20, flows) < 0  # %20 beklentiyle kârsız
rate = irr(flows, 0.0, 1.0)
assert abs(npv(rate, flows)) < 1e-4 and round(rate, 4) == 0.1532  # iç verim oranı %15,32

# İşaret iki kez değişen akışta iki iç verim oranı vardır: tek sayı yanıltır
odd = [-100, 230, -132]
assert round(irr(odd, 0.0, 0.15), 6) == 0.1 and round(irr(odd, 0.15, 0.5), 6) == 0.2
print("tamam")
```

İskonto oranı bir **varsayımdır** (sermayenin maliyeti, beklenen getiri, enflasyon); sonuç ona çok duyarlıdır.
Raporda birkaç oranla NBD verin. Projeleri karşılaştırırken iç verim oranı ölçeği görmez: küçük ama yüksek
oranlı proje, büyük ama daha düşük oranlı projeden daha az değer yaratabilir; NBD'ye bakın.

## KDV dahil ve hariç

```python calistir
from decimal import ROUND_HALF_UP, Decimal

KURUS = Decimal("0.01")
VAT = Decimal("0.20")  # örnek oran


def to_kurus(x):
    return x.quantize(KURUS, rounding=ROUND_HALF_UP)


gross = Decimal("120.00")
net = to_kurus(gross / (1 + VAT))
assert net == Decimal("100.00")  # DOĞRU: dahil / (1 + oran)
assert to_kurus(gross * (1 - VAT)) == Decimal("96.00")  # YANLIŞ: %20'yi "dahil" tutardan düşmek
assert gross - net == Decimal("20.00")  # KDV tutarı

# Satır satır mı, toplamda mı? Üç adet 0,13 TL'lik kalem
lines = [Decimal("0.13")] * 3
per_line = sum(to_kurus(p * VAT) for p in lines)
on_total = to_kurus(sum(lines) * VAT)
assert (per_line, on_total) == (Decimal("0.09"), Decimal("0.08"))  # 1 kuruş fark
print("tamam")
```

Satır bazında mı toplamda mı yuvarlanacağı ve hangi kipin kullanılacağı muhasebe/e-fatura kuralıdır; belgeye
yazın, tek bir yardımcıda uygulayın, toplamların eşitliğini test edin. Havuzdaki hazır yardımcı
[`para.py`](../../kutuphane/py/kutuphane/para.py) `add_vat`/`remove_vat` ile ikisini de kuruş kaybı olmadan yapar.

## Tuzaklar

| Belirti                                                      | Neden                                                     | Çözüm                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| "Faiz %5 arttı" cümlesi iki farklı anlama çekiliyor          | Yüzde ile yüzde puan karıştı                              | İkisini birden yazın: "5 puan (%12,5)"                |
| Ardışık indirim/zam sonrası fiyat beklenenden farklı         | Yüzdeler toplandı                                         | Çarpanları çarpın                                     |
| Teklifin yıllık maliyeti bankanınkinden düşük çıktı          | Aylık oran 12 ile çarpıldı (nominal)                      | Efektif oran: `(1 + r)^12 − 1`                        |
| Reel getiri yüksek enflasyonda olduğundan iyi görünüyor      | `nominal − enflasyon` yaklaşımı                           | `(1 + n)/(1 + e) − 1`                                 |
| Taksit planında toplam anapara 99 999,98 TL                  | Yuvarlama artığı kapanmamış; ya da `float`                | Son taksitte kalanı kapatın; `Decimal`/kuruş          |
| Plan bankanınkiyle birkaç kuruş tutmuyor                     | Farklı yuvarlama kipi, faiz işletme günü, vergi kesintisi | Bankanın kuralını öğrenin; birebir test               |
| KDV hariç tutar %4 eksik                                     | `dahil · (1 − oran)` kullanıldı                           | `dahil / (1 + oran)`                                  |
| Fatura toplamı KDV satırlarının toplamından 1 kuruş farklı   | Satır ve toplam ayrı yuvarlandı                           | Tek kural seçin, belgeye yazın, test edin             |
| İç verim oranı hesabı "kök yok" diyor ya da iki farklı değer | Akış birden çok kez işaret değiştiriyor                   | NBD'yi oranlara karşı tablolayın; NBD ile karar verin |

## Denetim listesi

- [ ] Bütün para hesapları `Decimal` (metinden kurulmuş) ya da tam sayı kuruşla; `float` yok.
- [ ] Yuvarlama kipi, satır/toplam kuralı ve son taksit farkı belgelenmiş ve tek yardımcıda.
- [ ] Taksit planında anapara toplamı tutara, son kalan sıfıra eşit (test).
- [ ] Oranların nominal mi efektif mi, aylık mı yıllık mı olduğu her alanın yanında yazılı.
- [ ] Değişimler hem yüzde puan hem yüzde olarak gösteriliyor.
- [ ] Reel getiri Fisher formülüyle; NBD birden çok iskonto oranıyla raporlanmış.
- [ ] Ekranda "danışmanlık değildir" ve "oranları kurumdan doğrulayın" uyarısı var.
- [ ] En az bir test, gerçek bir banka/muhasebe çıktısıyla kuruşu kuruşuna karşılaştırıyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Para için `Decimal` kullan, metinden kur (`Decimal('0.03')`). Taksit formülü
  `A = P·r/(1 − (1+r)^(−n))`; faizi her ay `ROUND_HALF_UP` ile kuruşa yuvarla; artığı son taksitte kapat. Anapara
  toplamının tutara eşit olduğunu sınayan test yaz."
- **Modelin tipik hatası:** `float` kullanır; aylık oranı 12 ile çarpıp "yıllık" der; KDV hariç tutarı
  `dahil * 0.8` diye hesaplar; reel getiriyi `n − e` yazar; yuvarlama artığını unutur; IRR için kök aralığını
  denetlemez.
- **Çıktıda denetleyin:** `float(` ve tırnaksız `Decimal(0.`; `* 12`; `* (1 - `; plan toplam testleri; hesap
  ekranında uyarı metni.
- **Örnekle doğrulatın:** "100 000 TL, aylık %3, 12 ay → taksit 10 046,21 TL, son taksit 10 046,19 TL, toplam faiz
  20 554,50 TL" gibi bilinen bir planı teste koyun.

## İlgili

- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): kuruş, `Decimal`, yuvarlama kipleri
- [Sayısal yöntemler](sayisal-yontemler.md): ikiye bölme ve durma ölçütü (iç verim oranı)
- [Tahmin ve büyüklük sezgisi](tahmin-ve-buyukluk-sezgisi.md): "bu sayı makul mü" denetimi
- [Getiri ve risk ölçüleri](getiri-ve-risk.md): geometrik ortalama, oynaklık, düşüş, geriye dönük sınama
- [Adil paylaştırma ve borç sadeleştirme](adil-paylastirma.md): tutarı kuruşu kuruşuna bölmek
- [Fiyatlandırma](../95-urun/fiyatlandirma.md): fiyat sayfasında KDV gösterimi, birim ekonomisi
- Kuruş temelli para tipi, KDV dahil/hariç, toplamı koruyan paylaştırma:
  [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py)
