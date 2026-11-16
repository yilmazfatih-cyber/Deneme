---
baslik: Adil paylaştırma ve borç sadeleştirme
ozet: Tutarı kuruşu kuruşuna bölmek (en büyük kalan yöntemi), yüzdelerin toplamını 100 tutmak, Alabama paradoksu, net bakiye ve en az ödemeyle borç kapatma; açgözlü yöntemin sınırı ve tam çözüm.
etiketler: [paylastirma, yuvarlama, para, borc-sadelestirme, en-buyuk-kalan]
duzey: orta
guncellik: 2026-11
---

# Adil paylaştırma ve borç sadeleştirme

> Bu notu ne zaman okumalı: bir tutarı kişilere, kalemlere ya da aylara bölerken (eşit, yüzde, hisse); ekranda
> yüzdelerin toplamı 99 ya da 101 çıktığında; ortak harcama uygulamasında "kim kime ne kadar ödesin" hesabını
> yazarken ya da denetlerken.

## Temel fikir

- Kuruş bölünmez. 100 TL üç kişiye bölünürken bir kuruş artar; o kuruş **bir yere gitmek zorundadır**. Her payı
  ayrı ayrı yuvarlamak toplamı bozar (33,33 × 3 = 99,99).
- **En büyük kalan yöntemi** (Hamilton): herkese tam payının tabanını ver; kalan kuruşları, kesirli kısmı en
  büyük olanlardan başlayarak birer birer dağıt. Sonuç: toplam tam korunur, kimse tam payından 1 kuruştan
  fazla sapmaz. Eşitlikte **belirlenimci** bir sıra (kişi sırası, kimlik) kullanılır.
- Bu yöntemin tuhaf bir yanı vardır (Alabama paradoksu): toplam artınca bir kişinin payı **azalabilir**. Testte
  "toplam artınca herkesin payı artar" diye bir kural yazmayın.
- Grup harcamasında her kişinin **net bakiyesi** = ödediği − payına düşen; bütün bakiyelerin toplamı sıfırdır.
  Borçları kapatmak için gereken ödeme sayısı en çok `n − 1`'dir; **en az** sayıyı bulmak genel olarak zordur
  (sıfır toplamlı alt grupları aramak), ama küçük gruplarda tam çözülür.

## Karar tablosu

| Durum                                             | Yöntem                                                   | Dikkat                                                      |
| ------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Eşit bölüşme                                      | Taban + kalan kuruşlar sıradaki ilk kişilere             | Hep aynı kişi fazla ödüyorsa sırayı döndürün                |
| Yüzde ya da hisseyle bölüşme                      | En büyük kalan; hesap `Fraction`/tam sayıyla             | `float` kalanlar eşitlikte rastgele davranır                |
| Ekranda yüzdeler (pasta grafiği, anket)           | En büyük kalan ile toplamı 100'e sabitleyin              | Tek tek yuvarlama 99 ya da 101 verir                        |
| Tutar = birçok kalemin toplamı (fatura, taksit)   | Kalemleri bölün, artığı tek kurala göre bir kaleme verin | Kural belgede yazılı olsun ([finans](finans-matematigi.md)) |
| Borç kapatma, grup küçük (≲ 12 kişi), en az ödeme | Tam çözüm: alt kümelerde dinamik programlama             | `2^n` büyür                                                 |
| Borç kapatma, büyük grup                          | Açgözlü: en büyük alacaklı ↔ en büyük borçlu             | En çok `n − 1` ödeme; en az olmayabilir                     |
| Kullanıcılar yalnız tanıdığına ödemek istiyor     | Kişi kişiye borç (sadeleştirmesiz)                       | Ödeme sayısı artar ama ilişki korunur                       |

## Kuruşu bölmek: en büyük kalan

