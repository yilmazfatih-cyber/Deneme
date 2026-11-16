---
baslik: Kapasite tahmini: zarf arkası hesap, tepe yük, yüzdelikler ve Little yasası
ozet: İstek/sn, depolama ve bant genişliğini birkaç satırda hesaplamak; tepeyi ortalamadan ayırmak; gecikmeyi yüzdelikle okumak; Little yasasıyla eşzamanlılık, havuz ve bağlantı sayısını bulmak.
etiketler: [kapasite, tahmin, gecikme, yuzdelik, little-yasasi, olcekleme]
duzey: orta
guncellik: 2026-11
---

# Kapasite tahmini: zarf arkası hesap, tepe yük, yüzdelikler ve Little yasası

> Bu notu ne zaman okumalı: yeni bir ürün ya da özellik için "kaç sunucu, ne kadar disk, ne kadar bant
> genişliği?" sorulduğunda; bağlantı havuzu, işçi sayısı, zaman aşımı gibi bir sayı seçilirken; bir pano
> "ortalama gecikme 60 ms" gösterip kullanıcılar yavaşlıktan yakınırken.

## Temel fikir

- **Zarf arkası hesap** (back-of-the-envelope) büyüklük mertebesini bulur: 2 kat hata önemsizdir, 10 kat hata
  mimariyi değiştirir. Amaç kesin sayı değil, "tek makine yeter mi, hangi kaynak önce dolar" sorusunun cevabıdır.
- Her hesap **yazılı varsayımlarla** başlar ve her varsayımın yanında kaynağı durur: ölçüldü / tahmin / benzer ürün.
  Varsayım değişince hesap yeniden koşulur; bu yüzden hesap kodda ya da tabloda tutulur, kafada değil.
- Kapasite **tepeye** göre planlanır, ortalamaya göre değil. Tepe, ortalamanın saatlik ölçekte 2–3, dakikalık
  ölçekte (bildirim, kampanya) 10–30 katı olabilir.
- Gecikme **dağılımdır**; tek sayıyla (ortalama) özetlenmez. p50 tipik kullanıcıyı, p99 kötü deneyimi anlatır.
- **Little yasası:** içerideki ortalama iş = geliş hızı × içeride kalma süresi (L = λ·W). Havuz boyu, işçi sayısı,
  açık bağlantı sayısı bununla hesaplanır.

## Yararlı çevrimler

| Değer                   | Yaklaşık                                         |
| ----------------------- | ------------------------------------------------ |
| 1 gün                   | 86 400 sn ≈ 10⁵ sn                               |
| Günde 1 milyon istek    | ≈ 12 istek/sn (ortalama; tepe değil)             |
| Ayda 1 milyon istek     | ≈ 0,4 istek/sn                                   |
| 1 yıl                   | ≈ 3,15 × 10⁷ sn                                  |
| 1 Mbit/sn sürekli       | 125 KB/sn ≈ günde 10,8 GB                        |
| Işığın fiberdeki hızı   | ≈ 200 000 km/sn → her 1000 km için ≥ 10 ms gidiş-dönüş |

## Yöntem: altı adım

1. **Varsayımlar:** günlük etkin kullanıcı, kullanıcı başına işlem, işlem başına istek, okuma/yazma oranı,
   kayıt boyutu, yanıt boyutu, saklama süresi. Her birinin kaynağını yazın.
2. **Ortalama istek/sn** = günlük istek / 86 400; **tepe** = ortalama × tepe çarpanı (aşağıda).
3. **Yazma/sn** ayrıca: veritabanını çoğunlukla yazmalar sınırlar.
4. **Depolama** = günlük yeni kayıt × boyut × 365 × ek yük payı (dizin, boşluk, günlük dosyası için ×1,5–2) ×
   yedek kopya sayısı.
5. **Bant genişliği** = tepe istek/sn × yanıt boyutu; görsel ve dosyalar çoğu zaman bunun büyük kısmıdır.
6. **Eşzamanlılık** = Little yasası: bağlantı, işçi, havuz boyu.

Sonuç cümlesi şöyle yazılır: "Tepe 80 istek/sn, tek sunucu ~700 taşır; yıllık 45 GB. Tek sunucu + günlük yedek
yeter. Tepe 400'ü geçerse yeniden bakılır." Son cümle **tetikleyici eşiktir**: panoya uyarı olarak girer.

## Çalışan hesaplayıcı

