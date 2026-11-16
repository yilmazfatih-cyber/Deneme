---
baslik: Kombinatorik
ozet: Permütasyon, kombinasyon, tekrarlı seçim, güvercin yuvası ve dahil etme-dışlama; doğum günü problemi ile karma ve kısa kod çakışması, olasılık hesabında sayma, kaba kuvvetin ne zaman imkânsızlaştığı.
etiketler: [kombinatorik, sayma, olasilik, karma, cakisma]
duzey: temel
guncellik: 2026-11
---

# Kombinatorik

> Bu notu ne zaman okumalı: "Kaç farklı durum var?", "rastgele kodlar çakışır mı?", "bütün kombinasyonları
> denesek ne kadar sürer?", "örneklemde kusur görmedik, parti temiz mi?" sorularında; kısa kimlik, karma
> (hash) ya da test kapsamı tasarlarken.

## Temel fikir

- Saymanın iki sorusu vardır: **sıra önemli mi?** ve **aynı öğe tekrar seçilebilir mi?** Dört formül bu iki
  sorunun yanıtlarından çıkar. Soruyu yanlış yanıtlamak ya çift saymaya ya eksik saymaya götürür.
- Sayılar çok hızlı büyür (`n!`, `2^n`). "Hepsini deneriz" planı çoğu zaman birkaç düzine öğede imkânsızlaşır;
  sayıyı önce hesaplayın, sonra karar verin.
- **Güvercin yuvası**: `n` kutuya `n + 1` öğe koyarsanız bir kutuda en az iki öğe olur. Kesinlik verir ama geç
  devreye girer. **Doğum günü problemi** çakışmanın çok daha erken, kabaca `√(kutu sayısı)` öğede olası
  olduğunu söyler.
- Eşit olasılıklı sonuçlarda olasılık = "istenen durum sayısı / bütün durumlar"; sayma, olasılığın temelidir.

## Karar tablosu

| Sıra önemli mi | Tekrar var mı | Formül                         | Python                     | Örnek                                  |
| -------------- | ------------- | ------------------------------ | -------------------------- | -------------------------------------- |
| Evet           | Hayır         | `n! / (n−k)!`                  | `math.perm(n, k)`          | 10 kişiden başkan, yardımcı, sekreter   |
| Evet           | Evet          | `n^k`                          | `n ** k`                   | 4 haneli PIN, parola                    |
| Hayır          | Hayır         | `n! / (k!·(n−k)!)`             | `math.comb(n, k)`          | 49'dan 6 sayı, 20 kişiden 3 kişilik ekip |
| Hayır          | Evet          | `C(n+k−1, k)`                  | `math.comb(n + k - 1, k)`  | 5 çeşitten 3 top dondurma (aynısı olabilir) |

| Soru                                                    | Araç                                     |
| ------------------------------------------------------- | ---------------------------------------- |
| "Bu kadar kayıtta rastgele kimlik çakışır mı?"           | Doğum günü yaklaşımı: `1 − e^(−n²/2N)`    |
| "Çakışma kesin olur mu?"                                | Güvercin yuvası: `n > N` ise kesin        |
| "En az bir koşulu sağlayan kaç öğe?"                    | Dahil etme-dışlama                        |
| "Örneklemde kusur yok; parti temiz mi?"                 | Hipergeometrik olasılık (yerine koymadan) |
| "Bütün kombinasyonları deneyebilir miyiz?"              | Sayıyı hesaplayın; > ~10⁸ ise başka yol   |

## Dört formül, kaba kuvvetle doğrulanmış

```python calistir
import math
from itertools import combinations, combinations_with_replacement, permutations, product

items, k = "ABCDE", 3
n = len(items)
assert len(list(permutations(items, k))) == math.perm(n, k) == 60  # sıra önemli, tekrar yok
assert len(list(product(items, repeat=k))) == n**k == 125  # sıra önemli, tekrar var
assert len(list(combinations(items, k))) == math.comb(n, k) == 10  # sıra önemsiz, tekrar yok
assert len(list(combinations_with_replacement(items, k))) == math.comb(n + k - 1, k) == 35

# Arama uzayı bit cinsinden: log2(durum sayısı). Her bit, kaba kuvvet süresini ikiye katlar
assert round(math.log2(26**8), 1) == 37.6  # 8 küçük harf
assert round(math.log2(62**12), 1) == 71.5  # 12 harf+rakam
assert 26**8 / 1e10 < 60  # varsayım: saniyede 10 milyar deneme → bir dakikadan kısa
print("tamam")
```

Küçük bir durumda formülü `itertools` ile sayarak doğrulamak, büyük durumda formüle güvenmenin en ucuz yoludur.

