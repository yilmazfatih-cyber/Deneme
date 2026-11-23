---
baslik: "Dış API istemcisi: toplam süre, güvenli yeniden deneme, sayfalama ve sözleşme testi"
ozet: Başka bir servisi çağıran istemciyi yazmak; toplam süre sınırı, anahtarı koruyan yeniden deneme, Retry-After ve sayfalama döngüsü, artımlı eşitlemede örtüşme, hoşgörülü şema doğrulama, sahte sunucu ve sözleşme testi.
etiketler: [api, istemci, zaman-asimi, yeniden-deneme, idempotentlik, sozlesme-testi]
duzey: ileri
guncellik: 2026-11
---

# Dış API istemcisi: toplam süre, güvenli yeniden deneme, sayfalama ve sözleşme testi

> Bu notu ne zaman okumalı: ödeme, kargo, e-posta, dil modeli, belge doğrulama gibi bir dış API'yi çağıran kod
> yazılırken ya da incelenirken; "istek bazen dakikalarca asılı kalıyor", "müşteriden iki kez çekildi", "liste eksik
> geldi", "sağlayıcı bir alan ekledi, her şey çöktü" şikâyetlerinde.

## Temel fikir

- Dış API başkasının kodu ve başkasının ağıdır. Üç şey **mutlaka** olur: yavaşlar ya da asılı kalır; yanıt yolda
  kaybolur (iş yapıldı ama siz bilmiyorsunuz); biçim habersiz değişir.
- İstemcinin işi bu üçünü sınırda karşılamaktır: her çağrıda **toplam** süre sınırı, her yan etkili çağrıda mantıksal
  işlem başına **tek** idempotentlik anahtarı, her yanıtta kullanılan alanların şema denetimi.
- Bütün çağrılar tek bir **bağdaştırıcıdan** (adapter) geçer: zaman aşımı, kimlik başlığı, günlük, hata çevirisi tek
  yerde durur; uygulamanın geri kalanı sağlayıcının biçimini görmez, sağlayıcı değişince tek dosya değişir.
- Genel kalıplar (yeniden deneme bütçesi, titreme, devre kesici, zaman aşımı bütçesi) başka nottadır:
  [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md). Bu not istemciye özgü tuzakları anlatır.

## Karar tablosu: hata türüne göre ne yapılır

| Durum                                              | Yeniden dene?                         | Neden                                                |
| -------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Bağlanılamadı (DNS, bağlantı reddi, bağlanma süresi) | Evet, her çağrı türünde              | İstek sunucuya hiç ulaşmadı                          |
| Yanıt beklenirken süre doldu ya da bağlantı koptu  | GET: evet · yan etkili: **yalnız aynı anahtarla** | Sonuç bilinmiyor: iş yapılmış olabilir     |
| 429                                                | Evet, `Retry-After` kadar bekleyip (üst sınırla) | Hız sınırı; titreme ekleyin                  |
| 500, 502, 503, 504, 408                            | GET: evet · yan etkili: yalnız anahtarla | Geçici olabilir; sunucu işi yarım bırakmış olabilir |
| 409 "aynı anahtarlı istek sürüyor"                 | Evet, kısa bekleyip                   | İlk deneme hâlâ işleniyor                            |
| 401                                                | Bir kez: belirteci yenileyip          | Süresi dolmuş erişim belirteci                       |
| 400, 403, 404, 422                                 | **Hayır**                             | Kalıcıdır; isteği düzeltmek gerekir                  |
| Yanıt şemaya uymuyor                               | **Hayır**; uyarı üret                 | Aynı yanıt yine gelir; sağlayıcı değişmiştir         |

## Bağdaştırıcının iskeleti

Her çağrı aynı yedi adımdan geçer; küçük modele bu sırayı yazdırın:

