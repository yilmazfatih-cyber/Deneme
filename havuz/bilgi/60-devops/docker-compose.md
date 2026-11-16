---
baslik: Docker Compose ile çok servisli ortam
ozet: Uygulama, veritabanı ve vekilin tek dosyada kurulması; ortam değişkenlerinin üç yeri, sağlığa bağlı başlama sırası, birimler, günlük sınırı ve geliştirme ile üretim farkı.
etiketler: [docker, compose, yerel-ortam, postgres, devops]
duzey: orta
guncellik: 2026-11
---

# Docker Compose ile çok servisli ortam

> Bu notu ne zaman okumalı: uygulamayı veritabanı ve ters vekille birlikte tek sunucuda çalıştıracakken;
> yerelde gerçek bir veritabanıyla geliştirirken; "uygulama açılışta veritabanına bağlanamıyor", "veriler
> gitti", "değişken boş geliyor" şikâyetlerinde.

## Temel fikir

Compose, birkaç kapsayıcıyı (servis), aralarındaki ağı ve birimleri tek bir YAML dosyasında tanımlar;
`docker compose up -d` hepsini kurar. Servisler kendi özel ağlarında birbirini **servis adıyla** bulur:
uygulama veritabanına `db:5432` diye bağlanır, `localhost:5432` diye değil (kapsayıcının içinde `localhost`
kapsayıcının kendisidir).

Compose iki iş için iyidir: yerelde gerçek bir veritabanıyla geliştirmek ve **tek sunucuda** üretim. Birden çok
makineye yayılan, kendiliğinden ölçeklenen bir düzen için değildir.

Docker bu ortamda çalıştırılamadı; YAML örnekleri gösterim içindir. Tek imajın kuralları: [Docker](docker.md).

## Karar tablosu

| Durum                                                         | Seçim                                                                | Neden                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Yerelde geliştirme, Postgres gerekiyor                        | Yalnız veritabanını compose ile açın (`docker compose up -d db`), uygulamayı Docker'sız çalıştırın | En sade; sıcak yeniden yükleme bozulmaz |
| Tek VPS'te uygulama + veritabanı + vekil                      | Compose + `restart: unless-stopped` + günlük sınırı                  | Tek dosya, tek komut, yeniden başlatmada kalkar |
| Havuzdaki uygulama (SQLite gömülü, tek servis)                | `docker run` yeter; compose yalnız ayarı dosyada tutmak için          | Ayrı veritabanı servisi yok                    |
| Veritabanı yönetilen bir serviste                             | Compose'da `db` servisi yok; bağlantı adresi dışarıdan               | Yedek ve güncelleme sağlayıcıda                |
| Birden çok makine, kendiliğinden ölçekleme                    | Compose değil: PaaS ya da bir düzenleyici (orchestrator)             | Compose tek makineyi yönetir                   |

## Örnek: uygulama + Postgres + Caddy

Postgres kullanan bir uygulama için (havuzdaki uygulama SQLite kullanır; onun için `db` servisi yerine `/data`
birimi yeter):

```yaml
# compose.yaml — tek sunucuda üretim
name: uygulama # proje adı sabit: klasörün adı değişse de birimler aynı kalır

x-gunluk: &gunluk # kapsayıcı günlükleri döndürülsün, disk dolmasın
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "5" }

services:
  uygulama:
    build: .
    env_file: uygulama.env # kapsayıcıya giren ayar ve sırlar; depoya girmez
    environment:
      DATABASE_URL: postgres://uygulama:${DB_PAROLA:?DB_PAROLA gerekli}@db:5432/uygulama
      TRUST_PROXY: "1" # önünde Caddy var
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    init: true # uygulama SIGTERM işlemiyorsa bile düzgün durur
    <<: *gunluk

  db:
    image: postgres:17 # ana sürüm sabit; veri klasörünün yolu sürüme göre değişebilir: imajın belgesine bakın
    environment:
      POSTGRES_USER: uygulama
      POSTGRES_PASSWORD: ${DB_PAROLA:?DB_PAROLA gerekli} # yalnız İLK açılışta (boş birimde) uygulanır
      POSTGRES_DB: uygulama
    volumes:
      - db-veri:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U uygulama -d uygulama"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped
    <<: *gunluk # ports YOK: veritabanına yalnız uygulama erişir

  vekil:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro # içinde: ornek.com { reverse_proxy uygulama:8310 }
      - caddy-veri:/data # sertifikalar; silinirse her açılışta yeniden istenir
    depends_on: [uygulama]
    restart: unless-stopped
    <<: *gunluk

volumes:
  db-veri:
  caddy-veri:
```

