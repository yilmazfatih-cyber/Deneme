---
baslik: Ortam ve yapılandırma
ozet: On iki etken uygulamasının pratik özü, ortam değişkeni ile yapılandırma dosyası seçimi, sırların yeri, ön yüz ayarının herkese açık oluşu, ortamlar arası fark ve açılışta doğrulama.
etiketler: [yapilandirma, ortam-degiskeni, 12-factor, sirlar, devops]
duzey: temel
guncellik: 2026-11
---

# Ortam ve yapılandırma

> Bu notu ne zaman okumalı: yeni bir ayar eklerken; uygulamayı yeni bir ortama (deneme sunucusu, üretim) taşırken;
> bir anahtarı nereye koyacağınızı düşünürken; "yerelde çalışıyor, sunucuda çalışmıyor" durumunda.

## Temel fikir

Aynı kod, aynı derleme her ortamda çalışır; ortamlar arasında değişen tek şey **yapılandırmadır**: adresler, sırlar,
açık/kapalı bayraklar. Yapılandırma koddan ayrı durur (çoğu zaman ortam değişkeninde), açılışta **bir kez** okunur,
bütünüyle doğrulanır, hatalıysa uygulama hiç başlamaz. Kodun geri kalanı `process.env`'e dağınık biçimde değil, tek
bir doğrulanmış ayar nesnesine bakar.

