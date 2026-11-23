---
baslik: Olasılıksal veri yapılarını boyutlandırma
ozet: Bloom süzgecinde bit ve karma sayısı, doluluk aşımında yanlış pozitifin patlaması; HyperLogLog hata payı, birleşim ve kesişim tuzağı; count-min boyutu ve hatanın toplam sayıma bağlı oluşu; çalışan hesap ve benzetimler.
etiketler: [matematik, olasilik, bloom-suzgeci, hyperloglog, count-min, veri-yapilari]
duzey: orta
guncellik: 2026-11
---

# Olasılıksal veri yapılarını boyutlandırma

> Bu notu ne zaman okumalı: Bloom süzgeci, HyperLogLog ya da count-min kurulmadan önce "kaç bit, kaç kova, kaç
> sayaç?" sorusunda; bu yapılardan birinin sonucu tuhaf çıktığında (çok yanlış pozitif, eksi kesişim, seyrek öğeye
> şişkin sayı); belleğe bir yapı sığdırılmaya çalışılırken.

## Temel fikir

Üç yapı da **kesinlikten vazgeçip bellekten kazanır** ve hatası kurulurken seçilen boyuta bağlıdır:

| Yapı | Sorusu | Hata türü | Boyut kuralı |
| --- | --- | --- | --- |
| Bloom süzgeci | "Bu öğe kümede var mı?" | Yalnız yanlış pozitif ("belki var"); yanlış negatif yok | `m = −n·ln p / (ln 2)²` bit, `k = (m/n)·ln 2` karma |
| HyperLogLog | "Kaç **farklı** öğe var?" | Göreli hata ≈ `1,04 / √(kova sayısı)` | Kova `2^p`; her biri birkaç bit |
| Count-min | "Bu öğe kaç kez geçti?" | Yalnız fazla sayar; fazlalık ≤ `ε·N` (N = **toplam** sayım) | Genişlik `⌈e/ε⌉`, derinlik `⌈ln(1/δ)⌉` |

