---
baslik: Tahmin ve büyüklük sezgisi
ozet: Fermi tahmini ve belirsizliğin logaritmik birleşimi, büyüklük mertebesi ve logaritmik düşünme, birimlerle hesap (boyut denetimi), "bu sayı makul mü" denetimleri, bilgisayarda bayt ve gecikme mertebeleri.
etiketler: [tahmin, fermi, buyukluk-mertebesi, birim, makullik-denetimi]
duzey: temel
guncellik: 2026-11
---

# Tahmin ve büyüklük sezgisi

> Bu notu ne zaman okumalı: veri olmadan bir büyüklüğe karar vermeniz gerektiğinde (disk, maliyet, kullanıcı
> sayısı); bir modelin ya da raporun verdiği sayıyı kabul etmeden önce; birim karışıklığından (ms/sn, bit/bayt,
> KB/KiB) şüphelendiğinizde.

## Temel fikir

- **Fermi tahmini**: bilinmeyen büyüklüğü, tahmin edilebilir çarpanlara bölün; her çarpan için bir aralık
  (alt–üst) yazın; ortalarını çarpın. Çarpanların hataları kısmen birbirini götürür; sonuç çoğu zaman
  "3 kat içinde" doğrudur ve **karar için** yeter.
- Belirsiz büyüklükler **çarpımsal** düşünülür: "10 ile 1000 arası" denince ortası 505 değil, 100'dür
  (geometrik ortalama). Hata "±50" değil, "×/÷ 3" diye yazılır.
- **Büyüklük mertebesi** (order of magnitude): sayının 10'un hangi kuvvetinde olduğu. 2 kat hata çoğu kararı
  değiştirmez; 10 kat hata mimariyi değiştirir.
- **Birimler** hesabın kendi denetimidir: birimleri sayılarla birlikte çarpıp bölün; sonuçta beklenen birim
  çıkmıyorsa formül yanlıştır.
- **Makullük denetimi**: her sayıyı fiziksel ve mantıksal sınırlara (günde 24 saat, oran ≤ %100, parça ≤ bütün)
  ve bağımsız ikinci bir hesaba karşı sınayın.

## Karar tablosu

| Durum                                                      | Yöntem                                                   | Not                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Veri yok, karar için büyüklük lazım                        | Fermi: çarpanlara böl, her birine aralık                 | Her çarpanın kaynağını yazın (ölçüm/tahmin)         |
| Aralıkların ortası                                         | Geometrik ortalama `√(alt·üst)`                           | Aritmetik ortalama üst değere kayar                 |
| Sonucun belirsizliği                                       | Log uzayında birleştirme (aşağıda)                       | Uçların çarpımı aşırı geniştir                      |
| Kapasite, istek/sn, depolama                               | Zarf arkası hesap ([kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md)) | Ortalamaya değil tepeye göre      |
| Bir rapordaki sayı                                         | Sınır denetimi + bağımsız ikinci hesap (üçgenleme)       | İki yol 3 kattan fazla ayrışıyorsa bir varsayım yanlış |
| Büyüme öngörüsü                                            | Logaritmik ölçek; ikiye katlanma süresi                  | Üstel büyümeyi doğrusal uzatmayın                   |
| Sonucu yazarken                                            | 1–2 anlamlı hane                                         | "20 784 609 bayt" sahte kesinliktir                 |

## Fermi tahmini: belirsizliği doğru birleştirmek

Soru: 1 milyon kayıtlı kullanıcısı olan bir uygulama günde kaç GB günlük (log) üretir?

```python calistir
import math
import random

# Her çarpan için %90 olasılıkla içinde olduğunu düşündüğümüz aralık (alt, üst)
factors = {
    "günlük etkin oran": (0.1, 0.3),
    "kişi başı oturum": (1, 4),
    "oturum başı istek": (20, 100),
    "istek başı günlük satırı": (3, 10),
    "satır başı bayt": (150, 400),
}
users = 1_000_000
center = users * math.prod(math.sqrt(lo * hi) for lo, hi in factors.values())  # geometrik ortalamalar

extreme_low = users * math.prod(lo for lo, _ in factors.values())
extreme_high = users * math.prod(hi for _, hi in factors.values())

# Log uzayında: her aralığı log-normal %90 aralığı say; log-sapmalar karelerle toplanır
z = 1.645
log_sd = math.sqrt(sum((math.log(hi / lo) / (2 * z)) ** 2 for lo, hi in factors.values()))
low90, high90 = center * math.exp(-z * log_sd), center * math.exp(z * log_sd)

print(f"tahmin ≈ {center / 1e9:.0f} GB/gün, %90 aralık {low90 / 1e9:.0f}–{high90 / 1e9:.0f} GB")
print(f"uçların çarpımı: {extreme_low / 1e9:.1f}–{extreme_high / 1e9:.0f} GB (gereksiz geniş)")
assert 15e9 < center < 30e9
assert high90 / low90 < (extreme_high / extreme_low) / 25

# Benzetimle doğrulama: her çarpanı rastgele çek, çarp, yüzdeliklere bak
rng = random.Random(0)
samples = sorted(
    users
    * math.prod(
        math.exp(rng.gauss(math.log(math.sqrt(lo * hi)), math.log(hi / lo) / (2 * z))) for lo, hi in factors.values()
    )
    for _ in range(20_000)
)
assert abs(samples[1000] / low90 - 1) < 0.1 and abs(samples[19000] / high90 - 1) < 0.1
```

