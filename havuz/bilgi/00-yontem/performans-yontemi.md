---
baslik: Performans yöntemi
ozet: Önce ölç, darboğazı bul, tek şeyi değiştir, yeniden ölç; ölçüm hataları, büyük-O ile sabitlerin ilişkisi, Amdahl yasası ve en iyilemenin ne zaman yapılmayacağı, çalışan ölçüm örnekleriyle.
etiketler: [yontem, performans, olcum, profil, darbogaz]
duzey: orta
guncellik: 2026-11
---

# Performans yöntemi

> Bu notu ne zaman okumalı: bir şey "yavaş" dendiğinde; bir model "bunu hızlandırdım" dediğinde; önbellek, dizin
> ya da paralellik eklemeyi düşünürken; ya da hızlandırma işine nereden başlayacağınızı bilmediğinizde.

## Temel fikir

Performans işi bir **ölçüm döngüsüdür**:

1. **Hedefi koyun:** hangi ölçü (yanıt süresinin %95'liği, sayfanın ilk açılışı, bellek), hangi değer
   ("telefonda 2 saniyenin altı"), hangi koşul (gerçek veri boyutu, 4G).
2. **Ölçün:** şimdiki değeri, tekrarlayarak.
3. **Darboğazı bulun:** kesit çıkarıcıyla (profiler); tahminle değil.
4. **Tek şeyi değiştirin.**
5. **Yeniden ölçün:** iyileşme yoksa geri alın.

Zamanın nereye gittiğine dair sezgi çoğu zaman yanılır; yanlış yeri hızlandırmak kodu karmaşıklaştırır ve bir
şey kazandırmaz. Hedef yoksa iş de bitmez: "daha hızlı" hiçbir zaman tamamlanmaz.

## Karar tablosu: belirtiye göre ilk ölçüm

| Belirti                         | İlk ölçüm aracı                                                     | Çoğu zaman çıkan                          |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Sayfa geç açılıyor              | Tarayıcı geliştirici araçları: Ağ ve Performans sekmeleri           | Büyük görsel, engelleyen betik, çok istek |
| Bir API ucu yavaş               | Süreyi aşamalara bölen günlük: veritabanı, dış çağrı, işleme        | Sorgu ya da dış servis                    |
| Python kodu yavaş               | `cProfile` + `pstats`                                               | Döngüde tekrarlanan iş, yanlış veri yapısı |
| Node kodu yavaş                 | `node --cpu-prof dosya.js` (çıkan dosya tarayıcı araçlarında açılır) | Aynı                                     |
| SQL yavaş                       | `EXPLAIN QUERY PLAN` (SQLite), `EXPLAIN ANALYZE` (PostgreSQL)        | Dizin yok, N+1 sorgu                      |
| Bellek sürekli büyüyor          | Python `tracemalloc`; tarayıcıda bellek anlık görüntüsü             | Sınırsız önbellek, kaldırılmayan dinleyici |
| Uygulama geç başlıyor           | `python -X importtime`; paket boyutu çözümleyicisi                  | Ağır içe aktarma, büyük paket             |
| Arada bir donma                 | Performans kaydında uzun görevler                                   | Ana iş parçacığında ağır hesap            |

## Darboğazı ölçerek bulun, düzeltip yeniden ölçün

Bir rapor üç adımda üretiliyor: ayrıştır, yinelenenleri ayıkla, biçimle. Hangisi yavaş? Tahmin etmeyin, kesit
çıkarın:

```python calistir
import cProfile
import pstats
import time


def parse(lines: list[str]) -> list[list[str]]:
    return [line.split(",") for line in lines]


def dedupe_slow(rows: list[list[str]]) -> list[list[str]]:
    seen: list[str] = []
    out = []
    for row in rows:
        if row[0] not in seen:  # listede arama: her seferinde baştan tarar
            seen.append(row[0])
            out.append(row)
    return out


def dedupe_fast(rows: list[list[str]]) -> list[list[str]]:
    seen: set[str] = set()
    out = []
    for row in rows:
        if row[0] not in seen:  # kümede arama: sabit süre
            seen.add(row[0])
            out.append(row)
    return out


def report(rows: list[list[str]]) -> str:
    return "\n".join(f"{name}: {amount}" for name, amount in rows)


lines = [f"musteri-{i % 3000},{i}" for i in range(6000)]


def run(dedupe) -> str:
    return report(dedupe(parse(lines)))


profiler = cProfile.Profile()
profiler.enable()
run(dedupe_slow)
profiler.disable()
own_time = {key[2]: value[2] for key, value in pstats.Stats(profiler).stats.items()}  # işlev → kendi süresi
print("en çok süre harcayan:", max(own_time, key=own_time.get))


def best_of(fn, repeat: int = 5) -> float:  # tekrarla, en iyisini al: gürültüyü azaltır
    times = []
    for _ in range(repeat):
        start = time.perf_counter()
        fn()
        times.append(time.perf_counter() - start)
    return min(times)


slow, fast = best_of(lambda: run(dedupe_slow)), best_of(lambda: run(dedupe_fast))
assert run(dedupe_slow) == run(dedupe_fast)  # davranış aynı kalmalı
assert slow > 5 * fast  # bu makinede onlarca kat; paylaşımlı makinede güvenli alt sınır
print("tek değişiklik: liste yerine küme; sonuç aynı, en az 5 kat hızlı")
```

```cikti
en çok süre harcayan: dedupe_slow
tek değişiklik: liste yerine küme; sonuç aynı, en az 5 kat hızlı
```

Dikkat: `parse` ve `report` da zaman harcıyor; ama onları hızlandırmak toplam süreyi neredeyse hiç değiştirmezdi.

## Önce payı büyük olanı hızlandırın (Amdahl yasası)

Bir parçanın toplam süredeki payı küçükse, onu ne kadar hızlandırırsanız hızlandırın kazanç küçük kalır:

```python calistir
def overall_speedup(fraction: float, local_speedup: float) -> float:
    """İşin `fraction` kadarı `local_speedup` kat hızlanırsa bütün iş kaç kat hızlanır?"""
    return 1 / ((1 - fraction) + fraction / local_speedup)


assert round(overall_speedup(0.05, 10), 3) == 1.047  # %5'lik payı 10 kat hızlandırmak: yalnız %4,7
assert round(overall_speedup(0.80, 2), 3) == 1.667  # %80'lik payı 2 kat: %67
assert round(overall_speedup(0.80, 1_000_000), 2) == 5.0  # üst sınır: 1 / (1 − 0,8)
print("kesit çıkarıcının en üstteki satırından başlayın")
```

```cikti
kesit çıkarıcının en üstteki satırından başlayın
```

## Veritabanında: sorgu planına bakın

```python calistir
import sqlite3

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri TEXT, tutar INTEGER)")
db.executemany("INSERT INTO siparis (musteri, tutar) VALUES (?, ?)", [(f"m{i % 500}", i) for i in range(5000)])
query = "SELECT * FROM siparis WHERE musteri = ?"


def plan() -> str:
    return " ".join(row[3] for row in db.execute("EXPLAIN QUERY PLAN " + query, ("m42",)))


assert plan().startswith("SCAN")  # bütün tabloyu satır satır tarıyor
db.execute("CREATE INDEX siparis_musteri ON siparis (musteri)")
assert "USING INDEX siparis_musteri" in plan()  # artık dizinden arıyor
print("dizin kullanılıyor")
```

```cikti
dizin kullanılıyor
```

## Ölçüm hataları

| Hata                                         | Sonucu                                       | Doğrusu                                              |
| -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Tek ölçüm                                    | Gürültü sonuç sanılır                        | En az 5 tekrar; en iyi ya da ortanca                 |
| Ortalama yanıt süresi                        | Yavaş kullanıcılar görünmez                  | Yüzdelikler: %50, %95, %99                           |
| Soğuk ve sıcak ölçüm karışık                 | İlk çalıştırma (önbellek, derleme) sonucu bozar | Isınma turunu ayrı ölçün ya da atın               |
| Geliştirme kipinde ölçmek                    | Arayüz çatıları geliştirme kipinde çok yavaş | Üretim derlemesiyle ölçün                            |
| Küçük veriyle ölçmek                         | O(n²) sorun görünmez                         | Gerçek boyutta (ya da 10 katı) veriyle               |
| `time.time()` / `Date.now()` ile süre        | Duvar saati geri gidebilir, kaba             | `time.perf_counter()`, `performance.now()`           |
| Hazırlık ölçümün içinde                      | Veri üretimi süreyi şişirir                  | Yalnız ölçülen işi saatin içine alın                 |
| Sonucu kullanılmayan ölçüm (JavaScript)      | Derleyici işi tümden atabilir                | Sonucu bir yere yazın ya da doğrulayın               |
| Dizüstünde, pilde, başka işler açıkken       | Isı ve güç tasarrufu sonucu oynatır          | Aynı koşulda karşılaştırın; farkı tekrarla doğrulayın |

## Büyük-O ve sabitler

Büyük-O, **n büyüdükçe** neyin baskın geleceğini söyler; küçük n'de sabitler belirler. Sabiti büyük ama O(n log n)
bir yöntemle, sabiti küçük ama O(n²) bir yöntemi karşılaştıralım:

```python calistir
import math


def cost_clever(n: int) -> float:  # ör. hazırlığı pahalı ama ölçeklenen yöntem
    return 50 * n * math.log2(n)


def cost_simple(n: int) -> float:  # iç içe döngü
    return n * n


n = 2
while cost_simple(n) <= cost_clever(n):
    n += 1
print("basit yöntem", n, "öğeye kadar daha ucuz")
assert cost_simple(100) < cost_clever(100) and cost_simple(10_000) > cost_clever(10_000)
```

```cikti
basit yöntem 439 öğeye kadar daha ucuz
```

Sonuç: liste hiç 100 öğeyi geçmeyecekse basit yöntem doğrudur. Ama veri büyüyecekse (kullanıcı sayısı, kayıt
sayısı) O(n²) bir gün patlar; önce ölçeği bilin. Ölçek bilgisi kodun yanına yazılmalıdır: "en çok 50 kişilik grup".

## Ne zaman en iyileme yapılmaz

- Ölçüm yoksa ya da hedef yoksa.
- Parça sıcak yolda değilse (kesit çıkarıcıda üst sıralarda görünmüyorsa).
- Süre G/Ç beklemesindeyse ve siz işlemci kodunu hızlandırıyorsanız.
- n küçük ve sınırlıysa (yukarıdaki kesişim).
- Kazanç küçük, kod belirgin biçimde karmaşıklaşıyorsa.
- Doğruluk henüz kanıtlanmamışsa: önce doğru, sonra hızlı.

Yüksek getirili, sık düzeltmeler: N+1 sorguyu tek sorguya indirmek, eksik dizin, döngüde değişmeyen işi dışarı
almak, toplu (batch) G/Ç, sayfalama, büyük görselleri küçültmek, sıkıştırma. Önbellek en son seçenektir: bayat
veri ve geçersiz kılma yükü getirir ([Hata sınıfları](hata-siniflari.md#önbellek)).

## Tuzaklar

| Belirti                                                  | Neden                                          | Çözüm                                                       |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Bir hafta hızlandırma, kullanıcı farkı görmüyor          | Payı küçük parça hızlandırıldı                 | Kesit çıkarın; en üstteki satırdan başlayın                 |
| "10 kat hızlandı" dendi, tekrar ölçünce fark yok         | Tek ölçüm, soğuk/sıcak farkı                   | Tekrarlı ölçüm; koşulları yazın                             |
| Geliştirici makinesinde hızlı, üretimde yavaş            | Küçük veri, yakın veritabanı                   | Gerçek boyutta veri; ağ gecikmesini hesaba katın            |
| Her yere önbellek eklendi, kullanıcılar eski veri görüyor | Ölçmeden önbellek                             | Önce darboğazı bulun; önbelleğe geçersiz kılma kuralıyla girin |
| Kod okunmaz hâle geldi, kazanç %2                        | Mikro en iyileme                               | Geri alın; okunaklılık daha değerlidir                      |
| Hızlanan sürüm farklı sonuç veriyor                      | Davranış doğrulanmadı                          | Eski ve yeni çıktıyı karşılaştıran test                     |
| Sorgu yavaş; dizin eklendi, hâlâ yavaş                   | Dizin kullanılmıyor (işlev uygulanmış sütun, tür uyuşmazlığı) | Sorgu planına bakın                       |

## Denetim listesi

- [ ] Hedef ölçü, değer ve koşul yazılı.
- [ ] Başlangıç değeri tekrarlı ölçümle kayda geçti (komutuyla).
- [ ] Darboğaz kesit çıkarıcıyla ya da sorgu planıyla bulundu.
- [ ] Tek değişiklik yapıldı; davranış aynı (karşılaştırma testi).
- [ ] Yeniden ölçüldü; iyileşme yoksa değişiklik geri alındı.
- [ ] Ölçek varsayımı (en çok kaç öğe) kodun yanında yazılı.
- [ ] Önbellek eklendiyse geçersiz kılma kuralı yazılı ve test edilmiş.

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce ölç: ölçüm komutunu ve çıktısını göster. Darboğazı kesit çıkarıcıyla bul. Tek değişiklik
  yap, davranışın aynı kaldığını test et, yeniden ölç ve iki ölçümü yan yana yaz. İyileşme yoksa değişikliği geri al."
- **Modelin tipik hatası:** ölçmeden "en iyileştirir"; her yere önbellek ve paralellik ekler; mikro en iyileme
  yapar (metin birleştirme, döngü biçimi); "X kat hızlı" der ama ölçüm göstermez; hızlandırırken davranışı değiştirir.
- **Çıktıda denetleyin:** önce/sonra ölçümü aynı koşulda mı; davranış karşılaştırma testi var mı; yeni önbelleğin
  geçersiz kılma kuralı var mı; değişiklik kesit çıkarıcının gösterdiği yerde mi.

## İlgili

- [Tasarım kararı](tasarim-karari.md): erken en iyileme tuzağı.
- [Hata ayıklama](hata-ayiklama.md): ölçüm de bir hipotez sınamasıdır.
- [Test stratejisi](test-stratejisi.md): hızlı sürümü yavaş başvuruyla karşılaştırmak.
- Web performansı ve veritabanı ayrıntıları `20-web-onyuz` ve `30-arkauc` kümelerindedir.
- Diğer kümelerden: [Web performansı](../20-web-onyuz/web-performansi.md), [SQL performansı ve işlem](../10-diller/sql-performans-ve-islem.md), [Tahmin ve büyüklük sezgisi](../92-matematik/tahmin-ve-buyukluk-sezgisi.md).