## Doğum günü problemi ve çakışma

23 kişilik bir odada iki kişinin doğum gününün aynı olma olasılığı %50'yi geçer. Aynı hesap rastgele kimlik,
karma ve kısa kod için geçerlidir: `N` olası değere `n` öğe dağıtılırsa çakışma olasılığı yaklaşık
`1 − e^(−n²/2N)`; %50 eşiği `n ≈ 1,1774·√N`'dir.

```python calistir
import math
import random


def collision_probability(n, space):
    """n öğe, 'space' eşit olası değere rastgele dağılıyor: en az bir çakışma olasılığı (tam)."""
    no_collision = 1.0
    for i in range(n):
        no_collision *= (space - i) / space
    return 1 - no_collision


assert round(collision_probability(23, 365), 4) == 0.5073
assert round(1 - math.exp(-23 * 22 / (2 * 365)), 4) == 0.5000  # yaklaşık formül

rng = random.Random(42)
trials = 20_000
hits = sum(len({rng.randrange(365) for _ in range(23)}) < 23 for _ in range(trials))
assert abs(hits / trials - 0.5073) < 0.02  # benzetim de aynı


def half_chance(space):
    """%50 çakışma için gereken öğe sayısı ≈ 1,1774·√space."""
    return math.sqrt(2 * space * math.log(2))


assert round(half_chance(2**32)) == 77163  # 32 bitlik karma (CRC32 gibi): ~77 bin kayıt
assert round(half_chance(62**6), -3) == 281_000  # 6 karakterlik rastgele kısa kod
assert half_chance(2**122) > 2e18  # UUIDv4 (122 rastgele bit): pratikte çakışmaz
print("tamam")
```

| Değer uzayı                           | %50 çakışma eşiği    | Sonuç                                              |
| ------------------------------------- | -------------------- | -------------------------------------------------- |
| 32 bit (CRC32, `int32` rastgele kimlik) | ~77 bin              | Tekilleştirme ya da kimlik için **yetmez**          |
| 6 karakter, 62 harf/rakam             | ~281 bin             | Kısa URL üretirken her kodda çakışma denetimi şart  |
| 64 bit                                | ~5 milyar            | Orta ölçekte yeter; yine de benzersizlik kısıtı koyun |
| 122 bit (UUIDv4), 256 bit (SHA-256)   | Astronomik           | Rastgelelik kaynağı iyiyse çakışma beklenmez        |

Kural: rastgele kimlik üretiyorsanız veritabanında **benzersizlik kısıtı** ve çakışmada yeniden üretme her zaman
olsun; olasılık hesabı kısıtın yerini tutmaz, yalnız ne sıklıkla devreye gireceğini söyler.

## Güvercin yuvası: kesinlik ve imkânsızlık

```python calistir
import random
import zlib

# 2^32 + 1 farklı girdi varsa 32 bitlik karmada çakışma KESİNDİR (ama çok daha önce olasıdır)
assert 2**32 + 1 > 2**32

# Her dosyayı küçülten kayıpsız sıkıştırma yoktur: n bitlik 2^n dizgi var,
# daha kısa dizgilerin toplamı 2^n − 1. En az biri küçülemez.
n = 16
assert sum(2**length for length in range(n)) == 2**n - 1

# Gerçekte: rastgele veri sıkışmaz, üstelik büyür (başlık + sağlama)
data = random.Random(1).randbytes(1000)
assert len(zlib.compress(data, 9)) > len(data)
print("tamam")
```

Pratik sonuçlar: kısa karma kesin benzersizlik vaat edemez; "her girdiyi küçülten sıkıştırma" ya da "çakışmasız
kısa özet" iddiası yanlıştır. Şifrelenmiş ve sıkıştırılmış veri rastgele görünür; tekrar sıkıştırmak boşunadır.

## Dahil etme-dışlama ve çekiliş problemi

"En az bir koşulu sağlayan" sayısı: tek tek toplayıp, ikili kesişimleri çıkarıp, üçlüyü geri eklemek.

```python calistir
import math
from fractions import Fraction
from itertools import permutations

# 1..1000 içinde 2'ye, 3'e ya da 5'e bölünenler
A, B, C = set(range(2, 1001, 2)), set(range(3, 1001, 3)), set(range(5, 1001, 5))
formula = len(A) + len(B) + len(C) - len(A & B) - len(A & C) - len(B & C) + len(A & B & C)
assert formula == len(A | B | C) == 734


def derangements(n):
    """Kimsenin kendini çekmediği dizilişlerin sayısı (!n)."""
    a, b = 1, 0  # !0, !1
    for k in range(2, n + 1):
        a, b = b, (k - 1) * (a + b)
    return b if n else a


for n in range(1, 8):  # kaba kuvvetle doğrula
    count = sum(all(p[i] != i for i in range(n)) for p in permutations(range(n)))
    assert count == derangements(n)

# Yılbaşı çekilişi: 10 kişi rastgele karıştırılınca kimsenin kendini çekmeme olasılığı ≈ 1/e
p_valid = Fraction(derangements(10), math.factorial(10))
assert abs(float(p_valid) - 1 / math.e) < 1e-6
assert round(1 / float(p_valid), 2) == 2.72  # "geçerli olana dek yeniden karıştır" ortalama 2,72 deneme
print("tamam")
```

