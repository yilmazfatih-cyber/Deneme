---
baslik: Oturum güvenliği: çerez bayrakları, sabitleme, süre ve iptal
ozet: Oturum çerezinin bayrakları ve denetimi, oturum sabitlemeye karşı kimlik döndürme, boşta ve mutlak süre, çıkışta ve parola değişiminde iptal, yenileme belirteci döndürme ve belirteci tarayıcıda saklamanın riski.
etiketler: [guvenlik, oturum, cerez, belirtec, iptal]
duzey: orta
guncellik: 2026-11
---

# Oturum güvenliği: çerez bayrakları, sabitleme, süre ve iptal

> Bu notu ne zaman okumalı: giriş/çıkış kodu, çerez ayarı, "beni hatırla", "her yerden çık", belirteç yenileme
> yazılırken; bir model belirteci `localStorage`'a koymayı önerdiğinde; "çıkış yaptım ama oturum hâlâ açık"
> bildiriminde. Oturum mu imzalı belirteç mi kararı: [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md).

## Temel fikir

Oturum belirteci, girişten sonra **parolanın yerine geçen** şeydir: onu ele geçiren, parola ya da ikinci etken
gerekmeden kullanıcı olur. Bu yüzden dört soru:

1. **Çalınabilir mi?** Betik okuyabiliyor mu (XSS), düz HTTP'de gidiyor mu, adreste/günlükte görünüyor mu,
   veritabanında düz mü duruyor?
2. **Yerleştirilebilir mi?** Saldırgan kendi bildiği kimliği kurbana kabul ettirebilir mi (oturum sabitleme)?
3. **Ne kadar yaşar?** Unutulmuş bir tarayıcıda, çalınmış bir kopyada ne kadar geçerli kalır?
4. **Öldürülebilir mi?** Çıkış, parola değişimi, hesap kapatma, "her yerden çık" sunucuda gerçekten iptal ediyor mu?

Sunucu tarafı oturum (rastgele belirteç, veritabanında özeti) dördüne de cevap verir; havuzdaki API bunu uygular:
[`session.ts`](../../uygulama/api/src/modules/auth/session.ts).

## Çerez bayrakları

| Öznitelik                  | Ne yapar                                                             | Oturum çerezinde                                    |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `HttpOnly`                 | Sayfadaki betik (`document.cookie`) okuyamaz                         | Her zaman                                           |
| `Secure`                   | Yalnız HTTPS'te gönderilir                                           | Üretimde her zaman                                  |
| `SameSite=Lax`             | Başka siteden gelen alt isteklere ve POST'a eklenmez                 | `Lax` (ya da `Strict`); ayrıntı: [CSRF ve CORS](csrf-ve-cors.md) |
| `Path=/`                   | Bütün yollarda geçerli                                               | `/`                                                 |
| `Domain`                   | **Yazılırsa** alt alan adlarına da gider                             | Yazmayın (yalnız bu ana makine)                     |
| `Max-Age` / `Expires`      | Yoksa "tarayıcı oturumu çerezi"; tarayıcı oturumu geri yükleyince yaşar | Sunucudaki süreyle aynı                          |
| `__Host-` öneki            | `Secure` + `Path=/` + `Domain` yok zorunlu; alt alandan üzerine yazılamaz | Üretimde                                       |
| `__Secure-` öneki          | Yalnız `Secure` zorunlu                                              | `Domain` şartsa                                     |

Bayrakları elle değil **testle** güvenceye alın: yanıtın `Set-Cookie` başlığını denetleyen küçük bir yardımcı,
yanlış bir ayar değişikliğini hemen yakalar.

