---
baslik: "Kapsayıcı güvenliği: küçük taban, kısıtlı çalışma, tarama, SBOM ve yeniden derleme"
ozet: İmajı ve çalışan kapsayıcıyı sertleştirmek; taban imaj seçimi, kodu değiştiremeyen kök olmayan kullanıcı, salt okunur dosya sistemi, yetenek kısma, katmanda kalan sır, imaj taraması, SBOM ve yeniden derleme sıklığı.
etiketler: [docker, kapsayici, guvenlik, sbom, tedarik-zinciri, devops]
duzey: orta
guncellik: 2026-11
---

# Kapsayıcı güvenliği: küçük taban, kısıtlı çalışma, tarama, SBOM ve yeniden derleme

> Bu notu ne zaman okumalı: bir imaj yayına alınmadan önce; compose dosyası ya da `docker run` komutu incelenirken;
> bir tarayıcı yüzlerce açık listelediğinde; "bu açık bizi etkiliyor mu?" sorusu geldiğinde. Dockerfile temelleri
> (çok aşamalı derleme, `USER`, BuildKit sırrı, PID 1, sağlık denetimi) [Docker](docker.md) notundadır; bu not saldırı
> yüzeyini ve çalışma anı kısıtlarını derinleştirir.

## Temel fikir

Kapsayıcı güvenliğinin iki yarısı vardır:

- **İçerik — imajda ne var:** az paket az açık demektir; sır imaja hiç girmez (silinen dosya alt katmanda kalır);
  içeriğin listesi (SBOM) her imajla saklanır; imaj düzenli yeniden derlenir, çünkü taban imajın yamaları çalışan
  kapsayıcıya kendiliğinden gelmez.
- **Yetki — kapsayıcı ele geçerse ne yapabilir:** kök olmayan ve kendi kodunu değiştiremeyen kullanıcı, salt okunur
  kök dosya sistemi, kısılmış çekirdek yetenekleri, yeni ayrıcalık yasağı, kaynak sınırları; Docker soketi ve
  `privileged` yok; kapı yalnız `127.0.0.1`'de.

Kapsayıcı ana makinenin çekirdeğini paylaşır; ince bir sınırdır. Kök kullanıcı + bir yanlış ayar (soket, `privileged`,
ana makine klasörü) sınırı kaldırır. Aynı nedenle sunucuda `docker` grubuna giren kullanıcı fiilen köktür.

## Karar tablosu: taban imaj

| Taban                                         | İçerik                         | Hata ayıklama                       | Dikkat                                                             | Ne zaman                                    |
| --------------------------------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| Tam dağıtım (Debian, Ubuntu)                  | Çok paket; taramada çok bulgu  | Kolay                               | Gereksiz araçlar saldırgana da yarar                               | Derleme aşaması; çalışma aşamasında değil   |
| `-slim` (ör. `node:22-bookworm-slim`)         | Orta                           | Kabuk var, `curl` yok               | Sağlık denetimi imajdaki dille yazılır                             | Çoğu uygulamanın varsayılanı (havuz)        |
| Alpine                                        | Küçük                          | Kabuk var                           | musl C kitaplığı: yerel modüller ve Python tekerlekleri farklı derlenir; bazı ağ/DNS davranışları farklıdır | Yerel bağımlılık yoksa |
| Kabuksuz (distroless gibi)                    | Çok küçük                      | `docker exec sh` yok                | Giriş betiği ve kabukla sağlık denetimi yazılamaz; hata ayıklama ayrı imajla | Olgun, iyi izlenen servis      |
| `scratch`                                     | Yalnız ikili dosya             | Hiçbir şey                          | Statik derlenmiş tek ikili gerekir                                 | Go gibi tek ikili uygulama                  |

Taban küçüldükçe tarayıcı bulgusu ve saldırganın elindeki araç azalır; bedeli hata ayıklamanın zorlaşmasıdır. Küçük
ekip için `-slim` iyi bir dengedir.

## Kodu değiştiremeyen, kök olmayan kullanıcı

- Son aşamada `USER` yazılır ([Docker](docker.md)). Kubernetes gibi ortamlar "kök değil" denetimini **sayısal**
  kullanıcıyla yapar (`USER 10001`); adla yazılan kullanıcıyı doğrulayamayıp kapsayıcıyı başlatmayabilir.