```python calistir
GUN_SN = 86_400


def zarf_hesabi(v: dict[str, float]) -> dict[str, float]:
    gunluk_islem = v["gunluk_etkin_kullanici"] * v["kullanici_basina_islem"]
    yazma_gunluk = gunluk_islem * v["yazma_orani"]
    ortalama_rps = gunluk_islem * v["islem_basina_istek"] / GUN_SN
    yillik_bayt = yazma_gunluk * v["kayit_bayt"] * 365 * v["dizin_ve_ek_yuk"]
    return {
        "ortalama_istek_sn": ortalama_rps,
        "tepe_istek_sn": ortalama_rps * v["tepe_carpani"],
        "yazma_sn_tepe": yazma_gunluk / GUN_SN * v["tepe_carpani"],
        "depolama_gb_yil": yillik_bayt / 1e9,
        "cikis_mbit_sn_tepe": ortalama_rps * v["tepe_carpani"] * v["yanit_bayt"] * 8 / 1e6,
    }


varsayim = {  # her satırın yanına kaynağını yazın: ölçüldü / tahmin / benzer ürün
    "gunluk_etkin_kullanici": 20_000,  # tahmin
    "kullanici_basina_islem": 30,  # tahmin: açma, listeleme, işaretleme…
    "islem_basina_istek": 2,  # ölçüldü: tarayıcı ağ sekmesi
    "yazma_orani": 0.1,  # işlemlerin %10'u yazma
    "kayit_bayt": 1_000,  # ölçüldü: ortalama JSON satırı
    "dizin_ve_ek_yuk": 2.0,  # dizin, sayfa boşluğu, günlük dosyası için ×2 pay
    "tepe_carpani": 6,  # dakikalık tepe / gün ortalaması
    "yanit_bayt": 8_000,  # ortalama sıkıştırılmış yanıt
}
s = zarf_hesabi(varsayim)
for ad, deger in s.items():
    print(f"{ad:>20}: {deger:8.1f}")
assert 13 < s["ortalama_istek_sn"] < 15  # 20 bin × 30 × 2 / 86 400 ≈ 13,9
assert s["depolama_gb_yil"] < 50  # birkaç on GB: tek disk yeter
```

```cikti
   ortalama_istek_sn:     13.9
       tepe_istek_sn:     83.3
       yazma_sn_tepe:      4.2
     depolama_gb_yil:     43.8
  cikis_mbit_sn_tepe:      5.3
```

Bu ürün için tek sunucu fazlasıyla yeter ([Ölçekleme temelleri](olcekleme-temelleri.md) → tek makine hesabı).
Kullanıcıların yüklediği fotoğraflar eklenirse depolama ve bant genişliği satırları 100 katına çıkabilir:
dosyalar ayrı hesaplanır ([Dosya paylaşımı](ornek-dosya-paylasimi.md)).

## Tepe ve ortalama

Trafik düz değildir: gece düşer, akşam yükselir; hafta sonu farklıdır; anlık bildirim, kampanya, televizyon
reklamı, saat başı çalışan zamanlanmış işler **dakikalık** sivri tepeler yaratır.

```python calistir
saatlik = [1, .5, .3, .2, .2, .3, .8, 2, 3, 3.5, 3.5, 3.5, 4, 4, 3.5, 3.5, 3.5, 4, 5, 6, 7, 7, 5, 2.5]  # göreli
ortalama = 1_200_000 / 86_400  # günde 1,2 milyon istek
saat_tepesi = ortalama * max(saatlik) / (sum(saatlik) / 24)

# 20:00'de 20 bin kişiye anlık bildirim: %25'i açar, açanların yarısı ilk dakikada; açılış 10 istek yapar
acan = 20_000 * 0.25
bildirim_dakikasi = saat_tepesi + acan * 0.5 * 10 / 60
# Aynı bildirim 20 dakikaya yayılarak gönderilirse dakikada ~1/20'si açar
yayilmis = saat_tepesi + acan / 20 * 10 / 60

print(f"gün ortalaması   : {ortalama:6.1f} istek/sn")
print(f"en yoğun saat    : {saat_tepesi:6.1f} istek/sn (×{saat_tepesi / ortalama:.1f})")
print(f"bildirim dakikası: {bildirim_dakikasi:6.1f} istek/sn (×{bildirim_dakikasi / ortalama:.0f})")
print(f"yayılmış bildirim: {yayilmis:6.1f} istek/sn (×{yayilmis / ortalama:.0f})")
assert bildirim_dakikasi / ortalama > 20 and yayilmis < bildirim_dakikasi / 4
```

