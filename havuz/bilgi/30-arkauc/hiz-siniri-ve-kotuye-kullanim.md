---
baslik: Hız sınırı ve kötüye kullanım: algoritmalar, anahtarlar, gerçek IP
ozet: Sabit pencere, kayan pencere ve jeton kovası arasında seçim, sınır anahtarı (IP, hesap, ikisi), vekil arkasında gerçek IP, giriş ve kayıt kötüye kullanımı, maliyetli uçlar ve yanıt başlıkları; çalışan örneklerle.
etiketler: [hiz-siniri, guvenlik, kotuye-kullanim, http, api]
duzey: orta
guncellik: 2026-11
---

# Hız sınırı ve kötüye kullanım: algoritmalar, anahtarlar, gerçek IP

> Bu notu ne zaman okumalı: giriş, kayıt, şifre sıfırlama, SMS/e-posta gönderen, arama, dışa aktarım ya da yapay
> zekâ çağıran bir uç yazılırken; bir barındırıcıya ya da ters vekil arkasına taşınırken; "herkes 429 alıyor" ya
> da "SMS faturası patladı" dendiğinde.

## Temel fikir

Hız sınırı üç şeyi korur: **kaynakları** (işlemci, veritabanı, para: SMS ve yapay zekâ çağrısı faturalanır),
**kullanıcıları** (parola deneme, hesap listesi çıkarma) ve **adaleti** (bir istemci herkesi yavaşlatmasın). Her uç
için üç karar verilir:

1. **Algoritma:** sınır nasıl sayılır (jeton kovası çoğu iş için doğru varsayılandır).
2. **Anahtar:** kime göre sayılır (IP, hesap, ikisi birden, uç başına, küresel).
3. **Sınır:** ucun maliyetine göre (sağlık ucu ile SMS gönderme ucu aynı sınırı almaz).

Hız sınırı tek başına savunma değildir: çok IP'li dağıtık saldırıyı durdurmaz. Güçlü parola kuralı, ikinci etken,
şüpheli durumda ek doğrulama ve izleme ile birlikte çalışır.

## Algoritmalar

| Algoritma          | Nasıl sayar                                  | Artı                          | Eksi                                        |
| ------------------ | -------------------------------------------- | ----------------------------- | ------------------------------------------- |
| Sabit pencere      | Her dakika başında sıfırlanan sayaç          | En basit, az bellek           | Pencere sınırında **iki katı** geçer        |
| Kayan kayıt (log)  | Son N saniyedeki istek zamanlarını tutar     | Kesin                         | Anahtar başına sınır kadar bellek           |
| Kayan sayaç        | İki pencerenin ağırlıklı toplamı             | Az bellek, yeterince kesin    | Yaklaşıktır                                 |
| Jeton kovası       | Kova dolu başlar, istek jeton harcar, kova sabit hızla dolar | Kısa patlamaya izin, ortalamayı sınırlar | Ayar iki sayı (kapasite, hız) |

```python calistir
from collections import defaultdict, deque


class SabitPencere:  # "dakika başına 5": sayaç her dakika başında sıfırlanır
    def __init__(self, sinir: int, pencere: float):
        self.sinir, self.pencere, self.sayac = sinir, pencere, defaultdict(int)

    def izin(self, anahtar: str, simdi: float) -> bool:
        dilim = (anahtar, int(simdi // self.pencere))
        self.sayac[dilim] += 1
        return self.sayac[dilim] <= self.sinir


class KayanKayit:  # son 60 sn'deki istek zamanlarını tutar
    def __init__(self, sinir: int, pencere: float):
        self.sinir, self.pencere, self.zamanlar = sinir, pencere, defaultdict(deque)

    def izin(self, anahtar: str, simdi: float) -> bool:
        z = self.zamanlar[anahtar]
        while z and z[0] <= simdi - self.pencere:
            z.popleft()
        if len(z) >= self.sinir:
            return False
        z.append(simdi)
        return True


class JetonKovasi:  # kapasite kadar ani istek, sonra saniyede `hiz` jeton
    def __init__(self, kapasite: float, hiz: float):
        self.kapasite, self.hiz, self.kova = kapasite, hiz, {}

    def izin(self, anahtar: str, simdi: float) -> bool:
        jeton, onceki = self.kova.get(anahtar, (self.kapasite, simdi))
        jeton = min(self.kapasite, jeton + (simdi - onceki) * self.hiz)
        if jeton < 1:
            self.kova[anahtar] = (jeton, simdi)
            return False
        self.kova[anahtar] = (jeton - 1, simdi)
        return True


def dene(sinirlayici, zamanlar) -> int:
    return sum(sinirlayici.izin("ip:203.0.113.7", t) for t in zamanlar)


# Saldırgan pencere sınırına yaslanır: 59. saniyede 5, 60. saniyede 5 istek
sinir_ani = [59.0] * 5 + [60.0] * 5
assert dene(SabitPencere(5, 60), sinir_ani) == 10  # 1 saniyede sınırın İKİ katı geçti
assert dene(KayanKayit(5, 60), sinir_ani) == 5
assert dene(JetonKovasi(kapasite=5, hiz=5 / 60), sinir_ani) == 5
# Jeton kovası zamanla dolar: 12 sn sonra 1 jeton daha
kova = JetonKovasi(kapasite=5, hiz=5 / 60)
assert dene(kova, [0.0] * 6) == 5 and kova.izin("ip:203.0.113.7", 12.0) and not kova.izin("ip:203.0.113.7", 12.5)
print("sabit pencere 10, kayan kayıt 5, jeton kovası 5 isteğe izin verdi")
```

