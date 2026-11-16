---
baslik: İzleme ve uyarı
ozet: Canlılık ve hazırlık sağlık uçları, dışarıdan erişilebilirlik izleme, günlük toplama ve çözümleme, temel ölçütler, gürültüsüz uyarı eşiği; yerel sunucuyla çalışan sağlık denetleyici örneği.
etiketler: [izleme, uyari, saglik-ucu, gunluk, olcut, devops]
duzey: orta
guncellik: 2026-11
---

# İzleme ve uyarı

> Bu notu ne zaman okumalı: uygulamayı yayına almadan önce; kesintiyi kullanıcıdan öğrendiğinizde; telefon gece
> boyunca anlamsız uyarılarla çaldığında; "yavaş" şikâyeti geldiğinde ama ortalama süre iyi göründüğünde.

## Temel fikir

Amaç, sorunu **kullanıcıdan önce** öğrenmektir. Üç katman vardır:

1. **Dışarıdan denetim:** site internetten, bir kullanıcının gördüğü gibi açılıyor mu? (DNS, sertifika, vekil,
   uygulama, veritabanı zincirinin tamamı.)
2. **Günlük:** ne oldu? Her isteğin ve hatanın tek satırlık kaydı.
3. **Ölçüt:** ne kadar, ne hızlı? Hata oranı, gecikme, bellek, disk.

**Uyarı** yalnız bir insanın **şimdi** bir şey yapması gerektiğinde çalar. Geri kalan her şey pano ya da haftalık
rapordur. Her uyarının yanında "ne yapılır" satırı vardır; hiçbir işe yaramayan uyarı silinir.

## Karar tablosu

| Ne izlenir                                   | Nasıl                                                     | Uyarı mı, pano mu                         |
| -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Site dışarıdan açılıyor mu                   | Başka bir yerden sağlık ucunu yoklama (birkaç dakikada bir) | **Uyarı:** üst üste başarısızlıkta       |
| Sertifika ve alan adı süresi                 | Süre denetimi ([HTTPS](https-ve-sertifikalar.md))         | Uyarı: 14 gün kala                        |
| Yedek alındı mı                              | Tazelik denetimi ya da ölü adam anahtarı ([Yedekleme](veritabani-yedekleme.md)) | Uyarı: 26 saatten eski |
| Hata oranı (5xx)                             | Erişim günlüğünden                                        | Uyarı: süreyle birlikte eşik aşılırsa     |
| Gecikme (p95)                                | Erişim günlüğünden                                        | Pano; uzun süre yüksekse uyarı            |
| Disk doluluğu                                | Platform paneli ya da `df`                                | Uyarı: %80 (iş günü), %90 (hemen)         |
| Bellek, yeniden başlatma sayısı              | Platform paneli                                           | Pano; sık yeniden başlatma uyarı          |
| İş ölçütleri (kayıt, eşitleme sayısı)        | Uygulama tablosu ya da günlük                             | Pano; birden sıfıra düşerse uyarı         |

## Sağlık ucu tasarımı

| Uç                     | Ne denetler                                    | Başarısızsa platform ne yapar          | Yanlış tasarımın sonucu                                  |
| ---------------------- | ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| **Canlılık** (liveness) | Süreç yanıt veriyor mu; bağımlılığa bakmaz     | Süreci yeniden başlatır                | Veritabanına bakarsa: veritabanı sallanınca bütün kopyalar art arda yeniden başlar |
| **Hazırlık** (readiness) | İstek karşılayabilir mi: veritabanı, migrasyon | Trafiği o kopyaya göndermez            | Hiç yoksa: açılmakta olan kopyaya istek gider, hata döner |

- Tek süreçli, SQLite gömülü bir uygulamada iki uç birleşebilir: havuzdaki `GET /api/health` veritabanına `SELECT 1`
  atar ve `{ ok, version, time }` döner ([`health/routes.ts`](../../uygulama/api/src/modules/health/routes.ts)).
  Uzak bir veritabanı varsa ikisini ayırın.
