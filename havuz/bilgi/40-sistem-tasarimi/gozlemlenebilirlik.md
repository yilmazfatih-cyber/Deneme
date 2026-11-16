---
baslik: Gözlemlenebilirlik: günlük, ölçüt, iz, SLO ve uyarı tasarımı
ozet: Günlük, ölçüt ve izden hangisinin ne zaman kullanılacağı; dört altın sinyal, SLI/SLO ve hata bütçesi, yanma hızıyla uyarı, belirti ve neden ayrımı, panoda ne olması gerektiği; çalışan hesaplarla.
etiketler: [gozlemlenebilirlik, izleme, slo, uyari, gunluk, olcut]
duzey: orta
guncellik: 2026-11
---

# Gözlemlenebilirlik: günlük, ölçüt, iz, SLO ve uyarı tasarımı

> Bu notu ne zaman okumalı: ilk yayından önce "neyi izlemeliyiz" sorulduğunda; uyarılar çok sık çalıp
> görmezden gelinmeye başlandığında ya da kesintiyi kullanıcı bildirdiğinde; bir pano kurulurken; bir model
> "her şeyi günlüğe yazalım" ya da "CPU %80'i geçince uyar" önerdiğinde.

## Temel fikir

- Gözlemlenebilirlik, sisteme yeni kod eklemeden "şu an ne oluyor ve neden" sorusunu cevaplayabilmektir.
- Üç sinyal türü farklı sorulara cevap verir: **ölçüt** (metric: ucuz sayılar, toplanabilir; uyarı ve pano),
  **günlük** (log: olay başına ayrıntı; hata ayıklama ve denetim), **iz** (trace: bir isteğin parçalar arasındaki
  yolculuğu; gecikmenin nerede harcandığı).
- Ne ölçüleceğinin kısa listesi: **dört altın sinyal** (gecikme, trafik, hata, doygunluk), kullanıcıya dönük her uç
  için.
- Hedef kullanıcının gözünden yazılır: **SLI** (ölçülen gösterge), **SLO** (hedef), **hata bütçesi** (izin verilen
  hata). %100 hedef yanlıştır: hiç değişiklik yapamazsınız.
- İnsanı uyandıran uyarı **belirtiye** (kullanıcı etkileniyor) bakar, nedene (CPU yüksek) değil; ve her uyarının
  yapılacak bir işi vardır.

## Karar tablosu: hangi sinyal

| Soru                                                        | Sinyal                         | Not                                                       |
| ----------------------------------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Sistem şu an sağlıklı mı, trend ne?                         | Ölçüt                          | Sayaç ve histogram; ucuz, uzun süre saklanır              |
| Bu kullanıcının bu isteği neden 500 aldı?                   | Günlük (istek kimliğiyle)      | Tek satır JSON; kişisel veri yok                          |
| Bu istek 3 saniyenin neresinde bekledi?                     | İz                             | Birden çok servis/dış çağrı varsa; yoksa günlükte süre alanları |
| Kim, ne zaman, neyi değiştirdi?                              | Denetim günlüğü                | Ayrı tablo, uzun saklama ([Veri yaşam döngüsü](veri-yasam-dongusu.md)) |
| Kullanıcılar gerçekte ne yaşıyor?                           | İstemci tarafı ölçüm + dış yoklama | Sunucu içi ölçüm kuyrukta bekleme ve ağı görmez       |
| Tek sunucu, ölçüt sistemi yok                               | Erişim günlüğünden ölçüt türet | Aşağıdaki örnek; büyüyünce gerçek ölçüt sistemi           |

## Dört altın sinyal

| Sinyal     | Web API için                                         | Kuyruk işçisi için                    | Dikkat                                         |
| ---------- | ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Gecikme    | Uç başına p50/p95/p99; başarılı ve başarısız ayrı    | İşin kuyrukta bekleme + işlenme süresi | Hızlı hatalar ortalamayı "iyileştirir"         |
| Trafik     | Uç başına istek/sn                                   | Saniyede eklenen/biten iş             | Ani düşüş de bir arızadır                      |
| Hata       | 5xx oranı; 4xx ayrı izlenir                          | Başarısız iş, ölü mektup sayısı       | 200 dönen ama yanlış cevap da hatadır          |
| Doygunluk  | İçerideki istek, bağlantı havuzu beklemesi, CPU, bellek, disk | Kuyruk derinliği, en eski işin yaşı | %100'den önce gecikme bozulur (%70–80 eşiği)  |