Ortak üç tuzak: yapı **tasarlandığı yükten fazlasıyla** doldurulur ve hata sessizce büyür; hata tanımı yanlış
okunur (count-min'in hatası öğeye değil toplama göredir); iki yapı birleştirilirken (kesişim, ayrı karma)
varsayım bozulur. Gerçeklemeler havuzda: [`bloom_filter.py`](../../algoritma/algoritma/veri_yapilari/bloom_filter.py),
[`hyperloglog.py`](../../algoritma/algoritma/veri_yapilari/hyperloglog.py),
[`count_min_sketch.py`](../../algoritma/algoritma/veri_yapilari/count_min_sketch.py).

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Öğeler belleğe sığıyor (yüz binler, kısa anahtar) | `set` / `Counter` / veritabanı dizini | Kesin ve basit; olasılıksal yapı gereksiz karmaşa |
| Pahalı aramanın (disk, ağ) önünde "kesin yok"ları elemek | Bloom süzgeci, hedef p %0,1–1 | Yanlış pozitif yalnız boşa bir arama demek |
| Silme gerekiyor | Sayaçlı Bloom ya da kesin yapı | Düz Bloom'dan silinemez |
| Öğe sayısı önceden bilinmiyor, büyüyor | Kapasite dolunca yeni (daha sıkı p'li) süzgeç ekleyin ya da yeniden kurun | Aşırı dolu süzgeç işe yaramaz |
| Günlük/segment başına tekil ziyaretçi, sonradan birleştirilecek | HyperLogLog, p = 12–14 | Birleşim kova kova `max`; kesin sayıma göre çok küçük |
| İki kümenin **kesişimi** (ortak kullanıcı) | Küçükse kesin küme; büyükse MinHash (Jaccard) ya da örnekleme | HLL ile kesişim çoğu zaman anlamsız (aşağıda) |
| Akışta "en çok geçen" öğeler | Count-min (+ en sık k listesi) | Sık öğede göreli hata küçük |
| Seyrek öğelerin sayısı | Count-min **değil**; örnekleme ya da kesin sayım | Hata toplam sayıma göredir |

## Bloom süzgeci: boyut ve doluluk

```python calistir
import hashlib
import math


def size(n, p):  # n öğe, hedef yanlış pozitif p → bit sayısı m ve karma sayısı k
    m = math.ceil(-n * math.log(p) / math.log(2) ** 2)
    return m, max(1, round(m / n * math.log(2)))


def false_positive(m, k, n):  # kuramsal: (1 − e^(−k·n/m))^k
    return (1 - math.exp(-k * n / m)) ** k


def measured(m, k, n, probes=20_000):  # gerçek süzgeç: blake2b + çift karma (havuzdaki gerçeklemeyle aynı fikir)
    bits = bytearray(m)

    def positions(item):
        d = hashlib.blake2b(item.encode(), digest_size=16).digest()
        h1, h2 = int.from_bytes(d[:8], "little"), int.from_bytes(d[8:], "little") | 1
        return [(h1 + i * h2) % m for i in range(k)]

    for i in range(n):
        for pos in positions(f"var-{i}"):
            bits[pos] = 1
    return sum(all(bits[p] for p in positions(f"yok-{i}")) for i in range(probes)) / probes


N = 10_000
for p in (0.01, 0.001):
    m, k = size(N, p)
    print(f"hedef %{100 * p:g}: m = {m} bit ({m / N:.1f} bit/öğe, {m / 8 / 1024:.1f} KiB), k = {k}")
m, k = size(N, 0.01)
print("doluluk   kuramsal   ölçülen")
for load in (0.5, 1.0, 2.0):
    n = int(N * load)
    print(f"{load:4.1f}×     %{100 * false_positive(m, k, n):5.2f}    %{100 * measured(m, k, n):5.2f}")
for wrong_k in (1, 3, 20):
    print(f"k = {wrong_k:2d} (doluluk 1×): kuramsal %{100 * false_positive(m, wrong_k, N):.2f}")
```

```cikti
hedef %1: m = 95851 bit (9.6 bit/öğe, 11.7 KiB), k = 7
hedef %0.1: m = 143776 bit (14.4 bit/öğe, 17.6 KiB), k = 10
doluluk   kuramsal   ölçülen
 0.5×     % 0.03    % 0.04
 1.0×     % 1.00    % 0.95
 2.0×     %15.75    %15.82
k =  1 (doluluk 1×): kuramsal %9.91
k =  3 (doluluk 1×): kuramsal %1.94
k = 20 (doluluk 1×): kuramsal %7.06
```

Okuma:

- Öğe başına bit, öğe sayısından **bağımsızdır**: %1 için ~9,6 bit, her on kat iyileşme için ~4,8 bit daha. Öğenin
  kendisi (adres, kimlik) saklanmaz; bu yüzden küçüktür ve içinden öğe geri okunamaz.
- **Doluluk aşımı:** tasarlanan öğe sayısının iki katı eklenince yanlış pozitif %1'den %16'ya çıkıyor; süzgeç
  "belki var" demeyi alışkanlık edinir ve arkasındaki pahalı aramayı korumaz olur. Eklenen öğe sayısını sayın ve
  kapasiteye yaklaşınca yeniden kurun ([`expected_false_positive_rate`](../../algoritma/algoritma/veri_yapilari/bloom_filter.py)).
- Karma sayısı formülden sapınca hata büyür (k = 1 → %10). k ayrı karma işlevi gerekmez: iki karmadan
  `h1 + i·h2` ile türetmek yeterlidir.
- Maliyet hesabı: beklenen boşa arama = yanlış pozitif oranı × "olmayan" sorgu sayısı. Günde 1 milyon olmayan
  sorguda %1, günde 10.000 boşa disk okuması demektir; bu kabul edilebilir mi, ona göre p seçin.

## HyperLogLog: hata, bellek, birleşim ve kesişim

```python calistir
import hashlib
import math
import statistics


class HLL:  # havuzdaki gerçeklemenin özü: 64 bit karma, ilk p bit kova, kalanında ilk 1'in yeri
    def __init__(self, p, salt=b""):
        self.p, self.m, self.salt, self.reg = p, 1 << p, salt, bytearray(1 << p)

    def add(self, item):
        x = int.from_bytes(hashlib.blake2b(item.encode(), digest_size=8, salt=self.salt).digest(), "big")
        rest = x & ((1 << (64 - self.p)) - 1)
        rho = (64 - self.p) - rest.bit_length() + 1
        i = x >> (64 - self.p)
        self.reg[i] = max(self.reg[i], rho)

    def merged(self, other):
        out = HLL(self.p, self.salt)
        out.reg = bytearray(map(max, self.reg, other.reg))
        return out

    def estimate(self):
        raw = 0.7213 / (1 + 1.079 / self.m) * self.m**2 / sum(2.0**-r for r in self.reg)
        zeros = self.reg.count(0)
        return self.m * math.log(self.m / zeros) if raw <= 2.5 * self.m and zeros else raw


N = 20_000
print("p    kova   bellek   kuramsal hata   ölçülen hata (12 farklı karma tuzu)")
for p in (6, 8, 10):
    errors = []
    for salt in range(12):
        h = HLL(p, salt.to_bytes(4, "little"))
        for i in range(N):
            h.add(f"kullanici-{i}")
        errors.append(h.estimate() / N - 1)
    print(f"{p:2d}  {1 << p:5d}  {1 << p:5d} B   ±%{100 * 1.04 / math.sqrt(1 << p):4.1f}          "
          f"±%{100 * statistics.pstdev(errors):4.1f}")

a, b = HLL(12), HLL(12)  # 30.000'er kullanıcı, yalnız 300'ü ortak
for i in range(30_000):
    a.add(f"u{i}")
    b.add(f"u{i + 29_700}")
union = a.merged(b).estimate()
print(f"birleşim: gerçek 59700, tahmin {union:.0f}")
print(f"kesişim (|A| + |B| − |A∪B|): gerçek 300, tahmin {a.estimate() + b.estimate() - union:.0f}")
```

```cikti
p    kova   bellek   kuramsal hata   ölçülen hata (12 farklı karma tuzu)
 6     64     64 B   ±%13.0          ±%11.3
 8    256    256 B   ±% 6.5          ±% 5.5
10   1024   1024 B   ±% 3.2          ±% 2.1
birleşim: gerçek 59700, tahmin 60349
kesişim (|A| + |B| − |A∪B|): gerçek 300, tahmin -355
```

Okuma:

- Hata **kova sayısının kareköküyle** iner: hatayı yarıya indirmek dört kat bellek ister. ±%1,6 için p = 12
  (4.096 kova, bu gerçeklemede 4 KiB; kova başına 6 bit paketlenirse ~3 KiB). Ölçülen hata kuramsalla aynı
  mertebede (12 örnekle kaba bir ölçüm).
- Hata **ne kadar öğe olduğundan bağımsızdır**: 20 bin de 20 milyon da ±%1,6. Küçük sayılarda gerçekleme doğrusal
  sayıma geçer ve daha doğrudur.
- **Birleşim** kova kova `max`'tır ve aynı hata payını korur: günlük sayaçlar haftalığa kayıpsız birleşir. Koşul:
  aynı p, aynı karma işlevi, aynı tuz.
- **Kesişim** `|A| + |B| − |A∪B|` ile hesaplanırsa büyük sayıların hataları küçük farkta toplanır: gerçek 300,
  tahmin −355. Kesişim, birleşimin birkaç yüzdesinden küçükse HLL ile ölçülmez.
- Bellek planı: 365 gün × 1.000 segment × 4 KiB ≈ 1,4 GiB. p'yi bir küçültmek belleği yarıya, hatayı √2 katına
  getirir; hangi sorunun hangi hassasiyeti istediğini yazıp seçin.

## Count-min: hata toplama göredir

```python calistir
import hashlib
import math
import random
from collections import Counter

EPS, DELTA = 0.001, 0.01
W, D = math.ceil(math.e / EPS), math.ceil(math.log(1 / DELTA))  # genişlik ve derinlik
table = [[0] * W for _ in range(D)]


def columns(item):
    return [int.from_bytes(hashlib.blake2b(item.encode(), digest_size=8, salt=bytes([row])).digest(), "little") % W
            for row in range(D)]


rng = random.Random(5)
words = [f"terim-{i}" for i in range(20_000)]
stream = rng.choices(words, weights=[1 / (i + 1) for i in range(len(words))], k=200_000)  # Zipf benzeri: az terim çok aranır
for word in stream:
    for row, col in enumerate(columns(word)):
        table[row][col] += 1
truth, total = Counter(stream), len(stream)
estimate = lambda w: min(table[row][col] for row, col in enumerate(columns(w)))
print(f"tablo {D} × {W} = {D * W} sayaç (~{D * W * 4 / 1024:.0f} KiB); garanti: hata ≤ ε·N = {EPS * total:.0f}")
for name, word in (("en sık", words[0]), ("100. sıradaki", words[99]), ("seyrek", words[15_000])):
    t, e = truth[word], estimate(word)
    print(f"{name:14s} gerçek {t:6d}  tahmin {e:6d}  fazla {e - t:4d} (göreli %{100 * (e - t) / max(t, 1):.0f})")
assert all(estimate(w) >= truth[w] for w in words[:200])  # asla eksik saymaz
```

```cikti
tablo 5 × 2719 = 13595 sayaç (~53 KiB); garanti: hata ≤ ε·N = 200
en sık         gerçek  19135  tahmin  19142  fazla    7 (göreli %0)
100. sıradaki  gerçek    184  tahmin    191  fazla    7 (göreli %4)
seyrek         gerçek      2  tahmin     26  fazla   24 (göreli %1200)
```

Okuma: garanti `ε·N` = 200 sayımdır; bu, en sık terim için yok denecek kadar azdır, 2 kez geçen terim için yüz
katıdır. Count-min "en çok aranan 100 terim" sorusunun aracıdır; eşiği `ε·N`'in belirgin üstüne koyun (ör. 1.000).
Hata `N` büyüdükçe büyür: zaman pencereli kullanımda tabloyu dönem dönem sıfırlayın ya da dönem başına ayrı tablo
tutun (aynı boyut ve karmayla tablolar hücre hücre toplanarak birleşir). Yalnız en küçük sayaçları artıran
"muhafazakâr güncelleme" fazlalığı azaltır (havuzdaki dosyanın `Genişletme` notu).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Bloom süzgeci neredeyse her şeye "belki var" diyor | Tasarım kapasitesinin üstünde dolduruldu | Eklenen öğeyi sayın; kapasiteye yaklaşınca yeniden kurun ya da yeni süzgeç ekleyin |
| Bloom süzgecinden öğe silinmeye çalışıldı, başka öğeler kayboldu | Bitler paylaşılıyor | Sayaçlı Bloom ya da kesin yapı |
| İki süzgeç birleştirilemiyor / sonuç saçma | Farklı m, k ya da karma | Aynı parametre ve karma; birleşim bit bit VEYA |
| Her çalıştırmada farklı sonuç, süreçler arası uyuşmazlık | Python `hash()` süreçten sürece değişir | Kararlı karma (blake2b, xxhash türü) |
| HLL ile ortak kullanıcı sayısı eksi çıktı | Kesişim fark olarak hesaplandı | Kesin küme, MinHash ya da örnekleme |
| Günlük HLL'ler birleşince sayı tutmuyor | Farklı p ya da tuz | Bütün sayaçlarda aynı p ve karma; sürümü kaydedin |
| Seyrek terimlerin count-min sayıları şişkin | Hata toplam sayıma göre | Yalnız sık öğeler için kullanın; seyreğe kesin sayım |
| Bellek hesabı tuttu, sunucu yine şişti | Yapı başına bellek × anahtar sayısı (gün × segment) unutuldu | Toplam bellek = yapı boyutu × kaç tane tutulduğu |

## Denetim listesi

- [ ] Önce kesin yapının (set, Counter, dizin) sığıp sığmadığı hesaplandı.
- [ ] Bloom için n (tasarım kapasitesi) ve p yazıldı; m ve k formülden; eklenen öğe sayısı izleniyor.
- [ ] HLL için hedef hata yazıldı ve p ondan seçildi; birleştirilecek sayaçların p ve karması aynı.
- [ ] Kesişim sorusu HLL ile yanıtlanmıyor.
- [ ] Count-min için ε ve δ yazıldı; yalnız `ε·N`'in belirgin üstündeki sayımlar raporlanıyor; pencere/sıfırlama planı var.
- [ ] Karma işlevi kararlı (süreçten bağımsız) ve tuz/sürüm kayıtlı.
- [ ] Toplam bellek = yapı boyutu × yapı sayısı hesaplandı.
- [ ] Kuramsal hata küçük bir benzetimle (bilinen veri) doğrulandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bloom süzgecini havuzdaki `algoritma/algoritma/veri_yapilari/bloom_filter.py` gerçeklemesinden
  kopyala; kapasiteyi ve hedef hatayı parametre yap. Eklenen öğe sayısı kapasiteyi geçince uyarı günlüğü yaz.
  Boyut hesabını ve kapasitenin 2 katında beklenen hatayı yorum olarak yaz."
- **Modelin tipik hatası:** Python `hash()` kullanır; k'yı keyfî seçer; kapasite aşımını hiç düşünmez; HLL ile
  kesişim hesaplar; count-min'in hatasını öğe başına göreli sanır; farklı p'li HLL'leri birleştirir.
- **Çıktıda denetleyin:** karma işlevi; m, k, p, ε, δ'nın formülden gelmesi; kapasite izleme; kesişim hesabı var mı;
  bellek hesabının yapı sayısıyla çarpılması.
- **Sorun:** "Tasarım yükünün iki katı gelirse hata ne olur? Bu hatanın bize maliyeti ne?"

## İlgili

- [Kombinatorik](kombinatorik.md) — doğum günü problemi ve karma çakışması
- [Olasılık temelleri](olasilik-temelleri.md) · [Rastgelelik ve benzetim](rastgelelik-ve-benzetim.md) — tohum,
  Monte Carlo ile doğrulama
- [Tahmin ve büyüklük sezgisi](tahmin-ve-buyukluk-sezgisi.md) — bayt mertebeleri ve bellek hesabı
- [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md) · [Önbellek katmanları](../40-sistem-tasarimi/onbellek-katmanlari.md)
- Havuz: [`bloom_filter.py`](../../algoritma/algoritma/veri_yapilari/bloom_filter.py),
  [`hyperloglog.py`](../../algoritma/algoritma/veri_yapilari/hyperloglog.py),
  [`count_min_sketch.py`](../../algoritma/algoritma/veri_yapilari/count_min_sketch.py); yakın kopya için MinHash:
  [`ince_ayar/data/neardup.py`](../../ince-ayar/ince_ayar/data/neardup.py)
