---
baslik: "Zamanlanmış işler: cron, systemd zamanlayıcısı, CI ve platform zamanlayıcısı"
ozet: Düzenli işi nerede çalıştıracağınızın karar tablosu; çakışan çalıştırma ve bayat kilit dosyası, saat dilimi, kaçırılan çalıştırma politikası, çok kopyada çifte çalışma ve haber yokluğunu izleyen ölü adam anahtarı.
etiketler: [zamanlama, cron, systemd, izleme, devops, saat-dilimi]
duzey: orta
guncellik: 2026-11
---

# Zamanlanmış işler: cron, systemd zamanlayıcısı, CI ve platform zamanlayıcısı

> Bu notu ne zaman okumalı: gece yedeği, saatlik eşitleme, haftalık rapor, abonelik yenileme, eski kayıt temizliği
> gibi düzenli bir iş kurulurken; "rapor iki kez gitti", "yedek üç gündür alınmıyormuş", "iş yaz saatinde bir saat
> kaydı", "sunucu kapalıyken kaçan iş hiç çalışmadı" durumlarında.

## Temel fikir

Zamanlanmış bir iş dört biçimde bozulur ve dördü de **sessizdir**:

1. **Çalışmadı:** zamanlayıcı kapalı, makine kapalıydı, betik ortamda bulunamadı, depo etkinsiz diye CI zamanlaması durdu.
2. **İki kez çalıştı:** önceki tur bitmeden yenisi başladı ya da uygulamanın iki kopyası aynı anda tetikledi.
3. **Yanlış zamanda çalıştı:** saat dilimi ve yaz saati.
4. **Çalıştı ama iş yapmadı:** çıkış kodu 0, yedek 0 bayt; ya da yarıda takılı kaldı.

Zamanlayıcıyı bu dördünün çoğunu sizin yerinize çözene göre seçin; geri kalanını kodla çözün; ve **başarı haberinin
yokluğunu** izleyin. Zamanlayıcı yalnız tetikler: iş kaybolmamalıysa kalıcı kuyruğa konur ve oranın kurallarıyla koşar
([Kalıcı iş kuyruğu](../30-arkauc/kalici-is-kuyrugu.md)).

## Karar tablosu: iş nerede çalışmalı

| Zamanlayıcı                          | Çakışma                          | Kaçırılan tur                     | Saat dilimi                        | Günlük                    | Ne zaman seçilir                                             |
| ------------------------------------ | -------------------------------- | --------------------------------- | ---------------------------------- | ------------------------- | ------------------------------------------------------------ |
| cron (VPS)                           | Korumaz; `flock` gerekir         | Telafi etmez                      | Sistem saat dilimi                 | Siz yönlendirirsiniz      | Basit, tek sunuculu iş; systemd yoksa                        |
| systemd zamanlayıcısı (VPS)          | Kendiliğinden: birim çalışırken ikincisi başlamaz | `Persistent=true` ile açılışta bir kez | `OnCalendar` dilim adı alır        | `journalctl`'da hazır     | VPS'te varsayılan seçim                                      |
| CI zamanlaması (GitHub Actions gibi) | `concurrency` grubu ile          | Telafi etmez; yoğunlukta gecikir ya da düşer | Yalnız UTC                  | CI günlüğü                | Depoyla ilgili işler: bağımlılık denetimi, rapor üretimi     |
| Platformun zamanlayıcısı (PaaS)      | Platforma göre                   | Platforma göre                    | Platforma göre                     | Platform günlüğü          | Uygulama PaaS'taysa; davranışı belgesinden doğrulayın        |
| Uygulama içi + veritabanı            | Dilim anahtarı ve kira ile kodda | Kodda yazdığınız politika         | Kodda (dilim adıyla)               | Uygulama günlüğü          | Çok kopyalı uygulama; iş uygulama kodunu ve verisini kullanıyor |