```python calistir
import http.cookies


def cerez_denetle(baslik: str, uretim: bool = True) -> list[str]:
    ad_deger, *parcalar = [p.strip() for p in baslik.split(";")]
    ad = ad_deger.split("=", 1)[0]
    oz = {}
    for parca in parcalar:
        anahtar, _, deger = parca.partition("=")
        oz[anahtar.strip().lower()] = deger.strip()
    sorunlar = []
    if "httponly" not in oz:
        sorunlar.append("HttpOnly yok: betik okuyabilir")
    if oz.get("samesite", "").lower() not in {"lax", "strict"}:
        sorunlar.append("SameSite Lax/Strict değil")
    if "domain" in oz:
        sorunlar.append("Domain var: alt alan adlarına da gider")
    if oz.get("path") != "/":
        sorunlar.append("Path=/ değil")
    if uretim and "secure" not in oz:
        sorunlar.append("Secure yok: düz HTTP'de gider")
    if uretim and not ad.startswith("__Host-"):
        sorunlar.append("__Host- öneki yok")
    return sorunlar


# DOĞRU: standart kitaplıkla üretilmiş başlık
cerez = http.cookies.SimpleCookie()
cerez["__Host-sid"] = "belirtec"
for anahtar, deger in {"httponly": True, "secure": True, "samesite": "Lax", "path": "/", "max-age": 2592000}.items():
    cerez["__Host-sid"][anahtar] = deger
iyi = cerez.output(header="").strip()
assert iyi == "__Host-sid=belirtec; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax; Secure"
assert cerez_denetle(iyi) == []

# TEST: yanlış ayarlanmış çerez her sorunu ayrı ayrı gösterir
kotu = "sid=belirtec; Domain=ornek.com; Path=/; SameSite=None"
assert cerez_denetle(kotu) == [
    "HttpOnly yok: betik okuyabilir",
    "SameSite Lax/Strict değil",
    "Domain var: alt alan adlarına da gider",
    "Secure yok: düz HTTP'de gider",
    "__Host- öneki yok",
]
print("tamam")
```

```cikti
tamam
```

Havuzdaki karşılığı: [`security.test.ts`](../../uygulama/api/test/security.test.ts) → "oturum çerezi" (üretimde
`__Host-sid; Secure; HttpOnly; SameSite=Lax; Path=/`, `Domain` yok, öneksiz `sid` kabul edilmez).

## Oturum sabitleme ve kimlik döndürme

Neden açık: saldırgan anonim bir oturum kimliği alır ve kurbanın tarayıcısına yerleştirir (adreste taşınan
oturum kimliği, kardeş alt alandan yazılan çerez, ortak bilgisayar). Uygulama girişte **aynı** kimliği "giriş
yapmış" diye işaretlerse saldırganın bildiği kimlik artık kurbanın oturumudur.

```python calistir
import secrets

OTURUMLAR: dict[str, dict] = {}


def anonim_oturum() -> str:
    kimlik = secrets.token_urlsafe(32)
    OTURUMLAR[kimlik] = {"kullanici": None, "sepet": ["çay"]}
    return kimlik


# YANLIŞ: var olan oturum "yükseltilir"
def giris_yanlis(kimlik: str, kullanici: str) -> str:
    OTURUMLAR[kimlik]["kullanici"] = kullanici
    return kimlik


# DOĞRU: eski kimlik silinir, yenisi verilir; taşınacak veri (sepet) açıkça taşınır
def giris(kimlik: str | None, kullanici: str) -> str:
    eski = OTURUMLAR.pop(kimlik, None) if kimlik else None
    yeni = secrets.token_urlsafe(32)
    OTURUMLAR[yeni] = {"kullanici": kullanici, "sepet": (eski or {}).get("sepet", [])}
    return yeni


saldirganin_bildigi = anonim_oturum()
giris_yanlis(saldirganin_bildigi, "ayse")
assert OTURUMLAR[saldirganin_bildigi]["kullanici"] == "ayse"  # saldırganın kimliği artık Ayşe'nin oturumu

saldirganin_bildigi = anonim_oturum()
yeni = giris(saldirganin_bildigi, "ayse")
# TEST: girişten sonra eski kimlik hiçbir şey açmaz; sepet korunur
assert saldirganin_bildigi not in OTURUMLAR
assert OTURUMLAR[yeni] == {"kullanici": "ayse", "sepet": ["çay"]}
print("tamam")
```

```cikti
tamam
```

