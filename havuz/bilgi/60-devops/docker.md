---
baslik: Docker: imaj, kapsayıcı ve güvenli küçük imaj
ozet: İmaj ve kapsayıcı farkı, katman önbelleği ve komut sırası, çok aşamalı derleme, kök olmayan kullanıcı ve sırlar, PID 1 ve sinyaller, sağlık denetimi, kalıcı veri.
etiketler: [docker, kapsayici, imaj, sinyal, guvenlik, devops]
duzey: orta
guncellik: 2026-11
---

# Docker: imaj, kapsayıcı ve güvenli küçük imaj

> Bu notu ne zaman okumalı: bir Dockerfile yazarken ya da incelerken; imaj çok büyük ya da derleme çok yavaşsa;
> `docker stop` uzun sürüyorsa; kapsayıcı yeniden yaratılınca veriler kayboluyorsa; platform "unhealthy" diyorsa.

## Temel fikir

**İmaj** salt okunur bir kalıptır: işletim sistemi parçaları + çalışma ortamı + uygulama, katman katman. **Kapsayıcı**
imajdan çalıştırılan bir süreçtir; üstünde ince, yazılabilir bir katman vardır ve kapsayıcı silinince o katman da
gider. Saklanacak her şey bir **birime** (volume) yazılır.

Aynı imaj geliştirmede, CI'da ve üretimde çalışır; ortamlar arasındaki tek fark ortam değişkenleridir. Bu yüzden
imajın içinde ortam ayarı ve sır olmaz.

Docker bu ortamda çalıştırılamadı (sunucusu yok). Aşağıdaki Dockerfile parçaları gösterim içindir; çalışan ve
yorumlu tam örnek havuzdadır: [`uygulama/Dockerfile`](../../uygulama/Dockerfile).

## Karar tablosu

| İstediğiniz                                              | Dockerfile'da                                                       | Neden                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Kod değişince bağımlılık kurulumu yeniden çalışmasın     | Önce yalnız `package.json` + kilit dosyası, kurulum, sonra kaynak   | Katman önbelleği ilk değişen satırda bozulur  |
| Son imajda derleyici ve geliştirme paketleri olmasın      | Çok aşamalı derleme                                                 | Küçük imaj, küçük saldırı yüzeyi              |
| Uygulama kök (root) olmasın                              | `USER node` (resmî Node imajında hazır), Python'da `useradd`        | Bir açık kapsayıcıda root yetkisi vermesin    |
| Derlemede sır gerekiyor (özel paket deposu)              | `RUN --mount=type=secret,…`                                         | `ARG`/`ENV`/`COPY` ile giren sır imajda kalır |
| `docker stop` uygulamayı düzgün kapatsın                 | Exec biçimi `CMD ["node", "…"]` + uygulamada `SIGTERM` işleyicisi   | Kabuk ve npm aracı süreçtir, sinyali yutar    |
| Platform uygulamanın ayakta olduğunu bilsin              | `HEALTHCHECK`, imajda **bulunan** bir araçla                        | Slim imajlarda `curl` yoktur                  |
| Veri kalıcı olsun                                        | `/data` birimi; `DATABASE_PATH=/data/…`                             | Kapsayıcı katmanı geçicidir                   |
| İmaj başka işlemci mimarisinde çalışacak                 | `docker build --platform linux/amd64`                               | ARM Mac'te derlenen imaj sunucuda çalışmaz    |

## Katman önbelleği ve komut sırası

Her komut bir katmandır. Docker bir komutun girdisi (komut metni ve kopyalanan dosyalar) değişmediyse eski katmanı
kullanır; **ilk değişen komuttan sonrası** yeniden çalışır. Bu yüzden az değişen şey üstte, sık değişen altta durur.