- Uygulama kodu kökün malıdır ve uygulama kullanıcısı onu **yazamaz**; yalnız veri klasörü kullanıcıya verilir.
  `COPY --chown=node:node . .` kolaylığı, kodu çalıştırabilen saldırgana kodu değiştirme ve orada kalma imkânı verir.
  Havuzdaki imaj doğru yapar: kaynak kök sahipliğiyle kopyalanır, yalnız `/data` `node` kullanıcısına verilir
  ([`uygulama/Dockerfile`](../../uygulama/Dockerfile)).
- Denetim: `docker run --rm imaj id` (uid 0 olmamalı) ve
  `docker run --rm --entrypoint sh imaj -c 'touch /app/api/src/deneme && echo YAZILABILIR'` (hata vermeli).

## Çalışma anı kısıtları

| `docker run`                         | Compose                                    | Ne kazandırır                                  | Ne bozabilir                                                       |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| `--read-only --tmpfs /tmp`           | `read_only: true`, `tmpfs: [/tmp]`         | Saldırgan diske araç ve dosya bırakamaz        | `/tmp` dışına yazan kitaplıklar (önbellek): hata günlükte görünür, gerekeni tmpfs ya da birim yapın |
| `--cap-drop ALL`                     | `cap_drop: [ALL]`                          | Ağ ayarı, dosya sahipliği değiştirme vb. gider | 1024 altı kapıyı dinlemek (yüksek kapı kullanın), `chown` yapan giriş betiği |
| `--security-opt no-new-privileges`   | `security_opt: ["no-new-privileges:true"]` | setuid programla köke yükselme engellenir      | setuid'e dayanan araçlar (nadir)                                   |
| `--pids-limit 200`                   | `pids_limit: 200`                          | Süreç patlaması makineyi kilitlemez            | Çok süreçli iş: değeri ölçün                                       |
| `--memory 512m --cpus 1`             | `mem_limit`, `cpus`                        | Bir kapsayıcı makineyi yutamaz                 | Sınırı aşan süreç öldürülür (çıkış 137): ölçüp verin               |
| `-p 127.0.0.1:8310:8310`             | `ports: ["127.0.0.1:8310:8310"]`           | Kapı yalnız makineye; vekil dışarıya açar      | —                                                                  |

Hiçbir zaman: `--privileged`, `-v /var/run/docker.sock:…` (soketi gören kapsayıcı ana makinede kök olur),
`--network host`, `--pid host`, ana makinenin `/`, `/etc` ya da ev klasörünü bağlamak. Yayımlanan kapının güvenlik
duvarını atlaması: [Sunucu sertleştirme](sunucu-sertlestirme.md).

Compose karşılığı (anahtarlar bu makinede `docker compose config` ile doğrulandı; Docker sunucusu olmadığı için
kapsayıcı çalıştırılmadı, havuzdaki uygulamayla birlikte **denenmedi**):

```yaml
services:
  uygulama:
    image: uygulama:3f9a1c2          # git kısa özeti; latest değil
    user: "1000:1000"
    read_only: true
    tmpfs: ["/tmp:size=64m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 200
    mem_limit: 512m
    cpus: 1.0
    ports: ["127.0.0.1:8310:8310"]
    volumes: ["uygulama-veri:/data"]   # birim salt okunur kök dosya sisteminde de yazılabilir
    stop_grace_period: 20s
volumes:
  uygulama-veri:
```

Kısıtları tek tek ekleyip her birinden sonra uygulamayı deneyin (giriş, kayıt, yedek komutu); bir şey bozulursa
günlükteki `EACCES`, `EROFS` ya da `EPERM` hangi kısıtın neden olduğunu söyler.

## Katmanda kalan sır

İmaj katmanlardan oluşur; bir katmanda silinen dosya, üst katmana yazılan bir "beyazlatma" (whiteout) dosyasıyla
**gizlenir**, alt katmandan silinmez. Kapsayıcının içinde görünmeyen sır, imajı indiren herkesin elindedir
(`docker save` katmanları dosya olarak verir):