```cikti
gün ortalaması   :   13.9 istek/sn
en yoğun saat    :   31.6 istek/sn (×2.3)
bildirim dakikası:  448.3 istek/sn (×32)
yayılmış bildirim:   73.3 istek/sn (×5)
```

Dersler: (1) Tepe çarpanını **ölçün**: günlüklerden dakika başına istek sayın, en yüksek dakikayı gün ortalamasına
bölün. (2) Tepeyi siz yaratıyorsanız (bildirim, toplu e-posta, saat başı iş) **yayın**: gönderimi dakikalara
dağıtın, zamanlanmış işleri saat başı yerine rastgele dakikaya koyun.

## Gecikme: neden ortalama değil yüzdelik

```python calistir
import math
import random

rng = random.Random(42)
gecikme = []
for _ in range(10_000):
    if rng.random() < 0.02:  # %2'si kilide, çöp toplamaya ya da soğuk önbelleğe denk gelir
        gecikme.append(rng.uniform(800, 2500))
    else:
        gecikme.append(max(5.0, rng.gauss(35, 8)))
gecikme.sort()


def yuzdelik(sirali: list[float], p: float) -> float:
    """En yakın sıra yöntemi: değerlerin p yüzdesi bu sayıya eşit ya da küçüktür."""
    return sirali[max(0, math.ceil(p / 100 * len(sirali)) - 1)]


ortalama = sum(gecikme) / len(gecikme)
p50, p95, p99 = (yuzdelik(gecikme, p) for p in (50, 95, 99))
print(f"ortalama {ortalama:.0f} ms | p50 {p50:.0f} ms | p95 {p95:.0f} ms | p99 {p99:.0f} ms")
assert p50 < ortalama < p99  # ortalama ne tipik isteği ne de kötü deneyimi anlatır
assert p99 > 10 * p50

# Kuyruk büyür: bir sayfa N çağrı yapıyorsa en az birinin p99'u aşma olasılığı
for n in (1, 10, 50, 100):
    print(f"{n:3} çağrı → en az bir yavaş çağrı olasılığı %{(1 - 0.99**n) * 100:4.1f}")
sayfa = sum(any(rng.random() < 0.01 for _ in range(10)) for _ in range(100_000)) / 100_000
assert abs(sayfa - (1 - 0.99**10)) < 0.005  # benzetim formülü doğruluyor
```

```cikti
ortalama 67 ms | p50 35 ms | p95 50 ms | p99 1651 ms
  1 çağrı → en az bir yavaş çağrı olasılığı % 1.0
 10 çağrı → en az bir yavaş çağrı olasılığı % 9.6
 50 çağrı → en az bir yavaş çağrı olasılığı %39.5
100 çağrı → en az bir yavaş çağrı olasılığı %63.4
```

Okuma:

- Ortalama (67 ms) ne tipik isteği (35 ms) ne de kötü deneyimi (1,6 sn) anlatır. Panoda p50, p95, p99 yan yana durur.
- p99 "yüzde birin sorunu" değildir: oturum başına 50 istek yapan kullanıcıların %40'ı en az bir kez p99'u yaşar.
  Bir sayfa 10 arka uç çağrısı bekliyorsa sayfaların ~%10'u p99 kadar yavaştır. Çok çağrılı sayfada kuyruk
  gecikmesi asıl gecikmedir.
- Yüzdelikler **ortalanamaz** ve toplanamaz: iki sunucunun p99'larının ortalaması, birleşik p99 değildir. Ham
  ölçümleri ya da histogramları birleştirin ([Gözlemlenebilirlik](gozlemlenebilirlik.md)).
- Ölçümü sunucunun içinden değil, mümkünse istemciye en yakın yerden alın: kuyrukta bekleme süresi sunucunun
  "işlem süresi" ölçümünde görünmez.

## Little yasası

Kararlı bir sistemde içerideki ortalama iş sayısı **L = λ · W**: λ geliş hızı, W içeride kalma süresidir. Dağılım,
işçi sayısı, sıra düzeni ne olursa olsun geçerlidir. Benzetim, L'yi rastgele anlarda sayarak bağımsız ölçer:

```python calistir
import bisect
import random

rng = random.Random(5)
gelis_hizi, isci, is_suresi = 50.0, 4, 0.06  # 50 istek/sn, 4 işçi, ortalama 60 ms iş → doluluk %75
bos = [0.0] * isci
gelis, ayrilis = [], []
saat = 0.0
for _ in range(50_000):
    saat += rng.expovariate(gelis_hizi)
    i = min(range(isci), key=bos.__getitem__)  # sıradaki istek ilk boşalan işçiye
    bos[i] = max(saat, bos[i]) + rng.expovariate(1 / is_suresi)
    gelis.append(saat)
    ayrilis.append(bos[i])

sure = max(ayrilis)
lam = len(gelis) / sure  # ölçülen geliş hızı (istek/sn)
w = sum(a - g for g, a in zip(gelis, ayrilis)) / len(gelis)  # ortalama içeride kalma (sn)
ayrilis_sirali = sorted(ayrilis)
anlar = [rng.uniform(0, sure) for _ in range(20_000)]  # rastgele anlarda "içeride kaç istek var"
L = sum(bisect.bisect_right(gelis, t) - bisect.bisect_right(ayrilis_sirali, t) for t in anlar) / len(anlar)
print(f"λ = {lam:.1f} istek/sn, W = {w * 1000:.0f} ms → λ·W = {lam * w:.2f}; sayılan L = {L:.2f}")
assert abs(L - lam * w) / (lam * w) < 0.05
```

```cikti
λ = 49.7 istek/sn, W = 89 ms → λ·W = 4.44; sayılan L = 4.38
```

Günlük işte kullanımı:

```python calistir
def icerideki(gelis_hizi_sn: float, sure_sn: float) -> float:
    """Little yasası: içerideki ortalama iş = geliş hızı × içeride kalma süresi."""
    return gelis_hizi_sn * sure_sn


# 1) Veritabanı bağlantı havuzu: 300 istek/sn, istek başına bağlantı toplam 8 ms tutuluyor
assert round(icerideki(300, 0.008), 1) == 2.4  # ortalama 2,4 bağlantı meşgul → 8–10'luk havuz bol gelir
# 2) Bağımlılık yavaşlarsa: 200 istek/sn, normalde 50 ms
assert icerideki(200, 0.05) == 10  # içeride 10 istek
assert icerideki(200, 2.0) == 400  # bağımlılık 2 sn'ye çıktı → 400 istek içeride: 64'lük işçi havuzu tükenir
# 3) Anlık bildirim bağlantıları: 20 bin kullanıcı × günde 3 oturum, tepe ×6, oturum 4 dk
oturum_hizi = 20_000 * 3 / 86_400 * 6
assert round(icerideki(oturum_hizi, 240)) == 1000  # tepede ~1000 açık bağlantı
print("havuz 2.4 | normal 10 → yavaş 400 | bağlantı 1000")
```

```cikti
havuz 2.4 | normal 10 → yavaş 400 | bağlantı 1000
```

İkinci satır, kesintilerin çoğunun öyküsüdür: bağımlılık yavaşlayınca W büyür, geliş hızı aynı kaldığı için
içerideki iş sayısı patlar ve bütün işçiler yavaş çağrıyı bekler. Çare W'yi sınırlamaktır: zaman aşımı, bölme,
yük atma ([Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)).

## Ağ gecikmesi: fizik alt sınırı

Sunucunun yeri, kullanıcıya en az bir gidiş-dönüş süresi ekler ve bunu hiçbir optimizasyon silemez:

```python calistir
import math


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """İki enlem/boylam arasındaki büyük daire uzaklığı (haversine)."""
    e1, b1, e2, b2 = map(math.radians, (*a, *b))
    h = math.sin((e2 - e1) / 2) ** 2 + math.cos(e1) * math.cos(e2) * math.sin((b2 - b1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


ISTANBUL = (41.01, 28.98)
for ad, yer in [("Frankfurt", (50.11, 8.68)), ("ABD doğu kıyısı", (38.95, -77.45))]:
    rtt_ms = 2 * km(ISTANBUL, yer) / 200_000 * 1000  # ışık fiberde ~200 000 km/sn
    print(f"İstanbul → {ad}: en az {rtt_ms:3.0f} ms gidiş-dönüş; 5 ardışık istek ≥ {5 * rtt_ms:3.0f} ms")
```

```cikti
İstanbul → Frankfurt: en az  19 ms gidiş-dönüş; 5 ardışık istek ≥  93 ms
İstanbul → ABD doğu kıyısı: en az  84 ms gidiş-dönüş; 5 ardışık istek ≥ 421 ms
```

Gerçek yol düz değildir; ölçülen değer bu alt sınırın üstündedir (`ping` ile ölçün). Ders: ardışık istek
sayısını azaltın (birleştirin, paralel yapın), kullanıcıların çoğu Türkiye'deyse sunucuyu yakına koyun, statik
dosyaları CDN'den verin.

## Tuzaklar