- CI zamanlamasıyla **üretim veritabanına** dokunan iş çalıştırmayın: CI'ya üretim sırrı ve ağ erişimi vermek gerekir;
  iş, uygulamanın yanında çalışmalıdır. CI zamanlamasının ayrıntıları (UTC, yalnız varsayılan dal, etkinsiz depoda
  kapanma): [CI/CD](ci-cd.md).
- Uygulama içi zamanlayıcı birden çok kopyada **her kopyada** tetikler; tek çalıştırma hakkını veritabanında alın
  ([Arka plan işleri](../30-arkauc/arka-plan-isleri.md) → dönem kaydı; havuzda dilim anahtarlı
  [`sifirdan/veri/is_kuyrugu`](../../sifirdan/veri/is_kuyrugu/README.md)).

## Çakışan çalıştırma ve bayat kilit dosyası

İş bir sonraki tetiklemeye taşabilir. cron'da çare `flock -n`'dir (çalışan örnek:
[Veritabanı yedekleme](veritabani-yedekleme.md) → "Zamanlama"). Sık görülen yanlış, "kilit dosyası varsa çalışma"
yöntemidir (`touch`, PID dosyası): süreç `kill -9`, bellek aşımı ya da elektrik kesintisiyle ölürse dosya kalır ve iş
**bir daha hiç** çalışmaz. Çekirdek kilidi (`flock`) süreç ölünce kendiliğinden bırakılır:

```python calistir
import fcntl
import os
import signal
import subprocess
import sys
import tempfile

DIZIN = tempfile.mkdtemp()
COCUK = """
import fcntl, os, sys, time
kip, yol = sys.argv[1], sys.argv[2]
if kip == "dosya":  # "kilit dosyası varsa çalışma" (touch / PID dosyası alışkanlığı)
    os.close(os.open(yol, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
else:  # çekirdek kilidi: flock(1) komutunun yaptığı
    tutulan = open(yol, "w")
    fcntl.flock(tutulan, fcntl.LOCK_EX | fcntl.LOCK_NB)
print("basladi", flush=True)
time.sleep(30)  # uzun iş
"""


def baslat(kip: str, yol: str) -> subprocess.Popen:
    surec = subprocess.Popen([sys.executable, "-I", "-c", COCUK, kip, yol], stdout=subprocess.PIPE, text=True)
    assert surec.stdout.readline().strip() == "basladi"
    return surec


def dosya_kilidi(yol: str) -> bool:
    try:
        os.close(os.open(yol, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
    except FileExistsError:
        return False
    os.unlink(yol)
    return True


def cekirdek_kilidi(yol: str) -> bool:
    with open(yol, "w") as dosya:
        try:
            fcntl.flock(dosya, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        return True


for kip, dene in (("dosya", dosya_kilidi), ("flock", cekirdek_kilidi)):
    yol = os.path.join(DIZIN, f"yedek.{kip}")
    surec = baslat(kip, yol)
    assert not dene(yol)  # iki yöntem de iş sürerken ikinci çalıştırmayı engeller
    surec.send_signal(signal.SIGKILL)  # bellek aşımı, kill -9, makine çöktü
    surec.wait()
    print(f"{kip:5}: süreç öldükten sonra yeni çalıştırma {'başlayabildi' if dene(yol) else 'HİÇ BAŞLAYAMAZ (bayat kilit)'}")
```

```cikti
dosya: süreç öldükten sonra yeni çalıştırma HİÇ BAŞLAYAMAZ (bayat kilit)
flock: süreç öldükten sonra yeni çalıştırma başlayabildi
```

- Kilit dosyası yerel diskte olmalıdır; ağ dosya sistemlerinde (NFS) kilit güvenilmezdir.
- `flock -n` ikinci turu **atlar**; `flock` (bekleyerek) sıraya sokar. Yedekte atlamak, faturada sıraya sokmak doğrudur.
- systemd zamanlayıcısı bu sorunu kendisi çözer: hizmet birimi çalışırken tetiklenen tur yeni bir kopya başlatmaz.