```python calistir
import random
from fractions import Fraction


def allocate(total, weights):
    """En büyük kalan yöntemi. total: tam sayı kuruş; weights: tam sayı ya da Fraction."""
    if total < 0 or any(w < 0 for w in weights) or sum(weights) == 0:
        raise ValueError("tutar ve ağırlıklar eksi olamaz; ağırlıkların toplamı 0 olamaz")
    weight_sum = sum(weights)
    quotas = [Fraction(total * w, weight_sum) for w in weights]  # tam paylar (kesirli)
    shares = [q.numerator // q.denominator for q in quotas]  # tabanlar
    leftover = total - sum(shares)
    # Kesirli kısmı büyük olan önce; eşitlikte listedeki sıra (belirlenimci)
    order = sorted(range(len(weights)), key=lambda i: (-(quotas[i] - shares[i]), i))
    for i in order[:leftover]:
        shares[i] += 1
    return shares


# YANLIŞ: her payı ayrı yuvarlamak
assert [round(10_000 / 3)] * 3 == [3333, 3333, 3333]  # toplam 9 999: bir kuruş kayboldu

# DOĞRU
assert allocate(10_000, [1, 1, 1]) == [3334, 3333, 3333]
assert allocate(1_000, [2, 1, 1]) == [500, 250, 250]  # hisseyle
assert allocate(100, [1, 1, 1]) == [34, 33, 33]  # ekranda yüzdeler: toplam 100
percents = [Fraction("50.5"), Fraction("30.3"), Fraction("19.2")]
assert allocate(12_345, percents) == [6234, 3741, 2370]

# Değişmezler: toplam korunur, her pay tam payından 1 kuruştan az sapar
rng = random.Random(0)
for _ in range(1_000):
    weights = [rng.randint(0, 9) for _ in range(rng.randint(1, 6))]
    if sum(weights) == 0:
        continue
    total = rng.randint(0, 100_000)
    shares = allocate(total, weights)
    assert sum(shares) == total
    assert all(abs(s - Fraction(total * w, sum(weights))) < 1 for s, w in zip(shares, weights))
print("tamam")
```

Bu değişmezler (toplam eşitliği, birden az sapma) testinize girmesi gereken iki kuraldır. Ağırlıkları `float`
olarak alırsanız (`0.1 + 0.2` gibi) kesirli kısımlar yuvarlama gürültüsü taşır ve eşitlikte hangi kişiye kuruş
gideceği öngörülemez olur; yüzdeleri metinden `Fraction`/`Decimal` olarak okuyun.

## Alabama paradoksu: toplam artınca pay azalabilir

```python calistir
from fractions import Fraction


def allocate(total, weights):
    weight_sum = sum(weights)
    quotas = [Fraction(total * w, weight_sum) for w in weights]
    shares = [q.numerator // q.denominator for q in quotas]
    order = sorted(range(len(weights)), key=lambda i: (-(quotas[i] - shares[i]), i))
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return shares


weights = [1, 3, 3]
assert allocate(3, weights) == [1, 1, 1]
assert allocate(4, weights) == [0, 2, 2]  # toplam arttı, ilk kişinin payı 1'den 0'a düştü
print("tamam")
```

Kuruş düzeyinde etkisi küçüktür ama iki sonucu vardır: (1) "toplam artarsa herkesin payı artar ya da aynı
kalır" diye özellik testi (property test) yazmayın, başarısız olur; (2) kişi başına küçük tam sayılar
paylaştırıyorsanız (koltuk, kontenjan, nöbet) bu yöntemin bu kusurunu kullanıcıya açıklayın ya da başka
yöntem (bölen yöntemleri) seçin.

## Net bakiye ve borç sadeleştirme

