---
baslik: Kriptografi kullanımı: doğru ilkel, doğru kitaplık
ozet: Kendi kriptonu yazmadan doğru ilkeli seçmek; random ile secrets farkı, sabit zamanlı karşılaştırma, kodlama-özet-şifreleme karışıklığı, anahtar yönetimi ve ECB, nonce yinelemesi, hızlı parola özeti gibi yaygın hatalar.
etiketler: [guvenlik, kriptografi, rastgelelik, anahtar, sifreleme]
duzey: orta
guncellik: 2026-11
---

# Kriptografi kullanımı: doğru ilkel, doğru kitaplık

> Bu notu ne zaman okumalı: kodda `random`, `Math.random`, `md5`, `sha1`, `createCipheriv`, `hmac`, `base64`
> görüldüğünde; bir veriyi "şifrelemek", "imzalamak", "anonimleştirmek" ya da belirteç üretmek gerektiğinde;
> bir model kendi şifreleme biçimini önerdiğinde.

## Temel fikir

Kriptografide hata **sessizdir**: yanlış kod da çalışır, testler geçer, veri "şifreli görünür". Bu yüzden kural
basittir: **kendi kriptonu yazma**. Bu yalnız algoritma icat etmemek değildir; şunlar da "kendi kriptonu yazmak"
sayılır: iki ilkeli elle birleştirmek (şifrele + ayrıca MAC), kendi belirteç biçimini kurmak, parolayı
`sha256`'yı bin kez çalıştırarak özetlemek, `Math.random` ile kod üretmek.

Doğru yol: işi tarif et ("bu veriyi kimse okumasın ve değiştirirse anlaşılsın"), tablodan ilkeli seç, o ilkeli
**üst düzey** bir kitaplıktan kullan, anahtarı koddan ayrı yönet.

## Karar tablosu: hangi iş, hangi ilkel

| İş                                                          | İlkel                                           | Python                                     | Node                                         |
| ----------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Dosya/veri bütünlüğü (sır yok, herkes hesaplar)             | SHA-256                                         | `hashlib.sha256`                           | `createHash('sha256')`                       |
| "Bu mesajı anahtarı bilen biri mi üretti?" (ortak sır)      | HMAC-SHA256                                     | `hmac.new(k, m, sha256)`                   | `createHmac('sha256', k)`                    |
| Veriyi gizlemek + değiştirilmediğini anlamak                | Doğrulamalı şifreleme (AEAD): AES-256-GCM, ChaCha20-Poly1305 | `cryptography` (AESGCM, Fernet)  | `createCipheriv('aes-256-gcm')`              |
| Herkesin doğrulayabileceği imza (tek kişi imzalar)          | Ed25519                                         | `cryptography` (Ed25519)                   | `generateKeyPairSync('ed25519')`, `sign`     |
| Parola saklama                                              | Argon2id / scrypt / bcrypt                      | `hashlib.scrypt`                           | `scrypt`                                     |
| Yüksek entropili sırdan alt anahtar türetme                 | HKDF                                            | `cryptography` (HKDF)                      | `hkdfSync`                                   |
| Belirteç, kod, tuz, nonce üretme                            | İşletim sisteminin rastgele kaynağı             | `secrets`                                  | `randomBytes`, `randomInt`, `randomUUID`     |
| İki makine arası güvenli kanal                              | TLS (kendiniz kurmayın)                         | `ssl` varsayılan bağlam                    | `https`, `fetch`                             |

Python standart kitaplığında simetrik şifreleme **yoktur**; `cryptography` paketi kullanılır (sürüm ve API'yi kurulu
paketten doğrulayın). Node'da AEAD ve Ed25519 yerleşiktir (aşağıda çalışır). Tarayıcıda `crypto.subtle`.

## Rastgelelik: `random` ile `secrets`

`random` (Python) ve `Math.random` (JavaScript) benzetim ve oyun içindir: çıktıları tohumdan ve önceki
çıktılardan hesaplanabilir. Belirteç, sıfırlama kodu, tuz, nonce, davet bağlantısı için işletim sisteminin
kriptografik kaynağı kullanılır.