## systemd zamanlayıcısının inceliği

Tam birim örneği (hizmet + zamanlayıcı, `systemd-analyze verify` ile denetlenmiş): [Veritabanı
yedekleme](veritabani-yedekleme.md) → "Zamanlama". Ek kararlar:

| Ayar                                   | Ne yapar                                                          | Ne zaman                                         |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| `OnCalendar=*-*-* 03:00:00 Europe/Istanbul` | Saati dilim adıyla verir                                      | İş bir iş gününe ya da yerel saate bağlıysa      |
| `Persistent=true`                      | Makine kapalıyken kaçan turu açılışta **bir kez** çalıştırır      | Yedek, temizlik                                  |
| `RandomizedDelaySec=10min`             | Tetiklemeyi rastgele geciktirir                                   | Çok makine aynı anda dış servise yüklenmesin     |
| `OnFailure=uyari@%n.service`           | Hizmet başarısız biterse başka bir birimi çalıştırır              | Hata bildirimi (bildirim birimini siz yazarsınız) |
| `TimeoutStartSec=30min` (hizmette)     | `Type=oneshot` hizmetin en uzun süresi (varsayılanı sınırsızdır)  | Takılan işi öldürmek                             |

`OnCalendar` ifadesini yazdıktan sonra sunucuya sorun: `systemd-analyze calendar --iterations=3 '*-*-* 03:00:00
Europe/Istanbul'` sonraki üç tetiklemeyi UTC karşılığıyla gösterir (bu makinede systemd 255 ile denendi: 03:00
İstanbul = 00:00 UTC). Kurulu zamanlayıcıların son ve sonraki çalışması: `systemctl list-timers`.

## cron'un bilinen tuzakları

| Belirti                                              | Neden                                                         | Çözüm                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Elle çalışıyor, cron'da "command not found"          | cron'un `PATH`'i çok kısadır; kabuk ayar dosyaları okunmaz     | Tam yollar; gereken değişkenleri satırda ya da betikte ver  |
| `date +%Y-%m-%d` içeren satır çalışmıyor             | crontab'da `%` yeni satır demektir                            | `\%` yazın ya da komutu betiğe taşıyın                      |
| Hata mesajı yok, iş yine de çalışmıyor               | Çıktı yerel postaya gider, kimse okumaz                       | `>> /var/log/is.log 2>&1` ya da `logger`; en iyisi systemd  |
| "Ayın 13'ü ve Cuma" yazdım, her Cuma çalışıyor       | Gün ve haftanın günü birlikte verilince **ya** kuralı          | Tek alan kullanın; kuralı betikte denetleyin                |
| Betik `bash` sözdizimiyle bozuluyor                  | cron satırı `/bin/sh` ile çalışır                             | `#!/usr/bin/env bash` olan betik dosyası çağırın            |
| Sunucunun saat dilimi değişince iş kaydı             | cron sistem saat dilimini kullanır                            | Sunucu UTC; saati UTC'ye çevirip yazın                      |

"Ya" kuralının (Vixie cron) çalışan gerçeklemesi ve testleri: [`sifirdan/veri/is_kuyrugu/cron.py`](../../sifirdan/veri/is_kuyrugu/cron.py).

## Saat dilimi ve yaz saati

- Sunucu **UTC**'de kalır; iş bir yerel saate bağlıysa saat dilimi ya zamanlayıcıya dilim adıyla verilir (systemd) ya
  da kodda hesaplanır. CI zamanlaması yalnız UTC bilir.
- Türkiye 2016'dan beri sabit UTC+3'tür; yaz saati yoktur. Ama yurt dışındaki kullanıcı, şube ya da sunucu bölgesi
  için yaz saati gecesinde 02:30'a kurulu iş **hiç** çalışmayabilir ya da **iki kez** çalışabilir. Çalışan örnek ve
  kurallar: [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md) → "Zamanlanmış iş ve saat dilimi".