Kaynaklar için kısaltma USE (kullanım, doygunluk, hata), servisler için RED (hız, hata, süre) aynı fikirdir.

Ayrı bir ölçüt sistemi kurmadan önce bile, yapılandırılmış erişim günlüğü dört sinyali verir. Havuzdaki API her
istek için tek satırlık JSON yazar ([`requestLog.ts`](../../uygulama/api/src/http/requestLog.ts)):

```python calistir
import json
import math
from collections import defaultdict

# Havuzdaki API'nin erişim günlüğü biçimi: her istek tek satır JSON. 60 sn'lik örnek üretiyoruz:
# her 100 ms bir istek; 30.–33. saniyelerde eşitleme ucu 503 veriyor ve 900 ms sürüyor.
satirlar = []
for i in range(600):
    rota = "/api/sync" if i % 3 else "/api/auth/login"
    durum = 503 if rota == "/api/sync" and 300 <= i < 330 else 200
    ms = 900 if durum == 503 else 35 + (i * 37) % 60
    satirlar.append(json.dumps({"msg": "istek", "route": rota, "status": durum, "ms": ms}))

gruplar = defaultdict(list)
for satir in satirlar:
    kayit = json.loads(satir)
    gruplar[kayit["route"]].append(kayit)

for rota, kayitlar in sorted(gruplar.items()):
    trafik = len(kayitlar) / 60  # istek/sn
    hata = sum(k["status"] >= 500 for k in kayitlar) / len(kayitlar)
    sureler = sorted(k["ms"] for k in kayitlar)
    p95, p99 = (sureler[math.ceil(p * len(sureler)) - 1] for p in (0.95, 0.99))
    icerde = trafik * sum(sureler) / len(sureler) / 1000  # Little: aynı anda içerideki istek (doygunluk)
    print(f"{rota:16} {trafik:3.1f} istek/sn | hata %{hata * 100:3.1f} | p95 {p95:3} ms, p99 {p99:3} ms | içeride ~{icerde:.2f}")
assert abs(sum(k["status"] >= 500 for k in gruplar["/api/sync"]) / len(gruplar["/api/sync"]) - 0.05) < 0.01
```

```cikti
/api/auth/login  3.3 istek/sn | hata %0.0 | p95  89 ms, p99  92 ms | içeride ~0.21
/api/sync        6.7 istek/sn | hata %5.0 | p95  94 ms, p99 900 ms | içeride ~0.71
```

Dikkat: eşitleme ucunda isteklerin %5'i başarısız ve yavaş, ama p95 hâlâ "94 ms" diyor. Gecikme tek başına
okunmaz; hata oranıyla birlikte okunur ve başarısız isteklerin gecikmesi ayrı izlenir.

## Yüzdelikler ortalanmaz

Panolarda en sık hata: her sunucunun p99'unu hesaplayıp ortalamasını almak. Ortalama, hasta sunucuyu gizler.
Doğru yol, her sunucunun **histogram** (sabit kovalarda sayı) tutması ve histogramların **toplanması**dır:

```python calistir
import bisect
import math
import random

rng = random.Random(4)
# 10 sunucu, eşit trafik; 9'u sağlıklı (ortalama 30 ms), biri hasta (ortalama 600 ms)
sunucular = [[rng.expovariate(1 / 30) for _ in range(2_000)] for _ in range(9)]
sunucular.append([rng.expovariate(1 / 600) for _ in range(2_000)])


def p99(degerler: list[float]) -> float:
    s = sorted(degerler)
    return s[math.ceil(0.99 * len(s)) - 1]


ortalama_p99 = sum(p99(s) for s in sunucular) / len(sunucular)  # YANLIŞ: panoda sık görülen
gercek = p99([d for s in sunucular for d in s])  # DOĞRU: bütün isteklerin p99'u

# Uygulanabilir yol: her sunucu sabit kovalı histogram tutar; histogramlar TOPLANIR, sonra yüzdelik okunur
KOVALAR = [10, 25, 50, 100, 250, 500, 1_000, 1_500, 2_000, 5_000, math.inf]  # ms üst sınırları


def histogram(degerler: list[float]) -> list[int]:
    sayi = [0] * len(KOVALAR)
    for d in degerler:
        sayi[bisect.bisect_left(KOVALAR, d)] += 1
    return sayi


birlesik = [sum(k) for k in zip(*(histogram(s) for s in sunucular))]
hedef, birikim = 0.99 * sum(birlesik), 0
tahmin = next(KOVALAR[i] for i, n in enumerate(birlesik) if (birikim := birikim + n) >= hedef)
print(f"p99'ların ortalaması {ortalama_p99:5.0f} ms | gerçek p99 {gercek:5.0f} ms | histogramdan ≤ {tahmin} ms")
assert gercek > 2 * ortalama_p99  # ortalama, hasta sunucuyu gizliyor
assert tahmin >= gercek  # kova üst sınırı gerçeği kapsar
```