## Olasılık hesabında sayma: örneklem yanıltır

100 parçalık partide 5 kusurlu var; rastgele 10 parça incelendi ve hiç kusur çıkmadı. "Parti temiz" denebilir mi?

```python calistir
import math
from fractions import Fraction

# Yerine koymadan çekiliş (hipergeometrik): hiç kusurlu gelmeme olasılığı
p_clean_sample = Fraction(math.comb(95, 10), math.comb(100, 10))
assert round(float(p_clean_sample), 3) == 0.584  # %58 olasılıkla kusur hiç görülmez
assert round(math.comb(95, 20) / math.comb(100, 20), 3) == 0.319  # 20 parça incelense bile %32

# Büyük sayılar: tam sayıyla kalın ya da logaritmaya geçin; float'a çevirmek taşar
exact = math.comb(2000, 1000) / 2**2000  # Python tam sayı bölmesi doğru yuvarlar
try:
    math.comb(2000, 1000) * 0.5**2000  # tam sayı float'a çevrilemez
    raise AssertionError("taşma bekleniyordu")
except OverflowError:
    pass
log_p = math.lgamma(2001) - 2 * math.lgamma(1001) - 2000 * math.log(2)
assert math.isclose(math.exp(log_p), exact, rel_tol=1e-9) and round(exact, 4) == 0.0178
print("tamam")
```

Kusur oranı küçükken örneklemde "hiç görmemek" olağandır. Kaç parça incelenmesi gerektiği bu hesapla seçilir;
sıfır gözlemden üst sınır çıkarmak için [istatistiksel kestirim](istatistiksel-kestirim.md) notundaki "3'ler
kuralı"na bakın.

## Kaba kuvvet ne zaman biter: test kapsamı örneği

20 açık/kapalı özellik bayrağının bütün birleşimleri 2^20 ≈ 1 milyon testtir. Hataların çoğu bir ya da iki
ayarın etkileşiminden çıkar; **ikili kapsama** (pairwise) her bayrak çiftinin dört değer birleşimini en az bir
testte bir araya getirir ve çok daha az test ister.

```python calistir
import math
import random
from itertools import combinations

assert 2**20 == 1_048_576  # bütün birleşimler
assert math.factorial(10) == 3_628_800  # 10 işin bütün sıralanışları
assert math.factorial(19) // 2 > 6e16  # 20 şehirli turun bütün rotaları


def pairwise_tests(factors, rng, candidates=60):
    """Açgözlü ikili kapsama: her adımda kapsanmamış çiftleri en çok kapsayan satırı seç."""
    uncovered = {(i, j, a, b) for i, j in combinations(range(factors), 2) for a in (0, 1) for b in (0, 1)}
    tests = []
    while uncovered:
        target = next(iter(uncovered))
        best, best_gain = None, -1
        for _ in range(candidates):
            row = [rng.randrange(2) for _ in range(factors)]
            row[target[0]], row[target[1]] = target[2], target[3]
            gain = sum((row[i], row[j]) == (a, b) for i, j, a, b in uncovered)
            if gain > best_gain:
                best, best_gain = row, gain
        tests.append(best)
        uncovered = {(i, j, a, b) for i, j, a, b in uncovered if (best[i], best[j]) != (a, b)}
    return tests


tests = pairwise_tests(20, random.Random(1))
for i, j in combinations(range(20), 2):  # her çiftin 4 birleşimi de görüldü mü
    assert {(row[i], row[j]) for row in tests} == {(0, 0), (0, 1), (1, 0), (1, 1)}
assert len(tests) <= 15
print("ikili kapsama için test sayısı:", len(tests), "(bütün birleşimler: 1 048 576)")
```