- Dönem anahtarı (ör. "2026-11-23 raporu") işin yaşadığı dilimdeki tarihtir; UTC tarihi İstanbul'da gece 00:00–03:00
  arasında bir gün geridedir.

## Kaçırılan çalıştırma: politika iş başına

Sunucu Cuma 22:00'de kapandı, Pazartesi 09:00'da açıldı; her gün 03:00'te çalışan işlerin üç turu kaçtı. Ne
yapılacağı işin anlamına bağlıdır ve **önceden yazılır**:

```python calistir
from datetime import datetime, timedelta


def kacirilanlar(son: datetime, simdi: datetime, saat: int) -> list[datetime]:
    """Her gün `saat`te çalışan işin `son` ile `simdi` arasında kaçırdığı dilimler."""
    dilim = son.replace(hour=saat, minute=0) + timedelta(days=1)
    sonuc = []
    while dilim <= simdi:
        sonuc.append(dilim)
        dilim += timedelta(days=1)
    return sonuc


POLITIKA = {"gece-yedegi": "bir_kez", "gunluk-fatura-donemi": "hepsi", "gunaydin-bildirimi": "atla"}
son, simdi = datetime(2026, 11, 20, 3, 0), datetime(2026, 11, 23, 9, 30)  # Cuma 22:00 – Pazartesi 09:00 kapalı
kacan = kacirilanlar(son, simdi, saat=3)
for is_adi, politika in POLITIKA.items():
    calisacak = {"atla": [], "bir_kez": kacan[-1:], "hepsi": kacan}[politika]
    print(f"{is_adi:22} {politika:8} → {[f'{d:%d.%m}' for d in calisacak]}")
assert len(kacan) == 3
```

```cikti
gece-yedegi            bir_kez  → ['23.11']
gunluk-fatura-donemi   hepsi    → ['21.11', '22.11', '23.11']
gunaydin-bildirimi     atla     → []
```

| Politika   | İş türü                                         | Şart                                                       |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Atla       | Zamana bağlı bildirim, anlık görüntü            | Geç gelen iş anlamsız ya da zararlı                        |
| Bir kez    | Yedek, temizlik, önbellek yenileme              | Son durum yeter; üç yedek art arda gereksiz                |
| Hepsi      | Dönemsel hesap (günlük fatura, faiz, rapor)     | Her dönem **kendi** anahtarıyla, idempotent; sırayla        |

`Persistent=true` "bir kez"dir; "hepsi" gerekiyorsa dönem kaydını kod tutar.

## İzleme: ölü adam anahtarı

Hata bildirimi yalnız işin **çalışıp hata verdiği** durumu yakalar. Çalışmayan, takılan ya da boş biten işi
yakalamanın yolu **haberin yokluğunu** izlemektir: iş başında "başladı", sonunda "bitti + iş miktarı" haberi verir;
beklenen sürede haber gelmezse uyarı çıkar (izleme hizmeti izlenen sunucudan bağımsız olmalıdır:
[İzleme ve uyarı](izleme-ve-uyari.md)):