Sonuç cümlesi: "Günde ~20 GB, büyük olasılıkla 5–90 GB. 30 gün saklamak için 3 TB'a göre plan; ölçüm gelince
güncelle." Belirsizliğin çoğu genellikle bir iki çarpandan gelir (burada oturum başı istek); önce onu ölçün.

## Birimlerle hesap: boyut denetimi

Birimi sayıyla birlikte taşıyan küçük bir sınıf, birim hatasını çalışırken yakalar.

```python calistir
from dataclasses import dataclass


@dataclass(frozen=True)
class Q:
    """Birimli büyüklük: birimler üs sözlüğüyle tutulur, ör. {'bayt': 1, 'sn': -1}."""

    value: float
    units: tuple = ()

    def _merge(self, other, sign):
        merged = dict(self.units)
        for unit, power in other.units:
            merged[unit] = merged.get(unit, 0) + sign * power
        return tuple(sorted((u, p) for u, p in merged.items() if p != 0))

    def __mul__(self, other):
        return Q(self.value * other.value, self._merge(other, +1))

    def __truediv__(self, other):
        return Q(self.value / other.value, self._merge(other, -1))

    def __add__(self, other):
        if self.units != other.units:
            raise TypeError(f"birimler uyuşmuyor: {self.units} + {other.units}")
        return Q(self.value + other.value, self.units)


def unit(name, value=1.0):
    return Q(value, ((name, 1),))


istek, bayt, sn, gun, bit = unit("istek"), unit("bayt"), unit("sn"), unit("gün"), unit("bit")
rate = Q(12.0) * istek / sn  # 12 istek/sn
size = Q(2_000.0) * bayt / istek  # istek başı 2 KB yanıt
day = Q(86_400.0) * sn / gun
daily = rate * size * day
assert daily.units == (("bayt", 1), ("gün", -1))  # beklenen birim çıktı: bayt/gün
assert round(daily.value / 1e9, 2) == 2.07  # ≈ 2 GB/gün

try:
    rate + size  # istek/sn ile bayt/istek toplanamaz
    raise AssertionError("hata bekleniyordu")
except TypeError:
    pass

# Bit ve bayt: 100 Mbit/sn hatta 1 GB dosya 10 değil 80 saniye sürer
link = Q(100e6) * bit / sn
file = Q(1e9 * 8) * bit  # 1 GB = 8·10⁹ bit
seconds = file / link
assert seconds.units == (("sn", 1),) and seconds.value == 80
print("tamam")
```

Birimleri koddaki adlara da yazın: `timeout_ms`, `size_bytes`, `rate_per_sec`. Çıplak `timeout = 30` hangi
birim olduğunu söylemez; hataların önemli bir kısmı buradan çıkar.

## Logaritmik düşünme

```python calistir
import math

# Belirsiz iki tahminin ortası: geometrik ortalama
assert math.sqrt(10 * 1000) == 100  # aritmetik ortalama 505 olurdu
# Mertebe: 10'un kuvveti
assert math.floor(math.log10(86_400)) == 4  # bir gün ≈ 10⁵ sn mertebesine yakın (8,6·10⁴)
# Üstel büyüme: ayda %10 büyüme yılda ~3,1 kat; ikiye katlanma ~7,3 ay
assert round(1.10**12, 2) == 3.14 and round(math.log(2) / math.log(1.10), 1) == 7.3
# Doğrusal uzatma yanılır: ilk ayın artışını (×0,1) 12 ile çarpmak 2,2 kat der
assert 1 + 0.10 * 12 < 1.10**12
```

Üstel süreçleri (kullanıcı büyümesi, veri birikimi, salgın, borç) logaritmik eksende çizin; orada düz çizgi
görünürler ve eğimleri büyüme hızını verir. Doğrusal eksende "birden patladı" görünen şey çoğu zaman
baştan beri sabit hızlı üstel büyümedir.