Havuzdaki uygulama bunun çalışan örneğidir: [`api/src/config.ts`](../../uygulama/api/src/config.ts) değişkenleri
Zod ile doğrular, bütün sorunları Türkçe listeler ve çıkar; değişkenlerin dökümü
[`YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ortam değişkenleri".

## On iki etkenin pratik özü

"On iki etken uygulaması" (twelve-factor app) PaaS'ta sorunsuz çalışan uygulamanın kurallarıdır. Pratikte:

| Etken                       | Pratikte                                                      | Uyulmazsa                                               |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Tek kod tabanı              | Bir depo, çok dağıtım (deneme, üretim)                        | Ortamlar ayrı kollarda kayar, hata bir yerde düzelir    |
| Bağımlılıklar açık          | Kilit dosyası; sunucuda kurulu araca güvenme                  | "Sunucuda vardı" diye çalışan, yenisinde çalışmayan kod |
| Yapılandırma ortamda        | Adres, sır, bayrak ortam değişkeninde                         | Sır depoda; ortam değiştirmek kod değiştirmek olur      |
| Destek servisleri ek kaynaktır | Veritabanı, e-posta, depo bir adresle bağlanır             | Servis değiştirmek kod değişikliği ister                |
| Derle / yayınla / çalıştır ayrı | Derleme bir kez; aynı yapıt her ortama                    | Üretimde "derlerken" çıkan sürprizler                   |
| Süreçler durumsuz           | Yerel disk geçicidir; kalıcı veri veritabanında               | Veriler yeniden başlatmada silinir ([Yayın yolu](yayin-yolu-secimi.md)) |
| Kapı bağlama                | Uygulama `PORT`'u dinler                                      | Platform uygulamaya ulaşamaz                            |
| Eşzamanlılık                | Kopya sayısıyla ölçeklenir                                    | (SQLite'ta tek kopya bilinçli bir sınırdır)             |
| Atılabilirlik               | Hızlı açılış, `SIGTERM`'de düzgün kapanış                     | Dağıtımda yarım istek, bozuk kayıt ([Linux](linux-temelleri.md)) |
| Geliştirme/üretim benzerliği | Aynı veritabanı türü, aynı sürüm çizgisi                     | Yerelde SQLite, üretimde Postgres: sürpriz sorgu farkları |
| Günlük akıştır              | Standart çıktıya tek satırlık JSON; toplamayı platform yapar  | Dosyaya yazılan günlük diski doldurur                   |
| Yönetim işleri              | Migrasyon, tohumlama aynı ortamda tek seferlik komut          | Elle veritabanı komutu, kaydı olmayan değişiklik        |

## Karar tablosu: ayar nerede durur

| Ayar                                                     | Yer                                                     | Neden                                                 |
| -------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Sır (parola, API anahtarı, imza anahtarı)                | Platformun sır ayarı ya da sunucuda `600` izinli dosya  | Depoya, imaja, günlüğe girmez                         |
| Ortama göre değişen adres ve bayrak (`APP_URL`, `LOG_LEVEL`) | Ortam değişkeni                                     | Aynı derleme her yerde çalışır                        |
| Ortamdan bağımsız, gözden geçirilmesi gereken kural (sınırlar, menü, fiyat tablosu) | Depodaki yapılandırma dosyası | Kodla birlikte incelenir, sürümlenir              |
| Çalışırken değişmesi gereken (duyuru, özellik bayrağı)   | Veritabanı ya da bayrak servisi                         | Yeniden dağıtım gerekmez ([Dağıtım](dagitim-stratejileri.md)) |
| Tarayıcıda çalışan koda giren her şey                    | Derleme anında gömülür ve **herkese açıktır**            | Sır asla buraya konmaz (aşağıda)                      |

## Sırların yeri

| Yer                                         | Uygun mu | Not                                                              |
| ------------------------------------------- | -------- | ---------------------------------------------------------------- |
| Depo (kod, `.env`, yapılandırma dosyası)    | Hayır    | Silinen kayıt da geçmişte ve çatallarda kalır                    |
| `.env` (yerel geliştirme)                   | Evet     | `.gitignore`'da; depoda yalnız sahte değerli `.env.example`      |
| Platformun sır/ortam ayarı, CI sırları      | Evet     | Kimlerin görebildiğini bilin                                     |
| Docker imajı (`ENV`, `ARG`, `COPY .env`)    | Hayır    | `docker history` ile okunur ([Docker](docker.md))                |
| Ön yüz kodu (`VITE_*`, `PUBLIC_*`)          | Hayır    | Derlenen JS'ye açık metin olarak girer                           |
| Günlük, hata iletisi, ekran görüntüsü       | Hayır    | Açılışta ayar özeti yazılacaksa sırlar maskelenir                |
| Modelle sohbet penceresi                    | Hayır    | Modele `.env.example`'ı gösterin, gerçek değeri değil            |

**Sır sızınca** sıra şudur: (1) anahtarı sağlayıcıda **iptal edip yenisini üretin**, (2) yeni değeri ortama yazın,
(3) kötüye kullanım için sağlayıcının günlüğüne bakın, (4) sonra depo geçmişini temizleyin. Kaydı silmek tek başına
hiçbir şeyi geri almaz.

## Ön yüz ayarı herkese açıktır

Vite yalnız `VITE_` önekli değişkenleri, Astro `PUBLIC_` önekli olanları tarayıcı koduna verir ve bunlar **derleme
anında** dosyaya yazılır. İki sonucu vardır:

1. `VITE_OPENAI_KEY` gibi bir değişken, siteyi açan herkesin okuyabileceği bir yerdedir. Sır gerektiren çağrı bir
   sunucu ucundan yapılır.
2. Durağan barındırmada bu değeri değiştirmek **yeniden derleme** ister; çalışan siteye ortam değişkeni eklemek bir
   şey değiştirmez. Havuzdaki site `PUBLIC_FORM_ENDPOINT`'i derleme ortamından alır
   ([`site/docs/YAYINLAMA.md`](../../site/docs/YAYINLAMA.md)).

## Ortamlar arası fark

| Konu              | Geliştirme                  | Test (CI)                    | Deneme (staging)                   | Üretim                               |
| ----------------- | --------------------------- | ---------------------------- | ---------------------------------- | ------------------------------------ |
| Veritabanı        | Yerel dosya                 | Bellek içi ya da geçici      | Üretimden **ayrı**, sahte veri     | Kalıcı disk, yedekli                 |
| E-posta           | Konsola/tabloya yazılır     | Sahte gönderici              | Yalnız izinli adreslere            | Gerçek sağlayıcı                     |
| Günlük düzeyi     | `debug`                     | `warn`                       | `info`                             | `info`                               |
| Çerez             | Güvensiz bağlantıda da      | —                            | `Secure`                           | `Secure`, HSTS                       |
| Hız sınırı        | Açık                        | Uçtan uca testte kapatılabilir | Açık                             | Açık; kapatmak yasak                 |
| Sırlar            | Deneme anahtarları          | CI sırları                   | Kendi anahtarları                  | Kendi anahtarları                    |

Deneme ortamı üretim veritabanına asla bağlanmaz; üretim verisini geliştirme makinesine kopyalamak kişisel veri
taşımaktır (KVKK). Ortama göre davranış `NODE_ENV` gibi **tek** bir değişkenden okunur; "bu adres ornek.com mu"
diye kod içinde ortam tahmin edilmez.

## Açılışta doğrulama

Kurallar: ortam değişkeni her zaman **metindir**; dönüşüm açık yapılır; bütün sorunlar tek seferde listelenir;
ileti hangi değişkenin, neden, nasıl düzeltileceğini söyler; sırrın varsayılan değeri olmaz; bilinmeyen ama bilinen
bir ada çok benzeyen değişken (yazım hatası) uyarılır.

JavaScript'in kendi dönüşümleri sessizce yanlış sonuç verir:

```js calistir
import assert from 'node:assert/strict'

const env = { PORT: '', DEBUG: 'false', RATE_LIMIT: '0' } // ortam değişkenleri HER ZAMAN metindir

// YANLIŞ: dilin kendi dönüşümleri
assert.equal(Number(env.PORT), 0) // boş PORT → 0 → sunucu rastgele bir kapıda açılır, sağlık denetimi kalır
assert.equal(Boolean(env.DEBUG), true) // "false" metni doğru sayılır
assert.equal(Boolean(env.RATE_LIMIT), true) // "0" da doğru sayılır
assert.ok(Number.isNaN(parseInt(env.PORT))) // parseInt ise NaN verir: iki yol, iki farklı yanlış

// DOĞRU: açık dönüşüm, ne yapılacağını söyleyen hata
function kapi(deger) {
  if (!/^\d{1,5}$/.test(deger ?? '') || Number(deger) > 65535) {
    throw new Error(`PORT 0–65535 arası bir sayı olmalı (şimdi: "${deger ?? ''}")`)
  }
  return Number(deger) // 0 bilinçli bir seçimdir (boş kapı); boş metin değildir
}
function mantiksal(ad, deger) {
  if (['true', '1', 'on'].includes(deger)) return true
  if (['false', '0', 'off'].includes(deger)) return false
  throw new Error(`${ad} true ya da false olmalı (şimdi: "${deger}")`)
}
assert.throws(() => kapi(env.PORT), /PORT 0–65535/)
assert.equal(kapi('8310'), 8310)
assert.equal(mantiksal('DEBUG', env.DEBUG), false)
assert.throws(() => mantiksal('DEBUG', 'evet'), /true ya da false/)
console.log('ortam değişkenleri açıkça dönüştürüldü')
```

```cikti
ortam değişkenleri açıkça dönüştürüldü
```

Bütün sorunları toplayan, yazım hatasını yakalayan ve sırları maskeleyen yükleyici (Python; TypeScript karşılığı
havuzdaki `config.ts`):

```python calistir
import difflib

BILINEN = ("NODE_ENV", "PORT", "DATABASE_PATH", "APP_URL", "MAIL_HTTP_KEY")
SIRLAR = {"MAIL_HTTP_KEY"}


def yukle(ortam: dict[str, str]) -> tuple[dict[str, object], list[str]]:
    """Bütün sorunları toplar; ilk hatada durmaz. Sorun varsa çağıran sunucuyu başlatmaz."""
    ayar: dict[str, object] = {}
    sorunlar: list[str] = []
    ayar["env"] = ortam.get("NODE_ENV", "development")
    if ayar["env"] not in ("development", "production", "test"):
        sorunlar.append(f"NODE_ENV şunlardan biri olmalı: development, production, test (şimdi: {ayar['env']!r})")
    uretim = ayar["env"] == "production"
    port = ortam.get("PORT", "8310")
    if port.isascii() and port.isdigit() and int(port) <= 65535:
        ayar["port"] = int(port)
    else:
        sorunlar.append(f"PORT 0–65535 arası bir sayı olmalı (şimdi: {port!r})")
    ayar["app_url"] = ortam.get("APP_URL", "http://localhost:5310")
    if uretim and not str(ayar["app_url"]).startswith("https://"):
        sorunlar.append("APP_URL üretimde https:// ile başlamalı (ör. APP_URL=https://ornek.com)")
    ayar["database_path"] = ortam.get("DATABASE_PATH", ".data/uygulama.db")
    if uretim and "DATABASE_PATH" not in ortam:
        sorunlar.append("DATABASE_PATH üretimde zorunlu: kalıcı diskteki dosyanın yolu (ör. /data/uygulama.db)")
    for ad in ortam:
        if ad not in BILINEN and (yakin := difflib.get_close_matches(ad, BILINEN, n=1)):
            sorunlar.append(f"{ad} tanınmıyor; {yakin[0]} mi demek istediniz?")
    return ayar, sorunlar


def acilis_ozeti(ortam: dict[str, str]) -> dict[str, str]:  # günlüğe yazılabilir: sırlar maskeli
    return {ad: ("***" if ad in SIRLAR else ortam[ad]) for ad in BILINEN if ad in ortam}


ortam = {
    "NODE_ENV": "production",
    "PORT": "",
    "APP_URL": "http://ornek.com",
    "DATABSE_PATH": "/data/uygulama.db",  # yazım hatası
    "MAIL_HTTP_KEY": "gizli-anahtar",
}
_, sorunlar = yukle(ortam)
print("Ayarlar geçersiz; sunucu başlatılmadı. Düzeltilmesi gerekenler:")
for sorun in sorunlar:
    print("  -", sorun)
assert len(sorunlar) == 4  # hepsi tek seferde: düzelt-dene döngüsü tek tur
assert acilis_ozeti(ortam)["MAIL_HTTP_KEY"] == "***"
assert yukle({"NODE_ENV": "production", "APP_URL": "https://ornek.com", "DATABASE_PATH": "/data/u.db"})[1] == []
```

```cikti
Ayarlar geçersiz; sunucu başlatılmadı. Düzeltilmesi gerekenler:
  - PORT 0–65535 arası bir sayı olmalı (şimdi: '')
  - APP_URL üretimde https:// ile başlamalı (ör. APP_URL=https://ornek.com)
  - DATABASE_PATH üretimde zorunlu: kalıcı diskteki dosyanın yolu (ör. /data/uygulama.db)
  - DATABSE_PATH tanınmıyor; DATABASE_PATH mi demek istediniz?
```

Gerçek ortamda başka programların değişkenleri de vardır (`PATH`, `HOME`); yazım hatası uyarısını yalnız yakın
eşleşmeye ya da uygulamanın önekine (`UYGULAMA_…`) uygulayın. Uyarı başlatmayı durdurmasın, yalnız günlüğe düşsün;
zorunlu değişkenin eksikliği ise durdursun.

## Tuzaklar

| Belirti                                                          | Neden                                                      | Çözüm                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Platform "sağlık denetimi başarısız"; uygulama rastgele kapıda   | `PORT` boş ya da hiç okunmuyor, `Number('')` = 0           | Platformun verdiği `PORT`'u okuyun; boş metni hata sayın           |
| Hata ayıklama kipi üretimde açık                                 | `DEBUG=false` metni doğru sayıldı                          | Açık mantıksal dönüşüm                                             |
| Sunucuda ayar etkisiz, yerelde çalışıyor                         | Değişken adı yanlış yazılmış (`DATABSE_PATH`)              | Bilinmeyen ada benzerlik uyarısı; ayar özeti açılışta günlükte     |
| API anahtarı sitenin JS dosyasında                               | `VITE_`/`PUBLIC_` önekli değişkene sır konmuş              | Anahtarı iptal edin; çağrıyı sunucu ucuna taşıyın                  |
| Platformda değişkeni değiştirdim, site aynı                      | Ön yüz değişkeni derlemede gömülür                         | Yeniden derleyip yayınlayın                                        |
| `.env` dosyası depoda                                            | `.gitignore`'a eklenmemiş                                  | Sırları yenileyin; `.gitignore`; depoda yalnız `.env.example`      |
| Uygulama eksik ayarla açıldı, ilk e-postada çöktü                | Ayar kullanıldığı anda okunuyor, açılışta doğrulanmıyor    | Açılışta tek seferde doğrulama; eksikse başlama                    |
| Her düzeltmeden sonra yeni bir eksik çıkıyor                     | Doğrulama ilk hatada duruyor                               | Bütün sorunları toplayıp birlikte yazın                            |
| Deneme ortamında yapılan işlem gerçek kullanıcıya e-posta attı   | Deneme ortamı üretim e-posta ayarlarını kullanıyor         | Ortama özel sırlar; denemede alıcı izin listesi                    |
| Yerelde geçen sorgu üretimde hata veriyor                        | Yerelde SQLite, üretimde Postgres                          | Geliştirmede de aynı veritabanı türü (compose ile)                 |
| Günlükte parola ya da anahtar görünüyor                          | Açılışta ortamın tamamı yazdırıldı                         | Bilinen adların özeti, sırlar maskeli                              |

## Denetim listesi

- [ ] Uygulama bütün ayarı tek bir yerde okuyup doğruluyor; kodda dağınık `process.env` / `os.environ` yok.
- [ ] Eksik ya da hatalı ayarda uygulama başlamıyor ve bütün sorunları ne yapılacağıyla birlikte yazıyor.
- [ ] Sayı ve mantıksal değerler açıkça dönüştürülüyor; boş metin hata.
- [ ] Sırların varsayılan değeri yok; depoda yalnız `.env.example` var ve her değişken orada açıklamalı.
- [ ] `VITE_*` / `PUBLIC_*` değişkenlerinde sır yok.
- [ ] Açılışta ayar özeti günlüğe yazılıyor; sırlar maskeli.
- [ ] Deneme ve üretim ayrı veritabanı, ayrı sırlar kullanıyor.
- [ ] Yeni ayar eklenince belge tablosu ve `.env.example` aynı değişiklikte güncelleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni ayarı havuzdaki tarife göre ekle: `config.ts`'teki şemaya alan, `Config`'e karşılığı,
  dönüşüm, belge tablosu, `.env.example` ve test ([`api/TARIFLER.md`](../../uygulama/api/TARIFLER.md) → '3. Yeni
  ayar (ortam değişkeni) ekle'). Kodun başka yerinde `process.env` okuma. Sır için varsayılan değer yazma."
- **Modelin tipik hatası:** ayarı kullanıldığı dosyada `process.env.X || 'varsayılan'` ile okumak; sırra
  varsayılan değer koymak; `Boolean(process.env.X)` yazmak; API anahtarını `VITE_` önekiyle ön yüze koymak;
  `.env`'i örnek diye depoya eklemek.
- **Çıktıda denetleyin:** değişiklikte `process.env.` ve `os.environ` geçen satırları arayın (yalnız ayar dosyasında
  olmalı); `.env` dosyası değişiklik listesinde mi; yeni değişken belge tablosunda ve `.env.example`'da mı.

## İlgili

- [Yayın yolu seçimi](yayin-yolu-secimi.md) — durumsuz süreç, geçici disk
- [Docker](docker.md) — sırrın imaja girmemesi · [CI/CD](ci-cd.md) — CI sırları ve ortamlar
- [OWASP özeti](../50-guvenlik/owasp-ozet.md) — yanlış yapılandırma ve sır sızıntısı
- Çalışan karşılıklar: [`config.ts`](../../uygulama/api/src/config.ts),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Ortam değişkenleri",
  [`render.ornek.yaml`](../../uygulama/render.ornek.yaml) (`sync: false` = değeri panelde girilen sır)