```python calistir
import io
import tarfile


def katman(dosyalar: dict[str, bytes]) -> bytes:
    tampon = io.BytesIO()
    with tarfile.open(fileobj=tampon, mode="w") as tar:
        for ad, veri in dosyalar.items():
            bilgi = tarfile.TarInfo(ad)
            bilgi.size = len(veri)
            tar.addfile(bilgi, io.BytesIO(veri))
    return tampon.getvalue()


# Dockerfile:  COPY .npmrc /root/.npmrc  →  RUN npm ci  →  RUN rm /root/.npmrc
IMAJ = [
    katman({"app/package.json": b"{}"}),
    katman({"root/.npmrc": b"//registry.example/:_authToken=npm_GIZLI_ANAHTAR"}),
    katman({"app/node_modules/kitaplik/index.js": b"module.exports = 1"}),
    katman({"root/.wh..npmrc": b""}),  # `rm` üst katmana beyazlatma dosyası yazar; alttaki kopya durur
]


def kapsayicinin_gordugu(katmanlar: list[bytes]) -> dict[str, bytes]:
    gorunum: dict[str, bytes] = {}
    for veri in katmanlar:
        with tarfile.open(fileobj=io.BytesIO(veri)) as tar:
            for uye in tar.getmembers():
                klasor, _, ad = uye.name.rpartition("/")
                if ad.startswith(".wh."):
                    gorunum.pop(f"{klasor}/{ad[4:]}", None)
                else:
                    gorunum[uye.name] = tar.extractfile(uye).read()
    return gorunum


assert "root/.npmrc" not in kapsayicinin_gordugu(IMAJ)  # kapsayıcının içinde dosya yok...
for sira, veri in enumerate(IMAJ):  # ...ama katmanları açan herkes görür
    if b"_authToken=" in veri:
        print(f"{sira}. katmanda sır duruyor: imajı dağıttığınız her yerde okunur")
```

```cikti
1. katmanda sır duruyor: imajı dağıttığınız her yerde okunur
```