1. **Son tarihi** hesapla (toplam süre; aşağıda neden kütüphanenin `timeout`'u yetmez).
2. İsteği kur: kimlik başlığı, `User-Agent` (sağlayıcının destek ekibi sizi bulsun), yan etkili çağrıda idempotentlik
   anahtarı (sağlayıcı destekliyorsa).
3. Gönder; bağlantı kurma ve okuma hatalarını ayrı sınıflandır.
4. Durum kodunu yukarıdaki tabloya göre sınıflandır; yeniden denemeyi **tek katmanda** yap.
5. Gövdeyi **boyut sınırıyla** oku (`read(EN_COK + 1)`); şemayla doğrula.
6. Sağlayıcı hatasını kendi hata türüne çevir (`KargoGecici`, `KargoReddetti`); üst katman sağlayıcının kodlarını görmez.
7. Günlüğe yaz: sağlayıcı, uç **kalıbı** (`/gonderiler/{id}`, tam adres değil), durum, süre, deneme numarası,
   sağlayıcının istek kimliği. `Authorization`, gövde ve kişisel veri günlüğe girmez.

Havuzda: e-posta bağdaştırıcısı toplam süreyi `AbortSignal.timeout` ile koyar ve sahte `fetch` ile test edilir
([`mailer.ts`](../../uygulama/api/src/mail/mailer.ts), [`mailer.test.ts`](../../uygulama/api/test/mailer.test.ts));
dil modeli bağdaştırıcısı yeniden denenecek durumları tek kümede tutar ([`openai_uyumlu.py`](../../yz/yz/saglayici/openai_uyumlu.py)),
ağsız testler betikli sahte sağlayıcıyla koşar ([`sahte.py`](../../yz/yz/saglayici/sahte.py)).

## Zaman aşımı: kütüphanenin `timeout`'u toplam süre değildir

Python'un `urllib`/`http.client`'ı, `requests` ve `httpx`, `timeout` değerini **tek bir ağ işlemine** (bağlanma, bir
parça okuma) uygular (`requests` ve `httpx` belgelerinde böyle yazar; doğrulayın). Yanıtını damla damla gönderen
bir sunucu, her parça sınırın altında geldikçe isteği sonsuza dek tutar:

```python calistir
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Damla(BaseHTTPRequestHandler):  # 10 baytı 0,25 sn arayla gönderir: toplam 2,5 sn
    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Length", "10")
        self.end_headers()
        try:
            for _ in range(10):
                self.wfile.write(b"x")
                self.wfile.flush()
                time.sleep(0.25)
        except OSError:
            pass  # istemci vazgeçti

    def log_message(self, *_: object) -> None:
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Damla)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()
adres = f"http://127.0.0.1:{sunucu.server_address[1]}/"


def toplam_sureli(url: str, toplam_sn: float, islem_sn: float = 0.5) -> bytes:
    """`timeout` tek işlemi sınırlar; toplam süreyi parça aralarında biz denetleriz (aşım ≤ islem_sn)."""
    bitis = time.monotonic() + toplam_sn
    parcalar = []
    with urllib.request.urlopen(url, timeout=islem_sn) as yanit:
        while parca := yanit.read1(65536):
            parcalar.append(parca)
            if time.monotonic() > bitis:
                raise TimeoutError(f"{toplam_sn} sn içinde bitmedi")
    return b"".join(parcalar)


bas = time.monotonic()
urllib.request.urlopen(adres, timeout=0.5).read()  # YANLIŞ: "en çok 0,5 sn" sanılır
yanlis = time.monotonic() - bas
bas = time.monotonic()
try:
    toplam_sureli(adres, toplam_sn=1.0)
except TimeoutError:
    dogru = time.monotonic() - bas
sunucu.shutdown()
print(f"timeout=0.5 ile istek {yanlis:.1f} sn sürdü; toplam süre sınırıyla {dogru:.1f} sn'de kesildi")
assert yanlis > 2.0 and dogru < 1.8
```

Node'da `fetch`'in kendiliğinden bir toplam sınırı yoktur. `fetch(adres, { signal: AbortSignal.timeout(1000) })`
gövde okunurken de keser (aynı damla damla sunucuyla bu makinede Node 22 ile denendi: 1,0 sn'de `TimeoutError`);
kullanıcının iptaliyle birleştirmek için `AbortSignal.any([iptal.signal, AbortSignal.timeout(ms)])`.

Süre seçimi: toplam sınır, çağıranın kalan bütçesinden küçük olmalıdır (kullanıcı isteği 2 sn ise dış çağrıya 5 sn
vermek anlamsızdır). Arka plan işinde sınır daha uzun olabilir ama **hiçbir zaman sonsuz** değildir.

## Yanıtı kaybolan yan etkili çağrı ve idempotentlik anahtarı

Sağlayıcı ödemeyi yaptı, yanıtı gönderirken bağlantı koptu. İstemci sonucu bilmiyor ve yeniden deniyor. Anahtar
yoksa ya da **her denemede yeni** üretiliyorsa müşteriden iki kez çekilir:

```python calistir
import http.client
import json
import socket
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

cekimler, yanitlar, kopar = [], {}, [True]  # yanitlar: anahtar → ilk yanıt (sağlayıcı anahtarı destekliyor)


class Saglayici(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        anahtar = self.headers.get("Idempotency-Key")
        if anahtar not in yanitlar:
            cekimler.append(govde["tutar_kurus"])
            yanitlar[anahtar or str(uuid.uuid4())] = b"{}"
        if kopar[0]:  # para çekildi ama yanıt istemciye hiç ulaşmayacak
            kopar[0] = False
            self.close_connection = True
            return self.connection.shutdown(socket.SHUT_RDWR)
        self.send_response(201)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *_: object) -> None:
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Saglayici)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()


def ode(tutar: int, kip: str) -> None:
    anahtar = str(uuid.uuid4())  # DOĞRU yer: mantıksal işlem başına BİR kez (gerçekte sipariş satırında durur)
    for _ in range(3):
        basliklar = {"Content-Type": "application/json"}
        if kip != "yok":  # "her_denemede_yeni" YANLIŞ: her deneme yeni bir işlem sayılır
            basliklar["Idempotency-Key"] = anahtar if kip == "ayni" else str(uuid.uuid4())
        baglanti = http.client.HTTPConnection(*sunucu.server_address, timeout=5)
        try:
            baglanti.request("POST", "/odemeler", json.dumps({"tutar_kurus": tutar}), basliklar)
            return baglanti.getresponse().close()
        except (http.client.RemoteDisconnected, ConnectionError):
            continue  # sonuç bilinmiyor → yeniden dene
        finally:
            baglanti.close()
    raise RuntimeError("ödeme sonucu bilinmiyor; sağlayıcıdan durum sorgulanmalı")


sonuc = {}
for kip in ("yok", "her_denemede_yeni", "ayni"):
    cekimler.clear(), yanitlar.clear()
    kopar[0] = True
    ode(15_000, kip)
    sonuc[kip] = len(cekimler)
sunucu.shutdown()
print("çekim sayısı:", sonuc)
assert sonuc == {"yok": 2, "her_denemede_yeni": 2, "ayni": 1}
```

```cikti
çekim sayısı: {'yok': 2, 'her_denemede_yeni': 2, 'ayni': 1}
```

- Anahtar **kalıcı** bir yerde üretilir (sipariş ya da iş kaydı). Süreç çökse ve iş kuyruktan yeniden alınsa bile aynı
  anahtar gider. Bellekte üretilen anahtar yeniden başlatmada kaybolur.
- Sağlayıcı anahtar desteklemiyorsa: isteğe **kendi referansınızı** koyun (sipariş numarası gibi) ve yeniden
  denemeden önce "bu referansla işlem var mı?" diye sorgulayın; sorgu yoksa yan etkili çağrıyı yeniden denemeyin,
  insana düşürün.
- Sunucu tarafında anahtar nasıl saklanır: [API tasarımı](api-tasarimi.md) → idempotentlik anahtarı.

## Hız sınırına uyma ve sayfalama döngüsü

- **Önceden:** sağlayıcının sınırının biraz altında kendi jeton kovanızı kullanın (birden çok işçi varsa kova
  paylaşılmalıdır); hazır kova: [`kutuphane/py/kutuphane/hiz_siniri.py`](../../kutuphane/py/kutuphane/hiz_siniri.py).
- **Sonradan:** 429'da `Retry-After` iki biçimde gelir: saniye (`120`) ya da HTTP tarihi. İkisini de okuyun, üst
  sınırla kırpın, titreme ekleyin; hazır ayrıştırıcı: [`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py)
  (`parse_retry_after`).
- **Sayfalama döngüsünün üç sigortası:** `sonraki` boşsa dur; aynı imleç geri gelirse dur (sağlayıcı hatası sonsuz
  döngü yapar); sayfa ya da istek sayısına üst sınır koy. Kimliğe göre tekilleştirin: ofsetle sayfalayan sağlayıcıda
  araya kayıt girince yineleme olur.

```python calistir
import json
import threading
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime, parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KAYITLAR, sayac, bozuk = [{"id": i} for i in range(1, 9)], [0], [False]  # bozuk: hep aynı imleci döndürür


class Saglayici(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        sayac[0] += 1
        imlec = int(self.path.rsplit("=", 1)[1])
        sonraki = imlec if bozuk[0] else (imlec + 3 if imlec + 3 < len(KAYITLAR) else None)
        durum, govde, ek = 200, json.dumps({"kayitlar": KAYITLAR[imlec : imlec + 3], "sonraki": sonraki}), {}
        if sayac[0] in (2, 4):  # ara sıra 429: önce saniye, sonra HTTP tarihi biçiminde
            tarih = format_datetime(datetime.now(UTC) + timedelta(seconds=2), usegmt=True)
            durum, govde, ek = 429, "{}", {"Retry-After": "1" if sayac[0] == 2 else tarih}
        self.send_response(durum)
        for ad, deger in {"Content-Length": str(len(govde)), **ek}.items():
            self.send_header(ad, deger)
        self.end_headers()
        self.wfile.write(govde.encode())

    def log_message(self, *_: object) -> None:
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Saglayici)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()
TABAN = f"http://127.0.0.1:{sunucu.server_address[1]}"


def bekleme(deger: str | None, ust_sinir: float = 60.0) -> float:
    """Retry-After: saniye ("120") ya da HTTP tarihi; okunamazsa 1 sn; üst sınırla kırpılır."""
    try:
        sure = float(deger) if deger and deger.isdigit() else (parsedate_to_datetime(deger) - datetime.now(UTC)).total_seconds()
    except (TypeError, ValueError):
        sure = 1.0
    return min(max(sure, 0.0), ust_sinir)


def hepsini_getir(uyu) -> list[int]:  # uyu dışarıdan verilir: testte gerçekten beklenmez
    kimlikler, imlec = [], 0
    for _ in range(50):  # istek sayısı sigortası
        try:
            with urllib.request.urlopen(f"{TABAN}/kayitlar?imlec={imlec}", timeout=5) as yanit:
                veri = json.load(yanit)
        except urllib.error.HTTPError as hata:
            if hata.code != 429:
                raise
            uyu(bekleme(hata.headers.get("Retry-After")))
            continue
        kimlikler += [k["id"] for k in veri["kayitlar"] if k["id"] not in kimlikler]  # tekilleştir
        if veri["sonraki"] == imlec:
            raise RuntimeError(f"sağlayıcı aynı imleci ({imlec}) döndürdü: sonsuz döngü kesildi")
        if (imlec := veri["sonraki"]) is None:
            return kimlikler
    raise RuntimeError("istek sınırı aşıldı: sayfalama bitmiyor")


beklemeler: list[float] = []
assert hepsini_getir(beklemeler.append) == list(range(1, 9))
assert beklemeler[0] == 1.0 and 0.5 <= beklemeler[1] <= 2.0  # ikincisi HTTP tarihinden hesaplandı
bozuk[0] = True
try:
    hepsini_getir(beklemeler.append)
except RuntimeError as hata:
    print(hata)
sunucu.shutdown()
```

```cikti
sağlayıcı aynı imleci (0) döndürdü: sonsuz döngü kesildi
```

Uzun bir dökümü sayfa sayfa çekiyorsanız imleci **her sayfa işlendikten sonra** kalıcı yere yazın; iş yarıda kalırsa
baştan değil kaldığı yerden sürer.

## Artımlı eşitleme: "şu andan sonra değişenler" kaçırır

Sağlayıcıdan yalnız değişenleri çekerken (`updated_since=<son görülen damga>`) iki kayıt aynı damgayı taşıyabilir ve
daha önemlisi, **uzun bir işlem** eski damgalı bir kaydı kontrol noktanızdan sonra görünür kılabilir. Sınır `>` ile
alınırsa o kayıt bir daha asla gelmez. Çare: geriye örten pencere (ör. 5 dakika) ve sürümle tekilleştirme:

```python calistir
# Sağlayıcı: (kimlik, sürüm, damga, okunabildiği an). C'yi yazan işlem 7'de başladı, 11'de bitti.
SAGLAYICI = [("A", 1, 5, 5), ("B", 1, 8, 8), ("C", 1, 7, 11), ("B", 2, 12, 12)]


def degisenler(sonra: int, simdi: int) -> list[tuple[str, int, int]]:
    """`updated_since` ucu: o an görünür kayıtların son sürümleri, damgası `sonra`dan küçük olmayanlar."""
    son = {k: (k, s, d) for k, s, d, gorunur in sorted(SAGLAYICI, key=lambda x: x[1]) if gorunur <= simdi}
    return sorted((k for k in son.values() if k[2] >= sonra), key=lambda k: k[2])


def esitle(ortusme: int) -> dict[str, int]:
    yerel: dict[str, int] = {}  # kimlik → işlenen son sürüm
    kontrol_noktasi = 0
    for simdi in (10, 20):  # iki eşitleme turu
        for kimlik, surum, damga in degisenler(kontrol_noktasi - ortusme, simdi):
            if yerel.get(kimlik, 0) < surum:  # aynı sürüm ikinci kez gelirse işlenmez
                yerel[kimlik] = surum
            kontrol_noktasi = max(kontrol_noktasi, damga)
    return yerel


assert esitle(ortusme=0) == {"A": 1, "B": 2}  # YANLIŞ: C kaçtı ve bir daha gelmeyecek
assert esitle(ortusme=5) == {"A": 1, "B": 2, "C": 1}  # DOĞRU: örtüşen pencere + sürüm denetimi
print("örtüşmesiz eşitleme C'yi kaçırdı; örtüşen pencere yakaladı")
```

```cikti
örtüşmesiz eşitleme C'yi kaçırdı; örtüşen pencere yakaladı
```

Örtüşme, eşitlemeyi **idempotent** olmaya zorlar (aynı kayıt iki kez gelir); bu yüzden işleyici sürüm ya da
güncellenme damgasıyla "bunu zaten işledim mi" diye bakar. Sağlayıcı sürüm vermiyorsa kayıt içeriğinin özetiyle bakın.
Haftalık tam karşılaştırma (mutabakat) yine de gerekir: [Ödeme tümleştirme](odeme-tumlestirme.md) → mutabakat.

## Şema doğrulama: sınırda ama hoşgörülü

Dış yanıtı kendi API'nizin isteği gibi sıkı doğrulamayın. Kural: **kullandığınız alanları** tür ve varlıkla
doğrulayın; bilinmeyen alanı yok sayın; bilinmeyen enum değerini çökmeden "bilinmeyen" dalına alın ve sayın; para
ve kimlik gibi alanları metin olarak alıp kendiniz çevirin.

```python calistir
from decimal import Decimal

BILINEN = {"hazirlaniyor", "kargoda", "teslim_edildi"}


class SemaHatasi(ValueError):
    pass


def oku(ham: dict, yol: str, tur: type):
    deger: object = ham
    for parca in yol.split("."):
        if not isinstance(deger, dict) or parca not in deger:
            raise SemaHatasi(f"{yol}: alan yok")
        deger = deger[parca]
    if not isinstance(deger, tur):
        raise SemaHatasi(f"{yol}: {tur.__name__} bekleniyordu, {type(deger).__name__} geldi")
    return deger


def kati_coz(ham: dict) -> dict:  # YANLIŞ: fazla alanı ve yeni durumu hata sayar
    fazla = set(ham) - {"takip_no", "durum", "ucret"}
    if fazla or ham["durum"] not in BILINEN:
        raise SemaHatasi(f"beklenmeyen alan ya da durum: {sorted(fazla) or ham['durum']}")
    return ham


def coz(ham: dict) -> dict:  # DOĞRU: kullandığını doğrula, bilinmeyeni yok say ya da işaretle
    durum = oku(ham, "durum", str)
    return {
        "takip_no": oku(ham, "takip_no", str),
        "durum": durum if durum in BILINEN else "bilinmeyen",  # çökmez; sayılır ve uyarı üretir
        "ucret_kurus": int(Decimal(oku(ham, "ucret.tutar", str)) * 100),  # para metin gelir; float'a çevrilmez
    }


dun = {"takip_no": "TR1", "durum": "kargoda", "ucret": {"tutar": "49.90", "para": "TRY"}}
bugun = {**dun, "durum": "subede_bekliyor", "tahmini_teslim": "2026-11-25"}  # sağlayıcı habersiz ekledi
assert coz(dun)["ucret_kurus"] == 4990 and kati_coz(dun)
assert coz(bugun)["durum"] == "bilinmeyen"
try:
    kati_coz(bugun)
except SemaHatasi as hata:
    print("katı çözücü çöktü:", hata)
try:
    coz({"takip_no": "TR2", "durum": "kargoda", "ucret": {"tutar": 49.9}})
except SemaHatasi as hata:
    print("hoşgörülü çözücü gerçek sorunu yine yakalar:", hata)
assert int(float("0.29") * 100) == 28 and int(Decimal("0.29") * 100) == 29  # float kuruş kaybettirir
```

```cikti
katı çözücü çöktü: beklenmeyen alan ya da durum: ['tahmini_teslim']
hoşgörülü çözücü gerçek sorunu yine yakalar: ucret.tutar: str bekleniyordu, float geldi
```

TypeScript'te aynı fikir Zod ile: `z.object` bilinmeyen alanı atar (hata vermez), `.strict()` hata verir; dış yanıtta
`.strict()` kullanmayın. Enum alanı `z.enum([...]).catch('bilinmeyen')` gibi bir yedekle okunabilir (Zod 4'te
`.catch` var; kurulu sürümde doğrulayın).

## Yönlendirme ve kimlik başlığı

Kütüphane yönlendirmeyi kendiliğinden izliyorsa kimlik başlığını **başka bir ana makineye** taşıyabilir. Python'un
`urllib`'i `Request(headers=...)` ile verilen `Authorization`'ı taşır (bu makinede Python 3.13 ile denendi):

```python calistir
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

gelen: dict[str, str | None] = {}


class Isleyici(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/api":  # API (ya da araya giren biri) 302 ile BAŞKA bir ana makine adına yolluyor
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{sunucu.server_address[1]}/yabanci")
        else:  # yönlendirmenin vardığı ana makine
            gelen["yetki"] = self.headers.get("Authorization")
            self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *_: object) -> None:
        pass


sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
threading.Thread(target=sunucu.serve_forever, daemon=True).start()
adres = f"http://127.0.0.1:{sunucu.server_address[1]}/api"

urllib.request.urlopen(urllib.request.Request(adres, headers={"Authorization": "Bearer gizli"}), timeout=5)
assert gelen["yetki"] == "Bearer gizli"  # YANLIŞ: anahtar başka ana makineye taşındı
istek = urllib.request.Request(adres)
istek.add_unredirected_header("Authorization", "Bearer gizli")  # DOĞRU: yönlendirmede taşınmaz
urllib.request.urlopen(istek, timeout=5)
assert gelen["yetki"] is None
sunucu.shutdown()
print("headers= ile anahtar yönlendirilen ana makineye gitti; add_unredirected_header ile gitmedi")
```

```cikti
headers= ile anahtar yönlendirilen ana makineye gitti; add_unredirected_header ile gitmedi
```

API çağrılarında yönlendirmeyi izlemeyin ya da yalnız aynı kökene izin verin; adresi kullanıcı veriyorsa SSRF
denetimi de gerekir ([SSRF ve dış istekler](../50-guvenlik/ssrf-ve-dis-istekler.md)). Anahtar adreste (sorgu
parametresi) değil başlıkta gider: adresler vekil ve sunucu günlüklerine yazılır.

## Sahte sunucu ve sözleşme testi

| Katman                | Ne kullanılır                                         | Neyi yakalar                                     |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Birim testi           | Enjekte edilen sahte taşıyıcı (`fetch`, `transport`)  | Sınıflandırma, yeniden deneme kararı, çeviri     |
| Bütünleşme testi      | Yukarıdaki gibi standart kütüphane sunucusu, boş kapıda | Gerçek zaman aşımı, kopan bağlantı, 429, sayfalama |
| Sözleşme testi        | Sağlayıcının **gerçek** yanıt örnekleri (tarihli dosyalar) | Ayrıştırıcının sağlayıcının biçimine uyması      |
| Canlı sözleşme denetimi | Sağlayıcının sınama ortamına, ortam değişkeniyle açılan test | Sağlayıcı biçimi değiştirdi mi              |

- Yanıt örneklerini gerçek sınama ortamından alıp tarihli dosyalara koyun (`ornekler/kargo-durum-2026-11.json`),
  kişisel veriyi silin. Canlı denetim `CANLI_SOZLESME=1` ile açılır, gece CI'da koşar, yayını durdurmaz.
- Sahte sunucu senaryoları: yavaş başlık, damla damla gövde, 500 sonra başarı, 429 + `Retry-After`, işlemden sonra
  kopan bağlantı, bozuk JSON, boş sayfa, aynı imleç.

## Tuzaklar

| Belirti                                                     | Neden                                                         | Çözüm                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| İstek "zaman aşımı 5 sn" olduğu hâlde dakikalarca sürdü     | `timeout` tek işlemi sınırlıyor; sunucu damla damla gönderiyor | Toplam son tarih; Node'da `AbortSignal.timeout`               |
| Müşteriden iki kez çekildi                                  | Yanıt kayboldu; yeniden denemede anahtar yok ya da yeni       | Mantıksal işlem başına tek, kalıcı anahtar                     |
| Yeniden başlatmadan sonra yine çift işlem                   | Anahtar bellekte üretilmişti                                  | Anahtarı iş/sipariş kaydında saklayın                          |
| Liste eksik; bazı kayıtlar hiç gelmiyor                     | `updated_since >` sınırı; geç görünür olan işlem              | Örtüşen pencere + sürümle tekilleştirme + dönemsel mutabakat   |
| Eşitleme işi hiç bitmiyor, istek sayısı patladı            | Sağlayıcı aynı imleci döndürüyor                              | Aynı imleç ve istek sayısı sigortası                           |
| Sağlayıcı alan ekledi, entegrasyon çöktü                    | Sıkı şema (`strict`, fazla alan hata)                         | Kullanılan alanları doğrula, bilinmeyeni yok say               |
| Yeni kargo durumu gelince ekran boş kaldı                   | Bilinmeyen enum değeri istisna fırlattı                       | "Bilinmeyen" dalı + sayaç + uyarı                              |
| Tutarlar kuruş kuruş tutmuyor                               | Para `float` olarak çevrildi                                  | Metin → `Decimal` → kuruş tamsayı                              |
| 429'lar arttıkça daha çok 429                               | `Retry-After` yok sayıldı; titremesiz sabit bekleme            | `Retry-After` + titreme + paylaşılan jeton kovası              |
| API anahtarı başka bir alan adının günlüğünde görüldü       | Yönlendirme izlendi, başlık taşındı; ya da anahtar adreste    | Yönlendirmeyi izleme; `add_unredirected_header`; başlıkta gönder |
| Bellek bir anda doldu                                       | Dev yanıt sınırsız okundu                                     | Boyut sınırıyla okuma                                          |
| Testler geçiyor, canlıda biçim farklı                       | Sahte yanıt elle uyduruldu                                    | Gerçek yanıttan alınmış, tarihli örnek dosyalar                |

## Denetim listesi

- [ ] Bütün çağrılar tek bağdaştırıcıdan geçiyor; uygulamada sağlayıcının biçimi ve hata kodları görünmüyor.
- [ ] Her çağrının **toplam** süre sınırı var (damla damla sunucuyla test edildi).
- [ ] Yeniden deneme yalnız tablodaki durumlarda, tek katmanda, titremeli ve üst sınırlı; `Retry-After` iki biçimde okunuyor.
- [ ] Yan etkili her çağrı, kalıcı yerde üretilmiş tek bir anahtarla yeniden deneniyor; "yanıt kayboldu" testi var.
- [ ] Sayfalama döngüsünde boş imleç, aynı imleç ve istek sayısı sigortası var; kimliğe göre tekilleştiriliyor.
- [ ] Artımlı eşitlemede örtüşen pencere ve sürüm denetimi var; dönemsel tam mutabakat koşuyor.
- [ ] Yanıt boyutu sınırlı; şema yalnız kullanılan alanları denetliyor; bilinmeyen enum çökmüyor ve sayılıyor.
- [ ] Yönlendirme izlenmiyor ya da aynı kökenle sınırlı; anahtar başlıkta, günlüğe yazılmıyor.
- [ ] Gerçek yanıt örnekleriyle sözleşme testi ve ortam değişkeniyle açılan canlı denetim var.
- [ ] Günlükte sağlayıcı, uç kalıbı, durum, süre, deneme no ve sağlayıcının istek kimliği var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dış API çağrılarını tek bir bağdaştırıcı modülüne yaz. Her çağrıya toplam süre sınırı koy
  (Python'da parça aralarında son tarih denetimi, Node'da `AbortSignal.timeout`). Yeniden deneme yalnız bağlantı
  hatası, 408, 429, 5xx'te; yan etkili çağrıda idempotentlik anahtarını işlem kaydından al, her denemede aynısını
  gönder. Yanıtı yalnız kullandığın alanlarla doğrula; bilinmeyen alanı yok say. Testleri standart kütüphane
  sunucusuyla, boş kapıda yaz: damla damla gövde, 429 + Retry-After, işlemden sonra kopan bağlantı."
- **Modelin tipik hatası:** `timeout=5`'i toplam süre sanır; anahtarı yeniden deneme döngüsünün **içinde** üretir;
  her hatayı yeniden dener (400 dahil); sayfalama döngüsünü `while True` ile sigortasız yazar; dış yanıtı
  `.strict()`/`extra="forbid"` ile doğrular; parayı `float` yapar; API anahtarını sorgu parametresine koyar.
- **Çıktıda arayın:** `uuid` çağrısının döngü içinde olup olmadığı; `while True` ve imleç denetimi; `float(` ve
  `* 100`; `timeout=` değerinin toplam süre gibi yorumlandığı yorumlar; `Authorization` içeren günlük satırları.
- **Test isteyin:** "yanıt kaybolunca tek çekim", "damla damla gövdede toplam süre aşılınca hata", "aynı imleçte
  döngü kesilir", "sağlayıcı yeni alan ekleyince ayrıştırıcı çalışır".

## İlgili

- [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md) (bütçe, titreme, devre kesici) ·
  [Güvenilirlik düşüncesi](../00-yontem/guvenilirlik-dusuncesi.md)
- [API tasarımı](api-tasarimi.md) (sunucu tarafı idempotentlik ve sayfalama) · [Webhooklar](webhooklar.md) (olayı
  sağlayıcı iterse) · [Ödeme tümleştirme](odeme-tumlestirme.md) (mutabakat) · [Hız sınırı](hiz-siniri-ve-kotuye-kullanim.md)
- [API testleri](api-testleri.md) (sahte dış servis) · [Kalıcı iş kuyruğu](kalici-is-kuyrugu.md) (dış çağrıyı işe
  almak) · [SSRF ve dış istekler](../50-guvenlik/ssrf-ve-dis-istekler.md)
- Havuzda: [`kutuphane/py/kutuphane/yeniden_dene.py`](../../kutuphane/py/kutuphane/yeniden_dene.py),
  [`kutuphane/ts/src/zamanlama.ts`](../../kutuphane/ts/src/zamanlama.ts),
  [`yz/yz/saglayici/openai_uyumlu.py`](../../yz/yz/saglayici/openai_uyumlu.py)