```cikti
sabit pencere 10, kayan kayıt 5, jeton kovası 5 isteğe izin verdi
```

Saat dışarıdan verilir ki test zamanı ileri sarabilsin. Bellekteki anahtar sayısına üst sınır koyun ve dolmuş
kovaları düzenli süpürün; yoksa sahte IP'lerle bellek doldurulur. Havuzdaki gerçekleme bunları yapar:
[`rateLimit.ts`](../../uygulama/api/src/http/rateLimit.ts) (kurallar `RATE_RULES`'ta, gerekçeleriyle; testi
[`rateLimit.test.ts`](../../uygulama/api/test/rateLimit.test.ts)). İş parçacığı güvenli Python ve TypeScript
sürümleri: [`kutuphane/py/kutuphane/hiz_siniri.py`](../../kutuphane/py/kutuphane/hiz_siniri.py).

## Anahtar seçimi

| Uç                                    | Anahtar                                    | Neden                                                      |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Herkese açık uçlar (genel koruma)     | IP                                         | Kimlik yok                                                 |
| Giriş                                 | IP **ve** IP + e-posta (iki ayrı kural)    | Çok hesabı deneyen tek kaynak + tek hesaba parola deneme   |
| Giriş: yalnız e-postaya göre kilit    | **Kullanmayın**                            | Başkası sizin e-postanızla yanlış deneyip sizi kilitler    |
| Şifremi unuttum                       | IP ve e-posta                              | E-posta başına sınır, birinin kutusunu doldurmayı önler    |
| Oturum açık kullanıcının uçları       | Kullanıcı kimliği                          | Kullanıcı IP değiştirerek kaçamaz; aynı ağdakiler etkilenmez |
| Pahalı bağımlılığı koruma             | Küresel (bütün kullanıcılar)               | Sağlayıcının kendi sınırını aşmamak için                    |

- **Paylaşılan IP:** bir okul, şirket ya da mobil operatör yüzlerce kişiyi aynı IP'den çıkarır. IP sınırlarını cömert,
  hesap sınırlarını sıkı tutun.
- **IPv6:** bir ev ya da telefon genellikle koca bir adres bloğu (/64) alır; adres başına sayarsanız saldırgan her
  istekte adres değiştirir. IPv6'da /64 öneki üzerinden sayın.

## Vekil arkasında gerçek IP

Barındırıcının yük dengeleyicisi ya da ters vekil arkasındaysanız soket adresi vekilin adresidir. Gerçek istemci
`X-Forwarded-For` başlığındadır; ama başlığın **solundaki** değerleri istemcinin kendisi yazabilir. Her vekil kendi
gördüğünü listenin **sonuna** ekler; bu yüzden sağdan, güvendiğiniz vekil sayısı kadar içeri sayılır:

```python calistir
import ipaddress


def istemci_ip(xff: str | None, soket_adresi: str, guvenilen_vekil: int) -> str:
    """guvenilen_vekil: önümüzdeki GÜVENİLEN vekil sayısı. Her vekil X-Forwarded-For'un SONUNA gördüğünü ekler."""
    liste = [p.strip() for p in (xff or "").split(",") if p.strip()]
    if guvenilen_vekil == 0 or not liste:
        return soket_adresi
    return liste[max(0, len(liste) - guvenilen_vekil)]  # sağdan say: soldakileri istemci uydurabilir


def sinir_anahtari(ip: str) -> str:
    adres = ipaddress.ip_address(ip)
    if adres.version == 6:  # bir ev/telefon genellikle koca bir /64 alır
        return str(ipaddress.ip_network(f"{adres}/64", strict=False))
    return str(adres)


# Saldırgan başlığa sahte adres yazdı; tek vekil (barındırıcının yük dengeleyicisi) gerçek adresi sona ekledi
xff = "1.2.3.4, 198.51.100.23"
assert istemci_ip(xff, "10.0.0.2", 1) == "198.51.100.23"  # DOĞRU: vekilin gördüğü adres
assert xff.split(",")[0] == "1.2.3.4"  # YANLIŞ yol en soldakini alır: saldırgan her istekte değiştirir
assert istemci_ip(xff, "10.0.0.2", 0) == "10.0.0.2"  # vekil varken 0: herkes aynı adres, herkes tek kova
assert istemci_ip("1.2.3.4", "198.51.100.23", 0) == "198.51.100.23"  # vekil yokken başlık yok sayılır
assert sinir_anahtari("2001:db8:aa:bb:1::7") == sinir_anahtari("2001:db8:aa:bb:ffff::1") == "2001:db8:aa:bb::/64"
print("tamam")
```