```dockerfile
# YANLIŞ: her kod değişikliği npm kurulumunu baştan çalıştırır
COPY . .
RUN npm ci

# DOĞRU: kilit dosyası değişmedikçe kurulum önbellekten gelir
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

`apt-get update` ile `apt-get install` aynı `RUN`'da olmalıdır; ayrı olursa eski paket listesi önbellekte kalır ve
kurulum günler sonra "bulunamadı" hatası verir. Aynı `RUN`'ın sonunda `rm -rf /var/lib/apt/lists/*` imajı küçültür.

## Çok aşamalı derleme

İlk aşama derler (geliştirme bağımlılıklarıyla), son aşama yalnız çalışma için gerekenleri kopyalar. Havuzdaki
örnek: 1. aşama web uygulamasını derler; 2. aşama yalnız API'nin çalışma bağımlılıklarını kurar, derlenmiş
`web/dist`'i ilk aşamadan alır, `node` kullanıcısına geçer ([`uygulama/Dockerfile`](../../uygulama/Dockerfile)).

Python için aynı fikir:

```dockerfile
FROM python:3.13-slim
# Çıktı arabelleğe alınmasın: yoksa `docker logs` boş görünür
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY src ./src
RUN useradd --create-home --uid 10001 uygulama && mkdir -p /data && chown uygulama /data
USER uygulama
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Etiketlerdeki sürümler örnektir: kendi projenizin sürümünü yazın, `latest` yazmayın. Uygulama kapsayıcının
içinde `0.0.0.0`'ı dinlemelidir; `127.0.0.1`'i dinleyen uygulamaya kapsayıcı dışından ulaşılamaz.
`EXPOSE` yalnız belgedir, kapıyı dışarı açmaz; açan `docker run -p` ya da compose `ports:`'tur.

## Küçük ve güvenli imaj

- **`.dockerignore`:** `COPY . .` derleme bağlamındaki her şeyi alır: `node_modules`, `.git`, `.env`, yerel
  veritabanı. Havuzdaki örnek: [`uygulama/.dockerignore`](../../uygulama/.dockerignore) (`**/.env`, `**/*.db`,
  `**/node_modules` …).
- **Sır imaja girmez.** `ENV API_KEY=…` ya da `ARG TOKEN` imajın geçmişinde (`docker history`) okunur. Çalışma
  anındaki sır ortam değişkeniyle gelir; derleme anında gerekiyorsa BuildKit sırrı:

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
# derleme: docker build --secret id=npmrc,src=$HOME/.npmrc -t uygulama .
```

- **Kök olmayan kullanıcı:** son aşamada `USER`. Birime yazacaksa klasörün sahibini `USER`'dan önce ayarlayın
  (havuz: `RUN mkdir -p /data && chown node:node /data`).
- **Taban imajı sabitleyin:** ana sürüm etiketiyle (`node:22-…-slim`); daha sıkısı özetle (`@sha256:…`). Güvenlik
  yamaları için imajı düzenli yeniden derleyin.

## Sinyaller ve PID 1