- Sağlık ucu oturum istemez, ucuzdur (ağır sorgu yok), sır ya da kişisel veri döndürmez, önbelleğe alınmaz
  (`Cache-Control: no-store`), hız sınırına takılmaz.
- **Sürümü döndürsün:** dağıtımdan sonra yeni sürümün yayında olduğu buradan doğrulanır ([CI/CD](ci-cd.md)).
- Açılışta uzun migrasyon varsa platformun bekleme süresi (Docker `--start-period`) ona yetmelidir; yoksa platform
  açılmakta olan uygulamayı öldürür ve döngü başlar.

## Dışarıdan erişilebilirlik izleme

- Denetim **sunucunun dışından** yapılır: sunucu düşünce kendi üzerindeki denetleyici de düşer. Uyarı kanalı da
  izlenen sistemden bağımsız olsun (uyarıyı çökmüş sunucunun e-posta servisiyle göndermeyin).
- Ana sayfayı değil, zincirin tamamını yoklayan ucu denetleyin: CDN'deki durağan sayfa API düşükken de açılır.
- Yalnız durum koduna değil **içeriğe** de bakın (`"ok":true`); bazı ara katmanlar hata sayfasını `200` ile verir.
- Birden çok bölgeden yoklamak "benim ağım mı, sunucu mu" sorusunu yanıtlar.
- Zamanlanmış işler (yedek, rapor) için **ölü adam anahtarı:** iş her başarıda bir adrese haber verir; beklenen
  sürede haber gelmezse uyarı çıkar. Yoklama değil, haber yokluğu izlenir.
- Uyuyan ucuz planlarda dışarıdan yoklama servisi uyandırır; bu bir kaynak kullanımıdır, platformun kurallarına
  bakın ([Maliyet](maliyet-ve-kaynak.md)).

## Uyarı eşiği ve gürültü

Tek başarısız yoklama çoğu zaman ağ kıpırtısıdır. Uyarı ancak **üst üste N** başarısızlıkta çalar, **bir kez**
çalar (her yoklamada yeniden değil) ve düzelince **bir kez** haber verir. Aşağıdaki denetleyici yerel bir sunucuya
gerçek HTTP istekleriyle bunu yapar:

```python calistir
import json
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERITABANI = {"ayakta": True}  # denemede elle bozacağız


class Saglik(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/saglik/canli":  # süreç yanıt veriyor mu? Bağımlılığa bakmaz
            kod, govde = 200, {"ok": True}
        elif self.path == "/saglik/hazir":  # istek karşılayabilir mi? Veritabanına bakar
            hazir = VERITABANI["ayakta"]
            kod, govde = (200 if hazir else 503), {"ok": hazir, "veritabani": hazir}
        else:
            kod, govde = 404, {"ok": False}
        veri = json.dumps(govde).encode()
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(veri)))
        self.end_headers()
        self.wfile.write(veri)

    def log_message(self, *args):
        pass


def yokla(adres: str, zaman_asimi: float = 2.0) -> bool:
    """200 + {"ok": true} değilse başarısız; zaman aşımı ve bağlantı hatası da başarısız."""
    try:
        with urllib.request.urlopen(adres, timeout=zaman_asimi) as yanit:
            return yanit.status == 200 and json.load(yanit).get("ok") is True
    except (OSError, ValueError):  # bağlantı hatası, 503 (HTTPError), zaman aşımı, bozuk JSON
        return False


class Uyarici:
    """Üst üste `esik` başarısızlıkta BİR kez uyarır, düzelince BİR kez haber verir."""

    def __init__(self, esik: int = 3) -> None:
        self.esik, self.ardisik, self.alarmda = esik, 0, False
        self.olaylar: list[str] = []

    def bildir(self, saglikli: bool) -> None:
        if saglikli:
            if self.alarmda:
                self.olaylar.append("DÜZELDİ")
            self.ardisik, self.alarmda = 0, False
            return
        self.ardisik += 1
        if self.ardisik >= self.esik and not self.alarmda:
            self.alarmda = True
            self.olaylar.append(f"ALARM: {self.ardisik} denetim üst üste başarısız")


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Saglik)
threading.Thread(target=sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
taban = f"http://127.0.0.1:{sunucu.server_address[1]}"

uyarici = Uyarici(esik=3)
senaryo = [True, False, True, True, False, False, False, False, False, True, True]  # veritabanı durumu
for ayakta in senaryo:
    VERITABANI["ayakta"] = ayakta
    assert yokla(taban + "/saglik/canli")  # canlılık hep geçer: platform süreci boşuna yeniden başlatmaz
    uyarici.bildir(yokla(taban + "/saglik/hazir"))
sunucu.shutdown()
sunucu.server_close()
assert not yokla(taban + "/saglik/hazir")  # sunucu kapalı: bağlantı hatası da başarısızlıktır
print(*uyarici.olaylar, sep="\n")
```

