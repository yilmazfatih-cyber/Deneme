---
baslik: "Yük testi: gerçekçi yük modeli, koordineli eksik ölçüm ve darboğaz okuma"
ozet: Üretimden türetilen yük modeli, açık ve kapalı model farkı, koordineli eksik ölçüm, kademeli artış, yüzdelik ve hata oranını birlikte okuma, darboğaz bulma; yerel sunucuya çalışan küçük bir yük üreteciyle.
etiketler: [yuk-testi, performans, gecikme, yuzdelik, kapasite, olcum]
duzey: ileri
guncellik: 2026-11
---

# Yük testi: gerçekçi yük modeli, koordineli eksik ölçüm ve darboğaz okuma

> Bu notu ne zaman okumalı: bir kampanya, televizyon reklamı ya da toplu bildirim öncesinde "kaldırır mı?" sorusu
> sorulduğunda; bir model yük testi betiği yazdığında ve sonuç "her şey hızlı" dediğinde; yayından sonra gerçek
> trafikte yavaşlık görüldüğü hâlde testin temiz geçtiği durumlarda.

## Temel fikir

- Yük testi tek bir soruya yanıt verir: **beklenen tepe yükte hedef (SLO) tutuyor mu, sistem nerede ve nasıl
  kırılıyor?** Sonuç tek sayı değil bir eğridir: hız arttıkça p50/p95/p99 ve hata oranı; eğrinin dirseği kapasitedir.
- Üç şey testi yalancı yapar: gerçek dışı **yük modeli** (tek uç, tek hesap, küçük veri, sıcak önbellek); gecikmeyi
  gizleyen **kapalı model üreteç** (koordineli eksik ölçüm); yanlış **ortam** (aynı makine, hız sınırı, eksik bağımlılık).
- Web trafiği **açık modeldir**: kullanıcılar sunucunun yavaşladığını bilmeden gelmeye devam eder. Kapasite testi
  açık modelle yapılır; süre, isteğin **gönderilmesi gereken** andan ölçülür.
- Kaba hesap ve Little yasası: [Kapasite tahmini](kapasite-tahmini.md); %70 doluluk dirseği:
  [Ölçekleme temelleri](olcekleme-temelleri.md); tek işlevi ölçmek: [Performans yöntemi](../00-yontem/performans-yontemi.md).

## Karar tablosu: hangi test, hangi soru

| Tür                     | Soru                                              | Biçim                                      | Süre                    | Geçme ölçütü                                     |
| ----------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------- | ------------------------------------------------ |
| Duman (smoke)           | Betik ve ortam çalışıyor mu                       | 1–2 istek/sn                               | 1 dk                    | Hata yok                                         |
| Yük (load)              | Beklenen tepede hedef tutuyor mu                  | Tepe × 1–2, açık model                     | 15–30 dk                | p95 hedefin altında, hata < %0,1                 |
| Kırılma (stress)        | Nerede ve **nasıl** kırılıyor                     | Kademeli artış, kırılana dek               | Kademe başına birkaç dk | Dirsek bulundu; aşırı yükte hızlı ret mi, çöküş mü |
| Ani artış (spike)       | Bildirim, kampanya anı                            | Saniyeler içinde 0'dan tepeye              | 5–10 dk                 | Toparlanma süresi, kayıp iş yok                  |
| Dayanıklılık (soak)     | Saatler içinde sızıntı, birikme                   | Ortalama yük                               | Saatler                 | Bellek, bağlantı, disk, kuyruk sabit             |

## Yük modeli: üretimden türetin

Uç karışımını ve tepe saniyeyi erişim günlüğünden çıkarın; kimlikleri kalıba indirin ki aynı uç tek satır olsun:

```python calistir
import re
from collections import Counter
from datetime import datetime

GUNLUK = """\
2026-11-20T20:00:00.120Z GET /api/gorevler 200 31
2026-11-20T20:00:00.480Z POST /api/sync 200 54
2026-11-20T20:00:01.010Z GET /api/gorevler/0193a5c8-5000-7000-8000-00000000000a 200 12
2026-11-20T20:00:01.050Z POST /api/sync 200 61
2026-11-20T20:00:01.090Z POST /api/sync 200 48
2026-11-20T20:00:01.200Z GET /api/events 200 30000
2026-11-20T20:00:01.310Z POST /api/auth/login 200 160
2026-11-20T20:00:01.400Z POST /api/sync 200 52
2026-11-20T20:00:01.770Z GET /api/gorevler/0193a5c8-5000-7000-8000-00000000000b 404 9
2026-11-20T20:00:01.950Z POST /api/sync 200 57
2026-11-20T20:00:02.300Z GET /api/gorevler 200 29
2026-11-20T20:00:03.600Z POST /api/sync 200 50
"""
KIMLIK = re.compile(r"/[0-9a-f]{8}-[0-9a-f-]{27}|/\d+")
satirlar = [s.split() for s in GUNLUK.splitlines()]
kalip = Counter(f"{yontem} {KIMLIK.sub('/{id}', yol)}" for _, yontem, yol, _, _ in satirlar)
saniye = Counter(zaman[:19] for zaman, *_ in satirlar)
ilk, son = (datetime.fromisoformat(satirlar[i][0]) for i in (0, -1))
sure = int((son - ilk).total_seconds()) + 1
print("uç karışımı:", ", ".join(f"{k} %{n * 100 // len(satirlar)}" for k, n in kalip.most_common()))
print(f"ortalama {len(satirlar) / sure:.1f} istek/sn, en yoğun saniye {max(saniye.values())} istek")
assert kalip["GET /api/gorevler/{id}"] == 2
```

```cikti
uç karışımı: POST /api/sync %50, GET /api/gorevler %16, GET /api/gorevler/{id} %16, GET /api/events %8, POST /api/auth/login %8
ortalama 3.0 istek/sn, en yoğun saniye 8 istek
```

Modele girmesi gerekenler:

- **Karışım ve tepe:** uç oranları; ortalama değil tepe saniye (örnekte ortalamanın 2,7 katı); bildirimden sonraki
  ani artış ([Kapasite tahmini](kapasite-tahmini.md) → tepe ve ortalama).
- **Uzun bağlantılar ayrı:** SSE ve WebSocket (`/api/events`, 30 sn) bir istek değil, **eşzamanlı bağlantı**
  sayısıdır; gecikme istatistiğine karışırsa p99 anlamsızlaşır.
- **Veri dağılımı:** gerçek kullanıcılar az sayıda sıcak kayda yoğunlaşır. Hep aynı kaydı istemek önbelleği haksız
  iyi, tekdüze rastgele anahtar haksız kötü gösterir.
- **Kimlik ve kaynak adresi:** tek hesap ve tek IP; kilitleri, önbelleği ve hız sınırını gerçek dışı yapar. Tek IP'den
  koşan test kapasiteyi değil hız sınırlayıcıyı ölçer (429).
- **Veri boyutu:** üretim boyutunda sentetik veri; 100 satırlık tabloda eksik dizin görünmez.
- **Arka plan:** zamanlanmış işler ve kuyruk işçileri testte de çalışsın; gece raporu tam tepe anına denk gelebilir.

## Açık ve kapalı model: koordineli eksik ölçüm

Kapalı model üreteç (N sanal kullanıcı, her biri yanıtı alınca yenisini gönderir) sunucu donunca **istek göndermeyi
de bırakır**: donma boyunca gelmesi gereken istekler hiç ölçülmez. Buna koordineli eksik ölçüm (coordinated
omission) denir. Aynı sunucu, aynı 0,6 saniyelik donma:

```python calistir
import http.client
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BAS = time.monotonic()
DURAKLAMA = (0.5, 1.1)  # testin 0,5. saniyesinde sunucu 0,6 sn donar (çöp toplama, kilit, disk)


class Sunucu(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        simdi = time.monotonic() - BAS
        if DURAKLAMA[0] <= simdi < DURAKLAMA[1]:
            time.sleep(DURAKLAMA[1] - simdi)
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *_: object) -> None:
        pass


ThreadingHTTPServer.request_queue_size = 128
sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Sunucu)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()


def istek() -> None:
    baglanti = http.client.HTTPConnection(*sunucu.server_address, timeout=5)
    baglanti.request("GET", "/")
    baglanti.getresponse().read()
    baglanti.close()


def kapali(sure: float) -> list[float]:
    """Tek sanal kullanıcı: yanıtı almadan yenisini göndermez; süreyi GÖNDERDİĞİ andan ölçer."""
    olcum, bitis = [], time.monotonic() + sure
    while time.monotonic() < bitis:
        t = time.monotonic()
        istek()
        olcum.append(time.monotonic() - t)
    return olcum


def acik(hiz: float, sure: float) -> list[float]:
    """Saniyede `hiz` istek, yanıtı beklemeden; süreyi isteğin GÖNDERİLMESİ GEREKEN andan ölçer."""
    olcum: list[float] = []
    bas = time.monotonic()

    def gorev(hedef: float) -> None:
        istek()
        olcum.append(time.monotonic() - hedef)

    with ThreadPoolExecutor(max_workers=64) as havuz:
        for i in range(int(hiz * sure)):
            hedef = bas + i / hiz
            time.sleep(max(0.0, hedef - time.monotonic()))
            havuz.submit(gorev, hedef)
    return olcum


def ozet(ad: str, olcum: list[float]) -> float:
    s = sorted(olcum)
    yavas = sum(x > 0.1 for x in s) / len(s)
    print(f"{ad:26} {len(s):5} istek | p50 {s[len(s) // 2] * 1000:6.1f} ms | p99 {s[int(len(s) * 0.99)] * 1000:6.1f} ms"
          f" | 100 ms'yi aşan %{yavas * 100:4.1f}")
    return yavas


BAS = time.monotonic()
k = ozet("kapalı model (1 kullanıcı)", kapali(2.0))
BAS = time.monotonic()
a = ozet("açık model (200 istek/sn)", acik(200, 2.0))
sunucu.shutdown()
assert k < 0.05 and a > 0.15
```

Bu makinede bir koşu: kapalı model ~2500 istek, p99 ~1 ms, yavaş istek %0,0; açık model 400 istek, p99 ~610 ms,
yavaş istek ~%30. Sunucu ikisinde de aynı 0,6 saniye dondu; kapalı model bunu tek bir örnekte saklayıp "p99 1 ms"
dedi.

- Kapalı modelin tavanı Little yasasıdır: N kullanıcı / (gecikme + düşünme süresi). 50 sanal kullanıcı 50 ms'de en çok
  1000 istek/sn üretir; sunucu 500 ms'ye yavaşlayınca yük **kendiliğinden** 100'e iner ve test "dayandı" der.
- Kapalı model, "aynı anda en çok N kişi çalışır" türü iç araçlar için doğrudur (çağrı merkezi ekranı); halka açık
  ürün için yanlıştır.
- Araç kullanıyorsanız (k6, Locust, wrk2, vegeta gibi) açık model ("sabit geliş hızı") seçeneğini ve sürenin planlanan
  andan ölçülüp ölçülmediğini belgesinden doğrulayın (doğrulanmadı; araçlar farklıdır).

## Kademeli artış: küçük bir yük üreteci

Aşağıdaki üreteç açık modelle çalışır: gelişler düzensizdir (Poisson, tohumlu), süre planlanan andan ölçülür,
üretecin planın gerisinde kalıp kalmadığı raporlanır. Sunucunun tavanı bilerek ~100 istek/sn yapılmıştır (aynı anda
2 iş, iş başına 20 ms):

