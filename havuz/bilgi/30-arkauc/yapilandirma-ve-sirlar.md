---
baslik: Yapılandırma ve sırlar: ortam ayarı, açılışta doğrulama, anahtar döndürme
ozet: Ayarı koddan ayırmak, açılışta bütün sorunları birden bildiren doğrulama, geliştirme/sınama/üretim farkları, sırların yeri ve döndürülmesi, güvenli varsayılanlar ve özellik bayrakları; çalışan örneklerle.
etiketler: [yapilandirma, sir, guvenlik, ozellik-bayragi, yayin]
duzey: temel
guncellik: 2026-11
---

# Yapılandırma ve sırlar: ortam ayarı, açılışta doğrulama, anahtar döndürme

> Bu notu ne zaman okumalı: yeni bir ayar ya da API anahtarı eklenirken; uygulama yeni bir barındırıcıya ya da
> ortama taşınırken; "yerelde çalışıyor, sunucuda çalışmıyor" denildiğinde; bir anahtar sızdığında.

## Temel fikir

Ortamdan ortama değişen her şey (adresler, kapılar, veritabanı yolu, anahtarlar, açık/kapalı özellikler) koddan
ayrılır ve **ortam değişkenlerinden** okunur. Okuma tek bir yerde, **açılışta bir kez** yapılır: değerler
doğrulanır, türüne çevrilir, tipli bir ayar nesnesi kurulur; kodun geri kalanı yalnız bu nesneyi kullanır.
Bir sorun varsa uygulama **başlamaz** ve bütün sorunları, değişken adı ve ne yapılacağıyla birlikte listeler.

Sırlar (API anahtarı, imza anahtarı, veritabanı parolası) depoya, günlüğe, hata iletisine ve tarayıcıya giden
koda asla girmez. Her ayarın varsayılanı **güvenli taraftır**: ayar unutulursa sistem kapanır, açılmaz.

## Karar tablosu: değer nerede durur

| Değer                                                 | Yer                                              | Neden                                          |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Ortamdan bağımsız sabit (sayfa boyutu, en çok deneme) | Kodda sabit                                      | Gözden geçirilir, testte değiştirilebilir      |
| Ortama göre değişen (adres, kapı, veritabanı yolu)    | Ortam değişkeni                                  | Aynı derleme her ortamda çalışır               |
| Sır                                                   | Barındırıcının sır yöneticisi → ortam değişkeni  | Depoda ve görüntüde (image) bulunmaz           |
| Çalışırken değişen iş kuralı (kampanya oranı)         | Veritabanı + yönetim ekranı                      | Yayın gerektirmez; değişiklik denetim izinde   |
| Özelliği aç/kapa, kademeli açılış                     | Özellik bayrağı                                  | Yayın ile açılış birbirinden ayrılır           |
| Kullanıcının tercihi                                  | Veritabanı                                       | Kişiye özel                                    |

## Açılışta doğrulama

Ortam değişkeni **her zaman metindir**: `"false"` boş olmayan bir metindir ve doğru sayılır, `"8310"` sayı
değildir, `PORT=` boş metindir. Bu dönüşümler tek yerde yapılır:

```python calistir
from dataclasses import dataclass
from urllib.parse import urlsplit

assert bool("false") is True  # TUZAK: boş olmayan metin "doğru"dur


@dataclass(frozen=True)
class Ayar:
    uretim: bool
    kapi: int
    uygulama_adresi: str
    hiz_siniri: bool
    izinli_kokenler: tuple[str, ...]


class AyarHatasi(Exception):
    pass


def ayar_yukle(ortam: dict[str, str]) -> Ayar:
    sorunlar: list[str] = []
    temiz = {k: v.strip() for k, v in ortam.items() if v.strip()}  # boş değer = yazılmamış
    uretim = temiz.get("NODE_ENV", "development") == "production"
    kapi_metni = temiz.get("PORT", "8310")
    if not kapi_metni.isdigit() or not 0 <= int(kapi_metni) <= 65535:
        sorunlar.append("PORT: 0–65535 arası bir sayı olmalı (ör. PORT=8310).")
    adres = temiz.get("APP_URL", "" if uretim else "http://localhost:5310")
    if not adres:
        sorunlar.append("APP_URL: üretimde zorunlu (ör. APP_URL=https://ornek.com).")
    elif uretim and urlsplit(adres).scheme != "https":
        sorunlar.append("APP_URL: üretimde https ile başlamalı.")
    hiz = temiz.get("RATE_LIMIT", "on")
    if hiz not in ("on", "off"):
        sorunlar.append("RATE_LIMIT: on ya da off olmalı.")
    elif uretim and hiz == "off":
        sorunlar.append("RATE_LIMIT: üretimde kapatılamaz.")
    kokenler = tuple(k.strip() for k in temiz.get("ALLOWED_ORIGINS", "").split(",") if k.strip())
    if "*" in kokenler:
        sorunlar.append("ALLOWED_ORIGINS: * kullanılamaz; kökenleri tek tek yazın.")
    if sorunlar:  # HEPSİ birden: kullanıcı tek tek düzeltip yeniden başlatmak zorunda kalmasın
        raise AyarHatasi("Ayarlar geçersiz; sunucu başlatılmadı:\n" + "\n".join(f"  - {s}" for s in sorunlar))
    return Ayar(uretim, int(kapi_metni), adres, hiz == "on", kokenler)


assert ayar_yukle({}).hiz_siniri is True  # varsayılan GÜVENLİ taraf
try:
    ayar_yukle({"NODE_ENV": "production", "PORT": "80a", "RATE_LIMIT": "off", "ALLOWED_ORIGINS": "*", "APP_URL": " "})
except AyarHatasi as hata:
    print(hata)
```