```cikti
ALARM: 3 denetim üst üste başarısız
DÜZELDİ
```

İkinci yoklamadaki tek başarısızlık uyarı üretmedi; beş üst üste başarısızlık **bir** uyarı üretti. Gerçek kullanımda
`taban` sizin adresiniz olur ve betik başka bir makinede birkaç dakikada bir çalışır; `olaylar`'a eklenen satır
telefonunuza giden bildirimdir.

Eşik kuralları:

- **Belirtiye** uyarı verin (kullanıcı hata görüyor), nedene değil (işlemci %90: kullanıcı etkilenmiyorsa pano).
- Oranlara **süre** ekleyin: "5 dakika boyunca hata oranı > %5", tek bir dakika değil.
- Az trafikte oran yanıltır: 3 istekten 1'i hatalıysa %33'tür. En az istek sayısı koşulu ekleyin.
- İki düzey: **hemen** (site kapalı, disk %90) ve **iş günü** (sertifika 14 gün, disk %80).
- Ayda bir uyarıları gözden geçirin: işe yaramayanı silin, kaçanı ekleyin. Uyarı yorgunluğu gerçek uyarının da
  görmezden gelinmesine yol açar.

## Günlük toplama

- Uygulama günlüğü **standart çıktıya**, satır başına bir JSON nesnesi olarak yazar; toplamayı platform (ya da
  `journald`, `docker logs`) yapar. Dosyaya yazmak diski doldurur ([Linux](linux-temelleri.md)).
- Her istek satırında: istek kimliği, yöntem, yol **kalıbı** (`/api/invites/:token`; gerçek adreste belirteç
  olabilir), durum, süre, kullanıcı kimliği. Parola, belirteç, çerez, e-posta, gövde **yazılmaz**. Havuzdaki
  örnek: [`requestLog.ts`](../../uygulama/api/src/http/requestLog.ts), [`logger.ts`](../../uygulama/api/src/lib/logger.ts).
- Kullanıcıya gösterilen hata iletisinde istek kimliği olsun; şikâyet geldiğinde o satır bulunur.
- Saklama süresini belirleyin: günlükte IP gibi kişisel veri vardır.

Günlükten ölçüt çıkarmak için ağır bir araca gerek yoktur. **Ortalama yanıltır**, yüzdelikler (p50, p95) gerçeği
gösterir:

```python calistir
import json
from collections import defaultdict
from statistics import mean, quantiles

# Havuzdaki API'nin erişim günlüğü biçimi: her satır tek bir JSON nesnesi (api/src/http/requestLog.ts)
satirlar = ["sunucu başlıyor…"]  # JSON olmayan satırlar da olur: atlanır, çökülmez
for i in range(200):
    ms = 2400 if i % 15 == 0 else 40  # 15 istekten biri çok yavaş
    satirlar.append(json.dumps({"level": "info", "msg": "istek", "route": "/api/sync/pull", "status": 200, "ms": ms}))
for i in range(50):
    durum = 503 if i % 10 == 0 else 200
    seviye = "warn" if durum >= 500 else "info"
    satirlar.append(json.dumps({"level": seviye, "msg": "istek", "route": "/api/sync/push", "status": durum, "ms": 60}))

yollar: dict[str, list[dict]] = defaultdict(list)
for satir in satirlar:
    try:
        kayit = json.loads(satir)
    except json.JSONDecodeError:
        continue
    if kayit.get("msg") == "istek":
        yollar[kayit["route"]].append(kayit)

for yol, kayitlar in sorted(yollar.items()):
    sureler = [k["ms"] for k in kayitlar]
    hata_orani = sum(k["status"] >= 500 for k in kayitlar) / len(kayitlar)
    p50, p95 = quantiles(sureler, n=100)[49], quantiles(sureler, n=100)[94]
    uyari = "  ← UYARI: hata oranı %5'in üstünde" if hata_orani > 0.05 else ""
    print(f"{yol}: {len(kayitlar)} istek, hata %{hata_orani * 100:.0f}, "
          f"ortalama {mean(sureler):.0f} ms, p50 {p50:.0f} ms, p95 {p95:.0f} ms{uyari}")
```

```cikti
/api/sync/pull: 200 istek, hata %0, ortalama 205 ms, p50 40 ms, p95 2400 ms
/api/sync/push: 50 istek, hata %10, ortalama 60 ms, p50 60 ms, p95 60 ms  ← UYARI: hata oranı %5'in üstünde
```

Ortalama 205 ms "iyi" görünür; oysa her 15 kullanıcıdan biri 2,4 saniye bekliyor. Sunucuda aynı çözümleme:
`journalctl -u uygulama -o cat --since "1 hour ago" > son-saat.jsonl` ya da `docker logs --since 1h uygulama`, sonra
betiğe verin.

## Temel ölçütler

| Ölçüt ailesi | Neye uygulanır          | Ölçütler                                                          |
| ------------ | ----------------------- | ----------------------------------------------------------------- |
| RED          | Her uç / servis         | İstek **oranı**, **hata** oranı, **süre** (p50, p95, p99)         |
| USE          | Her kaynak (CPU, bellek, disk, bağlantı havuzu) | **Kullanım**, **doygunluk** (kuyruk, bekleme), **hata** |
| İş           | Ürün                    | Kayıt, giriş, eşitleme, ödeme sayısı; birden sıfıra düşüş         |

Küçük bir uygulama için başlangıç: dışarıdan erişilebilirlik, 5xx oranı, p95 süre, disk doluluğu, bellek ve
yeniden başlatma sayısı, yedek tazeliği, sertifika süresi. Çıkış kodu 137 ile yeniden başlatmalar bellek aşımıdır.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Kesintiyi kullanıcı haber verdi                                  | Dışarıdan denetim yok ya da denetleyici aynı sunucuda         | Başka yerden yoklama; bağımsız uyarı kanalı                         |
| Veritabanı kısa süre sallandı, bütün kopyalar art arda yeniden başladı | Canlılık ucu veritabanına bakıyor                       | Canlılık bağımlılıksız; veritabanı yalnız hazırlıkta                |
| Uygulama açılırken öldürülüyor, döngüye girdi                    | Sağlık denetimi migrasyon bitmeden başarısız sayılıyor        | Açılış bekleme süresini uzatın                                      |
| Panoda her şey yeşil, kullanıcılar hata görüyor                  | Durağan ana sayfa yoklanıyor; ya da hata `200` ile dönüyor    | Zincirin tamamını yoklayın, içeriğe bakın; doğru durum kodları      |
| Telefon gece boyunca çaldı, sabah her şey normaldi               | Tek başarısızlıkta uyarı; düzelme haberi yok                  | Üst üste N + süre koşulu; bir kez uyar, bir kez "düzeldi"           |
| "Yavaş" şikâyeti var, ortalama süre iyi                          | Ortalama kuyruğu gizliyor                                     | p95/p99                                                             |
| Yedek aylardır alınmıyormuş                                      | Zamanlanmış iş izlenmiyor                                     | Ölü adam anahtarı, tazelik uyarısı                                  |
| Sertifika süresi doldu                                           | Otomatik yenileme sessizce başarısız                          | Dışarıdan süre denetimi                                             |
| Günlükte e-posta ve belirteç görünüyor                           | Ham adres ve gövde yazılıyor                                  | Yol kalıbı; yasaklı alanlar listesi ve testi                        |
| Günlük diski doldurdu                                            | Dosyaya yazma, döndürme yok; sağlık yoklamaları her dakika satır üretiyor | Standart çıktı; boyut sınırı; yoklamaları süzün       |
| Uyarılar artık okunmuyor                                         | Gürültü: işe yaramayan uyarılar                               | Aylık gözden geçirme; her uyarıya "ne yapılır" satırı               |