| Belirti                                                          | Neden                                                       | Çözüm                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Günlük ortalamaya göre kurulan sistem her akşam 20:00'de çöküyor | Tepe çarpanı yok sayıldı                                    | Dakikalık tepeyi ölç, ona göre planla                     |
| Bildirim gönderilince sistem çöküyor                             | Herkese aynı anda gönderim, sivri tepe                      | Gönderimi dakikalara yay                                  |
| Pano "ortalama 60 ms" diyor, kullanıcılar yavaşlıktan yakınıyor  | Uzun kuyruk ortalamada kayboluyor                           | p50/p95/p99 göster; istemci tarafı ölçüm                  |
| İki sunucunun p99'u ortalanınca "iyi" görünüyor                  | Yüzdelikler ortalanamaz                                     | Ham ölçüm ya da histogram birleştir                       |
| Bağımlılık yavaşlayınca bütün site duruyor                       | Little: W büyüdü, işçiler tükendi                           | Zaman aşımı, bölme, yük atma                              |
| Bağlantı havuzu 200, veritabanı boğuluyor                        | Havuz boyu tahminsiz, büyük seçildi                          | λ·W × 2–3 pay; veritabanı çekirdeğinin birkaç katını geçme |
| Depolama bir yılda tahminin 5 katı                               | Dizin, günlük dosyası, yedek kopyaları, dosyalar unutuldu   | Ek yük çarpanı ve dosyaları ayrı satırda hesapla          |
| Hesap var ama kimse yeniden bakmıyor                             | Tetikleyici eşik yazılmadı                                  | "Şu sayı geçilirse yeniden bak" uyarısı kur               |
| "10 milyon kullanıcı" için tasarım, gerçekte 2000 kullanıcı      | Varsayım ölçümle değil umutla yazıldı                       | Bugünkü ölçüm × makul büyüme; 10 kat ötesi ayrı karar     |

## Denetim listesi

- [ ] Her varsayım yazılı ve kaynağı belli (ölçüldü / tahmin / benzer ürün).
- [ ] Ortalama ve tepe ayrı hesaplandı; tepe çarpanı günlüklerden ölçüldü ya da gerekçeyle seçildi.
- [ ] Okuma ve yazma hızları ayrı; depolama yıllık büyüme ve ek yük payıyla hesaplandı.
- [ ] Dosya/görsel depolama ve bant genişliği ayrı satırda.
- [ ] Havuz, işçi ve bağlantı sayıları Little yasasıyla hesaplandı ve gerekçesi koda yorum olarak yazıldı.
- [ ] Gecikme hedefleri yüzdelikle yazıldı (ör. "p95 < 300 ms"), ortalamayla değil.
- [ ] Sonuç cümlesi ve tetikleyici eşik yazıldı; eşik panoda uyarı olarak var.
- [ ] Hesap kodda ya da tabloda; varsayım değişince yeniden koşulabiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kapasite hesabını Python işlevi olarak yaz; varsayımları bir sözlükte, her birinin yanına
  kaynağını yorum olarak koy. Ortalama ve tepeyi ayrı hesapla. Sonunda tek cümlelik sonuç ve 'şu sayı geçilirse
  yeniden bak' eşiği yaz."
- **Modelin tipik hatası:** günlük istekleri 86 400'e bölüp tepeyi unutur; yüzdelikleri ortalar; birimleri
  karıştırır (ms ↔ sn, bit ↔ bayt, MB ↔ MiB); "milyonlarca kullanıcı" gibi hiçbir ölçüme dayanmayan varsayımla
  dev bir mimari kurar.
- **Çıktıda denetleyin:** her sayının birimi var mı; tepe çarpanı var mı; Little yasasıyla bulunan sayılar
  (havuz, işçi) koddaki ayarlarla aynı mı; sonuç "tek sunucu yeter mi" sorusunu açıkça cevaplıyor mu.
- **Doğrulama:** hesaplayıcıya bugünkü ölçülmüş değerleri verip panodaki gerçek sayıyla karşılaştırın; 2 kattan
  fazla sapma varsa varsayımlardan biri yanlıştır.

## İlgili

- [Ölçekleme temelleri](olcekleme-temelleri.md) (tek makine hesabı, doluluk–gecikme ilişkisi)
- [Gözlemlenebilirlik](gozlemlenebilirlik.md) (yüzdelik ölçümü, SLO) · [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md)
- Örnek tasarımlardaki kaba hesaplar: [URL kısaltıcı](ornek-url-kisaltici.md), [Haber akışı](ornek-haber-akisi.md)
- Havuzdaki istatistik yardımcıları (yüzdelik, histogram): [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