```python calistir
import hmac
import random
import secrets
import string

HARFLER = string.ascii_letters + string.digits


# YANLIŞ: tohumu sunucu saati olan "rastgele" belirteç
def belirtec_yanlis(zaman: int) -> str:
    uretec = random.Random(zaman)
    return "".join(uretec.choice(HARFLER) for _ in range(20))


uretilen = belirtec_yanlis(1_800_000_123)
# TEST: yaklaşık zamanı bilen biri belirteci yeniden üretir
assert any(belirtec_yanlis(t) == uretilen for t in range(1_800_000_000, 1_800_000_200))

# DOĞRU
belirtec = secrets.token_urlsafe(32)  # 32 bayt = 256 bit → 43 karakter
kod = f"{secrets.randbelow(10**6):06d}"  # 6 haneli kod: yalnız hız sınırıyla birlikte güvenli
assert len(belirtec) == 43 and len(kod) == 6

# Sabit zamanlı karşılaştırma: == ilk farklı karakterde durur (süre bilgi sızdırır)
assert hmac.compare_digest(b"abc", b"abc") and not hmac.compare_digest("abc", "abd")
try:
    hmac.compare_digest("şifre", "şifre")  # tuzak: ASCII dışı str kabul edilmez
    raise AssertionError("TypeError bekleniyordu")
except TypeError:
    pass
print("tamam")
```

```cikti
tamam
```

- Node'da `timingSafeEqual` farklı uzunlukta tamponlarda **hata fırlatır**; önce iki tarafın özetini (sabit
  uzunluk) alıp onları karşılaştırmak iki sorunu birden çözer.
- `uuid4` kriptografik kaynaktan üretilir ve tahmin edilemez kimlik olarak iş görür; UUIDv1/v7 **zaman taşır**,
  kimliktir, sır değildir.

## Kodlama, özet, şifreleme: karıştırılan üçlü

| İşlem                       | Geri döner mi            | Anahtar   | Ne için                                     |
| --------------------------- | ------------------------ | --------- | ------------------------------------------- |
| Kodlama (base64, onaltılık) | Herkes geri çevirir      | Yok       | İkili veriyi metinde taşımak; **gizlemez**  |
| Özet (SHA-256)              | Hayır, ama tahmin edilebilir girdide bulunur | Yok | Bütünlük, eşleştirme                      |
| HMAC                        | Hayır                    | Var       | Kimin ürettiğini doğrulamak; takma ad       |
| Şifreleme (AEAD)            | Anahtarla geri döner     | Var       | Gizlemek + değişikliği yakalamak            |

En pahalı karışıklık: **küçük bir alandan gelen veriyi özetleyip "anonim" saymak.** Doğum tarihi, telefon,
T.C. kimlik numarası, plaka gibi değerlerin bütün olasılıkları sayılabilir; özet bir arama tablosuyla geri
çözülür.

```python calistir
import base64
import datetime
import hashlib
import hmac
import secrets

# Kodlama gizlemez
assert base64.b64decode(base64.b64encode("parola123".encode())).decode() == "parola123"

# YANLIŞ: doğum tarihini SHA-256'layıp "anonim" paylaşmak
ozet = hashlib.sha256(b"1987-03-14").hexdigest()
gun = datetime.date(1920, 1, 1)
tablo = {}
while gun.year < 2020:  # 100 yılın bütün günleri: ~36 500 özet, milisaniyeler
    tablo[hashlib.sha256(gun.isoformat().encode()).hexdigest()] = gun.isoformat()
    gun += datetime.timedelta(days=1)
assert tablo[ozet] == "1987-03-14"  # TEST: özet geri çözüldü

# DAHA İYİ: gizli anahtarlı takma ad (HMAC). Anahtarsız sayılamaz; anahtar sahibi için hâlâ kişisel veridir.
ANAHTAR = secrets.token_bytes(32)  # ayrı saklanır; sızarsa takma adlar da çözülür
takma = hmac.new(ANAHTAR, b"1987-03-14", hashlib.sha256).hexdigest()
assert takma not in tablo and takma == hmac.new(ANAHTAR, b"1987-03-14", hashlib.sha256).hexdigest()
print("tamam")
```

