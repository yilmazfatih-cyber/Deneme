---
baslik: Kimlik doğrulama: oturum, belirteç, parola, MFA ve OAuth
ozet: Oturum çerezi ile imzalı belirteç arasında seçim, parola saklama ve sıfırlama, TOTP, OAuth/OIDC yetki kodu + PKCE, geçiş anahtarı ve "beni hatırla"; çalışan örneklerle.
etiketler: [kimlik, oturum, jwt, parola, oauth, mfa]
duzey: orta
guncellik: 2026-11
---

# Kimlik doğrulama: oturum, belirteç, parola, MFA ve OAuth

> Bu notu ne zaman okumalı: giriş, kayıt, çıkış, şifre sıfırlama, "Google ile giriş", iki aşamalı doğrulama ya da
> "beni hatırla" yazılacakken; bir model "JWT kullanalım" önerdiğinde; bir hesabın ele geçirildiğinden
> şüphelenildiğinde.

## Temel fikir

Kimlik doğrulama (authentication) "bu istek kimden geliyor" sorusudur; "ne yapabilir" sorusu yetkilendirmedir
([Yetkilendirme](yetkilendirme.md)). Üç parçası vardır:

1. **Kanıtlama** (bir kez): parola, geçiş anahtarı, başka sağlayıcı (OIDC), tek kullanımlık kod.
2. **Taşıma** (her istekte): oturum çerezi ya da belirteç.
3. **Kurtarma** (kaybolunca): şifre sıfırlama, ikinci etkenin sıfırlanması. **En zayıf halka budur**; saldırgan
   kapıyı değil arka kapıyı dener.

Gerçek ihlallerin çoğu kriptografi hatası değil süreç boşluğudur: süresi dolmayan sıfırlama bağlantısı, iptal
edilemeyen belirteç, hız sınırı olmayan giriş ucu, "bu e-posta kayıtlı değil" diyen form.

## Karar tablosu: oturumu nasıl taşımalı

| Durum                                                      | Seçim                                                     | Neden                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Tarayıcı + kendi API'niz (aynı köken)                      | Sunucu tarafı oturum + `HttpOnly` çerez                   | Tek satır silerek iptal; betik (XSS) çerezi okuyamaz           |
| Mobil/masaüstü istemci ya da başka alan adı                | Opak belirteç (veritabanında özeti) + `Authorization: Bearer` | Aynı iptal gücü, çerez gerekmez                            |
| Çok servisli sistem, servisler arası kısa yetki            | Kısa ömürlü JWT (dakikalar) + veritabanında yenileme belirteci | Servisler veritabanına sormadan doğrular; iptal yenilemede |
| "Google/Apple ile giriş"                                   | OIDC yetki kodu + PKCE → sonra **kendi** oturumunuz       | Sağlayıcının belirteci sizin oturumunuz değildir               |
| Sunucudan sunucuya                                         | API anahtarı (özeti saklanır) ya da OAuth istemci kimliği | İnsan yok; anahtar döndürülebilir olmalı                       |

Havuzdaki API ilk iki satırı birlikte uygular: tarayıcıya çerez, `X-Auth-Mode: token` diyen istemciye belirteç;
ikisi de aynı `sessions` tablosundaki satırdır. JWT bilinçli olarak elendi: iptal edilemez, şifre değişince
düşürülemez ([`api/KARARLAR.md`](../../uygulama/api/KARARLAR.md)).

## JWT'nin sık yanlışları

İmzalı belirteç (JWT gibi) sunucunun **hatırlamadığı** bir izin belgesidir. Avantajı da kusuru da budur:

```python calistir
import base64
import hashlib
import hmac
import json

GIZLI = b"en-az-32-bayt-rastgele-gizli-anahtar!!"


def b64(veri: bytes) -> bytes:
    return base64.urlsafe_b64encode(veri).rstrip(b"=")


def b64_coz(veri: bytes) -> bytes:
    return base64.urlsafe_b64decode(veri + b"=" * (-len(veri) % 4))


def imzala(yuk: dict) -> str:
    govde = b64(json.dumps(yuk).encode())
    return (govde + b"." + b64(hmac.new(GIZLI, govde, hashlib.sha256).digest())).decode()


def coz(jeton: str, simdi: int) -> dict | None:
    govde, _, imza = jeton.encode().partition(b".")
    if not hmac.compare_digest(imza, b64(hmac.new(GIZLI, govde, hashlib.sha256).digest())):
        return None
    yuk = json.loads(b64_coz(govde))
    return yuk if yuk["exp"] > simdi else None


simdi = 1_800_000_000
jeton = imzala({"sub": "u42", "exp": simdi + 7 * 24 * 3600})  # 7 gün geçerli
# Kullanıcı "şifremi değiştirdim, her yerden çık" dedi. Sunucu belirteci hatırlamıyor, silemez:
assert coz(jeton, simdi + 3600) is not None  # çalınmış kopya HÂLÂ geçerli
# Tek çare her istekte veritabanına sormak (ör. belirteç sürümü): bu artık bir oturumdur.
belirtec_surumu = {"u42": 2}  # şifre değişince 1 → 2


def coz_surumlu(jeton: str, simdi: int) -> dict | None:
    yuk = coz(jeton, simdi)
    return yuk if yuk and yuk.get("ver", 1) == belirtec_surumu[yuk["sub"]] else None


assert coz_surumlu(jeton, simdi + 3600) is None
assert b'"sub": "u42"' in b64_coz(jeton.split(".")[0].encode())  # yük şifreli DEĞİL: herkes okur
print("tamam")
```

```cikti
tamam
```

| Yanlış                                                  | Sonuç                                                 | Doğrusu                                                   |
| ------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Uzun ömürlü (günler) JWT'yi oturum olarak kullanmak     | Çıkış, şifre değişimi, hesap kapatma işe yaramaz      | Sunucu tarafı oturum; JWT ise dakikalarla sınırlı         |
| Belirteci `localStorage`'da saklamak                    | Tek bir XSS açığı belirteci dışarı taşır              | `HttpOnly` çerez; ya da bellekte + kısa ömür              |
| İmzayı doğrulamadan okumak (`decode` ≠ `verify`)        | Herkes kendine `"role":"admin"` yazar                 | Her istekte doğrula; `alg`'ı sunucu sabitler              |
| Başlıktaki `alg` değerine güvenmek (`none`, karışıklık) | İmzasız ya da yanlış anahtarla imzalı belirteç geçer  | Kabul edilen algoritmayı kodda tek değere sabitleyin      |
| `exp`, `aud`, `iss` denetlememek                        | Başka uygulamanın belirteci sizde geçer               | Üçünü de denetleyin; saat kaymasına birkaç saniye pay     |
| Yüke kişisel veri koymak                                | base64 şifre değildir; günlüklere, adres çubuğuna düşer | Yükte yalnız kimlik (`sub`) ve süre                     |

## Oturumun doğru kurulumu

Havuzdaki gerçekleme: [`auth/session.ts`](../../uygulama/api/src/modules/auth/session.ts),
[`sessionRepo.ts`](../../uygulama/api/src/modules/auth/sessionRepo.ts), [`random.ts`](../../uygulama/api/src/lib/random.ts).

- Belirteç: 32 bayt kriptografik rastgele (`secrets.token_urlsafe(32)`, `randomBytes(32)`); `Math.random()` asla.
- Veritabanında belirtecin **SHA-256 özeti** durur; veritabanı sızsa da oturum çalınamaz. Yüksek entropili
  belirteçte tuz gerekmez (parolada gerekir).
- Çerez: `HttpOnly; Secure; SameSite=Lax; Path=/`, adı `__Host-` önekli (alt alan adından üzerine yazılamaz).
- Girişte **yeni** oturum açılır (eski kimlik taşınmaz: oturum sabitleme, session fixation).
- Kayan süre: kalan süre yarıya inince uzat. Kullanılmayan oturum kendiliğinden düşer.
- İptal: çıkış o satırı siler; şifre değişimi öteki oturumları, sıfırlama ve hesap kapatma hepsini siler.
- Çerezle kimlik doğrulayan her sitede CSRF koruması gerekir: `SameSite`, değiştirici isteklerde köken denetimi,
  yalnız JSON gövde ([`csrf.ts`](../../uygulama/api/src/http/csrf.ts)).

## Parola saklama ve giriş