```cikti
p99'ların ortalaması   396 ms | gerçek p99  1367 ms | histogramdan ≤ 1500 ms
```

Kova sınırlarını hedeflerinizin üstüne koyun (hedef "p95 < 300 ms" ise 300 bir kova sınırı olsun); çözünürlük
kova aralığı kadardır.

## SLI, SLO ve hata bütçesi

- **SLI** (hizmet düzeyi göstergesi): kullanıcı deneyimini ölçen oran. Örnek: "geçerli isteklerden 5xx almayan ve
  1 sn'den kısa sürenlerin oranı".
- **SLO** (hedef): "30 günlük kayan pencerede SLI ≥ %99,9". Küçük bir ürün için %99,5–%99,9 makuldür; her ek 9
  maliyeti katlar.
- **Hata bütçesi** = 1 − SLO. Bütçe varken yeni özellik yayımlanır; bütçe bitince güvenilirlik işine dönülür. Bu
  kural önceden yazılır ki tartışma kesintinin ortasında yapılmasın.
- **Yanma hızı:** hata oranı / bütçe. 1 ise bütçe tam pencere sonunda biter.

```python calistir
SLO = 0.999  # 30 günlük pencerede isteklerin %99,9'u başarılı
PENCERE_SAAT = 30 * 24
BUTCE = 1 - SLO  # hata bütçesi: isteklerin %0,1'i


def yanma_hizi(hata_orani: float) -> float:
    """1 → bütçe tam pencere sonunda biter; 10 → pencerenin onda birinde biter."""
    return hata_orani / BUTCE


print(f"izin verilen tam kesinti: ayda {PENCERE_SAAT * 60 * BUTCE:.1f} dk")
for hiz in (1, 2, 6, 14.4):
    print(f"yanma hızı {hiz:>4}: bütçe {PENCERE_SAAT / hiz / 24:5.1f} günde biter")

# "Bütçenin %2'si 1 saatte yanıyorsa insanı uyandır" kuralının eşiği:
SAYFALA = 0.02 * PENCERE_SAAT / 1
assert round(SAYFALA, 1) == 14.4


def karar(hata_1sa: float, hata_5dk: float) -> str:
    # İki pencere birlikte: uzun pencere "ciddi mi", kısa pencere "hâlâ sürüyor mu"
    if yanma_hizi(hata_1sa) >= SAYFALA and yanma_hizi(hata_5dk) >= SAYFALA:
        return "sayfala"
    return "bilet" if yanma_hizi(hata_1sa) >= 1 else "sessiz"


assert karar(0.02, 0.03) == "sayfala"  # %2 hata, sürüyor
assert karar(0.02, 0.0002) == "bilet"  # sorun 5 dk önce bitti: gece kimseyi uyandırma
assert karar(0.003, 0.05) == "bilet"  # kısa sıçrama: uzun pencere eşiğin altında
assert karar(0.0005, 0.0005) == "sessiz"  # bütçe içinde
```

```cikti
izin verilen tam kesinti: ayda 43.2 dk
yanma hızı    1: bütçe  30.0 günde biter
yanma hızı    2: bütçe  15.0 günde biter
yanma hızı    6: bütçe   5.0 günde biter
yanma hızı 14.4: bütçe   2.1 günde biter
```

"Hata oranı %1'i geçince uyar" gibi sabit eşik ya çok geç (düşük trafikte) ya çok sık (anlık sıçramada) çalar.
Yanma hızı, uyarıyı doğrudan "kullanıcıya verdiğimiz söz tehlikede mi" sorusuna bağlar.

## Uyarı tasarımı