```cikti
Ayarlar geçersiz; sunucu başlatılmadı:
  - PORT: 0–65535 arası bir sayı olmalı (ör. PORT=8310).
  - APP_URL: üretimde zorunlu (ör. APP_URL=https://ornek.com).
  - RATE_LIMIT: üretimde kapatılamaz.
  - ALLOWED_ORIGINS: * kullanılamaz; kökenleri tek tek yazın.
```

Havuzdaki gerçekleme aynı kalıbı şemayla (Zod) kurar, ayarlar arası kuralları (`crossCheck`) ayrı yazar,
başlamayı engellemeyen ama bilinmesi gerekenleri uyarı olarak günlüğe basar
([`config.ts`](../../uygulama/api/src/config.ts), testi [`config.test.ts`](../../uygulama/api/test/config.test.ts),
yeni ayar tarifi [`TARIFLER.md`](../../uygulama/api/TARIFLER.md) → "Yeni ayar ekle"). Bütün değişkenlerin dökümü
ve kopyalanabilir örnek: [`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ortam değişkenleri".

## Ortamlar arası fark

| Konu                | Geliştirme                     | Sınama (staging)                    | Üretim                                 |
| ------------------- | ------------------------------ | ----------------------------------- | -------------------------------------- |
| Veri                | Sahte/tohum veri               | Sahte ya da anonimleştirilmiş       | Gerçek; başka ortama kopyalanmaz       |
| E-posta, SMS        | Gönderilmez (tablo/terminal)   | Sağlayıcının sınama kipi            | Gerçek                                 |
| Ödeme anahtarı      | Sınama                         | Sınama                              | Canlı                                  |
| Çerez               | `Secure` yok (http)            | `Secure`                            | `Secure` + `__Host-`                   |
| Hız sınırı          | Açık (testte kapatılabilir)    | Açık                                | Açık; kapatılamaz                      |
| Günlük düzeyi       | `debug`/`info`                 | `info`                              | `info`                                 |
| Dinlenen adres      | `127.0.0.1`                    | `0.0.0.0` (vekil arkası)            | `0.0.0.0` (vekil arkası)               |

Farklar **az ve açık** olmalı: "üretimde başka davranan" her satır, yalnız üretimde ortaya çıkan bir hata adayıdır.
Üretim, tehlikeli ayarları açılışta reddeder (havuzda: `http` adres, kapalı hız sınırı, `*` köken).

## Sırların yeri

- Depoda yalnız `.env.example` (sahte değerlerle); gerçek `.env` `.gitignore`'da.
- Üretimde sırlar barındırıcının panelinde ya da sır yöneticisinde tutulur; Docker görüntüsüne, yapı (build)
  argümanına, ön yüz paketine girmez. Ön yüz paketleyicileri belirli önekli değişkenleri (ör. Vite'ta `VITE_`)
  tarayıcıya gömer: oraya sır yazmayın.
- Her ortamın, her servisin **ayrı** anahtarı olur; sızan bir anahtar yalnız bir yeri açar.
- Sır değerleri günlüğe, hata iletisine, ayar hatası listesine yazılmaz (yalnız değişken **adı** yazılır).
- Sır yönetiminin derinliği (nerede durur, kim erişir, sızınca adım adım ne yapılır):
  [Sır yönetimi](../50-guvenlik/sir-yonetimi.md).

## Anahtar döndürme

Anahtar düzenli olarak ya da sızınca değiştirilir. Kesintisiz döndürmenin yolu **anahtar halkası**dır: yeni
anahtarla imzala, eski ve yeni anahtarın ikisiyle de doğrula; eski anahtarla imzalanmış en uzun ömürlü şey
geçersizleşince eskisini çıkar. Hangi anahtarın kullanıldığı imzanın içinde yazar.

```python calistir
import hashlib
import hmac

ANAHTARLAR = {"2026-09": b"eski-anahtar-en-az-32-bayt-uzunlukta!!", "2026-11": b"yeni-anahtar-en-az-32-bayt-uzunlukta!!"}
GECERLI = "2026-11"  # imzalama hep bununla


def ozet(anahtar: bytes, veri: str) -> str:
    return hmac.new(anahtar, veri.encode(), hashlib.sha256).hexdigest()


def imzala(veri: str) -> str:
    return f"{GECERLI}.{ozet(ANAHTARLAR[GECERLI], veri)}"


def dogrula(veri: str, gelen: str) -> bool:
    kimlik, _, imza = gelen.partition(".")
    anahtar = ANAHTARLAR.get(kimlik)  # doğrulama halkadaki HER anahtarla
    return anahtar is not None and hmac.compare_digest(imza, ozet(anahtar, veri))


eski_imza = "2026-09." + ozet(ANAHTARLAR["2026-09"], "oturum:42")
assert dogrula("oturum:42", eski_imza)  # döndürme sırasında eski imzalar çalışmaya devam eder
assert imzala("oturum:42").startswith("2026-11.") and dogrula("oturum:42", imzala("oturum:42"))
del ANAHTARLAR["2026-09"]  # en uzun ömürlü imza da süresini doldurunca eski anahtar çıkarılır
assert not dogrula("oturum:42", eski_imza)
print("tamam")
```

```cikti
tamam
```

Bir sır depoya girdiyse: **önce döndürün** (yeni anahtar üret, eskisini iptal et), sonra temizleyin. Git geçmişinden
silmek tek başına yetmez; kopyalar, çatallar ve önbellekler eski hâli tutar.

## Güvenli varsayılanlar

| Ayar                         | Unutulursa ne olmalı                                         |
| ---------------------------- | ------------------------------------------------------------ |
| CORS izin listesi            | Boş: başka köken okuyamaz                                    |
| Hız sınırı                   | Açık                                                         |
| Hata ayıklama, ayrıntılı hata | Kapalı                                                      |
| Dinlenen adres (geliştirme)  | `127.0.0.1` (yerel ağdaki herkese açılmasın)                 |
| Yönetici listesi             | Boş                                                          |
| Oturum süresi                | Makul ve sınırlı (havuzda 30 gün, en çok 365)                |
| E-posta sağlayıcısı          | Göndermeyen kip; üretimde bu durum uyarı üretir              |

## Özellik bayrakları

| Tür                     | Ömür                    | Örnek                                        |
| ----------------------- | ----------------------- | -------------------------------------------- |
| Yayın bayrağı           | Kısa (haftalar)         | Yeni ödeme akışını kademeli açmak            |
| Acil kapatma düğmesi    | Kalıcı                  | Sorunlu bir dış servise giden özelliği kapatmak |
| Deney bayrağı           | Deney süresi            | A/B karşılaştırması                          |
| Yetki bayrağı           | Kalıcı                  | Yalnız ücretli plandakilere açık özellik     |

Kademeli açılışta karar **belirlenimci** olmalı: aynı kullanıcı her istekte aynı sonucu almalı, yüzde artınca
önceden açık olanlar açık kalmalı:

```python calistir
import hashlib


def acik_mi(bayrak: str, kullanici_id: str, yuzde: int) -> bool:
    kova = int.from_bytes(hashlib.sha256(f"{bayrak}:{kullanici_id}".encode()).digest()[:4], "big") % 100
    return kova < yuzde


kullanicilar = [f"u{i}" for i in range(10_000)]
yuzde10 = {k for k in kullanicilar if acik_mi("yeni-odeme", k, 10)}
yuzde50 = {k for k in kullanicilar if acik_mi("yeni-odeme", k, 50)}
assert 900 < len(yuzde10) < 1100 and yuzde10 <= yuzde50  # %10'dakiler %50'ye çıkınca da açık kalır
print("tamam")
```

```cikti
tamam
```

- Her bayrağın sahibi ve kaldırılma tarihi olur; açılışı biten yayın bayrağı koddan silinir (unutulan bayrak, iki
  kod yolunu sonsuza dek taşımaktır).
- İki yolun da testi vardır.
- Güvenlikle ilgili bayrak (yetki, ücretli özellik) sunucuda değerlendirilir; istemcideki bayrak yalnız görünüm içindir.

## Tuzaklar

| Belirti                                                       | Neden                                                  | Çözüm                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `FEATURE_X=false` yazıldı ama özellik açık                    | `bool("false")` / `if (process.env.X)` metin denetimi  | Açık değer listesiyle ayrıştırın (`on`/`off`)                 |
| Uygulama açıldı, ilk istekte "undefined" hatası               | Ayar kullanıldığı yerde okunuyor, açılışta denetlenmiyor | Açılışta tek doğrulama; eksikse başlamasın                  |
| Ayar hataları tek tek çıkıyor, her biri bir yeniden başlatma  | İlk hatada durulmuş                                    | Bütün sorunları toplayıp birlikte bildirin                    |
| Yerelde çalışıyor, sunucuda çalışmıyor                        | Ortamlar arası fark belgesiz ya da `.env` sunucuda yok | Değişken dökümü + örnek; eksik değişken açılışta raporlanır   |
| API anahtarı tarayıcının kaynak kodunda görüldü               | Ön yüz değişkenine sır yazıldı                         | Sırrı yalnız sunucuda kullanın; istemci sunucuya sorsun       |
| Sır git geçmişinde                                            | `.env` işlendi                                         | Döndürün; `.gitignore`; gönderim öncesi sır taraması          |
| Anahtar değişince bütün oturumlar/bağlantılar geçersizleşti   | Tek anahtar, döndürme planı yok                        | Anahtar halkası + imzada anahtar kimliği                      |
| Üretim sınama ödeme anahtarıyla çalışıyor (ya da tersi)       | Ortam denetimi yok                                     | Açılışta anahtar türünü ortamla karşılaştırın                 |
| Kapatılması unutulan bayraklar yüzünden kod okunmuyor         | Bayrakların sahibi ve süresi yok                       | Bayrak listesi, sahip, kaldırma tarihi                        |

## Denetim listesi

- [ ] Bütün ortam değişkenleri tek bir dosyada okunup doğrulanıyor; kod başka yerde `process.env`/`os.environ` okumuyor.
- [ ] Hatalı ya da eksik ayarda uygulama başlamıyor; bütün sorunlar birlikte, Türkçe ve çözümüyle listeleniyor.
- [ ] Mantıksal ve sayısal değerler açıkça ayrıştırılıyor (metin doğruluğuna güvenilmiyor).
- [ ] Üretim tehlikeli ayarları reddediyor; varsayılanlar güvenli tarafta.
- [ ] Depoda sır yok; `.env.example` var ve güncel; `.env` `.gitignore`'da.
- [ ] Sırlar günlükte, hata iletisinde, ön yüz paketinde yok.
- [ ] Her ortamın ve servisin ayrı anahtarı var; anahtar döndürme planı (halka + kimlik) var.
- [ ] Değişken dökümü belgede; yeni ayar eklenince belge ve test güncelleniyor.
- [ ] Her özellik bayrağının sahibi ve kaldırılma tarihi var; iki yol da testli.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni ayarı yalnız `config.ts`'teki şemaya ekle; kodun geri kalanı `ctx.config.x` kullansın.
  Varsayılanı güvenli tarafta olsun, üretimde zorunluysa çapraz kurala ekle. Belgedeki değişken tablosunu ve ayar
  testini güncelle. Sır değerini hiçbir yere yazdırma."
- **Tipik hatalar:** kodun ortasında `process.env.X` okumak; `if (process.env.DEBUG)` ile "false"u açık saymak;
  `parseInt` sonucunu denetlememek; sırrı varsayılan değer olarak koda gömmek (`?? 'gizli123'`); `.env` dosyasını
  depoya eklemek; ön yüz değişkenine anahtar koymak.
- **Çıktıda arayın:** `process.env.` ve `os.environ` geçen yerler (ayar dosyası dışında olmamalı); sır gibi görünen
  dizgiler (`sk_`, `key`, `secret`, uzun rastgele metin); `VITE_` önekli değişkenlerde anahtar.

## İlgili

- [Sunucu mimarisi](sunucu-mimarisi.md) (bağımlılıkları dışarıdan verme) · [Kimlik doğrulama](kimlik-dogrulama.md)
  (imza anahtarları) · [Webhooklar](webhooklar.md) (imza anahtarı döndürme) · [Ödeme tümleştirme](odeme-tumlestirme.md)
  (sınama/canlı anahtar) · [Migrasyonlar](migrasyonlar.md) (bayrakla kod geri alma)
- Ortam değişkenlerinin görüntüye ve yayın hattına girişi: [Docker](../60-devops/docker.md) · [CI/CD](../60-devops/ci-cd.md).