```cikti
tamam
```

| Ayar                                    | Sonuç                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Vekil yok, ama başlığa güveniliyor      | Saldırgan başlığı uydurur, her istek başka IP görünür: sınır çöker      |
| Vekil var, ama güvenilen sayı 0         | Herkes vekilin IP'si: bir kötü kullanıcı herkesi kilitler               |
| İki katman (CDN + barındırıcı), sayı 1  | Gerçek istemci yerine CDN'in adresi görünür                             |

Doğru sayı ortama bağlıdır; ayarladıktan sonra iki farklı ağdan istek atıp günlükteki IP'lerin farklı ve gerçek
olduğunu görün. Havuzdaki gerçekleme ve gerekçe: [`clientIp.ts`](../../uygulama/api/src/http/clientIp.ts),
[`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) → "Gerçek IP ve TRUST_PROXY".

## Giriş, kayıt ve istenmeyen içerik

- **Giriş:** iki anahtarlı sınır (yukarıda), tek tip hata iletisi, başarısız denemeler denetim günlüğünde, ani artış
  için uyarı. Şüpheli durumda (çok başarısız deneme) ek doğrulama istemek kilitlemekten iyidir.
- **Kayıt:** IP başına sınır, e-posta doğrulanmadan başkalarına ileti/davet gönderme yetkisi vermemek, formda insanın
  görmediği bir tuzak alan (dolduran bottur), yeni hesaplara ilk günlerde bağlantı/ileti sınırı.
- **Davet, paylaşım, yorum:** başkasına ulaşan her özellik istenmeyen ileti aracına dönüşebilir; hesap başına günlük
  sınır koyun.
- Doğrulama bulmacası (CAPTCHA) son çaredir: erişilebilirliği bozar ve kişisel veri işleyebilir.

## Maliyetli uçlar

| Uç türü                                       | Önlem                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| SMS / sesli arama ile doğrulama               | Numara başına ve IP başına sıkı sınır, ülke izin listesi, günlük küresel tavan |
| E-posta gönderen uçlar (sıfırlama, davet)     | Alıcı başına sınır (havuzda şifremi unuttum: e-posta başına saatte 3)       |
| Arama, rapor, dışa aktarım                    | Kullanıcı başına sınır + eşzamanlılık sınırı + zaman aşımı                  |
| Yapay zekâ / ücretli dış API çağrısı          | Kullanıcı başına günlük kota (jeton ya da çağrı), küresel bütçe tavanı      |
| Dosya yükleme                                 | Boyut, sayı ve toplam kota                                                  |

SMS gönderen herkese açık bir uç, saldırganın pahalı numaralara binlerce SMS attırıp size fatura çıkardığı bir
dolandırıcılığa açıktır. Bu uçlarda sınır yoksa yayına çıkmayın.

## Yanıt ve davranış

- Sınır aşılınca `429 Too Many Requests` + `Retry-After` (saniye). Gövde, sözleşmedeki hata biçiminde
  (`rate_limited`, bekleme süresiyle). Havuzdaki örnek: [`errors.ts`](../../uygulama/api/src/http/errors.ts).
- Kalan hak bilgisini başlıkla bildirmek için bir IETF taslağı (`RateLimit` başlıkları) var; taslak olduğu için
  ayrıntısını ezberden yazmayın (doğrulanmadı).
- İstemci 429'da `Retry-After` kadar bekler; titremeli geri çekilmeyle yeniden dener.
- Çok sunucuda bellek içi sayaç her kopyada ayrı sayar (sınır kopya sayısıyla çarpılır); ortak bir depo gerekir.
  Havuzdaki API tek kopya kuralıyla bunu bilinçli olarak kabul eder ([`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → §7).
- Sayaç deposu çökerse ne olacağına uç başına karar verin: genel uçlarda **açık** (istek geçsin, günlüğe yaz),
  SMS ve ödeme gibi pahalı uçlarda **kapalı** (istek reddedilsin).