```python calistir
from datetime import datetime, timedelta

SAAT, GUN = timedelta(hours=1), timedelta(days=1)
BEKLENTI = {  # iş → (aralık + tolerans, en uzun süre, en az iş miktarı)
    "gece-yedegi": (GUN + SAAT, timedelta(minutes=30), 1_000_000),  # bayt
    "saatlik-esitleme": (SAAT + timedelta(minutes=10), timedelta(minutes=15), 1),  # kayıt
    "haftalik-rapor": (timedelta(days=7) + 6 * SAAT, SAAT, 1),
}
SINYAL = [  # iş başında "basladi", sonunda "bitti" + iş miktarı (izleme adresine gönderilen haberler)
    ("gece-yedegi", "basladi", "2026-11-23T00:17", None), ("gece-yedegi", "bitti", "2026-11-23T00:21", 48_000_000),
    ("saatlik-esitleme", "basladi", "2026-11-23T06:00", None), ("saatlik-esitleme", "bitti", "2026-11-23T06:01", 0),
    ("saatlik-esitleme", "basladi", "2026-11-23T07:00", None),
    ("haftalik-rapor", "basladi", "2026-11-14T03:00", None), ("haftalik-rapor", "bitti", "2026-11-14T03:20", 12),
]


def sure(td: timedelta) -> str:
    return f"{td.days} gün {td.seconds // 3600} saat" if td.days else f"{td.seconds // 60} dk"


def denetle(simdi: datetime) -> list[str]:
    uyari = []
    for ad, (en_gec, en_uzun, en_az) in BEKLENTI.items():
        olay = [(datetime.fromisoformat(z), tur, n) for a, tur, z, n in SINYAL if a == ad]
        biten = max((o for o in olay if o[1] == "bitti"), default=None)
        basla = max((o[0] for o in olay if o[1] == "basladi"), default=None)
        if biten is None or simdi - biten[0] > en_gec:  # haber YOKLUĞU
            uyari.append(f"{ad}: son başarılı çalışma {sure(simdi - biten[0]) if biten else 'hiç olmadı'} önce")
        if basla and (biten is None or basla > biten[0]) and simdi - basla > en_uzun:
            uyari.append(f"{ad}: {basla:%H:%M}'de başladı, {sure(simdi - basla)} geçti, bitmedi")
        if biten and biten[2] < en_az:
            uyari.append(f"{ad}: son çalışma 'başarılı' ama iş miktarı {biten[2]}")
    return uyari


for satir in denetle(datetime(2026, 11, 23, 7, 30)):
    print("UYARI", satir)
```

```cikti
UYARI saatlik-esitleme: son başarılı çalışma 89 dk önce
UYARI saatlik-esitleme: 07:00'de başladı, 30 dk geçti, bitmedi
UYARI saatlik-esitleme: son çalışma 'başarılı' ama iş miktarı 0
UYARI haftalik-rapor: son başarılı çalışma 9 gün 4 saat önce
```

- Haber, işin **son satırında** ve yalnız başarıda gönderilir; betiğin başında gönderilen tek haber "çalıştı" değil
  "başladı" demektir.
- İş miktarı (yedek boyutu, işlenen kayıt) haberle birlikte gider; "başarılı ama boş" ancak böyle yakalanır.
  Yedek boyutunun ani düşüşüne bakan örnek: [Veritabanı yedekleme](veritabani-yedekleme.md).
- Haber isteği işi bozmamalıdır: kısa zaman aşımıyla ve hatası yutularak gönderilir (`curl -fsS -m 10 … || true`).

## Tuzaklar

| Belirti                                                     | Neden                                                         | Çözüm                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Yedek üç gündür alınmıyor, kimse bilmiyor                    | Yalnız hata bildirimi vardı; iş hiç başlamadı                 | Ölü adam anahtarı: haber yokluğunda uyarı                   |
| İş bir kez çöktü, o günden beri hiç çalışmıyor              | Bayat kilit dosyası                                           | `flock` ya da systemd zamanlayıcısı                         |
| Rapor iki kez gönderildi                                    | Uygulamanın iki kopyası da tetikledi                          | Dönem anahtarı ya da tek zamanlayıcı                        |
| Uzun yedek bir sonrakiyle üst üste bindi, disk doldu        | Çakışma koruması yok                                          | `flock -n` ya da systemd; süre üst sınırı                   |
| CI'daki zamanlanmış iş haftalarca çalışmamış                | Depo etkinsiz kaldı, zamanlama kapandı; ya da varsayılan dal değil | Ölü adam anahtarı; elle tetikleme düğmesi                |
| İş yurt dışı müşteride yaz saatinde bir saat kaydı          | Saat UTC'de sabit yazıldı                                     | Dilim adıyla zamanlama                                      |
| Sunucu açıldıktan sonra üç gece yedeği arka arkaya koştu    | Kaçırılan turların hepsi telafi edildi                        | Yedekte "bir kez" politikası                                |
| Fatura dönemlerinden biri hiç hesaplanmadı                  | Kaçırılan tur atlandı                                         | "Hepsi" politikası + dönem anahtarı                         |
| Elle çalışan betik cron'da sessizce başarısız               | `PATH`, `%`, `/bin/sh` farkları; çıktı kayboluyor             | Tam yol, betik dosyası, günlüğe yönlendirme                 |
| İş "başarılı" ama tablo boş                                 | Boş başarı izlenmiyor                                         | Haberle iş miktarı; eşik altında uyarı                      |

