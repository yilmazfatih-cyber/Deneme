---
baslik: Parola ve hesap güvenliği
ozet: Parola özetinin parametre seçimi, eski özetlerden göç ve yükseltme, yaygın parola reddi, hesap numaralandırma, kaba kuvvet ve hız sınırı, hesap kurtarma ve iki aşamalı doğrulamanın işletilmesi; çalışan scrypt örnekleri.
etiketler: [guvenlik, parola, scrypt, hesap, hiz-siniri, iki-asamali]
duzey: orta
guncellik: 2026-11
---

# Parola ve hesap güvenliği

> Bu notu ne zaman okumalı: parola saklama kodu yazılırken ya da eski bir sistemden kullanıcı taşınırken; giriş,
> kayıt, şifremi unuttum, iki aşamalı doğrulama uçları eklenirken; "biri hesabıma girdi" ya da "giriş ucuna
> dakikada binlerce istek geliyor" bildiriminde. Oturum açıldıktan sonrası: [Oturum güvenliği](oturum-guvenligi.md).

## Temel fikir

Parola güvenliği üç ayrı işin toplamıdır; birinin zayıflığı ötekileri boşa çıkarır:

1. **Saklama:** veritabanı sızsa da parolalar kolay çıkarılamasın. Yavaş, bellek isteyen, tuzlu özet; parametre
   özet dizgisinde; yükseltme yolu hazır.
2. **Giriş ucu:** deneme maliyetli olsun, hesabın varlığı sızmasın, kimse başkasını kilitleyemesin.
3. **Kurtarma ve ikinci etken:** parola unutulunca ya da çalınınca hesap kime açılıyor? Saldırgan ön kapıyı değil
   bu arka kapıyı dener.

Temeller (oturum mu belirteç mi, NFC normalleştirme, sıfırlama belirteci, TOTP hesabı, OAuth) zaten
[Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) notundadır; bu not güvenlik tarafını ve işletmeyi anlatır.

## Karar tablosu