Kimlik yalnız girişte değil, **yetki düzeyi değişince** de döner: ikinci etken tamamlanınca, rol değişince,
"yönetici kipi"ne geçince. Oturum kimliği hiçbir zaman adreste (`?sid=`) taşınmaz ve dışarıdan gelen bir kimlik
sunucuda yoksa **kabul edilip oluşturulmaz**.

## Süre, iptal ve depolama

| Süre türü          | Ne zaman biter                                   | Tipik seçim                                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| Boşta (idle)       | Son istekten bu kadar sonra                      | Hassas uygulama: dakikalar; tüketici uygulaması: kayan günler |
| Mutlak (absolute)  | Girişten bu kadar sonra, kullanım ne olursa olsun | Hassas uygulama: saatler; çalınmış kopyanın ömrünü sınırlar  |
| Yeniden doğrulama  | Hassas işlemde son parola doğrulamasından sonra  | Parola/e-posta değişimi, hesap silme, ödeme: birkaç dakika    |

Havuzdaki seçim: 30 günlük kayan süre, yarısı geçince uzar; hesap silme yeniden parola ister. Bankacılık benzeri bir
uygulamada boşta ve mutlak süre birlikte gerekir:

```python calistir
import hashlib
import secrets
from dataclasses import dataclass

BOSTA_SN, MUTLAK_SN = 30 * 60, 12 * 3600


@dataclass
class Oturum:
    kullanici: str
    baslangic: float
    son: float


class Depo:
    def __init__(self) -> None:
        self.satirlar: dict[str, Oturum] = {}  # anahtar: belirtecin SHA-256 özeti; belirtecin kendisi saklanmaz

    @staticmethod
    def _ozet(belirtec: str) -> str:
        return hashlib.sha256(belirtec.encode()).hexdigest()

    def ac(self, kullanici: str, simdi: float) -> str:
        belirtec = secrets.token_urlsafe(32)
        self.satirlar[self._ozet(belirtec)] = Oturum(kullanici, simdi, simdi)
        return belirtec

    def getir(self, belirtec: str, simdi: float) -> str | None:
        ozet = self._ozet(belirtec)
        o = self.satirlar.get(ozet)
        if o is None:
            return None
        if simdi - o.son > BOSTA_SN or simdi - o.baslangic > MUTLAK_SN:
            del self.satirlar[ozet]
            return None
        o.son = simdi
        return o.kullanici

    def cikis(self, belirtec: str) -> None:
        self.satirlar.pop(self._ozet(belirtec), None)

    def digerlerini_kapat(self, kullanici: str, haric: str) -> None:  # parola değişince
        korunan = self._ozet(haric)
        self.satirlar = {k: o for k, o in self.satirlar.items() if o.kullanici != kullanici or k == korunan}


d = Depo()
telefon, dizustu = d.ac("ayse", 0), d.ac("ayse", 0)
assert telefon not in str(d.satirlar)  # veritabanı sızsa belirteç çıkmaz
assert d.getir(telefon, 29 * 60) == "ayse"  # etkinlik boşta süresini sıfırlar
assert d.getir(dizustu, 31 * 60) is None  # TEST: boşta kaldı, düştü
canli = d.ac("ayse", 0)
for dakika in range(0, 12 * 60 + 1, 20):  # 12 saat boyunca 20 dakikada bir kullanılsa da
    sonuc = d.getir(canli, dakika * 60 + 1)
assert sonuc is None  # TEST: mutlak süre doldu
yeni = d.ac("ayse", 0)
d.digerlerini_kapat("ayse", haric=yeni)
assert d.getir(telefon, 60) is None and d.getir(yeni, 60) == "ayse"  # parola değişti: öteki cihazlar düştü
d.cikis(yeni)
assert d.getir(yeni, 61) is None  # TEST: çıkış sunucuda iptal etti
print("tamam")
```

```cikti
tamam
```

İptal kuralları: çıkış → o satır silinir; parola değişimi → öteki oturumlar; parola sıfırlama, hesap kapatma,
"her yerden çık" → hepsi. Açık anlık bildirim bağlantıları (SSE/WebSocket) da kapatılır; yoksa düşmüş oturum
veri almaya devam eder (havuzda testli).

