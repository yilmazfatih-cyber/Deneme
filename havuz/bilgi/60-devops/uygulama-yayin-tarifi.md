---
baslik: "Uygulama yayın tarifi: havuzdaki uygulamayı bir VPS'e kurmak ve güncellemek"
ozet: Havuzdaki tam yığın uygulamayı tek sunucuya kurmanın yol haritası; tek kapsayıcı ve kalıcı birim, ters vekil ve HTTPS, ilk yönetici, yedek zamanlayıcısı, güncelleme adımları, migrasyonlu sürümde geri alma ve duman testi.
etiketler: [yayin, vps, docker, https, yedek, geri-alma]
duzey: orta
guncellik: 2026-11
---

# Uygulama yayın tarifi: havuzdaki uygulamayı bir VPS'e kurmak ve güncellemek

> Bu notu ne zaman okumalı: [`havuz/uygulama`](../../uygulama/README.md) (ya da ondan türetilmiş bir proje) ilk kez
> bir VPS'e kurulurken; bir güncelleme yayınlanırken; yayından sonra bir şey bozulup "geri alalım" denince.
> Uygulanabilir tarif: [`tarifler/tek-sunucuda-yayin`](../../tarifler/tek-sunucuda-yayin/) (bu not yazılırken
> tarif yazılıyordu; `tarif.json`'a göre uygulamayı ve siteyi aynı makineye systemd birimleri, Caddy, saklama süreli
> yedek zamanlayıcısı, geri yükleme betiği ve sağlık denetimiyle kurar: `python havuz/tarifler/tek-sunucuda-yayin/uygula.py
> <proje>`). Komutların kaynağı uygulamanın kendi belgesidir: [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md).
> Bu not iki yolu da (Docker ve Docker'sız systemd) kapsayan **sırayı, karar noktalarını ve her adımın doğrulamasını** verir.

## Temel fikir

- **Biçim:** tek VPS, tek servis (API ve derlenmiş web aynı kökenden; ya bir kapsayıcı ya bir systemd birimi),
  kalıcı diskte tek veri klasörü (SQLite dosyası ve yedekler), önünde HTTPS'i yapan Caddy, yedekler sunucunun
  dışında. Uygulama **tek kopya** çalışır: SQLite, bellek içi hız sınırı ve anlık bildirim merkezi tek süreçtir
  (YAYINLAMA §7).
- **Güncelleme yerinde yapılır** (durdur, yenisini başlat): birkaç saniyelik kesinti. İstemci çevrimdışı-önce
  çalıştığı için kullanıcı bunu çoğu zaman fark etmez ([Dağıtım stratejileri](dagitim-stratejileri.md)).
- **En önemli tuzak:** uygulama migrasyonları açılışta kendiliğinden uygular ve kendisinden **yeni** bir veritabanında
  açılmaz ("Veritabanında uygulanmış … migrasyonu kod klasöründe yok", [`migrate.ts`](../../uygulama/api/src/db/migrate.ts)).
  Migrasyon içeren bir sürümden sonra eski sürüme (imaj ya da klasör) dönmek **çalışmaz**; servis sürekli yeniden
  başlar. Bu yüzden her yayından önce yedek alınır ve geri dönüş yolu yayından **önce** yazılır.

## Karar tablosu: Docker mı, systemd mi

| Yol                                   | Artısı                                                    | Bedeli                                                              |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| systemd birimi, Docker'sız (tarifin yolu) | Daha az katman; güvenlik duvarı ve `docker` grubu tuzağı yok | Node sunucuya kurulur ve sürümü elle yönetilir (Node ≥ 22.18, YAYINLAMA §7); geri alma = önceki sürüm klasörü |
| Tek kapsayıcı (YAYINLAMA §2)          | İmaj her yerde aynı; geri alma = önceki etiket            | Yayımlanan kapı duvarı atlar; kapsayıcı ayarları ayrıca sertleştirilir |

İki yolda da kararlar aynıdır: kalıcı disk, uygulama yalnız `127.0.0.1`'de, durdurma süresi uygulamanın 10 saniyesinden
uzun (Docker'da `--stop-timeout 20`, systemd'de `TimeoutStopSec=20`; birim örneği: [Linux temelleri](linux-temelleri.md)),
sırlar ortam dosyasında (`--env-file` ya da `EnvironmentFile=`), migrasyonlu sürümde geri alma planı. Aşağıdaki komutlar
Docker yolunu gösterir; systemd yolunun karşılığı tariftedir.

## Yol haritası: boş sunucudan yayına

| #  | Adım                                                                 | Ayrıntı nerede                                                       | Doğrulama                                                          |
| -- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0  | Karar: kalıcı diskli VPS (geçici diskte gerçek kullanıcı alınmaz)     | [Yayın yolu seçimi](yayin-yolu-secimi.md), YAYINLAMA §1              | Disk "kalıcı" yazıyor; plan bilinçli seçildi                        |
| 1  | Sunucuyu sertleştir                                                  | [Sunucu sertleştirme](sunucu-sertlestirme.md)                        | `sshd -T`, `ufw status verbose`, `ss -tulpn`                        |
| 2  | Docker'ı kur; `docker` grubunu yalnız yöneticilere ver               | [Kapsayıcı güvenliği](kapsayici-guvenligi.md)                        | `docker version` sunucu satırını gösterir                          |
| 3  | Alan adının A (ve varsa AAAA) kaydını sunucuya yönelt                 | [Alan adı ve DNS](alan-adi-ve-dns.md)                                | `dig +short alanadi` sunucunun adresi                               |
| 4  | İmajı derle, git özetiyle etiketle                                   | YAYINLAMA §2, [Docker](docker.md)                                    | `docker image ls uygulama` etiketi gösterir; `latest` yok          |
| 5  | Ortam dosyası `/etc/uygulama/uygulama.env` (kökün, `600`)             | YAYINLAMA §6, [Ortam ve yapılandırma](ortam-ve-yapilandirma.md)       | Hatalı ayarda sunucu başlamaz ve her sorunu Türkçe listeler        |
| 6  | Kapsayıcıyı başlat (aşağıdaki komut)                                 | YAYINLAMA §2                                                         | `docker logs uygulama` → "sunucu hazır"; `curl -s 127.0.0.1:8310/api/health` |
| 7  | Caddy: alan adı → `127.0.0.1:8310`, `flush_interval -1`              | YAYINLAMA §4, [Ters vekil](ters-vekil.md), [HTTPS](https-ve-sertifikalar.md) | `curl -sSI https://alanadi/api/health` → 200 ve HSTS         |
| 8  | İlk yönetici: `ADMIN_EMAILS` adresiyle **hemen** kaydol               | YAYINLAMA §6, [`GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md)        | Açılış günlüğünde "henüz hesabı yok" uyarısı yok                    |
| 9  | Yedek zamanlayıcısı + sunucu dışına kopya + tazelik uyarısı           | [Zamanlanmış işler](zamanlanmis-isler.md), [Veritabanı yedekleme](veritabani-yedekleme.md) | `systemctl list-timers`; sunucu dışında bugünkü dosya |
| 10 | Geri yükleme tatbikatı (bir kez, ayrı klasörde)                      | YAYINLAMA §5                                                         | Süre ve sorunlar tatbikat notunda                                   |
| 11 | Dışarıdan sağlık yoklaması, disk uyarısı                             | [İzleme ve uyarı](izleme-ve-uyari.md)                                | Uyarı bir kez bilerek tetiklendi                                    |
| 12 | Duman testi (aşağıda)                                                | [İlk yayın denetim listesi](ilk-yayin-denetim-listesi.md)            | Liste tamam                                                         |

Kapsayıcı (Docker sunucusu olmadığı için bu ortamda çalıştırılmadı; YAYINLAMA'daki komutun ortam dosyalı hâli):

```bash
docker volume create uygulama-veri
docker run -d --name uygulama --restart unless-stopped --stop-timeout 20 \
  -p 127.0.0.1:8310:8310 -v uygulama-veri:/data --env-file /etc/uygulama/uygulama.env \
  uygulama:3f9a1c2
```

- `-p 127.0.0.1:…`: kapı yalnız makineye açıktır; dışarıya Caddy açar. `-p 8310:8310` güvenlik duvarını atlar.
- `--stop-timeout 20`: uygulama kapanışı 10 saniyede zorla bitirir; Docker'ın varsayılan bekleme süresi de 10
  saniyedir ve ikisi yarışır. 20 saniye pay verir ([`index.ts`](../../uygulama/api/src/index.ts) → `SHUTDOWN_TIMEOUT_MS`).
- `--env-file`: sırlar komut geçmişine düşmez. Dosyada değerleri tırnaklamayın: `docker run`'ın ortam dosyası
  ayrıştırıcısı tırnakları değerin parçası sayar (Compose'un `.env` okuması farklıdır; kurulu sürümde doğrulayın).
- Kapsayıcı kısıtları (`read_only`, `cap_drop` …) bu uygulamayla henüz denenmedi; ekleyecekseniz tek tek ekleyip
  her birinden sonra duman testini koşun ([Kapsayıcı güvenliği](kapsayici-guvenligi.md)).

## Yedek zamanlayıcısı

Uygulamanın yedek komutu tutarlı bir kopyayı `/data/yedek/uygulama-YYYYMMDD-HHMMSS.db` olarak **aynı birime** yazar,
eskileri silmez ve şifrelemez ([`scripts/backup.ts`](../../uygulama/api/scripts/backup.ts)). Üç şey sizin işinizdir:
sunucu dışına kopya, döndürme (eskileri silme) ve izleme. Tarif, saklama süreli yedek zamanlayıcısını ve geri yükleme
betiğini hazır kurar (`tarif.json`); Docker yolunda örnek betik (denenmedi; Docker sunucusu yok):

```bash
#!/usr/bin/env bash
# /srv/uygulama/yedekle.sh — systemd zamanlayıcısı çalıştırır (birim örneği: Veritabanı yedekleme notu)
set -euo pipefail
docker exec uygulama npm run backup
yeni=$(docker exec uygulama sh -c 'ls -1t /data/yedek/*.db | head -n 1')
docker cp "uygulama:$yeni" /srv/yedek/                     # sonra buradan sunucu dışına (yalnız yazabilen anahtarla)
docker exec uygulama sh -c 'ls -1t /data/yedek/*.db | tail -n +8 | xargs -r rm --'   # birimde son 7 yedek
boyut=$(stat -c %s "/srv/yedek/$(basename "$yeni")")
curl -fsS -m 10 "https://izleme.example/ping/yedek?boyut=$boyut" > /dev/null || true   # ölü adam anahtarı
```

Sunucu dışındaki kopyanın şifrelenmesi, silinemez saklama ve yedeği çeken ikinci makine:
[Yedek ve fidye yazılımı](../50-guvenlik/yedek-ve-fidye-yazilimi.md). Geri yükleme adımları (sunucuyu durdur, dosyayı
koy, `-wal` ve `-shm` dosyalarını **sil**, başlat): YAYINLAMA §5.

## Güncelleme adımları

Her yayın için önce kısa bir **yayın notu** yazılır: önceki etiket, yeni etiket, migrasyon var mı, alınan yedeğin adı,
geri dönüş yolu. Aşağıdaki yardımcı bu notu `git diff --name-only ESKI YENI` çıktısından üretir:

```python calistir
def yayin_plani(onceki: str, yeni: str, degisen: list[str]) -> list[str]:
    """`git diff --name-only ONCEKI YENI` çıktısından yayın ve geri alma planı (havuz/uygulama düzeni)."""
    gocler = sorted(d.rsplit("/", 1)[-1] for d in degisen if d.startswith("api/migrations/") and d.endswith(".sql"))
    plan = [
        f"derle: docker build --pull -t uygulama:{yeni} .  (uygulama:{onceki} silinmez)",
        "yedek: docker exec uygulama npm run backup  → dosya adını yayın notuna yaz, sunucu dışına kopyala",
        f"değiştir: docker stop -t 20 uygulama; docker rm uygulama; docker run … uygulama:{yeni}",
        "günlük: 'sunucu hazır'" + (f" + 'migrasyonlar uygulandı: {', '.join(gocler)}'" if gocler else ""),
        "duman testi: /api/health sürümü, giriş, kayıt yaz-oku, ikinci cihazda eşitleme",
    ]
    if gocler:
        plan.append(f"geri alma: uygulama:{onceki} bu veritabanıyla AÇILMAZ ({len(gocler)} yeni migrasyon). Önce ileri"
                    " düzelt; olmazsa yedeği geri yükle + eski imaj (yedekten sonraki yazmalar sunucudan gider)")
    else:
        plan.append(f"geri alma: docker run … uygulama:{onceki} (şema değişmedi; veri olduğu gibi kalır)")
    return plan


for satir in yayin_plani("3f9a1c2", "9b2e7d0", ["web/src/features/tasks/List.tsx", "api/migrations/0005_etiketler.sql"]):
    print("-", satir)
assert "AÇILMAZ" in yayin_plani("a", "b", ["api/migrations/0005_x.sql"])[-1]
assert "şema değişmedi" in yayin_plani("a", "b", ["web/src/app.tsx"])[-1]
```

```cikti
- derle: docker build --pull -t uygulama:9b2e7d0 .  (uygulama:3f9a1c2 silinmez)
- yedek: docker exec uygulama npm run backup  → dosya adını yayın notuna yaz, sunucu dışına kopyala
- değiştir: docker stop -t 20 uygulama; docker rm uygulama; docker run … uygulama:9b2e7d0
- günlük: 'sunucu hazır' + 'migrasyonlar uygulandı: 0005_etiketler.sql'
- duman testi: /api/health sürümü, giriş, kayıt yaz-oku, ikinci cihazda eşitleme
- geri alma: uygulama:3f9a1c2 bu veritabanıyla AÇILMAZ (1 yeni migrasyon). Önce ileri düzelt; olmazsa yedeği geri yükle + eski imaj (yedekten sonraki yazmalar sunucudan gider)
```

systemd yolunda "değiştir" adımı: yeni sürümü ayrı bir klasöre kur, bağımlılıkları kilitten kur, sembolik bağı ya
da birimdeki yolu yeni klasöre çevir, `systemctl restart`; önceki klasör geri alma için durur.

| Nerede derlenir                               | Artısı                                    | Bedeli                                                    |
| --------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Sunucuda (`docker build`)                     | Kayıt deposu gerekmez                     | Küçük VPS'te derleme sırasında uygulama yavaşlar; trafiğin az olduğu saat |
| CI'da derle, kayıt deposundan çek             | Sunucu yorulmaz; aynı imaj sınanıp yayınlanır | Kayıt deposu hesabı ve sırrı ([CI/CD](ci-cd.md))      |
| Yerelde derle; `docker save` ile dosyaya, sunucuda `docker load` | Basit, depo yok         | Mimari farkı (ARM dizüstü → amd64 sunucu): `--platform linux/amd64` |

## Geri alma: hangi yol

| Durum                                                         | Yol                                                     | Bedel                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Sürümde migrasyon yok                                         | Önceki etiketle kapsayıcıyı yeniden yarat               | Saniyeler; veri kaybı yok                                     |
| Migrasyon var, hata küçük, düzeltme hızlı ve testli            | **İleri düzelt:** yeni sürüm                            | Dakikalar                                                     |
| Migrasyon var, uygulama kullanılamıyor, düzeltme uzun          | Yedeği geri yükle + önceki imaj                         | Yedekten sonraki sunucu yazmaları gider; istemciler eski sunucuyu fark eder (`reset`) ve kullanıcı "buradakini gönder" ile cihazındakini yeniden yollayabilir ([`ESITLEME.md`](../../uygulama/docs/ESITLEME.md)) |
| Ayar hatası                                                   | Ortam dosyasını düzelt, kapsayıcıyı yeniden yarat       | Saniyeler                                                     |
| `_migrations` tablosundan satır silip eski imajı açmak         | **Yapmayın**                                            | Kod ile şema uyuşmaz; sessiz veri bozulması                   |

Genel kural "şema yalnız genişletildiyse eski kod çalışır" ([Dağıtım stratejileri](dagitim-stratejileri.md)) bu
uygulamada geçerli **değildir**: koşucu, tanımadığı migrasyonu görünce açılmayı reddeder. Geri alınabilirlik
isteniyorsa migrasyonlu değişiklik ayrı ve küçük bir yayında çıkar; aynı yayına riskli kod konmaz.

## Duman testi

- `curl -fsS https://alanadi/api/health` → `"ok":true` ve beklenen `version`. Sürüm `api/package.json`'dan okunur;
  artırılmazsa her yayında aynı görünür ve hangi kodun çalıştığı anlaşılmaz. Kesin bilgi:
  `docker inspect -f '{{.Config.Image}}' uygulama`.
- `curl -sSI https://alanadi/` → `Strict-Transport-Security` ve `Content-Security-Policy` başlıkları var
  ([Güvenlik başlıkları ve HTTPS](../50-guvenlik/guvenlik-basliklari-ve-https.md)).
- Tarayıcıda giriş; bir kayıt ekle; ikinci cihazda ya da sekmede kaydın birkaç saniyede geldiğini gör (anlık bildirim
  vekilden geçiyor mu).
- `docker logs --since 10m uygulama` içinde `"level":"error"` yok.
- Yedek komutu çalışıyor (yayından hemen önce alınan yedek zaten bunu gösterir).

## Tuzaklar

| Belirti                                                         | Neden                                                        | Çözüm                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Yeniden başlatmadan sonra bütün kullanıcılar ve kayıtlar yok    | Veritabanı geçici diskte ya da birim bağlanmamış             | `-v uygulama-veri:/data`; kalıcı diskli plan                  |
| Uygulama HTTPS'siz olarak internetten açık                      | `-p 8310:8310`; Docker güvenlik duvarını atladı              | `-p 127.0.0.1:8310:8310`                                      |
| Eski imaja dönünce kapsayıcı sürekli yeniden başlıyor           | Migrasyon koşucusu yeni veritabanını reddediyor              | İleri düzelt ya da yedek + eski imaj; `_migrations`'a dokunma |
| Herkes aynı anda "çok fazla deneme" alıyor                      | `TRUST_PROXY` yanlış: bütün istekler vekilin adresinden      | `TRUST_PROXY=1` (tek vekil); günlükte farklı IP'ler           |
| Anlık güncellemeler gelmiyor ya da gecikiyor                    | Vekil yanıtı arabelleğe alıyor                               | Caddy'de `flush_interval -1` (YAYINLAMA §4)                   |
| Tanımadığınız biri yönetici oldu                                | `ADMIN_EMAILS` adresi kaydedilmeden site açıldı              | Önce kendiniz kaydolun; günlükteki uyarıyı okuyun             |
| Disk doldu, uygulama yazamıyor                                  | Yedekler aynı birimde birikiyor                              | Birimde son N yedek; asıl kopyalar sunucu dışında             |
| Geri yüklenen veritabanında tuhaf, karışık kayıtlar             | Eski `-wal`/`-shm` dosyaları silinmedi                       | Geri yüklemede ikisini de silin                               |
| Her yayında günlükte "zorla kapandı"                            | Docker 10 sn sonra öldürüyor; uygulama da 10 sn bekliyor     | `--stop-timeout 20`                                           |
| `MAIL_FROM` değeri tırnaklarıyla birlikte gidiyor               | Ortam dosyasında tırnak kullanıldı                           | Tırnaksız yazın                                               |
| Hangi sürümün çalıştığı bilinmiyor                              | `latest` etiketi; `version` artırılmadı                      | Git özetiyle etiket; `docker inspect`; sürümü artırın         |
| Derleme sırasında site dakikalarca yavaşladı                    | Küçük VPS'te derleme                                         | CI'da derleyin ya da trafiğin az olduğu saatte                |

## Denetim listesi

- [ ] Disk kalıcı; veritabanı `/data` biriminde; kapsayıcı silinip yeniden yaratılınca kayıtlar duruyor (denendi).
- [ ] Kapı yalnız `127.0.0.1`'de; dışarıdan `nc -vz sunucu 8310` bağlanamıyor.
- [ ] Ortam dosyası kökün ve `600`; `NODE_ENV=production`, `APP_URL=https://…`, `TRUST_PROXY=1`; `RATE_LIMIT` satırı yok.
- [ ] Caddy sertifikayı aldı; `flush_interval -1` var; HSTS başlığı görünüyor.
- [ ] `ADMIN_EMAILS` adresiyle ilk hesap açıldı.
- [ ] Yedek zamanlayıcısı çalışıyor; kopya sunucu dışında; birimde döndürme var; tazelik uyarısı kurulu.
- [ ] Geri yükleme bir kez ayrı klasörde denendi; süresi biliniyor.
- [ ] Her yayının notu var: önceki/yeni etiket, migrasyon, yedek adı, geri dönüş yolu.
- [ ] Önceki imaj saklanıyor; imajlar git özetiyle etiketli.
- [ ] Duman testi her yayından sonra koşuldu.

## Küçük modele yaptırırken

- **İsteme yazın:** "Havuzdaki uygulamayı `uygulama/docs/YAYINLAMA.md`'ye göre kur. Kapsayıcıyı `-p 127.0.0.1:8310:8310`,
  `-v uygulama-veri:/data`, `--env-file`, `--stop-timeout 20` ile başlat. Her güncellemeden önce yedek al ve yayın
  notunu yaz: migrasyon varsa eski imajın açılmayacağını ve geri dönüş yolunu belirt. Her adımdan sonra doğrulama
  komutunu ver ve çıktıyı benden iste."
- **Modelin tipik hatası:** `-p 8310:8310` yazar; birimi unutur; `latest` etiketi kullanır; geri almayı "önceki imajı
  çalıştır" diye tek satırla geçer (migrasyonu hesaba katmaz); yedeği yalnız aynı birimde bırakır; geri yüklemede
  `-wal`/`-shm` dosyalarını silmez; ortam dosyasına tırnaklı değer yazar; çıkan hatada `_migrations` tablosunu elle
  düzeltmeyi önerir.
- **Çıktıda arayın:** `-p` satırında `127.0.0.1`; `-v …:/data`; etiket biçimi; yayın notunda migrasyon satırı; geri
  yükleme adımlarında `-wal`/`-shm`.

## İlgili

- [Sunucu sertleştirme](sunucu-sertlestirme.md) · [Kapsayıcı güvenliği](kapsayici-guvenligi.md) ·
  [Ters vekil](ters-vekil.md) · [HTTPS ve sertifikalar](https-ve-sertifikalar.md)
- [Dağıtım stratejileri](dagitim-stratejileri.md) · [Zamanlanmış işler](zamanlanmis-isler.md) ·
  [Veritabanı yedekleme](veritabani-yedekleme.md) · [İlk yayın denetim listesi](ilk-yayin-denetim-listesi.md)
- [Geriye uyumlu değişim](../40-sistem-tasarimi/geriye-uyumlu-degisim.md) · [Migrasyonlar](../30-arkauc/migrasyonlar.md)
- Havuzda: [`tarifler/tek-sunucuda-yayin`](../../tarifler/tek-sunucuda-yayin/) (uygulanabilir tarif),
  [`uygulama/docs/YAYINLAMA.md`](../../uygulama/docs/YAYINLAMA.md), [`uygulama/Dockerfile`](../../uygulama/Dockerfile),
  [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) (yayın öncesi denetim listesi)