| Konu                         | Seçim                                                                       | Neden                                                         |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Özet algoritması             | Argon2id; yoksa scrypt (stdlib'de var); yoksa bcrypt; son çare PBKDF2-SHA256 | Hepsi kasıtlı yavaş; ilk ikisi bellek de ister                |
| Parametre                    | Hedef makinede ölç: giriş başına kabul edilebilir süre ve eşzamanlı giriş × bellek | Ezber sayı eskir; o günkü OWASP önerisini doğrulayın     |
| Özet dizgisi                 | `algoritma$parametreler$tuz$özet`                                           | Parametre yükselince eskiler doğrulanır, girişte yükseltilir  |
| Biber (pepper, sunucu sırrı)  | İsteğe bağlı ek kat; sır ayrı yerde                                         | Yalnız veritabanı sızarsa işe yarar; döndürmesi zordur        |
| Parola kuralı                | Uzunluk (havuzda 10–128) + yaygın parola listesi + kişisel bilgi içermeme   | Karakter türü zorunluluğu ve dönemsel değişim zayıf parola doğurur |
| Hesap kilidi                 | Yok; yerine IP ve IP+hesap hız sınırı, artan bekleme                        | E-postaya göre kilit başkasının sizi kilitlemesine izin verir  |
| İkinci etken                 | Geçiş anahtarı ya da TOTP; yöneticide zorunlu                               | Çalınmış parolayı tek başına yetersiz kılar                   |

## Parametre seçimi: ölç, hesapla

scrypt'in belleği yaklaşık `128 × N × r` bayttır. `N=2^14, r=8` → 16 MiB. Aynı anda 10 giriş hesaplanırsa
160 MiB: küçük bir sunucuda bu, parametrenin ve eşzamanlılık sınırının birlikte seçilmesi demektir (havuzdaki
API aynı anda en çok 2 özet hesaplar).

```python calistir
import hashlib
import time


def bellek_mib(n: int, r: int) -> float:
    return 128 * n * r / 2**20


assert bellek_mib(2**14, 8) == 16 and bellek_mib(2**15, 8) == 32

# Tuzak: OpenSSL'in varsayılan bellek sınırı N=2^15, r=8'e yetmez
try:
    hashlib.scrypt(b"parola", salt=b"t" * 16, n=2**15, r=8, p=1, dklen=32)
    raise AssertionError("bellek sınırı hatası bekleniyordu")
except ValueError as hata:
    assert "memory limit exceeded" in str(hata)
# Çözüm: maxmem'i parametreden hesaplayın
hashlib.scrypt(b"parola", salt=b"t" * 16, n=2**15, r=8, p=1, dklen=32, maxmem=2 * 128 * 2**15 * 8)

# Ölçüm: bu satırları ÜRETİM makinesinde çalıştırın; sonuç makineye ve yüke göre değişir
for n in (2**14, 2**15):
    baslangic = time.perf_counter()
    hashlib.scrypt(b"parola", salt=b"t" * 16, n=n, r=8, p=1, dklen=32, maxmem=2 * 128 * n * 8)
    print(f"N=2^{n.bit_length() - 1}, r=8: {bellek_mib(n, 8):.0f} MiB, {(time.perf_counter() - baslangic) * 1000:.0f} ms")
```

Seçim kuralı: girişin kabul edilebilir gecikmesi (çoğu uygulamada onda bir saniye mertebesi) ve sunucunun aynı anda
kaç özet hesaplayacağı. Havuzdaki seçim ve gerekçesi (N=2^14, r=8, p=5):
[`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Parola özeti".

## Yükseltme ve eski özetten göç

Parola yalnız **başarılı giriş anında** elinizdedir; yeniden özetleme o an yapılır. Eski sistemden gelen hızlı
özetler (MD5, SHA-1, tuzsuz SHA-256) ise girişi beklemez: **bugün** yavaş özetin içine sarılır, kullanıcı ilk
girişinde düz yavaş özete geçer. Bekleyen her gün, sızıntıda kırılabilecek bir gündür.

```python calistir
import base64
import hashlib
import hmac
import os

GUNCEL = (2**14, 8, 1)


def b64(veri: bytes) -> str:
    return base64.urlsafe_b64encode(veri).rstrip(b"=").decode()


def b64_coz(metin: str) -> bytes:
    return base64.urlsafe_b64decode(metin + "=" * (-len(metin) % 4))


def turet(girdi: str, tuz: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(girdi.encode(), salt=tuz, n=n, r=r, p=p, dklen=32, maxmem=2 * 128 * n * r)


def ozetle(parola: str, tur: str = "scrypt", params: tuple[int, int, int] = GUNCEL) -> str:
    tuz = os.urandom(16)
    return f"{tur}${params[0]}${params[1]}${params[2]}${b64(tuz)}${b64(turet(parola, tuz, *params))}"


def eski_md5(parola: str) -> str:  # eski sistemden kalma: hızlı ve tuzsuz (YANLIŞ saklama)
    return hashlib.md5(parola.encode()).hexdigest()


def dogrula(parola: str, kayit: str) -> bool:
    tur, n, r, p, tuz, beklenen = kayit.split("$")
    girdi = eski_md5(parola) if tur == "scrypt-md5" else parola
    return hmac.compare_digest(turet(girdi, b64_coz(tuz), int(n), int(r), int(p)), b64_coz(beklenen))


def giris(parola: str, kayit: str) -> tuple[bool, str]:
    if not dogrula(parola, kayit):
        return False, kayit
    tur, n, r, p, *_ = kayit.split("$")
    if tur != "scrypt" or (int(n), int(r), int(p)) != GUNCEL:
        kayit = ozetle(parola)  # parola şu an elimizde: tek fırsat
    return True, kayit


# 1) Eski parametreli kayıt girişte yükseltilir
eski = ozetle("güneşli-gün", params=(2**12, 8, 1))
tamam, yeni = giris("güneşli-gün", eski)
assert tamam and yeni.startswith(f"scrypt${2**14}$8$1$")
# 2) MD5 dökümü parola bilinmeden HEMEN sarılır; ilk girişte düz scrypt'e geçer
sarili = ozetle(eski_md5("eski-parola-1"), tur="scrypt-md5")
tamam, yeni = giris("eski-parola-1", sarili)
assert tamam and yeni.startswith("scrypt$")
# TEST: yanlış parola hiçbir şeyi değiştirmez
assert giris("yanlis", sarili) == (False, sarili)
print("tamam")
```

```cikti
tamam
```

Karşılaştırma sabit zamanlıdır; Python'da `hmac.compare_digest` ASCII dışı `str` alırsa `TypeError` verir:
bayt ya da onaltılık/base64 dizge karşılaştırın ([Kriptografi kullanımı](kriptografi-kullanimi.md)).

## Parola kuralları ve yaygın parolalar

- Uzunluk alt sınırı + **üst sınırı** (havuzda 128). Üst sınır olmadan megabaytlık "parola" her denemede yavaş
  özetle işlenir. bcrypt ilk 72 bayttan sonrasını yok sayar; uzun parolayı kesmeyin, başka algoritma seçin.
- Yaygın parola listesi (Türkçe olanlar dahil: takım adları, `sifre123`, `seniseviyorum`) ve "yaygın sözcük +
  rakam" kalıbı reddedilir; karşılaştırma büyük/küçük harf ve Türkçe işaret duyarsızdır. Çalışan kural ve lisanslı
  liste: [`passwordPolicy.ts`](../../uygulama/api/src/lib/passwordPolicy.ts).
- Sızmış parola denetimi (isteğe bağlı): bazı hizmetler "k-anonimlik" ile çalışır; parolanın SHA-1 özetinin
  yalnız ilk 5 onaltılık hanesi gönderilir, eşleşme yerelde yapılır. Hizmetin adresi ve koşulları değişebilir;
  kullanmadan önce doğrulayın, hizmete ulaşılamazsa kaydı engellemeyin.
- Parola yöneticisi dostu olun: yapıştırmayı engellemeyin, `autocomplete="new-password"` / `current-password`.

## Hesap numaralandırma

Saldırgan önce hangi e-postaların kayıtlı olduğunu öğrenir (oltalama ve parola denemesi için). Her uç aynı soruya
cevap vermemelidir:

| Uç                        | Sızdıran davranış                               | Güvenli davranış                                                   |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| Giriş                     | "Kullanıcı bulunamadı" / yanıt süresi farkı     | Tek ileti, tek kod; hesap yoksa da sahte özet doğrulanır            |
| Şifremi unuttum           | "Bu e-posta kayıtlı değil"                      | Her durumda aynı yanıt; e-posta arka planda                         |
| Kayıt                     | "Bu e-posta zaten kullanılıyor"                 | Bilinçli ödün ya da "e-postanıza bağlantı gönderdik" akışı + hız sınırı |
| E-posta değiştirme        | "Bu adres başka hesapta"                        | Doğrulama bağlantısı yeni adrese; sonuç sonra bildirilir            |
| Davet/sıfırlama önizleme  | "Süresi dolmuş" ile "yok" ayrı                  | Hepsi aynı `invalid_token`                                          |
| Profil adresi `/u/ayse`   | Kullanıcı adının varlığı                         | Herkese açık profil bir ürün kararıdır; kararı bilerek verin        |

Süre farkı sayaçla, yani belirlenimci olarak sınanabilir:

```python calistir
import hashlib
import hmac
import os

SAYAC = {"ozet": 0}


def yavas_ozet(parola: str, tuz: bytes) -> bytes:
    SAYAC["ozet"] += 1
    return hashlib.scrypt(parola.encode(), salt=tuz, n=2**12, r=8, p=1, dklen=32)


TUZ = os.urandom(16)
HESAPLAR = {"ayse@ornek.test": (TUZ, yavas_ozet("doğru parola", TUZ))}
SAHTE = (os.urandom(16), b"\x00" * 32)


# YANLIŞ: hesap yoksa hızlı döner ve farklı ileti verir
def giris_yanlis(eposta: str, parola: str) -> str:
    if eposta not in HESAPLAR:
        return "kullanıcı bulunamadı"
    tuz, ozet = HESAPLAR[eposta]
    return "tamam" if hmac.compare_digest(yavas_ozet(parola, tuz), ozet) else "parola yanlış"


# DOĞRU: her yol bir özet hesaplar ve aynı iletiyi verir
def giris(eposta: str, parola: str) -> str:
    kayit = HESAPLAR.get(eposta)
    tuz, ozet = kayit or SAHTE
    dogru = hmac.compare_digest(yavas_ozet(parola, tuz), ozet)
    return "tamam" if kayit and dogru else "e-posta ya da parola yanlış"


def calistir(islev, *arg) -> tuple[str, int]:
    once = SAYAC["ozet"]
    return islev(*arg), SAYAC["ozet"] - once


# TEST: kayıtlı ve kayıtsız e-posta aynı yanıtı alır ve aynı işi yaptırır
assert calistir(giris_yanlis, "yok@ornek.test", "x") == ("kullanıcı bulunamadı", 0)
assert calistir(giris_yanlis, "ayse@ornek.test", "x") == ("parola yanlış", 1)
assert calistir(giris, "yok@ornek.test", "x") == calistir(giris, "ayse@ornek.test", "x") == ("e-posta ya da parola yanlış", 1)
assert calistir(giris, "ayse@ornek.test", "doğru parola") == ("tamam", 1)
print("tamam")
```

```cikti
tamam
```

## Kaba kuvvet ve hız sınırı

| Saldırı                                    | Belirti                                            | Anahtar ve önlem                                                     |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| Kaba kuvvet (tek hesap, çok parola)        | Bir hesapta art arda başarısız giriş               | IP + hesap sayacı; artan bekleme; hesap sahibine bildirim            |
| Parola püskürtme (çok hesap, yaygın parola) | Bir IP'den çok hesaba birkaç deneme                | IP sayacı; yaygın parola reddi zaten kırar                           |
| Kimlik bilgisi doldurma (sızmış çiftler)   | Çok IP'den, çok hesaba, normalden yüksek başarı    | Küresel başarısız giriş oranı alarmı; yeni cihazda ek doğrulama; ikinci etken |
| Kilitleme saldırısı                        | Kullanıcı "giremiyorum" diyor, kendisi denemiyor   | E-postaya göre kilit yok; yalnız yavaşlatma                           |
| İkinci etken deneme                        | 6 haneli kodda art arda deneme                     | Kod ucunda ayrı ve sıkı sınır; başarısızlıkta oturum adımı düşer      |

- Yanıt `429` + `Retry-After`. Sınır aşımı ve başarısız giriş denetim günlüğüne
  ([Günlük ve izleme](gunluk-ve-izleme-guvenlik.md)); kullanıcı başına sınır, dağıtık saldırıda IP sınırından önemlidir.
- Gerçek IP'yi doğru okumak hız sınırının ön şartıdır (ters vekil sayısı: `TRUST_PROXY`).
- Havuzdaki sınırlar ve gerekçeleri: [`rateLimit.ts`](../../uygulama/api/src/http/rateLimit.ts) → `RATE_RULES`;
  bağımsız jeton kovası/kayan pencere: [`kutuphane/py/kutuphane/hiz_siniri.py`](../../kutuphane/py/kutuphane/hiz_siniri.py).

## Hesap kurtarma güvenliği

Sıfırlama belirtecinin kuralları (tek kullanım, 1 saat, özetli, başarıda bütün oturumlar düşer)
[Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) notundadır. Ek olarak:

- **Güvenlik soruları kullanmayın** ("annenizin kızlık soyadı" araştırılarak bulunur).
- Kurtarma **ikinci etkeni atlamamalı**: e-postayla parola sıfırlanabilir, ama ikinci etkenin sıfırlanması
  kurtarma koduyla ya da bekleme süreli, her kanala bildirimli bir süreçle olur.
- Her kurtarma ve hesap değişikliği (e-posta, parola, ikinci etken) **eski** iletişim adresine de bildirilir:
  "Bunu siz yapmadıysanız…" bağlantısıyla.
- Destek ekibinin "hesabımı açın" isteği için yazılı kimlik doğrulama adımları; telefon görüşmesiyle hesap
  devri en kolay saldırıdır.
- Maskeli bilgi gösterirken tutarlı olun (`a***@ornek.com`); farklı ekranlarda farklı karakterleri açmak
  birleştirilince tamamını verir.

## İki aşamalı doğrulamayı işletmek

TOTP'nin hesabı ve yeniden oynatma koruması: [Kimlik doğrulama → MFA](../30-arkauc/kimlik-dogrulama.md); sıfırdan
gerçekleme ve RFC sınama vektörleri: [`sifirdan/ag/kripto_egitim/otp.py`](../../sifirdan/ag/kripto_egitim/otp.py).
İşletme kuralları:

1. **Kurulum onayla biter:** QR gösterilir, kullanıcı bir kod girer, ancak doğru koddan sonra etken açılır.
2. TOTP gizli anahtarı özetlenemez (sunucu kodu hesaplamak için ona muhtaç): veritabanında **şifreli** saklanır.
3. Etkeni kapatmak ya da değiştirmek yeniden parola **ve** geçerli bir kod ister.
4. Kurtarma kodları kurulumda bir kez gösterilir, özetle saklanır, tek kullanımlıktır:

```python calistir
import hashlib
import secrets

ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # karışan karakter yok: I, O, 0, 1


def kod_uret(adet: int = 10) -> tuple[list[str], set[str]]:
    kodlar = ["-".join("".join(secrets.choice(ALFABE) for _ in range(4)) for _ in range(4)) for _ in range(adet)]
    return kodlar, {_ozet(k) for k in kodlar}  # kullanıcıya kodlar, veritabanına yalnız özetler


def _ozet(kod: str) -> str:
    sade = kod.replace("-", "").replace(" ", "").upper()  # makine dili: İngilizce kural yeter
    return hashlib.sha256(sade.encode()).hexdigest()


def kod_kullan(girilen: str, saklanan: set[str]) -> bool:
    ozet = _ozet(girilen)
    if ozet in saklanan:
        saklanan.discard(ozet)  # tek kullanımlık; gerçekte aynı veritabanı işleminde silinir
        return True
    return False


kodlar, saklanan = kod_uret()
assert len(saklanan) == 10 and len(kodlar[0]) == 19  # 16 karakter = 80 bit: hızlı özet yeterli
assert kod_kullan(kodlar[0].lower().replace("-", " "), saklanan)  # boşluklu/küçük harfli giriş kabul
assert not kod_kullan(kodlar[0], saklanan)  # TEST: ikinci kullanım reddedilir
assert not kod_kullan("AAAA-BBBB-CCCC-DDDD", saklanan) and len(saklanan) == 9
print("tamam")
```

```cikti
tamam
```

Neden hızlı özet yetiyor: kod 80 bit rastgele (32^16); deneme alanı kaba kuvvete kapalıdır. Parola ya da 6 haneli
kod gibi **düşük entropili** değerde bu geçerli değildir; onlarda yavaş özet ve hız sınırı şarttır.

5. "Bu cihazı hatırla" ayrı, özetli, süreli bir belirteçtir; parola değişince silinir.
6. Yönetici hesaplarında ikinci etken zorunludur. SMS yalnız başka seçenek yoksa (SIM kopyalama riski).

## Tuzaklar

| Belirti                                                          | Neden                                                     | Çözüm                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| `ValueError: memory limit exceeded` parametre yükseltince         | OpenSSL'in varsayılan scrypt bellek sınırı                | `maxmem` parametreden hesaplanır                                |
| Parametre yükseltildi, eski kullanıcılar giremiyor               | Parametre koddaydı, özet dizgisinde değil                 | Parametre özet dizgisinde; girişte yükseltme                     |
| Eski MD5 özetleri "kullanıcı girince çeviririz" diye bekliyor    | Göç girişe bağlandı                                       | Hemen sarın (`scrypt(md5)`), girişte düz özete geçin             |
| Saldırgan kayıtlı e-postaları listeliyor                         | İleti ya da süre farkı                                    | Tek ileti, sahte özet, sayaç testi                               |
| Kullanıcılar sabah hesaplarının kilitli olduğunu söylüyor         | E-postaya göre kilit; biri bilerek yanlış deniyor          | Kilit yok; IP+hesap hız sınırı                                   |
| Hız sınırı var ama dağıtık deneme sürüyor                        | Yalnız IP anahtarı; çok IP                                | Hesap başına sayaç + küresel oran alarmı + ikinci etken          |
| Hız sınırı her kullanıcıyı birden kilitliyor                     | Vekil arkasında herkes vekilin IP'si                      | `TRUST_PROXY` doğru ayarı                                        |
| E-postayla sıfırlama ikinci etkeni de kapatıyor                  | Kurtarma iki etkeni birden atlıyor                        | İkinci etken sıfırlaması ayrı, gecikmeli, bildirimli süreç       |
| Kurtarma kodu iki kez kullanıldı                                 | Kullanılınca silinmiyor ya da yarış koşulu                 | Aynı işlemde sil; benzersiz kullanım kaydı                       |
| Kullanıcılar yaygın parolayı küçük değişiklikle geçiriyor         | Liste düz eşleşmeyle, katlamasız                          | Türkçe katlama + "sözcük + rakam" kuralı                        |

## Denetim listesi

- [ ] Özet algoritması yavaş ve bellek isteyen; parametre hedef makinede ölçüldü; `maxmem` hesaplanıyor.
- [ ] Özet dizgisi algoritma ve parametreleri taşıyor; girişte yükseltme testli.
- [ ] Eski/hızlı özet kalmadı (sarıldı ya da yükseltildi).
- [ ] Parola alt ve üst uzunluk sınırı, yaygın parola ve kişisel bilgi kuralı var; yapıştırma engellenmiyor.
- [ ] Giriş, şifremi unuttum, davet/sıfırlama önizlemesi hesabın varlığını sızdırmıyor (sayaç testi).
- [ ] Hız sınırı IP ve IP+hesap anahtarlarıyla; e-postaya göre kilit yok; `429` + `Retry-After`.
- [ ] Kurtarma ikinci etkeni atlamıyor; her hesap değişikliği eski adrese bildiriliyor.
- [ ] İkinci etken: kurulum kodla onaylanıyor, gizli anahtar şifreli, kurtarma kodları özetli ve tek kullanımlık,
      kod ucunda ayrı hız sınırı, yöneticide zorunlu.

## Küçük modele yaptırırken

- **İsteme yazın:** "Parola özeti için projedeki `password.ts`/`ozetle` yardımcısını kullan; yeni algoritma yazma.
  Giriş ucunda hesap yoksa da sahte özet doğrula ve aynı iletiyi dön. Hesap kilidi ekleme; hız sınırını
  `RATE_RULES`'a kural olarak ekle. Kurtarma kodlarını yalnız özet olarak sakla."
- **Modelin tipik hatası:** `sha256(parola)` ya da tuzsuz özet; parametreyi sabit kodlayıp dizgiye yazmamak;
  "kullanıcı bulunamadı" ile "şifre yanlış"ı ayırmak; 5 hatalı girişte hesabı kilitlemek; karakter türü kuralı
  eklemek; kurtarma kodunu düz metin saklamak.
- **Çıktıda denetleyin:** `md5(`, `sha1(`, `sha256(` + parola; `==` ile özet karşılaştırma; `locked`, `failed_attempts`
  alanları; hata iletilerinde "bulunamadı".
- **Test isteyin:** sayaç testi (kayıtlı/kayıtsız e-posta aynı yanıt, aynı özet sayısı), yükseltme testi (eski
  parametreli özet girişte yenilenir), "aynı kurtarma kodu ikinci kez reddedilir".

## İlgili

- [Kimlik doğrulama](../30-arkauc/kimlik-dogrulama.md) (temel akışlar) · [Oturum güvenliği](oturum-guvenligi.md) ·
  [Kriptografi kullanımı](kriptografi-kullanimi.md)
- Çalışan kod: [`uygulama/api/src/lib/password.ts`](../../uygulama/api/src/lib/password.ts) (scrypt, `needsRehash`,
  `burn`), testleri [`password.test.ts`](../../uygulama/api/test/password.test.ts) ve
  [`security.test.ts`](../../uygulama/api/test/security.test.ts) → "hesap varlığı sızıntısı", "hız sınırı"
- PBKDF2 ve TOTP'nin içi: [`sifirdan/ag/kripto_egitim/README.md`](../../sifirdan/ag/kripto_egitim/README.md)