`docker stop` kapsayıcının **ilk sürecine** (PID 1) `SIGTERM` gönderir, bir süre bekler (varsayılan 10 sn;
`docker stop -t`, compose'da `stop_grace_period`), sonra `SIGKILL`. İki ayrı tuzak vardır:

1. **Aracı süreç:** `CMD npm start`, `CMD node server.js` (kabuk biçimi) ya da `exec`'siz giriş betiği sinyali ara
   bir sürece (npm, `/bin/sh`) verir; uygulama sinyali hiç almaz. Debian tabanlı imajlarda `/bin/sh` (dash) tek
   komutu bile ara süreç olarak çalıştırır (bu makinede denendi).
2. **PID 1'in özel durumu:** çekirdek, PID 1'e gelen sinyalde işleyici yoksa varsayılan davranışı (sonlanmayı)
   uygulamaz. İşleyicisi olmayan node PID 1 iken `SIGTERM`'i yok sayar ve süre dolunca `SIGKILL` ile ölür: süren
   istekler yarıda kalır, veritabanı düzgün kapanmaz.

Gözlem (bu makinede `unshare --pid` ile; kök yetkisi istediği için çalıştırılabilir blok değil):

```text
$ unshare --pid --fork node -e "setTimeout(() => console.log('uyandım'), 3000)" &
$ kill -TERM <node süreci>
uyandım          ← SIGTERM yok sayıldı; süreç 3 sn'nin sonunda kendiliğinden bitti
```

Giriş betiği (açılışta migrasyon, sonra uygulama) kullanıyorsanız son satır `exec` olmalıdır:

```bash calistir
cat > uygulama.py <<'PY'
import os, signal, sys, time

def kapan(*_):
    print("uygulama: SIGTERM geldi, düzgün kapandı", flush=True)
    sys.exit(0)

signal.signal(signal.SIGTERM, kapan)
open("uygulama.pid", "w").write(str(os.getpid()))
time.sleep(5)
PY
printf 'python3 uygulama.py\n' > giris-yanlis.sh # ör. önce migrasyon, sonra uygulama
printf 'exec python3 uygulama.py\n' > giris-dogru.sh

dene() {
  rm -f uygulama.pid
  bash "$1" &
  local kabuk=$!
  until [ -s uygulama.pid ]; do sleep 0.05; done
  kill -TERM "$kabuk" # docker stop: sinyal yalnız ana sürece (PID 1) gider
  { wait "$kabuk" || true; } 2> /dev/null
  local uygulama
  uygulama=$(cat uygulama.pid)
  if kill -0 "$uygulama" 2> /dev/null; then
    echo "$1: kabuk öldü, uygulama sinyali hiç almadı"
    kill -KILL "$uygulama" # Docker'da bu, bekleme süresi dolunca gelen SIGKILL'dir
  fi
}
dene giris-yanlis.sh
dene giris-dogru.sh
```

```cikti
giris-yanlis.sh: kabuk öldü, uygulama sinyali hiç almadı
uygulama: SIGTERM geldi, düzgün kapandı
```

| Durum                                                    | Çözüm                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Uygulama `SIGTERM`'i işliyor (havuzdaki API gibi)        | Exec biçimi `CMD ["node", …]`; başka bir şey gerekmez                   |
| Uygulama işlemiyor ve değiştiremiyorsunuz                | `docker run --init` / compose `init: true`: küçük bir init PID 1 olur   |
| Giriş betiği gerekiyor                                   | Betiğin son satırı `exec "$@"` (ya da `exec node …`)                    |
| `npm start`, `yarn start`, `sh -c "…"`                   | Kullanmayın; komutu doğrudan yazın                                      |

## Sağlık denetimi

- `HEALTHCHECK` kapsayıcıyı `healthy`/`unhealthy` işaretler; `docker ps` gösterir, compose `depends_on` koşulu
  kullanır. Tek başına Docker **unhealthy kapsayıcıyı yeniden başlatmaz**; yeniden başlatma platformun işidir.
- Denetim komutu imajda bulunan bir araçla yazılır: Node imajında `node -e "fetch(…)"`, Python'da
  `python -c "urllib…"`. Slim imajda `curl` yoktur; kapsayıcı hep `unhealthy` görünür.
- `--start-period` açılıştaki migrasyona süre tanır.
- Birçok platform imajdaki denetim yerine kendi ayarını kullanır (Render: `healthCheckPath`). Sağlık ucunun
  tasarımı: [İzleme ve uyarı](izleme-ve-uyari.md).

## Kalıcı veri: birim ve bağlama

| Yol                                   | Örnek                                   | Ne zaman                     | Dikkat                                                   |
| ------------------------------------- | --------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| Adlı birim (named volume)             | `-v uygulama-veri:/data`                | Üretimde veritabanı          | Kapsayıcı silinse de durur; `docker volume rm` ile gider |
| Bağlama (bind mount)                  | `-v /srv/uygulama/veri:/data`           | Sunucuda klasörü görmek, geliştirme | Sahiplik sunucudaki klasörden gelir: `chown` gerekir |
| Dockerfile'daki `VOLUME` (adsız birim) | bağlanmadığında kendiliğinden           | Kendi başına kullanmayın     | Yeni kapsayıcı yeni, boş bir birim alır                  |

Boş bir adlı birim ilk bağlandığında imajdaki klasörün içeriği ve sahibi birime kopyalanır; bu yüzden
Dockerfile'daki `chown node:node /data` adlı birimde işe yarar, bağlamada yaramaz. Çalışan bir SQLite dosyasını
`tar` ile kopyalamayın; uygulamanın yedek komutunu çalıştırın (`docker exec uygulama npm run backup`,
[Veritabanı yedekleme](veritabani-yedekleme.md)).

## Dockerfile denetleyicisi

Küçük modelin yazdığı Dockerfile'ı hızla taramak için; havuzdaki gerçek Dockerfile bu denetimden bulgusuz geçer:

```python calistir
import re


def denetle(dockerfile: str) -> list[str]:
    komutlar = [s.strip() for s in re.sub(r"\\\n", " ", dockerfile).splitlines()]
    komutlar = [k for k in komutlar if k and not k.startswith("#")]
    sorunlar, taban, kaynak_kopyalandi = [], "", False
    son_asama = max(i for i, k in enumerate(komutlar) if k.upper().startswith("FROM "))
    for komut, _, arg in (k.partition(" ") for k in komutlar):
        komut, arg = komut.upper(), arg.strip()
        if komut == "FROM":
            taban, kaynak_kopyalandi = arg.split()[0], False
            ad = taban.split("/")[-1]
            if "$" not in taban and taban != "scratch" and "@" not in ad and (":" not in ad or ad.endswith(":latest")):
                sorunlar.append("sürümsüz taban imaj")
        elif komut in ("ARG", "ENV") and re.search(r"SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY", arg, re.I):
            sorunlar.append("imajda sır")
        elif komut in ("COPY", "ADD") and re.match(r"(--\S+\s+)*\.\s", arg):
            kaynak_kopyalandi = True
        elif komut == "RUN":
            if re.search(r"\bnpm install\b", arg):
                sorunlar.append("npm install (npm ci olmalı)")
            if kaynak_kopyalandi and re.search(r"\b(npm ci|npm install|pip install|yarn install)\b", arg):
                sorunlar.append("kaynak, kurulumdan önce kopyalanmış")
            if "apt-get update" in arg and "apt-get install" not in arg:
                sorunlar.append("apt-get update ayrı katmanda")
        elif komut in ("CMD", "ENTRYPOINT") and not arg.startswith("["):
            sorunlar.append("kabuk biçimi CMD/ENTRYPOINT")
        elif komut == "HEALTHCHECK" and re.search(r"\bcurl\b", arg) and re.search(r"slim|alpine", taban):
            sorunlar.append("slim imajda curl")
    kullanicilar = [k.split()[1] for k in komutlar[son_asama:] if k.upper().startswith("USER ")]
    if not kullanicilar or kullanicilar[-1] in ("root", "0"):
        sorunlar.append("kök kullanıcı")
    return sorunlar


KOTU = """
FROM node:latest
ENV API_KEY=abc123
COPY . .
RUN npm install
RUN apt-get update
CMD npm start
"""
IYI = """
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS derle
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM ${NODE_IMAGE}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=derle /app/dist dist
USER node
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8310/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.js"]
"""
assert denetle(IYI) == []
assert denetle("FROM python:3.13-slim\nUSER app\nHEALTHCHECK CMD curl -f http://127.0.0.1/\n") == ["slim imajda curl"]
for sorun in denetle(KOTU):
    print("-", sorun)
```

```cikti
- sürümsüz taban imaj
- imajda sır
- npm install (npm ci olmalı)
- kaynak, kurulumdan önce kopyalanmış
- apt-get update ayrı katmanda
- kabuk biçimi CMD/ENTRYPOINT
- kök kullanıcı
```

Denetleyici kaba bir süzgeçtir; bulgusuz geçmek doğru çalıştığı anlamına gelmez. Asıl kanıt: imaj derlenir,
kapsayıcı `healthy` olur, `docker stop` birkaç saniyede biter, kapsayıcı silinip yeniden açılınca veri durur.

## Sık komutlar

| İş                                  | Komut                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Derle                               | `docker build -t uygulama .`                                              |
| Çalıştır (yalnız bu makineye açık)  | `docker run -d --name uygulama --restart unless-stopped -p 127.0.0.1:8310:8310 -v uygulama-veri:/data uygulama` |
| Durum ve sağlık                     | `docker ps` · `docker inspect --format '{{.State.Health.Status}}' uygulama` |
| Günlük                              | `docker logs -f --since 10m uygulama`                                     |
| İçeride komut                       | `docker exec -it uygulama sh` · `docker exec uygulama npm run backup`     |
| Katmanlar, boyut, geçmiş            | `docker history uygulama` · `docker image ls`                             |
| Disk kullanımı ve temizlik          | `docker system df` · `docker image prune` (birimlere dokunmaz)            |

## Tuzaklar

| Belirti                                                       | Neden                                                         | Çözüm                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Kapsayıcı yeniden yaratılınca veriler yok                     | Veri kapsayıcı katmanında ya da adsız birimde                 | Adlı birim; `DATABASE_PATH` birimin içinde                      |
| `docker stop` hep 10 sn sürüyor                               | PID 1 sinyali yok sayıyor ya da aracı süreç yutuyor           | Exec biçimi + `SIGTERM` işleyicisi ya da `--init`               |
| Kod değişikliği küçük ama derleme dakikalar sürüyor           | `COPY . .` kurulumdan önce                                    | Önce kilit dosyası, kurulum, sonra kaynak                       |
| İmaj yüzlerce MB fazla, `.git` ve `node_modules` içinde       | `.dockerignore` yok                                           | `.dockerignore` ekleyin; çok aşamalı derleme                    |
| `docker history`'de API anahtarı görünüyor                    | `ENV`/`ARG` ile sır                                           | Anahtarı iptal edip yenileyin; çalışma anında ortam değişkeni   |
| Kapsayıcı hep `unhealthy`, uygulama çalışıyor                 | Sağlık komutu imajda olmayan `curl`'ü çağırıyor               | İmajdaki dille (`node -e`, `python -c`) denetleyin              |
| Sunucuda `exec format error`                                  | İmaj başka mimaride (ARM) derlenmiş                           | `--platform linux/amd64` ya da CI'da derleyin                   |
| `EACCES: permission denied, open '/data/…'`                   | Birimin ya da bağlanan klasörün sahibi root                   | Dockerfile'da `chown` (adlı birim) ya da sunucuda `chown`       |
| Kapsayıcının içinden `localhost:5432` bağlanmıyor             | `localhost` kapsayıcının kendisi                              | Servis adı (`db:5432`) — [Docker Compose](docker-compose.md)    |
| Vekil 502 veriyor, uygulama çalışıyor                         | Uygulama kapsayıcıda `127.0.0.1`'i dinliyor                   | `HOST=0.0.0.0`; dışarıya `-p 127.0.0.1:…` ile açın              |
| `docker logs` boş (Python)                                    | Çıktı arabellekte                                             | `PYTHONUNBUFFERED=1`                                            |
| Paket kurulumu "Unable to locate package"                     | `apt-get update` ayrı, eski katmandan geliyor                 | `update` ve `install` aynı `RUN`'da                             |
| Sunucunun diski kapsayıcı günlükleriyle doldu                 | Varsayılan günlük sürücüsü döndürmüyor                        | Günlük boyut sınırı ([Docker Compose](docker-compose.md))       |

## Denetim listesi

- [ ] Taban imaj ana sürümle sabit; `latest` yok.
- [ ] Bağımlılık kurulumu kilit dosyasından (`npm ci`, kilitli `pip install`), kaynaktan önce.
- [ ] Çok aşamalı; son imajda derleyici, test, geliştirme paketi yok.
- [ ] `.dockerignore` `.env`, `.git`, `node_modules`, `*.db` dışlıyor.
- [ ] `ARG`/`ENV`'de sır yok; `docker history` temiz.
- [ ] Son aşamada `USER` kök değil; veri klasörünün sahibi o kullanıcı.
- [ ] `CMD` exec biçiminde; giriş betiği varsa son satırı `exec`.
- [ ] `docker stop` birkaç saniyede bitiyor; günlükte düzgün kapanış satırı var.
- [ ] `HEALTHCHECK` imajdaki bir araçla; kapsayıcı `healthy` oluyor.
- [ ] Veri adlı birimde; kapsayıcı silinip yeniden açılınca kayıtlar duruyor (denendi).
- [ ] Kapı dışarıya yalnız `127.0.0.1` üzerinden ya da vekil aracılığıyla açık.

## Küçük modele yaptırırken

- **İsteme yazın:** "Dockerfile'ı `havuz/uygulama/Dockerfile` örneğine göre yaz: çok aşamalı, önce kilit dosyası,
  `npm ci`, son aşamada `USER node`, exec biçimi `CMD`, imajdaki araçla `HEALTHCHECK`, veri `/data`'da. Sır ve ortam
  ayarı imaja girmesin; `.dockerignore`'u da yaz."
- **Modelin tipik hatası:** `FROM node:latest`; `COPY . .` en üstte; `npm install`; `CMD npm start`; `curl` ile
  sağlık denetimi; `ENV DATABASE_URL=…` gibi sırları imaja gömmek; `EXPOSE`'u kapıyı açıyor sanmak; uygulamayı
  `127.0.0.1`'de dinletmek.
- **Çıktıda denetleyin:** yukarıdaki denetleyiciyi çalıştırın; sonra `docker stop` süresini ve kapsayıcıyı silip
  yeniden açınca verinin durduğunu kendiniz görün.

## İlgili

- [Docker Compose](docker-compose.md) — çok servisli ortam, birimler, günlük sınırı
- [Linux temelleri](linux-temelleri.md) — sinyaller, systemd ile Docker'sız çalıştırma
- [Yayın yolu seçimi](yayin-yolu-secimi.md) — geçici disk · [Ortam ve yapılandırma](ortam-ve-yapilandirma.md)
- Çalışan karşılık: [`uygulama/Dockerfile`](../../uygulama/Dockerfile),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md) → "Docker ile"