- Yavaş ve bellek isteyen özet: Argon2id, scrypt, bcrypt ya da PBKDF2. Parametreleri özet dizgisine yazın
  (`scrypt$N$r$p$tuz$özet`): parametre yükselince eski özetler çalışmaya devam eder, kullanıcı bir sonraki
  başarılı girişinde yeniden özetlenir. Güncel parametreleri o günkü OWASP önerisinden alın; ezberden yazmayın.
- Özetten önce **Unicode NFC**: "ş" tek karakter de yazılabilir, "s + birleşik çengel" de. Bir cihazda kurulan
  şifre öteki cihazda tutmaz.
- Karşılaştırma sabit zamanlı (`hmac.compare_digest`, `timingSafeEqual`).

```python calistir
import base64
import hashlib
import hmac
import os
import unicodedata

N, R, P = 2**14, 8, 1  # ~16 MiB bellek; değerler özetin içinde saklanır


def b64(veri: bytes) -> str:
    return base64.urlsafe_b64encode(veri).rstrip(b"=").decode()


def b64_coz(metin: str) -> bytes:
    return base64.urlsafe_b64decode(metin + "=" * (-len(metin) % 4))


def turet(parola: str, tuz: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(unicodedata.normalize("NFC", parola).encode(), salt=tuz, n=n, r=r, p=p, dklen=32)


def ozetle(parola: str) -> str:
    tuz = os.urandom(16)
    return f"scrypt${N}${R}${P}${b64(tuz)}${b64(turet(parola, tuz, N, R, P))}"


def dogrula(parola: str, kayitli: str) -> bool:
    _, n, r, p, tuz, beklenen = kayitli.split("$")
    return hmac.compare_digest(turet(parola, b64_coz(tuz), int(n), int(r), int(p)), b64_coz(beklenen))


kayit = ozetle("güneşli-şehir-42")
assert kayit != ozetle("güneşli-şehir-42")  # tuz her seferinde farklı
assert dogrula("güneşli-şehir-42", kayit) and not dogrula("güneşli-şehir-43", kayit)
ayrik = unicodedata.normalize("NFD", "güneşli-şehir-42")  # aynı görünür, baytları farklı
assert ayrik != "güneşli-şehir-42" and dogrula(ayrik, kayit)  # NFC sayesinde giriş çalışır
print("tamam")
```

```cikti
tamam
```

Giriş ucunun kuralları:

- "E-posta yok" ile "şifre yanlış" **aynı ileti, aynı kod, aynı süre**. E-posta yoksa da sahte bir özet
  doğrulayın; yoksa yanıt süresi hesabın varlığını söyler.
- Hız sınırı iki anahtarla: IP ve IP + e-posta. Yalnız e-postaya göre kilit koymayın: başkası sizin e-postanızla
  yanlış deneyip sizi kilitler ([Hız sınırı](hiz-siniri-ve-kotuye-kullanim.md)).
- Şifre kuralı: uzunluk (havuzda 10–128) + yaygın parola listesi + kişisel bilgi içermeme. Karakter türü zorunluluğu
  ve dönemsel zorunlu değişiklik yok. Üst sınır şart: megabaytlık "şifre" özet hesabıyla sunucuyu yorar. bcrypt
  ilk 72 bayttan sonrasını yok sayar. Havuzdaki kural: [`passwordPolicy.ts`](../../uygulama/api/src/lib/passwordPolicy.ts).
- Başarısız giriş denetim günlüğüne (IP ve kullanıcı kimliğiyle, parola olmadan).

## Hesap kurtarma: en zayıf halka

- Sıfırlama belirteci: 32 bayt rastgele, veritabanında **özeti**, 1 saat geçerli, **tek kullanımlık**; başarıda
  kullanıcının öteki sıfırlama belirteçleri ve **bütün oturumları** silinir, "şifreniz değişti" e-postası gider.
- "Şifremi unuttum" her durumda aynı yanıtı verir; e-postayı arka planda gönderir (yanıt süresi de aynı kalsın).
- Belirteç adresteyse sayfa `Referrer-Policy: no-referrer` taşısın; adresler günlüğe belirteçle yazılmasın.
- E-posta değiştirme: yeni adrese doğrulama, eski adrese bildirim. İkinci etkeni kapatma ve kurtarma kodu
  yenileme parola (ya da ikinci etken) ister.
- Destek ekibine "hesabımı açın" diyen kişi için yazılı bir doğrulama süreci olmalı; yoksa en kolay saldırı
  telefon görüşmesidir.