## Tuzaklar

| Belirti                                                       | Neden                                                   | Çözüm                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Yayına geçince herkes 429 alıyor                              | Vekil arkasında soket adresine göre sayılıyor           | Güvenilen vekil sayısını ayarlayın                         |
| Sınır hiç işlemiyor, saldırgan sınırsız deniyor               | `X-Forwarded-For`'un en soldaki değerine güveniliyor    | Sağdan, güvenilen vekil sayısı kadar                       |
| Bir kullanıcı başkasının hesabını kilitledi                   | Yalnız e-postaya göre kilit                             | IP + e-posta; kilit yerine hız sınırı                      |
| Bir okuldaki herkes giriş yapamıyor                           | Sıkı IP sınırı, paylaşılan IP                           | IP sınırını cömert, hesap sınırını sıkı tutun              |
| Dakika başında istek patlaması sınırı iki katına çıkarıyor    | Sabit pencere                                           | Jeton kovası ya da kayan pencere                           |
| Sunucu belleği zamanla doluyor                                | Kova sözlüğünde sınırsız anahtar                        | Üst sınır + süpürme                                        |
| İki kopyada sınır iki katı                                    | Bellek içi sayaç                                        | Ortak depo ya da tek kopya                                 |
| SMS faturası beklenmedik biçimde yükseldi                     | SMS ucu sınırsız ya da ülke denetimi yok                | Numara/IP/küresel sınır + ülke izin listesi                |
| IPv6'dan gelen saldırgan sınıra hiç takılmıyor                | Tek adres başına sayılıyor                              | /64 öneki başına                                           |
| Testler ara sıra 429 ile düşüyor                              | Testte hız sınırı açık                                  | Testte saati ileri sarın ya da sınırı testte kapatın       |

## Denetim listesi

- [ ] Her uç için algoritma, anahtar ve sınır seçilmiş; pahalı uçların sınırı ayrı ve sıkı.
- [ ] Girişte IP ve IP+hesap kuralları var; yalnız hesaba göre kilit yok.
- [ ] Güvenilen vekil sayısı ortama göre ayarlı ve iki ağdan denenerek doğrulandı.
- [ ] IPv6 /64 öneki üzerinden sayılıyor.
- [ ] 429 yanıtında `Retry-After` ve sözleşmedeki hata gövdesi var.
- [ ] Sayaç deposunda anahtar üst sınırı ve süpürme var; saat dışarıdan veriliyor.
- [ ] SMS/e-posta/yapay zekâ uçlarında kullanıcı başı ve küresel tavan var.
- [ ] Çok kopyada ortak sayaç ya da tek kopya kararı belgeli.
- [ ] Ani 429/başarısız giriş artışı uyarı üretiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu uca `RATE_RULES`'a yeni bir kural ekleyerek hız sınırı koy: anahtar …, sınır … / …
  dakika. IP'yi `c.get('ip')`'den al, başlığı kendin okuma. 429'da `Retry-After`. Testte saati ileri sararak
  sınırın dolup boşaldığını göster." (Havuz tarifi: [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Küçükler".)
- **Tipik hatalar:** `req.headers['x-forwarded-for'].split(',')[0]` ile IP almak; sabit pencereyi tek seçenek
  sanmak; sınırı yalnız girişe koyup SMS/e-posta uçlarını unutmak; hesabı e-postaya göre kilitlemek; bellek
  sözlüğüne sınırsız anahtar eklemek.
- **Çıktıda arayın:** `x-forwarded-for` okuyan her satır; yeni uçta hız sınırı çağrısı var mı; 429 yanıtında
  `Retry-After`; testte zamanın gerçek saatten mi sahte saatten mi geldiği.

## İlgili

- [Kimlik doğrulama](kimlik-dogrulama.md) (giriş akışı) · [HTTP temelleri](http-temelleri.md) (429, `Retry-After`) ·
  [Yapılandırma ve sırlar](yapilandirma-ve-sirlar.md) (`TRUST_PROXY` gibi ortam ayarları) ·
  [Hata yönetimi ve günlükleme](hata-yonetimi-ve-gunlukleme.md) (uyarılar)
- Havuzdaki sınır tablosu: [`uygulama/docs/API.md`](../../uygulama/docs/API.md) → "Hız sınırları".
- Vekilin `X-Forwarded-For` başlığını nasıl eklediği: [Ters vekil](../60-devops/ters-vekil.md).
- Aşırı yükte yük atma ve öncelik: [Dayanıklılık kalıpları](../40-sistem-tasarimi/dayaniklilik-kaliplari.md);
  hesap ele geçirme denemelerinin bütünü: [Parola ve hesap güvenliği](../50-guvenlik/parola-ve-hesap-guvenligi.md).