```python calistir
def net_balances(expenses):
    """expenses: (ödeyen, tutar_kuruş, {kişi: pay_kuruş}). Bakiye > 0: alacaklı, < 0: borçlu."""
    balance = {}
    for payer, amount, shares in expenses:
        assert sum(shares.values()) == amount, "paylar tutara eşit olmalı"
        balance[payer] = balance.get(payer, 0) + amount
        for person, share in shares.items():
            balance[person] = balance.get(person, 0) - share
    return balance


def settle_greedy(balance):
    """En büyük alacaklıya en büyük borçlu öder; en çok n − 1 ödeme."""
    bal, transfers = dict(balance), []
    while True:
        creditor = max(bal, key=lambda k: (bal[k], k))
        debtor = min(bal, key=lambda k: (bal[k], k))
        if bal[creditor] == 0:
            return transfers
        amount = min(bal[creditor], -bal[debtor])
        transfers.append((debtor, creditor, amount))
        bal[creditor] -= amount
        bal[debtor] += amount


expenses = [
    ("Ali", 90_000, {"Ali": 30_000, "Ayşe": 30_000, "Can": 30_000}),  # market
    ("Ayşe", 30_000, {"Ayşe": 15_000, "Can": 15_000}),  # fatura (Ali yoktu)
]
balance = net_balances(expenses)
assert balance == {"Ali": 60_000, "Ayşe": -15_000, "Can": -45_000}
assert sum(balance.values()) == 0  # değişmez: bakiyeler toplamı sıfır
transfers = settle_greedy(balance)
assert transfers == [("Can", "Ali", 45_000), ("Ayşe", "Ali", 15_000)]
print("tamam")
```

Açgözlü yöntem çoğu zaman iyidir ama **en az** ödeme sayısını garanti etmez. En az sayı şudur: sıfırdan farklı
bakiyeli kişi sayısı eksi "toplamı sıfır olan ayrık alt grupların en büyük sayısı" (her alt grup kendi içinde
`boy − 1` ödemeyle kapanır).

```python calistir
import random


def settle_greedy_count(values):
    bal, count = list(values), 0
    while max(bal) > 0:
        i, j = bal.index(max(bal)), bal.index(min(bal))
        amount = min(bal[i], -bal[j])
        bal[i], bal[j], count = bal[i] - amount, bal[j] + amount, count + 1
    return count


def settle_min_count(values):
    """Tam çözüm, O(n·2^n): dp[küme] = kümeyi bölen en çok sıfır toplamlı grup sayısı."""
    vals = [v for v in values if v != 0]
    n = len(vals)
    total, best = [0] * (1 << n), [0] * (1 << n)
    for mask in range(1, 1 << n):
        low = (mask & -mask).bit_length() - 1
        total[mask] = total[mask & (mask - 1)] + vals[low]
        best[mask] = max(best[mask ^ (1 << i)] for i in range(n) if mask >> i & 1) + (total[mask] == 0)
    return n - best[(1 << n) - 1]


example = [5, 4, 2, -6, -5]  # {5, −5} ve {4, 2, −6} kendi içinde kapanır
assert settle_greedy_count(example) == 4  # açgözlü: 4 ödeme
assert settle_min_count(example) == 3  # en az: 3 ödeme

rng = random.Random(0)
worse = 0
for _ in range(300):
    values = [rng.randint(-9, 9) for _ in range(5)]
    values.append(-sum(values))
    nonzero = sum(1 for v in values if v)
    greedy, best = settle_greedy_count(values), settle_min_count(values)
    assert best <= greedy <= max(nonzero - 1, 0)  # sınırlar her zaman tutar
    worse += greedy > best
print(f"300 rastgele grupta açgözlü yöntem {worse} kez en azdan fazla ödeme önerdi")
assert 0 < worse < 100
```