| Uyarı                                                   | Tür                 | Neden                                                     |
| ------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| Hata bütçesi hızlı yanıyor (iki pencere)                | Sayfala (hemen)     | Kullanıcı etkileniyor, eylem gerekiyor                    |
| Dış yoklama: ana sayfa/sağlık ucu 2 dk yanıt vermiyor   | Sayfala             | Her şey çökmüş olabilir; iç ölçütler de susmuştur          |
| Bütçe yavaş yanıyor, disk %80, sertifika 14 gün içinde bitiyor | Bilet (mesai içi) | Acil değil ama unutulmamalı                            |
| Kuyrukta en eski iş 10 dk'dan eski                      | Bilet ya da sayfala | Tüketici durmuş olabilir; ürüne göre                      |
| CPU %80, bellek %75                                     | Yalnız pano         | Neden; kullanıcı etkilenmiyorsa kimseyi uyandırmaz        |
| Yedek işi 24 saattir başarılı olmadı                    | Bilet               | Sessiz arıza: kimse fark etmez, ta ki gerekene dek         |

- Her uyarının bir **yapılacaklar notu** (runbook) bağlantısı olur: ne anlama gelir, ilk 3 adım, kime haber verilir.
- Hiç eylem doğurmayan uyarı silinir. Haftada bir "hangi uyarı neden çaldı" gözden geçirilir.
- Sessiz arızalar için **ölü adam anahtarı** (dead man's switch): düzenli iş her başarılı çalışmada bir zaman
  damgası yazar; damga eskiyince uyarı çalar.
- Dışarıdan yoklama şarttır: sunucu tamamen düştüğünde kendi uyarısını gönderemez.

## Panoda ne olmalı

1. **Üst satır, kullanıcı gözü:** SLO durumu ve kalan bütçe; uç başına trafik, hata oranı, p50/p95/p99.
2. **İkinci satır, doygunluk:** içerideki istek, bağlantı havuzu beklemesi, kuyruk derinliği ve en eski iş,
   CPU, bellek, disk doluluğu.
3. **Bağımlılıklar:** veritabanı sorgu süresi, dış servis başına hata/gecikme, devre kesici durumları.
4. **Olay işaretleri:** dağıtım, yapılandırma değişikliği, yük devri (grafik üstünde dikey çizgi). Kesintilerin
   çoğu bir değişiklikten hemen sonra başlar.
5. Her grafiğin birimi ve zaman aralığı yazılı; ortalama yerine yüzdelik. Panonun okuru, karşılaştırma bağlamı ve
   aşırı yükleme tuzakları: [Pano tasarımı](../70-veri/pano-tasarimi.md).

## Günlük ve iz

- Günlük tek satır JSON, istek kimliği taşır; istek kimliği yanıt başlığında döner ve servisler arası çağrılarda
  iletilir. Hata sınıfları, düzeyler ve **asla yazılmayacaklar** (parola, belirteç, e-posta, gövde):
  [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md); havuzdaki yasak listesi ve onu
  koruyan test: [`logger.ts`](../../uygulama/api/src/lib/logger.ts).
- Adresin kendisi değil kalıbı yazılır (`/api/invites/:token`): adreste belirteç olabilir.
- İz (tracing), ikiden çok servis ya da çok sayıda dış çağrı olunca değer kazanır. Standart başlık W3C
  `traceparent`'tır; iz kimliği günlük satırına da yazılır ki ikisi bağlansın. Yüksek trafikte izler örneklenir;
  hatalı ve yavaş isteklerin izi her zaman tutulur.
- Ölçüt etiketlerine kullanıcı kimliği, e-posta, tam adres gibi **sınırsız değerli** alan konmaz: her değer yeni
  bir zaman serisi açar ve ölçüt sistemi şişer. Bu ayrıntı günlüğe gider.

## Tuzaklar

| Belirti                                                     | Neden                                                     | Çözüm                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Kesintiyi kullanıcılar bildiriyor                           | Uyarı yok ya da yalnız nedenlere bakıyor                  | SLO yanma hızı + dış yoklama                                  |
| Uyarılar sürekli çalıyor, kimse bakmıyor                    | Neden tabanlı, eylemsiz uyarılar                          | Belirtiye bağla; eylemsiz uyarıyı sil                         |
| Pano "her şey yeşil", kullanıcılar yavaşlıktan yakınıyor    | Ortalama gecikme ya da sunucu içi ölçüm                    | Yüzdelik; istemci tarafı ölçüm                                |
| p95 iyi görünüyor ama istekler başarısız                    | Hızlı ya da az sayıda hata gecikmeyi gizliyor             | Hata oranı ayrı; başarısız isteklerin gecikmesi ayrı          |
| İki sunucunun p99 ortalaması sağlıklı, biri aslında hasta   | Yüzdelikler ortalandı                                      | Histogramları topla                                           |
| Ölçüt sistemi şişti, fatura patladı                         | Etikette kullanıcı kimliği / tam adres                     | Sınırlı değerli etiket; ayrıntı günlükte                      |
| Hatayı bulmak için günlüklerde e-posta aranıyor             | Kişisel veri günlüğe yazılmış                             | Kullanıcı kimliği; e-posta asla                               |
| Gece yedek işi aylardır çalışmıyormuş                        | Başarısızlık sessiz                                       | Ölü adam anahtarı                                             |
| Kesinti dağıtımla ilgiliydi ama bağlantı kurulamadı         | Dağıtım işaretleri panoda yok                              | Olay işaretleri                                               |

## Denetim listesi

- [ ] Kullanıcıya dönük her uç için trafik, hata oranı ve p50/p95/p99 ölçülüyor.
- [ ] Doygunluk ölçütleri var: içerideki istek, havuz beklemesi, kuyruk derinliği/yaşı, CPU, bellek, disk.
- [ ] En az bir SLO yazılı; hata bütçesi politikası (bütçe bitince ne olur) yazılı.
- [ ] Sayfalayan uyarılar belirti tabanlı (yanma hızı, dış yoklama); her birinin yapılacaklar notu var.
- [ ] Düzenli işlerde ölü adam anahtarı var.
- [ ] Günlük tek satır JSON, istek kimliği taşıyor; kişisel veri ve sır yok (testle korunuyor).
- [ ] Panoda dağıtım işaretleri ve yüzdelikler var; yüzdelikler histogramdan hesaplanıyor.
- [ ] Ölçüt etiketlerinde sınırsız değerli alan yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her uç için istek sayısı, 5xx sayısı ve süre histogramı tut (kovalar: 25, 50, 100, 250, 500,
  1000, 2500 ms). Günlük satırı JSON, `requestId` taşısın; e-posta, parola, belirteç, gövde yazma. Uyarı eşiğini
  CPU'ya değil SLO yanma hızına bağla."
- **Modelin tipik hatası:** ortalama gecikme ölçer; yüzdelikleri ortalar; her şeyi `info` düzeyinde günlüğe
  yazar (gövde ve e-posta dahil); ölçüt etiketine kullanıcı kimliği koyar; CPU/bellek eşiklerine sayfalayan
  uyarı kurar; dış yoklama eklemeyi unutur.
- **Çıktıda arayın:** `avg`, `mean` ile gecikme; günlük çağrılarında `body`, `email`, `password`, `token`;
  ölçüt etiketinde `user_id`; uyarı kurallarında yalnız kaynak eşikleri.
- **Doğrulama:** sahte bir hata oranıyla (ör. %2) yanma hızı uyarısının çaldığını, 5 dk sonra durduğunu
  gösteren bir test isteyin.

## İlgili

- [Kapasite tahmini](kapasite-tahmini.md) (yüzdelikler, Little yasası) · [Dayanıklılık kalıpları](dayaniklilik-kaliplari.md) ·
  [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) (kuyruk derinliği)
- [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md) ·
  [İzleme ve uyarı](../60-devops/izleme-ve-uyari.md) (sağlık uçları, dışarıdan izleme, günlük toplama) ·
  [Güvenlik günlüğü](../50-guvenlik/gunluk-ve-izleme-guvenlik.md) · [Olay sonrası değerlendirme](../60-devops/olay-sonrasi-degerlendirme.md)
- Havuzda: istek günlüğü [`uygulama/api/src/http/requestLog.ts`](../../uygulama/api/src/http/requestLog.ts),
  sağlık ucu [`uygulama/api/src/modules/health/routes.ts`](../../uygulama/api/src/modules/health/routes.ts),
  yüzdelik ve histogram [`kutuphane/py/kutuphane/istatistik.py`](../../kutuphane/py/kutuphane/istatistik.py)