Vekilin yapılandırması ve `TRUST_PROXY`: [Ters vekil](ters-vekil.md).

## Ortam değişkenlerinin üç yeri

En sık karışıklık budur:

| Yer                                    | Ne yapar                                                          | Kapsayıcının ortamına girer mi |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------------ |
| `.env` (compose dosyasının yanında)    | Compose dosyasındaki `${DB_PAROLA}` gibi yerleri doldurur         | Hayır; yalnız kullanıldığı yere yazılır |
| `env_file: uygulama.env`               | Dosyadaki her satırı kapsayıcının ortamına koyar                  | Evet                           |
| `environment:`                         | Tek tek değişken; aynı ad `env_file`'dakini ezer                  | Evet                           |

Kabukta verilen değişken (`DB_PAROLA=… docker compose up -d`) `.env`'dekinden önceliklidir. `${AD:?ileti}` değişken
yoksa compose'u iletiyle durdurur; `${AD:-varsayılan}` boşsa varsayılanı koyar. Sır için varsayılan yazmayın.
Sonucu görmek için `docker compose config` (çıktıda sırlar açık görünür; kimseyle paylaşmayın). `.env` ve
`uygulama.env` `.gitignore`'da olur; depoya yalnız değerleri sahte `*.example` dosyaları girer.

## Başlama sırası ve sağlık