Ürün kararı: sadeleştirme, hiç ortak harcaması olmayan iki kişiyi birbirine borçlandırabilir (A, hiç
tanımadığı C'ye öder). Kullanıcıya iki görünüm sunun ("en az ödeme" ve "kişi kişiye") ve sadeleştirmenin
bakiyeleri değiştirmediğini, yalnız ödeme yolunu değiştirdiğini gösterin. Tam çözüm 12–15 kişinin üstünde
yavaşlar; o zaman açgözlü yönteme düşün.

## Tuzaklar

| Belirti                                                       | Neden                                                  | Çözüm                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Bölüşülen payların toplamı tutardan 1–2 kuruş eksik/fazla     | Her pay ayrı yuvarlandı                                | En büyük kalan; `sum(paylar) == tutar` testi                      |
| Ekrandaki yüzdelerin toplamı 99 ya da 101                     | Tek tek yuvarlama                                      | Gösterimde de en büyük kalan                                      |
| Fazla kuruş her seferinde farklı kişiye gidiyor               | Eşitlikte belirsiz sıra; `float` kalanlar              | Tam sayı/`Fraction` hesap; belirlenimci bağ kırma                 |
| Hep aynı kişi fazla kuruşu ödüyor                             | Bağ kırma hep listenin başını seçiyor                  | Sırayı döndürün ya da ödeyene verin; kuralı yazın                 |
| Özellik testi "toplam artınca pay azalmaz" ara sıra kalıyor   | Alabama paradoksu: yöntemin doğal davranışı            | O testi kaldırın; toplam ve "1 kuruştan az sapma" testleri kalsın |
| Bakiyelerin toplamı sıfır değil                               | Paylar tutara eşit değil ya da ödeme kaydı tek taraflı | Harcama girişinde `sum(paylar) == tutar` doğrulaması              |
| "Sadeleştirilmiş" ödeme sayısı en az değil                    | Açgözlü yöntem en azı garanti etmez                    | Küçük grupta tam çözüm; büyükte açgözlü + açıklama                |
| Kullanıcı tanımadığı birine ödeme yapması istendiğinde itiraz | Sadeleştirme ilişkiyi değiştirdi                       | "Kişi kişiye" görünümü de sunun                                   |

## Denetim listesi

- [ ] Bütün tutarlar tam sayı kuruş; ağırlık ve yüzdeler `Fraction`/`Decimal` olarak metinden okunuyor.
- [ ] Her bölüşmede `sum(paylar) == tutar` ve "her pay tam payından 1 kuruştan az sapar" testleri var.
- [ ] Bağ kırma kuralı belirlenimci ve belgede yazılı.
- [ ] Ekranda gösterilen yüzdelerin toplamı 100.
- [ ] Net bakiyelerin toplamı sıfır (her kayıttan sonra denetleniyor).
- [ ] Borç kapatma önerisi sonrası bütün bakiyeler sıfırlanıyor (test).
- [ ] Sadeleştirmenin en az ödemeyi garanti edip etmediği kullanıcıya doğru anlatılmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Tutarları tam sayı kuruş tut. Bölüşmede en büyük kalan yöntemini kullan, eşitlikte kişi
  sırasını esas al. `sum(paylar) == tutar` ve `abs(pay − tam_pay) < 1` testlerini rastgele girdilerle yaz.
  Borç kapatmada bakiyelerin sıfırlandığını sınayan test ekle."
- **Modelin tipik hatası:** `round(tutar / n, 2)` ile bölüp artığı unutur; yüzdeleri `float` alır; açgözlü
  sadeleştirmeyi "en az ödeme" diye adlandırır; bağ kırmayı `dict` sırasına ya da `float` karşılaştırmasına
  bırakır; "toplam artınca pay artar" testi yazar.
- **Çıktıda denetleyin:** `round(` ve `/ len(` kalıpları para kodunda; testlerde toplam eşitliği; sadeleştirme
  işlevinin adı ve belgesi ne vaat ediyor.
- **Örnek isteyin:** "100 TL üç kişi → 33,34 / 33,33 / 33,33" ve "bakiyeler [5, 4, 2, −6, −5] → en az 3 ödeme"
  örneklerini test olarak verin.

## İlgili

- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): kuruş, `Decimal`, yuvarlama kipleri
- [Finans matematiği](finans-matematigi.md): taksit ve KDV'de yuvarlama artığı
- [Kombinatorik](kombinatorik.md): alt küme sayısının (`2^n`) büyümesi
- [Ayrık matematik](ayrik-matematik.md): çizge olarak borç ilişkileri, döngü değişmezi
- En büyük kalan yöntemiyle `allocate`, `split`: [`kutuphane/py/kutuphane/para.py`](../../kutuphane/py/kutuphane/para.py)
  (TypeScript eşi [`para.ts`](../../kutuphane/ts/src/para.ts))