## "Bu sayı makul mü" denetimi

Bir rapor ya da model aşağıdaki sayıları verdi. Mantıksal sınırlarla ve birbirleriyle tutarlı mı?

```python calistir
report = {
    "kayitli": 50_000,
    "aylik_etkin": 30_000,
    "gunluk_etkin": 34_000,  # şüpheli
    "gunluk_oturum_kisi_basi": 3.0,
    "ortalama_oturum_dk": 9.0,
    "donusum_orani": 0.04,
    "aylik_siparis": 9_500,
}

problems = []
if not report["gunluk_etkin"] <= report["aylik_etkin"] <= report["kayitli"]:
    problems.append("günlük etkin ≤ aylık etkin ≤ kayıtlı sırası bozuk")
if report["gunluk_oturum_kisi_basi"] * report["ortalama_oturum_dk"] > 24 * 60:
    problems.append("kişi başı günlük süre 24 saati aşıyor")
if not 0 <= report["donusum_orani"] <= 1:
    problems.append("oran 0–1 dışında")
# Üçgenleme: aynı büyüklüğü ikinci bir yoldan hesapla
implied_orders = report["aylik_etkin"] * report["donusum_orani"]
if not 1 / 3 < report["aylik_siparis"] / implied_orders < 3:
    problems.append(f"sipariş sayısı tutmuyor: rapor {report['aylik_siparis']}, hesap {implied_orders:.0f}")

assert problems == [
    "günlük etkin ≤ aylık etkin ≤ kayıtlı sırası bozuk",
    "sipariş sayısı tutmuyor: rapor 9500, hesap 1200",
]
print("\n".join(problems))
```

Denetim sırası: (1) birim ve mertebe doğru mu, (2) sınırlar (≤ %100, ≤ 24 saat, parça ≤ bütün), (3) bağımsız
ikinci hesap 3 kat içinde mi, (4) zaman içinde tutarlı mı (dünkü değerin 10 katı mı?). Tutmayan sayı, varsayım
ya da veri hatasının izidir; "yuvarlama farkı" diye geçmeyin.

## Bilgisayarda büyüklükler

Baytlar (ölçülebilir, kesin):

```python calistir
import struct
import uuid

assert len("ş".encode("utf-8")) == 2 and len("a".encode("utf-8")) == 1  # Türkçe harf 2 bayt
assert len("😀".encode("utf-8")) == 4
assert struct.calcsize("<q") == 8 and struct.calcsize("<d") == 8  # int64, float64
u = uuid.UUID(int=0x1234)
assert len(u.bytes) == 16 and len(str(u)) == 36  # UUID: ikili 16 bayt, metin 36 karakter
assert 1_000_000 * 100 == 100_000_000  # 1 milyon satır × 100 bayt ≈ 100 MB (dizinsiz)
assert round(1 - 10**9 / 2**30, 3) == 0.069  # 1 GB ile 1 GiB arasında ~%7 fark
assert round(1 - 10**12 / 2**40, 3) == 0.091  # TB ile TiB arasında ~%9
print("tamam")
```

Gecikmeler (mertebe; donanıma ve ağa göre 10 kat değişebilir; kesin değer için ölçün — doğrulanmadı):

| İşlem                                    | Mertebe              |
| ---------------------------------------- | -------------------- |
| İşlemci önbelleğinden okuma              | ~1–10 ns             |
| Ana bellekten okuma                      | ~100 ns              |
| Python'da tek basit işlem (yorumlayıcı)  | ~10–100 ns           |
| SSD'den rastgele okuma                   | ~10–100 µs           |
| Aynı veri merkezinde ağ gidiş-dönüşü     | ~0,5 ms              |
| Dönen diskten rastgele okuma             | ~10 ms               |
| Ülke içi internet gidiş-dönüşü           | ~10–50 ms            |
| Kıtalar arası gidiş-dönüş                | ~100–200 ms          |
| Kullanıcının "anında" saydığı tepki      | ~100 ms              |

```python calistir
import time

start = time.perf_counter()
total = 0
for i in range(1_000_000):
    total += i
per_op = (time.perf_counter() - start) / 1_000_000
assert 1e-9 < per_op < 1e-5  # mertebe sınaması; kesin değer makineye ve yüke bağlı
print(f"Python döngü adımı ≈ {per_op * 1e9:.0f} ns")
```

Tablodan çıkan kararlar: 100 ms'lik bir bütçeye kıtalar arası tek gidiş-dönüş sığar, aynı veri merkezinde
~200; bir sayfada ardışık 100 veritabanı sorgusu (N+1) tek başına bütçeyi bitirir. Ayrıntılı hesap:
[kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md).