```cikti
tamam
```

Takma adlandırma KVKK açısından anonimleştirme değildir: [KVKK pratiği](kvkk-pratik.md). Parolada da aynı neden
geçerlidir: hızlı özet (MD5, SHA-1, SHA-256) saniyede milyarlarca denemeye izin verir; parola yavaş özetle
saklanır ([Parola ve hesap](parola-ve-hesap-guvenligi.md)).

## Doğru şifreleme: AEAD ve imza (Node, yerleşik)

```js calistir
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto'

const anahtar = randomBytes(32) // gerçekte anahtar yönetiminden gelir, koddan değil

function sifrele(metin, ekVeri) {
  const nonce = randomBytes(12) // her şifrelemede YENİ; aynı anahtarla asla yinelenmez
  const c = createCipheriv('aes-256-gcm', anahtar, nonce)
  c.setAAD(Buffer.from(ekVeri)) // şifrelenmez ama bağlanır: başka kayda taşınamaz
  const govde = Buffer.concat([c.update(metin, 'utf8'), c.final()])
  return Buffer.concat([nonce, c.getAuthTag(), govde]).toString('base64url')
}

function coz(paket, ekVeri) {
  const ham = Buffer.from(paket, 'base64url')
  const d = createDecipheriv('aes-256-gcm', anahtar, ham.subarray(0, 12))
  d.setAAD(Buffer.from(ekVeri))
  d.setAuthTag(ham.subarray(12, 28))
  return Buffer.concat([d.update(ham.subarray(28)), d.final()]).toString('utf8') // etiket tutmazsa fırlatır
}

const paket = sifrele('IBAN: TR00 0000 …', 'kullanici:42')
assert.equal(coz(paket, 'kullanici:42'), 'IBAN: TR00 0000 …')
assert.notEqual(sifrele('aynı', 'k'), sifrele('aynı', 'k')) // rastgele nonce: aynı metin farklı çıktı
// TEST: başka kayda taşınan ya da tek biti değişen paket reddedilir
assert.throws(() => coz(paket, 'kullanici:43'))
const bozuk = Buffer.from(paket, 'base64url')
bozuk[bozuk.length - 1] ^= 1
assert.throws(() => coz(bozuk.toString('base64url'), 'kullanici:42'))

// İmza: özel anahtarla imzala, herkes açık anahtarla doğrulasın (güncelleme dosyası, lisans)
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const bildirim = Buffer.from('surum=1.4.2;sha256=ab12…')
const imza = sign(null, bildirim, privateKey)
assert.equal(verify(null, bildirim, publicKey, imza), true)
assert.equal(verify(null, Buffer.from('surum=1.4.3;sha256=ab12…'), publicKey, imza), false)
console.log('tamam')
```

```cikti
tamam
```