## Belirteci tarayıcıda saklamak

| Yer                                      | XSS olursa                                   | Not                                                        |
| ---------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `HttpOnly` çerez                         | Betik okuyamaz (ama kullanıcı adına istek atar) | Web için varsayılan; CSRF katmanı gerekir               |
| Bellekte (değişken)                      | Sayfa açıkken okunabilir; yenilemede kaybolur | Kısa ömürlü erişim belirteci + `HttpOnly` yenileme çerezi |
| `localStorage` / `sessionStorage` / IndexedDB | **Okunur ve dışarı taşınır**; kalıcıdır | Uzun ömürlü belirteç için kullanmayın                      |
| Mobil: Keychain / Keystore               | —                                            | Uygulamanın güvenli deposu                                 |

Çalınan `HttpOnly` olmayan belirteç saldırganın kendi makinesinden, istediği zaman kullanılır; XSS kapansa bile
süre bitene kadar geçerlidir. Bu yüzden XSS önlemi ([XSS ve CSP](xss-ve-csp.md)) ile depolama kararı birlikte
verilir.

## Yenileme belirteci döndürme

İstemci kısa ömürlü erişim belirteci + uzun ömürlü yenileme belirteci kullanıyorsa (mobil, başka alan adı),
yenileme belirteci **her kullanımda değişir**; eski belirteç ikinci kez gelirse biri kopyalamıştır: o belirteç
**ailesinin tamamı** iptal edilir.

```python calistir
import hashlib
import secrets


class YenilemeDeposu:
    def __init__(self) -> None:
        self.kayit: dict[str, dict] = {}  # özet → {"aile", "kullanildi"}

    def ver(self, aile: str | None = None) -> str:
        belirtec = secrets.token_urlsafe(32)
        self.kayit[hashlib.sha256(belirtec.encode()).hexdigest()] = {"aile": aile or secrets.token_hex(8), "kullanildi": False}
        return belirtec

    def yenile(self, belirtec: str) -> str | None:
        k = self.kayit.get(hashlib.sha256(belirtec.encode()).hexdigest())
        if k is None:
            return None
        if k["kullanildi"]:  # yeniden kullanım: çalınma işareti → bütün aileyi düşür
            for satir in self.kayit.values():
                if satir["aile"] == k["aile"]:
                    satir["kullanildi"] = True
            return None
        k["kullanildi"] = True
        return self.ver(k["aile"])


depo = YenilemeDeposu()
ilk = depo.ver()
ikinci = depo.yenile(ilk)  # meşru istemci yeniledi
assert ikinci is not None
# TEST: saldırganın kopyaladığı eski belirteç reddedilir ve meşru istemcinin yenisi de düşer
assert depo.yenile(ilk) is None
assert depo.yenile(ikinci) is None  # kullanıcı yeniden giriş yapar; olay günlüğe yazılır
print("tamam")
```

```cikti
tamam
```