- Derleme anındaki sır BuildKit sır bağlamasıyla gelir; `ARG`/`ENV`/`COPY` ile gelmez ([Docker](docker.md) → "Küçük
  ve güvenli imaj").
- Çok aşamalı derlemede sırrı yalnız ilk aşamada kullanmak son imajı korur; ama derleme önbelleğini kayıt deposuna
  bütün aşamalarıyla dışa aktarıyorsanız (`--cache-to`, en geniş kip) ara aşamaların katmanları da oraya gider.
- Sır imaja girdiyse sıra: **önce döndür** ([Sır yönetimi](../50-guvenlik/sir-yonetimi.md)), sonra imajı ve
  etiketlerini kayıt deposundan sil, temiz derle.

## İmaj taraması

Tarayıcı, imajdaki paketleri (işletim sistemi paketleri ve dil kilit dosyaları) açık veritabanlarıyla karşılaştırır;
her bulgu için önem derecesi ve düzelten sürümü verir. Araçlar (Trivy, Grype, Docker Scout gibi) komut ve çıktı
biçiminde farklıdır; kurulu sürümün belgesinden doğrulayın (doğrulanmadı).

| Bulgu                                                     | Karar                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Kritik/yüksek, düzelten sürüm var                         | Bugün: taban ya da paketi güncelle, yeniden derle, dağıt                   |
| Düzeltme yok                                              | Etkilenen işlev kullanılıyor mu, ağdan ulaşılır mı? Gerekçeyi yazın, izleyin |
| Yalnız derleme aşamasında                                 | Son imajı tarayın; derleme imajının bulgusu üretimi etkilemez              |
| Sizin kullanmadığınız taban paketinde                     | Daha küçük taban                                                           |
| Geliştirme bağımlılığında                                 | Son imaja girmiyorsa (`npm ci --omit=dev`) önemsiz                          |

- Hedef "sıfır bulgu" değil, "düzeltilebilir kritik bulgu sıfır"dır. İlki ekibi yorar ve bulgular görmezden
  gelinmeye başlar.
- Tarama iki yerde koşar: CI'da derlemeden sonra (kapı: düzeltilebilir kritik varsa dur) ve **düzenli olarak yayındaki
  imajlarda** — dün temiz olan imaj, bugün yayımlanan bir açıkla kirlenir.

## SBOM: imajın içerik listesi

SBOM (yazılım malzeme listesi), imajdaki her bileşenin adı, sürümü ve lisansıdır (biçimler: SPDX, CycloneDX).
Derlemede üretilir ve imajın özetiyle birlikte saklanır (bu makinedeki `docker buildx` 0.38'de `--sbom` seçeneği var;
çıktısı denenmedi). Değeri yeni bir açık duyurulduğunda ortaya çıkar: "hangi **çalışan** imajda o paketin etkilenen
sürümü var?" sorusu yeniden tarama beklemeden dakikalar içinde yanıtlanır:

```python calistir
def surum(metin: str) -> tuple[int, ...]:
    return tuple(int(p) for p in metin.split("."))


SBOM = {  # imaj → (paket türü, ad, sürüm); gerçekte derlemede üretilen SPDX/CycloneDX dosyası
    "uygulama:3f9a1c2": [("deb", "libornek", "3.0.13"), ("npm", "hono", "4.13.18"), ("npm", "zod", "4.6.7")],
    "uygulama:9b2e7d0": [("deb", "libornek", "3.0.15"), ("npm", "hono", "4.13.18"), ("npm", "zod", "4.6.7")],
    "rapor:51c0aa1": [("pypi", "pillow", "11.0.0"), ("deb", "libornek", "3.0.11")],
}
CALISAN = {"uretim/uygulama": "uygulama:3f9a1c2", "uretim/rapor": "rapor:51c0aa1"}  # ne nerede çalışıyor
UYARI = {"tur": "deb", "ad": "libornek", "duzelten": "3.0.15"}  # örnek (uydurma) bir güvenlik duyurusu

etkilenen = {imaj for imaj, paketler in SBOM.items() for tur, ad, s in paketler
             if (tur, ad) == (UYARI["tur"], UYARI["ad"]) and surum(s) < surum(UYARI["duzelten"])}
for yer, imaj in sorted(CALISAN.items()):
    print(f"{yer}: {imaj} → {'ETKİLENİYOR: yeniden derle ve dağıt' if imaj in etkilenen else 'temiz'}")
assert etkilenen == {"uygulama:3f9a1c2", "rapor:51c0aa1"}
```

```cikti
uretim/rapor: rapor:51c0aa1 → ETKİLENİYOR: yeniden derle ve dağıt
uretim/uygulama: uygulama:3f9a1c2 → ETKİLENİYOR: yeniden derle ve dağıt
```

Gerçek sürüm karşılaştırması paket türüne göre değişir (Debian sürümlerinde `3.0.13-1~deb12u1` gibi ekler vardır);
basit karşılaştırma yalnız gösterim içindir, kararı tarayıcı araca bırakın. "Ne nerede çalışıyor" listesini
(dağıtım kaydı) tutmazsanız SBOM'un yarısı işe yaramaz.

## Yeniden derleme sıklığı

| Yöntem                                                       | Sonuç                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Etiketle (`node:22-slim`), seyrek derleme                    | Taban aylarca eski; ne zaman değiştiği bilinmez                              |
| Özetle sabit (`@sha256:…`) + otomatik güncelleme önerisi     | Tekrarlanabilir ve düzenli güncel: **önerilen**                              |
| Haftalık zamanlanmış derleme + tarama + dağıtım              | Kod değişmese de yamalar gelir; özet sabitlemeyle birlikte                    |

- Yeniden derlemek çalışan kapsayıcıyı değiştirmez: yeni imajla kapsayıcı **yeniden yaratılmalıdır**.
- `docker build --pull` taban imajın en yenisini çeker; yoksa makinedeki eski kopya kullanılır.
- Bir önceki imaj silinmez: geri alma onunla yapılır ([Uygulama yayın tarifi](uygulama-yayin-tarifi.md)).
- Taban ve bağımlılık güncellemesinin yöntemi: [Tedarik zinciri](../50-guvenlik/tedarik-zinciri.md).

## Compose ve çalışma ayarı denetleyicisi

`docker compose config --format json` çıktısını alıp her servisi denetler (çıktı biçimi bu makinede docker compose
v5 ile doğrulandı; aşağıda kısaltılmış örnek):

```python calistir
import json

CIKTI = json.loads("""{"services": {
 "uygulama": {"image": "uygulama:3f9a1c2", "user": "1000:1000", "read_only": true, "tmpfs": ["/tmp:size=64m"],
   "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"], "pids_limit": 200, "mem_limit": "536870912",
   "ports": [{"host_ip": "127.0.0.1", "target": 8310, "published": "8310", "protocol": "tcp"}],
   "volumes": [{"type": "volume", "source": "uygulama-veri", "target": "/data"}]},
 "db": {"image": "postgres", "user": "root", "privileged": true,
   "ports": [{"target": 5432, "published": "5432", "protocol": "tcp"}],
   "volumes": [{"type": "bind", "source": "/var/run/docker.sock", "target": "/var/run/docker.sock"}]}}}""")


def denetle(servis: dict) -> list[str]:
    sorun = []
    if "user" not in servis:
        sorun.append("user yazılmamış: imajın USER'ı geçerli, imajda yoksa kök (docker run --rm imaj id)")
    elif str(servis["user"]).split(":")[0] in ("root", "0"):
        sorun.append("kök kullanıcı")
    if servis.get("privileged"):
        sorun.append("privileged: kapsayıcı ana makinede neredeyse kök")
    if any(c.get("source") == "/var/run/docker.sock" for c in servis.get("volumes", [])):
        sorun.append("Docker soketi bağlanmış: ana makinede kök demektir")
    if servis.get("network_mode") == "host":
        sorun.append("ana makinenin ağı paylaşılıyor")
    for kapi in servis.get("ports", []):
        if kapi.get("host_ip") not in ("127.0.0.1", "::1"):
            sorun.append(f"{kapi['published']} kapısı bütün arayüzlere yayımlanmış (güvenlik duvarını atlar)")
    if not servis.get("read_only"):
        sorun.append("kök dosya sistemi yazılabilir")
    if "ALL" not in servis.get("cap_drop", []):
        sorun.append("yetenekler kısılmamış (cap_drop: [ALL])")
    if "no-new-privileges:true" not in servis.get("security_opt", []):
        sorun.append("no-new-privileges yok")
    if "mem_limit" not in servis or "pids_limit" not in servis:
        sorun.append("bellek ya da süreç sınırı yok")
    if ":" not in servis["image"].rsplit("/", 1)[-1] or servis["image"].endswith(":latest"):
        sorun.append("imaj etiketsiz ya da latest")
    return sorun


assert denetle(CIKTI["services"]["uygulama"]) == []
for sorun in denetle(CIKTI["services"]["db"]):
    print("db:", sorun)
```

```cikti
db: kök kullanıcı
db: privileged: kapsayıcı ana makinede neredeyse kök
db: Docker soketi bağlanmış: ana makinede kök demektir
db: 5432 kapısı bütün arayüzlere yayımlanmış (güvenlik duvarını atlar)
db: kök dosya sistemi yazılabilir
db: yetenekler kısılmamış (cap_drop: [ALL])
db: no-new-privileges yok
db: bellek ya da süreç sınırı yok
db: imaj etiketsiz ya da latest
```

Denetleyici kaba bir süzgeçtir; resmî imajların bazıları (ör. veritabanları) kökle başlayıp kendi kullanıcısına
geçer. Her bulgu için "bu servis için kabul edilebilir mi" kararı yazılır, körü körüne kapatılmaz.

## Tuzaklar

| Belirti                                                         | Neden                                                        | Çözüm                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Silinen `.npmrc`/`.env` imaj katmanında bulundu                 | `COPY` sonra `RUN rm`; dosya alt katmanda kaldı              | BuildKit sır bağlaması; sızdıysa döndür                       |
| Ele geçirilen kapsayıcıda uygulama kodu değiştirildi            | Kod uygulama kullanıcısına aitti (`COPY --chown`)            | Kod kökün; yalnız veri klasörü kullanıcıya                    |
| Bir kapsayıcı ana makinenin bütün dosyalarını okudu             | Docker soketi bağlanmıştı ya da `privileged`                 | İkisi de yasak; denetleyici                                   |
| Sunucuda `docker` grubundaki stajyer kök oldu                   | `docker` grubu kök eşdeğeridir                               | Grubu yalnız yöneticilere; dağıtım için dar bir yol           |
| `read_only` açılınca uygulama "EROFS" ile çöktü                  | Kitaplık `/tmp` dışına yazıyor                               | Yazdığı yolu tmpfs ya da birim yapın                          |
| Kapsayıcı ara sıra 137 ile ölüyor                               | Bellek sınırı gerçek kullanımın altında                      | Ölçüp sınırı ayarlayın; sızıntıyı arayın                      |
| Tarayıcı 400 bulgu verdi, ekip bakmayı bıraktı                  | Hedef "sıfır bulgu"; tam dağıtım tabanı                      | Küçük taban; "düzeltilebilir kritik" kapısı                   |
| Yeni açık duyuruldu, hangi sunucunun etkilendiği günlerce bulunamadı | SBOM ve dağıtım kaydı yok                                | SBOM imajla birlikte; "ne nerede çalışıyor" listesi           |
| Taban imaj aylardır yamasız                                     | Kod değişmeyince derleme yapılmadı                           | Özetle sabitleme + otomatik güncelleme + haftalık derleme     |
| Yeni imaj derlendi ama sunucuda eskisi çalışıyor                | Kapsayıcı yeniden yaratılmadı                                | Yeni etiketle yeniden yarat; `docker inspect` ile denetle     |
| `latest` etiketiyle geri alınamadı                              | Önceki imajın adı yok                                        | Git özetiyle etiketleme; önceki imajı saklama                 |

## Denetim listesi

- [ ] Son imaj `-slim` ya da daha küçük; derleme araçları son aşamada yok.
- [ ] `docker run --rm imaj id` kök değil; uygulama kodu kullanıcı tarafından yazılamıyor (denendi).
- [ ] Katmanlarda sır yok (`docker history`, gerekirse `docker save` ile tarandı); derleme sırları BuildKit ile.
- [ ] Çalışma ayarında `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, bellek ve süreç sınırı var; uygulama bu
      kısıtlarla denendi.
- [ ] `privileged`, Docker soketi, `network_mode: host` ve ana makine klasörü bağlama yok.
- [ ] Kapılar `127.0.0.1` üzerinden yayımlanıyor.
- [ ] CI'da tarama kapısı (düzeltilebilir kritik bulguda dur) ve yayındaki imajların düzenli taraması var.
- [ ] Her yayımlanan imajın SBOM'u ve "ne nerede çalışıyor" kaydı saklanıyor.
- [ ] Taban imaj özetle sabit; güncelleme önerisi otomatik; en az haftalık yeniden derleme; önceki imaj saklanıyor.
- [ ] `docker` grubu yalnız yöneticilerde.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu compose servisini sertleştir: `user` sayısal ve kök değil, `read_only: true` + `/tmp` için
  tmpfs, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `mem_limit` ve `pids_limit`, kapılar
  `127.0.0.1:` ile. Uygulamanın yazdığı her yolu birim ya da tmpfs yap. Sonra `docker compose config --format json`
  çıktısını denetleyiciden geçir ve uygulamayı bu ayarlarla dene."
- **Modelin tipik hatası:** izin hatasında `privileged: true` ya da `user: root` önerir; Docker soketini "kolaylık"
  için bağlar; `COPY --chown` ile bütün kodu uygulama kullanıcısına verir; sırrı `RUN rm` ile "siler"; tarama
  bulgularının hepsini aynı önemde sayar; `latest` etiketiyle dağıtır.
- **Çıktıda arayın:** `privileged`, `docker.sock`, `network_mode: host`, `--chown` kapsamı, `ARG`/`ENV`'de sır,
  `RUN rm` ile silinen gizli dosyalar, `:latest`.

## İlgili

- [Docker](docker.md) (Dockerfile temelleri, denetleyici) · [Docker Compose](docker-compose.md) ·
  [Sunucu sertleştirme](sunucu-sertlestirme.md) (Docker ve güvenlik duvarı) · [Uygulama yayın tarifi](uygulama-yayin-tarifi.md)
- [Tedarik zinciri](../50-guvenlik/tedarik-zinciri.md) · [Sır yönetimi](../50-guvenlik/sir-yonetimi.md) ·
  [Olay müdahalesi](../50-guvenlik/olay-mudahalesi.md)
- Havuzda: [`uygulama/Dockerfile`](../../uygulama/Dockerfile), [`uygulama/.dockerignore`](../../uygulama/.dockerignore)