Bu biçim (nonce + etiket + şifreli metin) örnek içindir; gerçek projede hazır bir biçim kullanın (Python'da
`cryptography`'nin Fernet'i ya da AESGCM'i) ve anahtar sürümünü pakete yazın (aşağıda). Rastgele 96 bitlik
nonce ile bir anahtar sınırsız sayıda mesajı şifrelemez; çok yüksek hacimde anahtarı düzenli döndürün (üst sınır
için NIST SP 800-38D'ye bakın, doğrulanmadı).

## Yaygın hatalar: gösterim

İki klasik hatanın etkisi, gerçek AES ile:

```js calistir
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'

const anahtar = randomBytes(32)

// YANLIŞ 1: ECB kipi — aynı açık blok, aynı şifreli blok (desen görünür kalır)
const blok = Buffer.from('MAAS:85000 TL...') // 16 bayt = bir AES bloğu
const ecb = createCipheriv('aes-256-ecb', anahtar, null)
const c = Buffer.concat([ecb.update(Buffer.concat([blok, blok])), ecb.final()])
assert.ok(c.subarray(0, 16).equals(c.subarray(16, 32))) // "bu iki kişinin maaşı aynı" sızdı

// YANLIŞ 2: aynı anahtar + aynı nonce ile iki mesaj (akış/CTR/GCM kiplerinde)
const sabitNonce = randomBytes(16)
const ctr = (m) => {
  const x = createCipheriv('aes-256-ctr', anahtar, sabitNonce)
  return Buffer.concat([x.update(m), x.final()])
}
const p1 = Buffer.from('ad=Ayse;maas=85000')
const p2 = Buffer.from('ad=Ali_;maas=92500')
const c1 = ctr(p1)
const c2 = ctr(p2)
const cozulen = Buffer.from(c1.map((b, i) => b ^ c2[i] ^ p1[i])) // anahtar hiç kullanılmadı
assert.equal(cozulen.toString(), 'ad=Ali_;maas=92500') // bir mesajı bilen, ötekini okur
console.log('tamam')
```

```cikti
tamam
```

| Hata                                                   | Sonuç                                              | Doğrusu                                               |
| ------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| ECB kipi                                               | Desen sızar                                        | AEAD (GCM, ChaCha20-Poly1305)                         |
| Sabit/yinelenen IV veya nonce                          | Mesajlar birbirini açar; GCM'de değiştirme mümkün   | Her şifrelemede rastgele nonce; kitaplığa bırakın     |
| Doğrulamasız şifreleme (CBC/CTR tek başına)            | Şifreli metin fark edilmeden değiştirilir          | AEAD                                                  |
| MD5/SHA-1/SHA-256 ile parola                           | Saniyede milyarlarca deneme                         | Argon2id/scrypt/bcrypt                                |
| `sha256(gizli + mesaj)` ile imza                       | Uzunluk uzatma saldırısına açık (SHA-256 gibi özetlerde) | HMAC                                            |
| `==` ile MAC/belirteç karşılaştırma                    | Süre farkı                                          | `compare_digest` / `timingSafeEqual`                  |
| Paroladan doğrudan anahtar (`sha256(parola)`)          | Sözlükle bulunur                                    | scrypt/Argon2 ile türetme (tuzlu)                     |
| Bir anahtarı iki işte (şifreleme + imza) kullanmak     | Bir işteki zayıflık ötekine geçer                   | İş başına ayrı anahtar ya da HKDF ile türetme          |
| TLS doğrulamasını kapatmak (`verify=False`)            | Araya giren herkes okur ve değiştirir              | Doğru kök sertifikalar; geliştirmede de açık          |
| Anahtarı verinin yanında saklamak                      | Veri sızınca anahtar da gider                      | Anahtar yönetimi (aşağıda)                            |
| JWT'de `alg` başlığına güvenmek                        | İmzasız ya da yanlış algoritmalı belirteç geçer     | [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md)  |

## Anahtar yönetimi

- **Nerede:** kodda ve depoda değil; ortam değişkeni/sır yöneticisi ([Sır yönetimi](sir-yonetimi.md)).
- **Ayrım:** iş başına ayrı anahtar (oturum imzası, alan şifreleme, takma ad, webhook imzası); ortam başına
  ayrı anahtar (geliştirme anahtarı üretimde geçmez).
- **Döndürme:** paket hangi anahtarla üretildiğini söylemeli; yeni anahtar eklenir, bir süre eskisi yalnız
  doğrulama/çözme için kalır, sonra silinir. İmza anahtarı için anahtar halkası örneği:
  [Yapılandırma ve sırlar → Anahtar döndürme](../30-arkauc/yapilandirma-ve-sirlar.md).
- **Zarf şifreleme (envelope encryption):** veriyi kayda özgü bir **veri anahtarı** şifreler; veri anahtarı bir
  **ana anahtarla** sarılıp kaydın yanında durur. Ana anahtar bir anahtar yönetim hizmetinde kalır, uygulamaya
  çıkmaz. Döndürmede yalnız küçük veri anahtarları yeniden sarılır; büyük şifreli veri değişmez.

```js calistir
import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function muhurle(anahtar, veri, ekVeri) {
  const nonce = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', anahtar, nonce)
  c.setAAD(Buffer.from(ekVeri))
  const govde = Buffer.concat([c.update(veri), c.final()])
  return Buffer.concat([nonce, c.getAuthTag(), govde])
}
function ac(anahtar, paket, ekVeri) {
  const d = createDecipheriv('aes-256-gcm', anahtar, paket.subarray(0, 12))
  d.setAAD(Buffer.from(ekVeri))
  d.setAuthTag(paket.subarray(12, 28))
  return Buffer.concat([d.update(paket.subarray(28)), d.final()])
}

// Ana anahtarlar: gerçekte anahtar yönetim hizmetinde durur; burada gösterim için bellekte
const anaAnahtarlar = new Map([['ana-1', randomBytes(32)]])
function anaAnahtar(kimlik) {
  const anahtar = anaAnahtarlar.get(kimlik)
  if (!anahtar) throw new Error(`ana anahtar yok: ${kimlik} (kayıt döndürülmemiş)`)
  return anahtar
}

function kaydet(metin, kayitKimligi) {
  const veriAnahtari = randomBytes(32) // her kayda ayrı
  return {
    ana: 'ana-1',
    sarili: muhurle(anaAnahtar('ana-1'), veriAnahtari, 'ana-1'),
    sifreli: muhurle(veriAnahtari, Buffer.from(metin), kayitKimligi),
  }
}
function oku(kayit, kayitKimligi) {
  const veriAnahtari = ac(anaAnahtar(kayit.ana), kayit.sarili, kayit.ana)
  return ac(veriAnahtari, kayit.sifreli, kayitKimligi).toString()
}
function yenidenSar(kayit, yeniAna) {
  const veriAnahtari = ac(anaAnahtar(kayit.ana), kayit.sarili, kayit.ana)
  return { ...kayit, ana: yeniAna, sarili: muhurle(anaAnahtar(yeniAna), veriAnahtari, yeniAna) }
}

const kayit = kaydet('IBAN: TR00 0000 …', 'kullanici:7')
assert.equal(oku(kayit, 'kullanici:7'), 'IBAN: TR00 0000 …')
anaAnahtarlar.set('ana-2', randomBytes(32)) // 1) yeni ana anahtar
const donmus = yenidenSar(kayit, 'ana-2') // 2) yalnız veri anahtarı yeniden sarıldı
assert.ok(donmus.sifreli.equals(kayit.sifreli)) // büyük veri aynen duruyor
anaAnahtarlar.delete('ana-1') // 3) bütün kayıtlar döndürülünce eski ana anahtar silinir
// TEST: döndürülen kayıt açılır; döndürülmemiş kopya ve başka kayda taşınan veri açılmaz
assert.equal(oku(donmus, 'kullanici:7'), 'IBAN: TR00 0000 …')
assert.throws(() => oku(kayit, 'kullanici:7'), /ana anahtar yok/)
assert.throws(() => oku(donmus, 'kullanici:8'))
console.log('tamam')
```

```cikti
tamam
```

## Tuzaklar

| Belirti                                                          | Neden                                                  | Çözüm                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Sıfırlama kodları tahmin edildi                                  | `random`/`Math.random`, zaman tohumu                   | `secrets` / `randomBytes`                                        |
| `TypeError: comparing strings with non-ASCII characters`         | `compare_digest` Türkçe karakterli `str` aldı           | Bayt ya da onaltılık özet karşılaştırın                           |
| `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`                            | Farklı uzunlukta tampon                                 | Önce ikisinin özetini alın                                       |
| "Şifreli" alan base64 ile açıldı                                 | Kodlama şifreleme sanıldı                              | AEAD + anahtar                                                   |
| "Anonim" veri kümesinde kişiler bulundu                          | Küçük alanlı değerler tuzsuz özetlenmiş                | Anahtarlı HMAC; mümkünse veriyi hiç paylaşmamak                  |
| Şifre çözme ara sıra "unable to authenticate" veriyor            | Nonce ya da etiket yanlış kesilmiş, ek veri farklı     | Paket biçimini tek yardımcıda toplayın; gidiş-dönüş testi        |
| Anahtar döndürünce eski veriler açılmıyor                        | Pakette anahtar kimliği yok                            | Anahtar kimliği + anahtarlık                                     |
| Geliştirme anahtarıyla imzalanmış belirteç üretimde geçti         | Ortamlar aynı anahtarı kullanıyor                      | Ortam başına anahtar; üretimde varsayılan anahtar reddi          |
| Model "basit XOR şifreleme" ya da kendi biçimini yazdı            | Kendi kriptosu                                         | Tablodaki kitaplık çağrısı; kendi biçim yok                      |

## Denetim listesi

- [ ] Güvenlikle ilgili her rastgele değer `secrets`/`randomBytes`/`getRandomValues` ile üretiliyor.
- [ ] Belirteç, MAC, özet karşılaştırmaları sabit zamanlı.
- [ ] Şifreleme AEAD ile, nonce her seferinde yeni; ECB, sabit IV, doğrulamasız kip yok.
- [ ] Parolalar yavaş özetle; MD5/SHA-1 yalnız güvenlik dışı işlerde (önbellek anahtarı gibi) ve yanında yorumla.
- [ ] "Anonim" denilen veri özetle değil, gerçekten anonimleştirilmiş ya da anahtarlı takma adla işleniyor.
- [ ] Anahtarlar koddan ve depodan ayrı; iş ve ortam başına ayrı; paketler anahtar kimliği taşıyor.
- [ ] TLS doğrulaması hiçbir yerde kapalı değil.
- [ ] Şifreleme/imza yardımcıları tek dosyada; gidiş-dönüş, kurcalama ve yanlış anahtar testleri var.

## Küçük modele yaptırırken

- **İsteme yazın:** "Kendi şifreleme biçimini yazma. Şifreleme için [kitaplık + işlev], imza için Ed25519,
  belirteç için `secrets.token_urlsafe(32)`. Anahtarı ortam değişkeninden oku; yoksa başlama. Gidiş-dönüş,
  kurcalanmış veri ve yanlış anahtar testlerini yaz."
- **Modelin tipik hatası:** `random`/`Math.random` ile kod; `hashlib.md5(parola)`; AES'i ECB ya da sabit IV ile
  kullanmak; `==` ile imza karşılaştırmak; anahtarı koda gömmek; "base64'le şifreledim" demek; `verify=False` ile
  sertifika hatasını "çözmek".
- **Çıktıda denetleyin:** `random.`, `Math.random`, `md5`, `sha1`, `ecb`, sabit `iv =`, `verify=False`,
  `rejectUnauthorized: false`, kodda 32+ karakterlik sabit dizgiler.
- **Test isteyin:** "aynı metin iki kez şifrelenince farklı çıktı", "tek bit değişince çözme hata verir",
  "eski anahtar silinince eski paket reddedilir".

## İlgili

- Yapı taşlarının içi, RFC sınama vektörleriyle: [`sifirdan/ag/kripto_egitim/README.md`](../../sifirdan/ag/kripto_egitim/README.md)
  (nonce yinelemesi ve sabit zamanlı karşılaştırma testleri dahil)
- İki dilde HMAC, imzalı belirteç, PBKDF2 yardımcıları: [`kutuphane/py/kutuphane/kripto.py`](../../kutuphane/py/kutuphane/kripto.py),
  [`kutuphane/ts/src/kripto.ts`](../../kutuphane/ts/src/kripto.ts)
- Belirteç ve özeti: [`uygulama/api/src/lib/random.ts`](../../uygulama/api/src/lib/random.ts) · Parola:
  [Parola ve hesap güvenliği](parola-ve-hesap-guvenligi.md) · Sırlar: [Sır yönetimi](sir-yonetimi.md)