Kaba sınır: tek çekirdekte saniyede ~10⁶–10⁷ basit Python denemesi yapılır. Durum sayısı 10⁸'i aşıyorsa kaba
kuvvet yerine akıllı arama (dinamik programlama, dal-sınır, sezgisel yöntem) ya da örnekleme gerekir.

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Hesaplanan olasılık benzetimin tam katı (2, 6, 24…) çıkıyor   | Sıra önemsizken sıralı sayılmış (çift sayma)                  | Sıra sorusunu yeniden yanıtlayın; küçük durumda `itertools` ile sayın |
| "Bu kadar kısa kodda çakışma olmaz" denmişti, oldu            | Doğum günü etkisi: eşik `N` değil `√N`                        | `1,1774·√N` hesabı; benzersizlik kısıtı + yeniden üretme        |
| CRC32/kısa karma ile tekilleştirilen kayıtlar birleşti         | 32 bit, ~77 bin kayıtta %50 çakışma                           | En az 64 bit; tercihen tam karşılaştırma ya da güçlü özet      |
| "Geçerli olana dek karıştır" döngüsü bazen uzun sürüyor       | Geçerli diziliş olasılığı ~%37 (çekiliş problemi)             | Beklenen deneme sayısını hesaplayın; gerekirse doğrudan kurun  |
| `OverflowError: int too large to convert to float`            | Büyük tam sayı float ile çarpıldı                             | Tam sayı bölmesi, `Fraction` ya da `math.lgamma` ile logaritma |
| "Örneklemde kusur yok" denip parti kabul edildi, kusur çıktı  | Küçük örneklemde nadir kusuru görmemek olağan                 | Hipergeometrik hesap; örnek boyunu hedef güvene göre seçin     |
| Gece boyu süren "bütün kombinasyonları dene" işi bitmiyor     | `2^n`, `n!` patlaması                                         | Önce durum sayısını hesaplayın; ikili kapsama, örnekleme       |
| Birleşim sayısı tek tek toplamdan küçük çıktı, "hata" sanıldı | Kesişimler iki kez sayılmıştı                                 | Dahil etme-dışlama; küme birleşimi ve kesişimiyle doğrulayın   |

## Denetim listesi

- [ ] "Sıra önemli mi, tekrar var mı" soruları açıkça yanıtlanmış; formül tablodaki satırla eşleşiyor.
- [ ] Formül küçük bir durumda `itertools` ile sayılarak doğrulanmış.
- [ ] Rastgele kimlik/kod uzunluğu, beklenen kayıt sayısında çakışma olasılığı hesaplanarak seçilmiş.
- [ ] Rastgele kimlikte veritabanı benzersizlik kısıtı ve çakışmada yeniden üretme var.
- [ ] Büyük sayılar tam sayı, `Fraction` ya da logaritma ile hesaplanmış; float'a erken çevrilmemiş.
- [ ] Kaba kuvvet planından önce durum sayısı ve tahmini süre yazılmış.
- [ ] Örneklemeyle kalite denetiminde "hiç görmeme" olasılığı raporlanmış.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce sıra önemli mi ve tekrar var mı sorularını yanıtla, formülü seç. Sonra küçük bir
  örnekte `itertools` ile sayarak formülü doğrula. Büyük sayıları tam sayı ya da `math.lgamma` ile hesapla."
- **Modelin tipik hatası:** kombinasyon yerine permütasyon kullanır (ya da tersi); çakışma olasılığını `n/N` diye
  hesaplar; `math.factorial` sonucunu float'a çevirip taşırır; "kısa rastgele kod benzersizdir" varsayar.
- **Çıktıda denetleyin:** küçük durum doğrulaması var mı; olasılık 0–1 arasında mı; çakışma hesabında karekök
  eşiği kullanılmış mı; benzersizlik kısıtı kodda var mı.
- **Soru sorun:** "Bu sayı 10 kat büyürse ne olur?" Kombinatoryal patlamayı modelin kendisine gösterir.

## İlgili

- [Olasılık temelleri](olasilik-temelleri.md): örneklem uzayı, tümleyen, koşullu olasılık
- [Ayrık matematik](ayrik-matematik.md): kümeler, modüler aritmetik, karma ve sağlama
- [Rastgelelik ve benzetim](rastgelelik-ve-benzetim.md): kriptografik rastgele kimlik, karıştırma
- [Bilgi kuramı](bilgi-kurami.md): sıkıştırmanın sınırı (entropi)
- [Parola ve hesap güvenliği](../50-guvenlik/parola-ve-hesap-guvenligi.md): arama uzayı, kaba kuvvet ve hız sınırı
- Büyük `C(n, k)` değerlerini mod p'de hesaplamak: [`algoritma/algoritma/sayilar/combinatorics_mod.py`](../../algoritma/algoritma/sayilar/combinatorics_mod.py)
- Rastgele ve zaman sıralı kimlik üreticisi (UUIDv7, kısa kimlik, okunaklı kod):
  [`kutuphane/py/kutuphane/kimlik.py`](../../kutuphane/py/kutuphane/kimlik.py)