## Tuzaklar

| Belirti                                                     | Neden                                                          | Çözüm                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Tahmin aralığı "0,9 GB ile 480 GB arası" kadar işe yaramaz   | Uçlar çarpılmış                                                | Log uzayında birleştirme; geometrik ortalama                    |
| İndirme süresi hesabı 8 kat iyimser                         | Mbit/sn ile MB/sn karıştı                                      | Birimleri sayıyla taşıyın; bit/bayt ayrımı                      |
| Disk "dolmamalıydı" ama doldu                               | GB ile GiB, dizin ve kopya ek yükü unutuldu                    | ×1,5–2 ek yük payı; ikili/ondalık birimi yazın                  |
| Zaman aşımı 1 000 kat yanlış                                | `ms` ile `sn` karıştı                                          | Ada birimi ekleyin (`timeout_ms`)                               |
| Büyüme öngörüsü birkaç ay içinde çöktü                      | Üstel süreç doğrusal uzatıldı                                  | Logaritmik eksen; ikiye katlanma süresi                         |
| Raporda 7 haneli kesin sayı, ama girdiler kaba tahmin       | Sahte kesinlik                                                 | 1–2 anlamlı hane ve aralık                                      |
| Model "günlük etkin kullanıcı > aylık etkin" diyen rapor üretti | Tanımlar ya da veri karışık                                  | Sınır denetimlerini koda koyun                                  |
| İki ekip aynı büyüklüğe 10 kat farklı tahmin veriyor        | Farklı varsayımlar, yazılmamış                                 | Çarpanları ve aralıkları yan yana yazın; farkı bulun            |

## Denetim listesi

- [ ] Tahmin çarpanlara ayrılmış; her çarpanın aralığı ve kaynağı (ölçüm/tahmin/benzer ürün) yazılı.
- [ ] Orta değer geometrik ortalamayla, belirsizlik log uzayında birleştirilmiş.
- [ ] Sonuç 1–2 anlamlı haneyle ve bir aralıkla yazılmış; karar eşiği belirtilmiş.
- [ ] Her büyüklüğün birimi yazılı; değişken adlarında birim var.
- [ ] Sınır denetimleri (oran ≤ 1, süre ≤ 24 saat, parça ≤ bütün) uygulanmış.
- [ ] Aynı büyüklük bağımsız ikinci bir yoldan hesaplanmış; 3 kat içinde.
- [ ] Gecikme ve bayt varsayımları ölçümle güncellenecek biçimde işaretlenmiş.

## Küçük modele yaptırırken

- **İsteme yazın:** "Tahmini çarpanlara ayır; her çarpan için alt–üst aralık ve kaynağını yaz; geometrik ortalamayla
  çarp; sonucu 2 anlamlı haneyle ve %90 aralıkla ver. Sonra aynı büyüklüğü başka bir yoldan hesapla ve karşılaştır."
- **Modelin tipik hatası:** tek bir kesin sayı verir; bit/bayt, ms/sn, GB/GiB karıştırır; aralıkların aritmetik
  ortalamasını alır; üstel büyümeyi doğrusal uzatır; kendi ürettiği sayıları sınırlarla denetlemez.
- **Çıktıda denetleyin:** her sayının birimi; anlamlı hane sayısı; aralık var mı; "parça ≤ bütün" ve "≤ %100"
  denetimleri; ikinci hesap yapılmış mı.
- **Soru sorun:** "Bu sayı 10 kat büyük olsaydı neye dikkat ederdin?" Yanıt, kararın hangi varsayıma bağlı
  olduğunu gösterir.

## İlgili

- [Kapasite tahmini](../40-sistem-tasarimi/kapasite-tahmini.md): istek/sn, tepe yük, Little yasası, ağ gecikmesi
- [Dağılımlar](dagilimlar.md): log-normal, kalın kuyruk, yüzdelikler
- [Kombinatorik](kombinatorik.md): kaba kuvvet süresinin büyüklüğü
- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md): sayıların bellekteki boyu ve sınırları
- [Finans matematiği](finans-matematigi.md): bileşik büyüme ve ikiye katlanma
- [Performans yöntemi](../00-yontem/performans-yontemi.md): tahmin yerine ölçüm; doğru ölçmenin kuralları
- [Unicode ve kodlama](../10-diller/unicode-ve-kodlama.md): bayt, karakter ve grafem farkı
- İş süresi tahmini (bu notun konusu değil): [Tahmin ve planlama](../00-yontem/tahmin-ve-planlama.md)