Havuzdaki akış: [`auth/service.ts`](../../uygulama/api/src/modules/auth/service.ts) ve
[`docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Hesap varlığı sızıntısı".

## Çok etkenli doğrulama (MFA)

| Etken                         | Güç       | Not                                                              |
| ----------------------------- | --------- | ---------------------------------------------------------------- |
| Geçiş anahtarı (passkey)      | En yüksek | Oltalamaya dayanıklı: anahtar alan adına bağlıdır                |
| TOTP uygulaması (6 haneli kod) | Yüksek   | Oltalama sitesine kod girilebilir; yine de paroladan çok güçlü   |
| SMS kodu                      | Orta      | SIM kopyalama ve yönlendirme riski; yalnız başka seçenek yoksa   |
| E-posta kodu                  | Düşük-orta | E-posta hesabı ele geçerse ikisi birden gider                   |

TOTP (RFC 6238) standart kütüphaneyle yazılır; doğrulamayı RFC'nin sınama vektörleriyle sınayın:

```python calistir
import hashlib
import hmac
import struct


def totp(gizli: bytes, unix: int, basamak: int = 6, adim: int = 30) -> str:
    ozet = hmac.new(gizli, struct.pack(">Q", unix // adim), hashlib.sha1).digest()
    kaydir = ozet[-1] & 0x0F
    kod = (struct.unpack(">I", ozet[kaydir : kaydir + 4])[0] & 0x7FFFFFFF) % 10**basamak
    return str(kod).zfill(basamak)


gizli = b"12345678901234567890"  # RFC 6238 Ek B (SHA-1, 8 hane)
assert totp(gizli, 59, 8) == "94287082" and totp(gizli, 1111111109, 8) == "07081804"


def dogrula(kod: str, simdi: int, son_adim: int) -> int | None:
    """±1 adım saat kayması payı; aynı adım ikinci kez kabul edilmez (yeniden oynatma)."""
    for kayma in (-1, 0, 1):
        adim = simdi // 30 + kayma
        if adim > son_adim and hmac.compare_digest(totp(gizli, adim * 30), kod):
            return adim  # veritabanına "son kullanılan adım" olarak yazılır
    return None


simdi = 1_800_000_000
adim = dogrula(totp(gizli, simdi), simdi + 20, son_adim=0)
assert adim is not None
assert dogrula(totp(gizli, simdi), simdi + 25, son_adim=adim) is None  # aynı kod ikinci kez: red
print("tamam")
```

```cikti
tamam
```

- TOTP gizli anahtarı özetlenemez (sunucu kodu hesaplamak için ona muhtaç): veritabanında **şifreli** saklayın.
- Kurtarma kodları: 8–10 tane, tek kullanımlık, özetli saklanır; kullanıcı ikinci etkeni kaybedince tek yol budur.
- İkinci etken doğrulama ucunda da hız sınırı (6 hane = bir milyon olasılık).

## OAuth 2 ve OIDC, sade anlatım

"Google ile giriş" OIDC'dir (OAuth 2 üstüne kimlik katmanı). Doğru akış **yetki kodu + PKCE**:

1. Uygulama rastgele `code_verifier` üretir, özetini (`code_challenge`) ve rastgele `state` (+ OIDC'de `nonce`)
   değerini oturuma yazar, kullanıcıyı sağlayıcıya yönlendirir.
2. Kullanıcı sağlayıcıda onaylar; sağlayıcı tarayıcıyı `redirect_uri?code=…&state=…` adresine döndürür.
3. Sunucu `state`'i karşılaştırır (CSRF), kodu **sunucudan** `code_verifier` ile belirtece çevirir.
4. Kimlik belirtecini (ID token) doğrular: imza, `iss`, `aud`, `exp`, `nonce`.
5. Kullanıcıyı `iss` + `sub` ile bulur ya da açar ve **kendi oturumunu** başlatır.

```python calistir
import base64
import hashlib
import secrets


def b64url(veri: bytes) -> str:
    return base64.urlsafe_b64encode(veri).rstrip(b"=").decode()


# RFC 7636 Ek B sınama vektörü (S256 yöntemi)
assert b64url(hashlib.sha256(b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk").digest()) == (
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
)
# Gerçek kullanım: her giriş denemesinde yeni değerler
dogrulayici = b64url(secrets.token_bytes(32))  # oturuma yazılır, sağlayıcıya gönderilmez
meydan = b64url(hashlib.sha256(dogrulayici.encode()).digest())  # yönlendirme adresine eklenir
durum = secrets.token_urlsafe(16)  # dönüşte birebir karşılaştırılır
assert len(dogrulayici) == 43 and dogrulayici != meydan
print("tamam")
```

```cikti
tamam
```

- Kullanıcıyı **e-postayla değil `iss` + `sub` ile** tanıyın; e-posta değişir, bazı sağlayıcılarda doğrulanmamış
  olabilir. "Aynı e-posta → var olan hesaba bağla" otomatik yapılırsa doğrulanmamış e-postayla hesap ele geçirilir.
- Örtük akış (implicit) ve tarayıcıda gizli anahtar (client secret) kullanılmaz.
- `redirect_uri` sağlayıcıda tam adres olarak kayıtlı olsun; joker ve açık yönlendirme yok.
- Hazır, bakımı süren bir kütüphane kullanın; akışı elle yazmak yalnız öğrenmek içindir.

## Geçiş anahtarı (passkey)

Kullanıcının cihazı (ya da parola yöneticisi) her site için bir anahtar çifti üretir; sunucu yalnız **açık
anahtarı** ve kimlik bilgisi numarasını saklar. Girişte sunucu rastgele bir meydan okuma gönderir, cihaz özel
anahtarla imzalar. Paylaşılan sır olmadığı için sızacak parola yoktur; imza alan adına bağlı olduğu için sahte
siteye işe yaramaz. Gerçeklemede WebAuthn için bakımı süren bir kütüphane kullanın, meydan okumayı tek kullanımlık
ve kısa süreli tutun, kullanıcıya birden çok anahtar ve bir kurtarma yolu bırakın.

## "Beni hatırla"

| Seçenek                                                       | Ne zaman                                            |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Kayan süreli uzun oturum (havuzda 30 gün, kullanıldıkça uzar)  | Çoğu tüketici uygulaması                            |
| Kısa oturum + ayrı uzun ömürlü "hatırla" belirteci            | Hassas uygulama; belirteç her kullanımda yenilenir  |
| Kutucuk yok, hep kısa oturum                                  | Bankacılık benzeri; paylaşılan cihazlar             |

Hangisi olursa olsun: hassas işlem (şifre değiştirme, hesap silme, e-posta değiştirme, ödeme yöntemi) **yeniden
parola** ister. Havuzdaki hesap silme ucu bunu yapar ([`docs/API.md`](../../uygulama/docs/API.md) →
`DELETE /api/account`).

## Tuzaklar

| Belirti                                                      | Neden                                                 | Çözüm                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| Şifre değişti ama çalınan oturum çalışmaya devam ediyor      | Uzun ömürlü JWT ya da oturumlar silinmiyor            | Sunucu tarafı oturum; değişimde öteki oturumları silin      |
| Bir cihazda kurulan şifre öbüründe "yanlış"                  | Unicode normalleştirme yok                            | Özetten önce NFC                                            |
| Saldırgan kayıtlı e-postaları listeliyor                     | "Bu e-posta kayıtlı değil" iletisi ya da süre farkı   | Tek tip ileti ve sahte özet                                 |
| Kullanıcı tıklamadan sıfırlama bağlantısı "kullanılmış"      | E-posta tarayıcısı GET ile açtı ve sayfa belirteci harcadı | GET formu gösterir; belirteç POST'ta harcanır          |
| Sıfırlama bağlantısı haftalar sonra hâlâ çalışıyor           | Süre ya da tek kullanım yok                           | 1 saat, tek kullanım, yeni istek eskileri iptal eder        |
| Veritabanı yedeği sızınca bütün oturumlar çalındı            | Belirteçler düz metin                                 | Yalnız özet saklayın                                        |
| "Google ile giriş" başkasının hesabına girdi                 | Hesap e-postayla eşlendi                              | `iss` + `sub`; bağlama yalnız oturum açıkken ve onayla      |
| Giriş ucu dakikada binlerce denemeye yanıt veriyor           | Hız sınırı yok                                        | IP ve IP+hesap sınırı                                       |
| Bir kullanıcı başkasını sürekli kilitliyor                   | Yalnız e-postaya göre hesap kilidi                    | Kilit yerine hız sınırı                                     |
| TOTP kodu aynı 30 saniyede iki kez kabul ediliyor            | Son kullanılan adım saklanmıyor                       | Adımı saklayın, eşit ya da küçüğünü reddedin                |
| Belirteçler tahmin edilebiliyor                              | `Math.random()`, zaman damgası ya da kısa kimlik      | Kriptografik rastgele, 32 bayt                              |

## Denetim listesi

- [ ] Oturum belirteci 32 bayt kriptografik rastgele; veritabanında yalnız özeti.
- [ ] Çerez `HttpOnly; Secure; SameSite=Lax; Path=/`, üretimde `__Host-` önekli.
- [ ] Çıkış, şifre değişimi, sıfırlama ve hesap kapatma oturumları sunucuda siliyor (testli).
- [ ] Parola: yavaş özet, parametreler dizgide, NFC, sabit zamanlı karşılaştırma, üst uzunluk sınırı.
- [ ] Giriş ve "şifremi unuttum" yanıtları hesabın varlığını sızdırmıyor (ileti ve süre).
- [ ] Giriş, sıfırlama, MFA uçlarında hız sınırı var; hesap kilidi yok.
- [ ] Sıfırlama belirteci özetli, 1 saatlik, tek kullanımlık; başarıda bütün oturumlar düşüyor ve e-posta gidiyor.
- [ ] Hassas işlemler yeniden parola istiyor.
- [ ] OIDC'de `state`, `nonce`, PKCE ve kimlik belirteci doğrulaması var; kullanıcı `iss`+`sub` ile tanınıyor.
- [ ] Günlükte parola, belirteç, çerez, sıfırlama bağlantısı yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kimlik için havuzdaki oturum modelini kullan (`uygulama/api/src/modules/auth/session.ts`):
  rastgele belirteç, veritabanında SHA-256 özeti, `HttpOnly` çerez. JWT ekleme. Giriş hataları tek tip. Yeni
  güvenlik olayını denetim günlüğüne yaz."
- **Tipik hatalar:** JWT'yi `localStorage`'a koymak; `jwt.decode`'u doğrulama sanmak; `==` ile belirteç
  karşılaştırmak; `Math.random()` ile kod üretmek; "kullanıcı bulunamadı" ile "şifre yanlış"ı ayırmak; sıfırlama
  bağlantısını günlüğe yazmak; çıkışta yalnız çerezi silip sunucu kaydını bırakmak.
- **Çıktıda arayın:** `localStorage.setItem(`, `Math.random`, `decode(`, `=== token`, `console.log(` yakınında
  `token`/`password`/`link`, `expiresIn: '30d'`.
- **Test isteyin:** "şifre değişince eski oturum 401 alır", "aynı sıfırlama bağlantısı ikinci kez çalışmaz",
  "olmayan e-postayla giriş, yanlış şifreyle girişle aynı yanıtı verir".

## İlgili

- [Yetkilendirme](yetkilendirme.md) · [Hız sınırı ve kötüye kullanım](hiz-siniri-ve-kotuye-kullanim.md) ·
  [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md) · [E-posta ve bildirim](e-posta-ve-bildirim.md)
- Güvenlik kümesindeki eşleri: [Oturum güvenliği](../50-guvenlik/oturum-guvenligi.md),
  [Parola ve hesap güvenliği](../50-guvenlik/parola-ve-hesap-guvenligi.md), [CSRF ve CORS](../50-guvenlik/csrf-ve-cors.md),
  [Kriptografi kullanımı](../50-guvenlik/kriptografi-kullanimi.md).
- Çalışan gerçekleme: [`uygulama/api/src/modules/auth/`](../../uygulama/api/src/modules/auth/service.ts),
  parola özeti [`password.ts`](../../uygulama/api/src/lib/password.ts), testler
  [`auth.test.ts`](../../uygulama/api/test/modules/auth.test.ts) ve [`security.test.ts`](../../uygulama/api/test/security.test.ts).
- İmzalı belirteç ve PBKDF2 yardımcıları (Python + TypeScript): [`kutuphane/py/kutuphane/kripto.py`](../../kutuphane/py/kutuphane/kripto.py).