## Denetim listesi

- [ ] Sağlık ucu oturumsuz, ucuz, `no-store`, sürümü döndürüyor; uzak bağımlılık varsa canlılık ve hazırlık ayrı.
- [ ] Başka bir yerden, birkaç dakikada bir, içeriğe de bakan yoklama var; uyarı telefona geliyor.
- [ ] Uyarı üst üste başarısızlıkta bir kez çalıyor, düzelince bir kez haber veriyor.
- [ ] Sertifika ve alan adı süresi, yedek tazeliği, disk doluluğu izleniyor.
- [ ] Günlük standart çıktıda, JSON; istek kimliği var; sır ve kişisel veri yok; saklama süresi belli.
- [ ] 5xx oranı ve p95 süre en az haftalık okunuyor.
- [ ] Her uyarının yanında "ne yapılır" satırı var.
- [ ] Bir kesinti denemesi yapıldı (uygulama durduruldu) ve uyarı beklenen sürede geldi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Sağlık ucunu oturumsuz, `Cache-Control: no-store`, sürüm döndüren bir uç olarak yaz. Uzak
  veritabanı varsa canlılık ve hazırlığı ayır; canlılık bağımlılığa bakmasın. Uyarı mantığı üst üste 3 başarısızlıkta
  bir kez uyarsın, düzelince bir kez haber versin; bunun testini yaz."
- **Modelin tipik hatası:** canlılık ucunda veritabanını, dış API'yi, e-posta servisini denetlemek; her başarısız
  yoklamada uyarı göndermek; ortalama süreye eşik koymak; günlüğe istek gövdesini yazmak; denetleyiciyi izlediği
  sunucuya kurmak.
- **Çıktıda denetleyin:** sağlık ucunun yanıtında sır ya da kişisel veri var mı; günlük çağrılarında `body`,
  `password`, `token`, `email` geçiyor mu; uyarı mantığının "düzeldi" durumu ve testi var mı.

## İlgili

- [Olay sonrası değerlendirme](olay-sonrasi-degerlendirme.md) — uyarıdan sonra ne yapılır
- [Veritabanı yedekleme](veritabani-yedekleme.md) · [HTTPS ve sertifikalar](https-ve-sertifikalar.md) (süre izleme)
- [Dağıtım stratejileri](dagitim-stratejileri.md) — dağıtım sonrası sağlık doğrulaması
- [Gözlemlenebilirlik](../40-sistem-tasarimi/gozlemlenebilirlik.md) — SLO, hata bütçesi, yanma hızıyla uyarı
- [Hata yönetimi ve günlükleme](../30-arkauc/hata-yonetimi-ve-gunlukleme.md) · [Günlük ve izleme güvenliği](../50-guvenlik/gunluk-ve-izleme-guvenlik.md)
- [Ürün ölçütleri](../70-veri/urun-olcutleri.md) — iş ölçütleri
- Çalışan karşılıklar: [`health/routes.ts`](../../uygulama/api/src/modules/health/routes.ts),
  [`requestLog.ts`](../../uygulama/api/src/http/requestLog.ts), [`uygulama/Dockerfile`](../../uygulama/Dockerfile) (`HEALTHCHECK`)