- `depends_on: [db]` yalnız **başlatma sırasını** belirler; veritabanının bağlantı kabul ettiğini beklemez.
- `condition: service_healthy` veritabanının sağlık denetiminden geçmesini bekler. Sağlık denetimi tanımlı
  olmalıdır (imajda ya da compose'da).
- Tek seferlik migrasyon servisi kullanıyorsanız: `condition: service_completed_successfully`.
- Bunlar yine de yetmez: üretimde veritabanı uygulamadan bağımsız yeniden başlayabilir. Uygulama bağlantıyı
  **geri çekilmeyle yeniden denemelidir**:

```python calistir
import random
import socket
import threading
import time


def bos_kapi() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


KAPI = bos_kapi()


def gec_kalkan_veritabani(gecikme_s: float) -> None:  # compose'daki "db": kalkması zaman alır
    time.sleep(gecikme_s)
    with socket.create_server(("127.0.0.1", KAPI)) as sunucu:
        baglanti, _ = sunucu.accept()
        baglanti.close()


def baglan(en_cok: int = 10, taban_s: float = 0.05, tavan_s: float = 1.0) -> int:
    for deneme in range(1, en_cok + 1):
        try:
            socket.create_connection(("127.0.0.1", KAPI), timeout=1).close()
            return deneme
        except OSError:
            if deneme == en_cok:
                raise
            # üstel geri çekilme + titreşim: bütün kopyalar aynı anda yeniden denemesin
            time.sleep(min(tavan_s, taban_s * 2 ** (deneme - 1)) * random.uniform(0.5, 1.0))
    raise AssertionError("ulaşılmaz")


# YANLIŞ: tek deneme; veritabanı henüz kalkmamışsa uygulama çöker
try:
    socket.create_connection(("127.0.0.1", KAPI), timeout=1).close()
    raise AssertionError("bağlanmamalıydı")
except ConnectionRefusedError:
    print("tek deneme: bağlantı reddedildi, uygulama çöktü")

# DOĞRU: geri çekilmeyle yeniden dene
threading.Thread(target=gec_kalkan_veritabani, args=(0.4,), daemon=True).start()
deneme = baglan()
assert deneme > 1
print("geri çekilmeyle yeniden denendi ve bağlandı")
```

```cikti
tek deneme: bağlantı reddedildi, uygulama çöktü
geri çekilmeyle yeniden denendi ve bağlandı
```

Deneme sayısının bir üst sınırı olsun; sınır aşılınca uygulama anlaşılır bir iletiyle çıksın ve yeniden başlatmayı
platforma bıraksın. Sonsuz döngüde sessizce bekleyen uygulama "çalışıyor" görünür ama istek karşılamaz.

## Birimler

- Adlı birimler `docker compose down` ve `up` arasında durur. **`docker compose down -v` birimleri siler**:
  veritabanı gider. Bu komutu üretim sunucusunda yazmayın.
- Birimin gerçek adı `<proje>_<birim>`'dir; proje adı varsayılan olarak klasör adıdır. Klasörün adı değişince
  compose yeni, boş birimler açar. Bu yüzden dosyanın başında `name:` sabittir.
- Postgres'in `POSTGRES_PASSWORD` gibi değişkenleri yalnız **boş** birimle ilk açılışta uygulanır; sonradan
  değiştirmek parolayı değiştirmez.
- Yedek, kapsayıcının içindeki araçla ve `-T` ile (TTY ikili çıktıyı bozar):
  `docker compose exec -T db pg_dump -U uygulama -Fc uygulama > yedek.dump`
  ([Veritabanı yedekleme](veritabani-yedekleme.md)).

## Geliştirme ↔ üretim

| Konu              | Geliştirme                                          | Üretim                                                          |
| ----------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| İmaj              | Yerelde derlenir                                     | Sunucuda `--build` ya da CI'da derlenip kayıt kimliğiyle etiketlenir |
| Kaynak kod        | Bağlanabilir (bind mount)                            | İmajın içinde; bağlama yok                                      |
| Kapılar           | `127.0.0.1:` önekiyle araçlar için açık              | Yalnız vekil: 80 ve 443                                         |
| Sırlar            | Deneme değerleri                                     | Sunucuda `600` izinli dosyada; depoda değil                     |
| Günlük            | `debug`                                              | `info`, boyutu sınırlı                                          |
| Yeniden başlatma  | Yok                                                  | `unless-stopped`                                                |
| Veri              | Silinebilir                                          | Adlı birim + düzenli yedek + denenmiş geri yükleme              |

Geliştirme farkları `compose.override.yaml`'a yazılır; `docker compose up` onu **kendiliğinden** okur:

```yaml
# compose.override.yaml — yalnız geliştirme makinesinde
services:
  db:
    ports: ["127.0.0.1:5432:5432"] # uygulamayı Docker'sız çalıştırıp buradan bağlanın
  uygulama:
    environment:
      LOG_LEVEL: debug
    ports: ["127.0.0.1:8310:8310"]
```

Üretim sunucusunda bu dosya bulunmamalı ya da komut açıkça yalnız ana dosyayı okumalıdır:
`docker compose -f compose.yaml up -d`. İmajı CI'da derleyip `image: …:${SURUM}` ile çekmek geri almayı tek satıra
indirir: eski `SURUM` ile yeniden `up -d` ([Dağıtım stratejileri](dagitim-stratejileri.md)).

## Sık komutlar

| İş                                     | Komut                                                       |
| -------------------------------------- | ----------------------------------------------------------- |
| Kur ve başlat (arka planda)            | `docker compose up -d` · imajı yeniden derleyerek: `--build` |
| Durum (sağlık dahil)                   | `docker compose ps`                                         |
| Günlük                                 | `docker compose logs -f --since 10m uygulama`               |
| Tek seferlik komut                     | `docker compose run --rm uygulama npm run migrate`          |
| İçeride kabuk                          | `docker compose exec uygulama sh`                           |
| Durdur ve kapsayıcıları sil (veri kalır) | `docker compose down`                                     |
| Son yapılandırmayı gör                 | `docker compose config`                                     |

## Tuzaklar

| Belirti                                                           | Neden                                                       | Çözüm                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Uygulama `ECONNREFUSED 127.0.0.1:5432`                             | Kapsayıcıda `localhost` kendisidir                          | Adres servis adıyla: `db:5432`                                   |
| İlk `up`'ta uygulama çöküyor, birkaç yeniden başlatmadan sonra düzeliyor | `depends_on` yalnız sıra; veritabanı hazır değil      | `condition: service_healthy` + uygulamada yeniden deneme         |
| `docker compose down -v` sonrası veritabanı boş                   | `-v` adlı birimleri siler                                   | Yedekten dönün; üretimde `-v` yazmayın                           |
| Klasör adı değişti, veritabanı boş açıldı                         | Proje adı değişti, yeni birimler açıldı                     | Üst düzeyde `name:`; eski birim `docker volume ls`'te duruyor    |
| `POSTGRES_PASSWORD` değişti, bağlanılamıyor                       | Değişken yalnız ilk açılışta uygulanır                      | Parolayı veritabanında `ALTER ROLE` ile değiştirin               |
| Güvenlik duvarı kapalı dediği hâlde veritabanına dışarıdan ulaşılıyor | Docker'ın açtığı kapılar güvenlik duvarı kurallarını aşabilir | Veritabanına `ports:` yazmayın; gerekirse `127.0.0.1:` önekiyle |
| `${DB_PAROLA}` boş geliyor                                        | Değer `env_file`'da; o dosya `${}` doldurmaz               | Değeri `.env`'e yazın ya da kabukta verin                        |
| Sunucunun diski doldu                                             | Kapsayıcı günlükleri sınırsız büyüdü                        | `logging` seçenekleri (ya da Docker'ın genel ayarında günlük sınırı) |
| `pg_dump` dosyası açılmıyor                                       | `exec` TTY ile çalıştı, ikili çıktı bozuldu                 | `docker compose exec -T …`                                       |
| Üretimde hata ayıklama günlükleri, açık veritabanı kapısı         | `compose.override.yaml` sunucuda da okundu                  | Dosyayı sunucuya koymayın ya da `-f compose.yaml`                |
| Her yeniden başlatmada sertifika yeniden isteniyor, sonra alınamıyor | Caddy'nin `/data` birimi yok                             | `caddy-veri:/data` birimi                                        |
| Kapsayıcı durmadan yeniden başlıyor, kimse fark etmiyor           | `restart` çöküşü gizliyor                                   | `docker compose ps` (Restarting), `logs`; izlemede yeniden başlatma sayısı |

## Denetim listesi

- [ ] Dosyanın başında `name:` var.
- [ ] Veritabanı servisinde `ports:` yok; dışarıya yalnız vekil açık.
- [ ] Veritabanının `healthcheck`'i var; uygulama `condition: service_healthy` ile bekliyor ve bağlantıyı yeniden deniyor.
- [ ] Bütün kalıcı veriler adlı birimde; `down` + `up` sonrası kayıtlar duruyor (denendi).
- [ ] Sırlar `.env` / `uygulama.env`'de; ikisi `.gitignore`'da; depoda yalnız `*.example`.
- [ ] Her serviste günlük boyutu sınırlı.
- [ ] Her serviste `restart: unless-stopped`.
- [ ] Sunucuda `compose.override.yaml` yok ya da komutlar `-f compose.yaml` ile.
- [ ] Yedek komutu `exec -T` ile çalışıyor ve geri yükleme denendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "compose.yaml yaz: `name:` sabit; veritabanında `ports` yok, `healthcheck` var; uygulama
  `condition: service_healthy` ile beklesin ve bağlantıyı geri çekilmeyle yeniden denesin; adlı birimler; her
  serviste günlük sınırı ve `restart: unless-stopped`; sırlar `${…:?…}` ile, varsayılansız."
- **Modelin tipik hatası:** uygulamada `localhost:5432` yazmak; `depends_on`'u hazır olmayı bekliyor sanmak;
  veritabanına `ports: ["5432:5432"]` yazmak; `.env` ile `env_file`'ı karıştırmak; sır için varsayılan değer
  koymak; eski örneklerden `version:` satırı kopyalamak (gereksizdir); "temiz başlangıç" için `down -v` önermek.
- **Çıktıda denetleyin:** `docker compose config` hatasız mı; `ports:` yalnız vekilde mi; her kalıcı yol adlı
  birimde mi; `down -v` geçen bir talimat var mı.

## İlgili

- [Docker](docker.md) — imaj kuralları, PID 1, sağlık denetimi
- [Ortam ve yapılandırma](ortam-ve-yapilandirma.md) · [Ters vekil](ters-vekil.md) · [HTTPS ve sertifikalar](https-ve-sertifikalar.md)
- [Veritabanı yedekleme](veritabani-yedekleme.md) · [Linux temelleri](linux-temelleri.md) (disk doluluğu)
- [Arka plan işleri](../30-arkauc/arka-plan-isleri.md) — yeniden deneme kuralları
- Çalışan karşılık: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Docker ile"