Ağ kesintisinde istemci aynı belirteci iki kez gönderebilir; kısa bir tolerans (ör. birkaç saniye içinde aynı
yanıtı yinelemek) ödünleşimdir, gerekçesiyle yazılır.

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| Çıkış yaptıktan sonra kopyalanan çerez hâlâ çalışıyor          | Çıkış yalnız istemcideki çerezi siliyor                  | Sunucuda satırı silin; testle doğrulayın                        |
| Parola değişti, çalınan oturum devam ediyor                   | Değişimde öteki oturumlar düşmüyor                       | `digerlerini_kapat`; SSE bağlantıları da                        |
| Giriş sonrası oturum kimliği değişmiyor                       | Var olan oturum yükseltiliyor                            | Girişte ve yetki değişiminde yeni kimlik                        |
| Alt alan adındaki bir sayfa ana uygulamanın çerezini görüyor   | `Domain=ornek.com` yazılmış                              | `Domain` yazmayın; `__Host-` öneki                              |
| Oturum kimliği analitikte ve sunucu günlüğünde görünüyor       | Kimlik adreste taşınıyor                                 | Yalnız çerez ya da `Authorization` başlığı                      |
| Veritabanı yedeği sızınca oturumlar ele geçti                 | Belirteçler düz saklanıyor                               | Yalnız SHA-256 özeti                                            |
| Ortak bilgisayarda günler sonra oturum açık                   | Yalnız kayan süre var, mutlak süre yok                   | Uygulamanın riskine göre mutlak süre                            |
| Mobil kullanıcılar sık sık çıkışa düşüyor                     | Oturum IP'ye sıkı bağlanmış; mobil ağda IP değişir       | IP/tarayıcı değişimini işaret olarak kullanın, kilit olarak değil |
| Çıkış yapan kullanıcının sayfası geri tuşuyla görünüyor        | Kişisel yanıtlar önbellekte                              | `Cache-Control: no-store`                                       |
| XSS sonrası belirteçler dışarı taşındı                         | Uzun ömürlü belirteç `localStorage`'da                   | `HttpOnly` çerez ya da bellek + kısa ömür                        |

## Denetim listesi

- [ ] Belirteç 32 bayt kriptografik rastgele; veritabanında yalnız özeti.
- [ ] Çerez `HttpOnly; Secure; SameSite=Lax; Path=/`, `Domain` yok, üretimde `__Host-` (testli).
- [ ] Girişte ve yetki düzeyi değişiminde yeni oturum kimliği; dışarıdan gelen bilinmeyen kimlik kabul edilmiyor.
- [ ] Boşta ve mutlak süre uygulamanın riskine göre seçilmiş ve yazılı; hassas işlemde yeniden doğrulama.
- [ ] Çıkış, parola değişimi/sıfırlama, hesap kapatma, "her yerden çık" sunucuda iptal ediyor; açık akışlar kesiliyor.
- [ ] Yenileme belirteci varsa her kullanımda dönüyor; yeniden kullanımda aile iptal ediliyor ve olay günlükte.
- [ ] Belirteç adreste, günlükte, `localStorage`'da yok; kişisel yanıtlar `no-store`.

## Küçük modele yaptırırken

- **İsteme yazın:** "Oturum için projedeki `session.ts` akışını kullan: `createSession` + `attachSession`; yeni
  çerez ayarı yazma. Girişte yeni oturum aç, eskisini sil. Çıkış sunucudaki satırı silsin. Belirteci
  `localStorage`'a koyma."
- **Modelin tipik hatası:** JWT'yi `localStorage`'da saklamak; çıkışta yalnız çerezi silmek; `Domain=` eklemek
  ("alt alanlarda da çalışsın"); girişte oturum kimliğini değiştirmemek; `SameSite=None` ile CORS sorununu
  "çözmek"; süreyi `expiresIn: '30d'` ile sabit ve iptalsiz bırakmak.
- **Çıktıda denetleyin:** `setCookie(`/`Set-Cookie` çağrılarının bayrakları; `localStorage.setItem`; çıkış
  işleyicisinde veritabanı silme çağrısı var mı; parola değişiminde öteki oturumlar siliniyor mu.
- **Test isteyin:** "çıkıştan sonra eski çerezle istek 401", "parola değişince öteki cihaz 401, bu cihaz 200",
  "girişten önceki oturum kimliği girişten sonra geçersiz", `cerez_denetle` ile bayrak testi.

## İlgili

- [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) (oturum mu belirteç mi, "beni hatırla") ·
  [Parola ve hesap güvenliği](parola-ve-hesap-guvenligi.md) · [CSRF ve CORS](csrf-ve-cors.md)
- Çalışan kod: [`uygulama/api/src/modules/auth/session.ts`](../../uygulama/api/src/modules/auth/session.ts),
  [`random.ts`](../../uygulama/api/src/lib/random.ts) (belirteç ve özeti), testler
  [`security.test.ts`](../../uygulama/api/test/security.test.ts) → "oturum çerezi", "oturum iptali ve kapalı hesap"