## Denetim listesi

- [ ] Her düzenli iş için zamanlayıcı tablodaki ölçütlerle seçildi; üretim verisine dokunan iş CI'da değil.
- [ ] Çakışma koruması var (`flock` ya da systemd); kilit dosyası yöntemi kullanılmıyor.
- [ ] Çok kopyada iş bir kez çalışıyor (dönem anahtarı ya da tek zamanlayıcı).
- [ ] Saat dilimi bilinçli: sunucu UTC; yerel saate bağlı iş dilim adıyla zamanlanmış (`systemd-analyze calendar` ile denetlendi).
- [ ] Kaçırılan çalıştırma politikası (atla / bir kez / hepsi) iş başına yazılı.
- [ ] Her işin en uzun süresi ve zaman aşımı var.
- [ ] Ölü adam anahtarı: başladı/bitti haberleri, iş miktarı, beklenen aralık; izleme izlenen sunucudan bağımsız.
- [ ] İşlerin çıktısı bir günlükte (`journalctl` ya da dosya) ve okunabiliyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Bu işi VPS'te systemd zamanlayıcısıyla kur: `OnCalendar` dilim adıyla, `Persistent=true`,
  hizmette `Type=oneshot` ve `TimeoutStartSec`. İşin sonunda başarıyla birlikte iş miktarını izleme adresine gönder
  (`curl -fsS -m 10 … || true`). Kaçırılan tur politikası: bir kez. Komutları `systemd-analyze verify` ve
  `systemd-analyze calendar` ile doğrula."
- **Modelin tipik hatası:** cron satırında göreli yol ve `%` kullanır; çakışma korumasını PID dosyasıyla yapar;
  CI zamanlamasını yerel saatle yazar; uygulama içi zamanlayıcıyı çok kopyada korumasız bırakır; izlemeyi yalnız hata
  bildirimi sanır; haberi betiğin başında gönderir.
- **Çıktıda arayın:** `touch` / `.pid` ile kilit; crontab'da kaçışsız `%`; `OnCalendar` ya da cron ifadesinin hangi
  saat dilimine göre yazıldığı; başarı haberinin betiğin son satırı olup olmadığı.

## İlgili

- [Arka plan işleri](../30-arkauc/arka-plan-isleri.md) (dönem kaydı, çifte çalışma) · [Kalıcı iş kuyruğu](../30-arkauc/kalici-is-kuyrugu.md)
  (dilim anahtarı, zamanlanmış işin kuyruğa girişi) · [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md)
- [Veritabanı yedekleme](veritabani-yedekleme.md) (flock örneği, systemd birimi, yedek tazelik uyarısı) ·
  [İzleme ve uyarı](izleme-ve-uyari.md) · [CI/CD](ci-cd.md) · [Sunucuda Linux temelleri](linux-temelleri.md)
- Havuzda: [`sifirdan/veri/is_kuyrugu/cron.py`](../../sifirdan/veri/is_kuyrugu/cron.py) (cron ayrıştırıcı),
  [`kutuphane/py/kutuphane/cron.py`](../../kutuphane/py/kutuphane/cron.py) (sonraki çalışma anı),
  [`uygulama/api/src/maintenance.ts`](../../uygulama/api/src/maintenance.ts) (süreç içi saatlik bakım)