```python calistir
import http.client
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ISCI = threading.Semaphore(2)  # darboğaz: aynı anda 2 iş, iş başına 20 ms → tavan ~100 istek/sn


class Sunucu(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        with ISCI:
            time.sleep(0.02)
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *_: object) -> None:
        pass


ThreadingHTTPServer.request_queue_size = 256
sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Sunucu)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()


def istek(hedef: float, sonuc: list) -> None:
    try:
        baglanti = http.client.HTTPConnection(*sunucu.server_address, timeout=5)
        baglanti.request("GET", "/")
        durum = baglanti.getresponse().status
        baglanti.close()
    except OSError:
        durum = 0
    sonuc.append((time.monotonic() - hedef, durum))  # süre, isteğin GİTMESİ GEREKEN andan


def kademe(hiz: float, sure: float, rng: random.Random) -> dict:
    sonuc: list = []
    geride = 0.0  # üretecin planın en çok ne kadar gerisinde kaldığı
    bas = hedef = time.monotonic()
    with ThreadPoolExecutor(max_workers=128) as havuz:
        while (hedef := hedef + rng.expovariate(hiz)) < bas + sure:  # Poisson gelişler: gerçek trafik gibi düzensiz
            time.sleep(max(0.0, hedef - time.monotonic()))
            geride = max(geride, time.monotonic() - hedef)
            havuz.submit(istek, hedef, sonuc)
    basarili = sorted(s for s, d in sonuc if d == 200)  # gecikme yalnız başarılı isteklerden
    yuzdelik = lambda p: basarili[min(len(basarili) - 1, int(len(basarili) * p))] * 1000
    return {"p50": yuzdelik(0.5), "p95": yuzdelik(0.95), "p99": yuzdelik(0.99),
            "hata": 1 - len(basarili) / len(sonuc), "geride": geride * 1000}


print(" hedef/sn |   p50 ms |   p95 ms |   p99 ms | hata | üreteç geride ms")
sonuclar = []
for hiz in (25, 50, 75, 125):  # her kademe 1 sn (gerçekte birkaç dakika + atılan ısınma süresi)
    k = kademe(hiz, 1.0, random.Random(hiz))
    sonuclar.append(k)
    print(f" {hiz:8} | {k['p50']:8.1f} | {k['p95']:8.1f} | {k['p99']:8.1f} | %{k['hata'] * 100:3.0f} | {k['geride']:6.1f}")
sunucu.shutdown()
assert sonuclar[0]["p95"] < 100 and sonuclar[-1]["p95"] > 3 * sonuclar[0]["p95"]
```

Bu makinede bir koşu (sayılar koşudan koşuya biraz değişir):

```text
 hedef/sn |   p50 ms |   p95 ms |   p99 ms | hata | üreteç geride ms
       25 |     21.3 |     21.6 |     21.9 | %  0 |    0.3
       50 |     21.3 |     30.3 |     36.2 | %  0 |    0.3
       75 |     31.0 |     62.9 |     68.2 | %  0 |    0.5
      125 |    214.3 |    308.5 |    314.0 | %  0 |    0.5
```

Okuma:

- %75 dolulukta (75/100) p95 üç katına çıktı: düzensiz gelişte kuyruk tavana varmadan başlar. Aynı testi **sabit
  aralıkla** göndermek bu dirseği gizler (sabit aralıklı denemede 75'te p95 ~21 ms kaldı).
- Tavanın üstünde (125) kuyruk her saniye büyür; gecikme kademe sürdükçe artmaya devam eder. Kısa kademe dirseği
  kaçırır; gerçekte kademe başına birkaç dakika koşun, ilk dakikayı (ısınma) ayrı raporlayın.
- "Üreteç geride" sütunu birkaç milisaniyeyi aşıyorsa ölçülen şey sunucu değil üreteçtir: üreteci ayrı makineye alın.
- Hata oranı ayrı sütundur: hızlı dönen 500'ler gecikme yüzdeliklerini **iyileştirir**; ikisi birlikte okunur.

## Ölçüm hataları

- **Örnek sayısı:** 200 istekte p99 tek bir istektir; p99 için kademe başına en az birkaç bin istek.
- **Yüzdelikler ortalanmaz:** kademeleri ya da üreteç makinelerini birleştirirken ham ölçümleri ya da histogramları
  birleştirin ([Kapasite tahmini](kapasite-tahmini.md) → yüzdelikler).
- **Saat:** süre `time.monotonic()` / `performance.now()` ile ölçülür; duvar saati geriye atlayabilir.
- **Bağlantı:** gerçek istemci kalıcı bağlantı kullanıyorsa test de kullanmalı (ya da tersi); her istekte TLS el
  sıkışması ayrı bir yük modelidir.
- **Aynı makine:** üreteç ve sunucu işlemciyi paylaşır; sonuç ikisinin toplamıdır. Göreli karşılaştırma (önce/sonra)
  için kabul edilebilir, kapasite için değil.
- **Kısa test:** sızıntı, disk dolması, günlük döndürme, önbellek süresi dakikalar içinde görünmez (dayanıklılık testi).

## Darboğazı okumak

Her kaynak için üç soru (USE yöntemi): **kullanım** (ne kadar meşgul), **doygunluk** (ne kadar iş bekliyor),
**hata** (reddediyor mu):

| Kaynak                         | Kullanım              | Doygunluk                               | Hata                     |
| ------------------------------ | --------------------- | --------------------------------------- | ------------------------ |
| İşlemci                        | %CPU                  | Çalışma kuyruğu (yük ortalaması > çekirdek) | —                    |
| Node olay döngüsü              | —                     | Döngü gecikmesi (`monitorEventLoopDelay`) | —                      |
| Veritabanı bağlantı havuzu     | Kullanılan bağlantı   | Havuzdan bağlantı bekleme süresi        | Havuz zaman aşımı        |
| SQLite yazma kilidi            | —                     | Kilit bekleme                           | `SQLITE_BUSY`            |
| Bellek                         | Çalışan bellek        | Takas (swap)                            | Bellek aşımı ile ölüm    |
| Disk                           | Meşguliyet            | Bekleme süresi                          | —                        |
| Bağlantı ve dosya tanıtıcısı   | Açık bağlantı         | Kabul kuyruğu                           | `EMFILE`, bağlantı reddi |
| Dış bağımlılık                 | Çağrı/sn              | Bekleyen çağrı                          | Zaman aşımı, 429         |

Örüntüler:

- **Hız düz, gecikme artıyor:** bir kaynak doydu (yüzde yüz ya da bir kilit/havuz). Doygunluk sütununa bakın.
- **İşlemci düşük, gecikme yüksek:** iş bekliyor; kilit, havuz, disk ya da dış çağrı. Bekleme süresi ölçütlerine bakın.
- **Gecikme önce düz, sonra dik:** kuyruk dirseği; tavanın %70–80'i civarında başlar.
- **Hatalar başladı, gecikme düşük:** hızlı ret (hız sınırı, havuz doldu, bağlantı reddi). Bilinçli yük atma mı,
  yanlış ayar mı? ([Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) → yük atma)
- **Little sağlaması:** ölçülen hız × ortalama süre ≈ eşzamanlı istek. Üreteç bu eşzamanlılığı taşıyamıyorsa (bağlantı
  ya da işçi sınırı) ölçülen tavan üretecin tavanıdır.

Havuzdaki uygulamada bilinen bir darboğaz: parola özeti istek başına ~0,15 sn işlemci ister ve aynı anda en çok 2
özet hesaplanır ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ölçekleme ve sınırlar"). Giriş ucunun tavanı
bu yüzden yaklaşık 2 / 0,15 ≈ 13 giriş/sn'dir; yük modelinde giriş oranı bunu aşıyorsa dirsek orada çıkar. Aynı uç IP
ve e-posta başına hız sınırı uygular: tek IP'den koşan test 429 ölçer. Yalıtılmış deneme ortamında `RATE_LIMIT=off`
yazılabilir (üretimde sunucu bu ayarla açılmaz) ya da test çok hesap ve adresle koşar.

## Nerede ve nasıl koşulur

- Üreteç ayrı makinede; sistem üretim boyutunda sentetik veriyle, üretimle aynı ayarlarla.
- Dış bağımlılıklar (ödeme, e-posta, dil modeli) sahte sunucuyla değiştirilir: gerçek sağlayıcıya yük testi hız
  sınırına, faturaya ve kullanım koşullarına çarpar ([Dış API istemcisi](../30-arkauc/dis-api-istemcisi.md) → sahte sunucu).
- Üretimde test ancak planlı, düşük trafik saatinde, bir durdurma anahtarıyla ve kişisel veri üretmeyen test
  hesaplarıyla yapılır.
- Sonuç betik ve veri sürümüyle birlikte saklanır; değişiklikten önce ve sonra **aynı** test koşulur.

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Test "p99 5 ms" dedi, kullanıcılar takılma yaşıyor            | Kapalı model; donma anındaki istekler ölçülmedi               | Açık model; süre planlanan andan                              |
| Sunucu yavaşlayınca test yükü de düştü                        | Kapalı model kendini sunucuya uydurdu                         | Sabit geliş hızı                                              |
| Test temiz, gerçek trafikte %70 dolulukta yavaşlık             | Sabit aralıklı istekler kuyruğu gizledi                       | Düzensiz (Poisson) gelişler                                   |
| Hata arttıkça ortalama gecikme iyileşti                       | Hızlı 500'ler istatistiğe karıştı                             | Başarılı gecikme ve hata oranı ayrı                           |
| Test her zaman 429 ile bitiyor                                | Tek IP/hesaptan koşuldu; hız sınırı ölçüldü                   | Çok hesap/adres ya da yalıtık ortamda sınır kapalı            |
| Testte önbellek isabeti %99, üretimde %40                     | Hep aynı birkaç anahtar istendi                               | Gerçek dağılımdan anahtar seçimi                              |
| Testte hızlı, üretimde yavaş sorgu                            | Küçük test veritabanı; dizin eksikliği görünmedi              | Üretim boyutunda sentetik veri                                |
| "Tavan 300 istek/sn" çıktı ama üreteç makinesi %100 işlemcide  | Ölçülen üreteçti                                              | Ayrı makine; "geride kalma" sütunu                            |
| p99 her koşuda çok farklı                                     | Az örnek                                                      | Kademe başına binlerce istek                                  |
| SSE açıkken p99 30 saniye                                     | Uzun bağlantılar istek gibi sayıldı                           | Eşzamanlı bağlantı olarak ayrı modelle                        |
| Ödeme sağlayıcısı hesabı askıya aldı                          | Yük testi gerçek sağlayıcıya gitti                            | Sahte sunucu                                                  |

## Denetim listesi

- [ ] Yük modeli günlükten türetildi: uç karışımı, tepe saniye, uzun bağlantılar ayrı, veri dağılımı, hesap/IP çeşitliliği.
- [ ] Üreteç açık modelde; gelişler düzensiz; süre planlanan andan ölçülüyor; üreteç gerisi raporlanıyor.
- [ ] Rapor her kademede hedef hız, p50/p95/p99 (başarılı), hata oranı ve kaynak ölçütlerini birlikte veriyor.
- [ ] Isınma süresi ayrı; kademe başına yeterli örnek var.
- [ ] Üreteç ayrı makinede; veri üretim boyutunda; dış bağımlılıklar sahte.
- [ ] Dirsek ve kırılma biçimi (hızlı ret mi, çöküş mü) yazıldı; darboğaz kaynak adıyla belirlendi.
- [ ] Aynı test değişiklikten önce ve sonra koşuldu; sonuçlar sürümle saklandı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Açık modelli bir yük testi yaz: sabit geliş hızı (Poisson aralıklarla), istekler yanıtı
  beklemeden gönderilsin, süre isteğin planlanan anından ölçülsün. Kademeler: 25, 50, 75, 100, 150 istek/sn, her biri
  3 dakika, ilk 30 saniye ısınma. Her kademede p50/p95/p99'u yalnız başarılı isteklerden, hata oranını ayrı, üretecin
  plan gerisini de raporla. Uç karışımını şu günlük özetinden al: …"
- **Modelin tipik hatası:** `for` döngüsünde istek atıp yanıtı bekleyen (kapalı) betik yazar; süreyi isteğin
  gönderildiği andan ölçer; ortalama gecikme raporlar; hataları gecikmeye katar; tek uçla, tek hesapla, sabit aralıkla
  test eder; üreteci aynı makinede koşturur; gerçek ödeme/e-posta sağlayıcısını çağırır.
- **Çıktıda arayın:** zamanlayıcının her isteğin "planlanan an"ını tutup tutmadığı; `await`/yanıt beklemesinin
  gönderim döngüsünde olup olmadığı; yüzdelik hesabının ham ölçümden yapılıp yapılmadığı; hata ve gecikmenin ayrı
  raporlanması.
- **Test isteyin:** üreteci önce bilinen tavanlı sahte sunucuya (yukarıdaki gibi) koşturup tavanı doğru bulduğunu
  gösterin; ancak sonra gerçek sisteme.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) (Little yasası, yüzdelikler) · [Ölçekleme temelleri](olcekleme-temelleri.md)
  (%70 dirseği, önce ölç) · [Gözlemlenebilirlik](gozlemlenebilirlik.md) (SLO, dört altın sinyal)
- [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) (aşırı yükte yük atma) ·
  [Performans yöntemi](../00-yontem/performans-yontemi.md) (tek işlevin ölçümü)
- Havuzda: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ölçekleme ve sınırlar" (kapasite
  ölçülmedi; bilinen sınırlar)
