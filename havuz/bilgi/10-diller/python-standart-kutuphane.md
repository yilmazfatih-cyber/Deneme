---
baslik: Python standart kütüphanesi tuzakları
ozet: collections, itertools, functools.lru_cache, logging, argparse ve ortam değişkeni, subprocess, zaman ölçümü, random ile secrets ve Türkçe sıralamada sık yapılan hatalar ve doğru kalıplar.
etiketler: [python, standart-kutuphane, logging, subprocess, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Python standart kütüphanesi tuzakları

> Bu notu ne zaman okumalı: `groupby`, `defaultdict`, `lru_cache`, `logging`, `argparse`, `os.environ`,
> `subprocess`, `random` kullanan bir kod yazarken ya da incelerken; "günlük görünmüyor", "False verdim True oldu",
> "önbellekteki ayar değişti", "komut hata verdi ama betik devam etti" gibi sorunlarda.

## Temel fikir

- Standart kütüphane güvenilirdir ama birçok işlevin **varsayılanı** sizin beklediğiniz şey değildir: `groupby`
  sıralı girdi ister, `basicConfig` ikinci kez çağrılınca bir şey yapmaz, `subprocess.run` hatada durmaz,
  `type=bool` her metni `True` yapar.
- Bu tuzakların ortak belirtisi **sessizliktir**: istisna yok, yanlış davranış var. Bu yüzden her biri için bir
  test yazmak ucuzdur.
- Güvenlik açısından iki kural: rastgele **belirteç** için `secrets`, komut çalıştırmak için `shell=False` + liste.
- Bu nottaki davranışlar Python 3.13 ile denendi; sürüm gerektirenler yanlarında yazıyor.

## collections ve itertools

```python calistir
from collections import Counter, defaultdict, deque
from itertools import batched, groupby

satislar = [("İzmir", 5), ("Van", 2), ("İzmir", 3)]

# YANLIŞ: groupby yalnız ARDIŞIK eşit öğeleri gruplar; sıralanmamış girdide grup bölünür
yanlis = [(il, sum(a for _, a in grup)) for il, grup in groupby(satislar, key=lambda s: s[0])]
assert yanlis == [("İzmir", 5), ("Van", 2), ("İzmir", 3)]
# DOĞRU: önce aynı anahtarla sırala ya da sözlükte topla
dogru = [(il, sum(a for _, a in grup)) for il, grup in groupby(sorted(satislar), key=lambda s: s[0])]
assert dogru == [("Van", 2), ("İzmir", 8)]  # kod noktası sırası: "V" < "İ"

# defaultdict OKUMADA da anahtar oluşturur: "var mı" denetimi listeyi kirletir
stok: defaultdict[str, list[int]] = defaultdict(list)
if stok["çay"]:  # yalnız bakmak istedik
    pass
assert "çay" in stok  # ama anahtar oluştu
assert stok.get("simit") is None and "simit" not in stok  # DOĞRU: .get ya da `in`

# Counter çıkarması sıfır ve eksileri atar
assert Counter("aab") - Counter("aaab") == Counter()
# Son N kayıt: deque(maxlen=N) eskisini kendiliğinden atar
son = deque(maxlen=3)
for olay in range(5):
    son.append(olay)
assert list(son) == [2, 3, 4]
# Parçalara bölme (3.12+): son parça kısa olabilir
assert list(batched(range(7), 3)) == [(0, 1, 2), (3, 4, 5), (6,)]
print("tamam")
```

## functools.lru_cache

```python calistir
from functools import lru_cache


@lru_cache
def ayarlar() -> dict[str, str]:
    return {"tema": "koyu"}


# YANLIŞ: önbellek AYNI nesneyi döndürür; çağıranın değişikliği önbelleği bozar
a = ayarlar()
a["tema"] = "acik"
assert ayarlar() == {"tema": "acik"}  # sonraki herkes değişmiş ayarı görüyor


@lru_cache
def ayarlar_dogru() -> tuple[tuple[str, str], ...]:
    return (("tema", "koyu"),)  # DOĞRU: değişmez değer döndür (tuple, frozenset, frozen dataclass)


# Argümanlar hashlenebilir olmalı: liste verilemez
@lru_cache
def toplam(sayilar: tuple[int, ...]) -> int:
    return sum(sayilar)


try:
    toplam([1, 2])  # type: ignore[arg-type]
    raise AssertionError("hata bekleniyordu")
except TypeError:
    pass
assert toplam((1, 2)) == 3
toplam.cache_clear()  # testler arasında önbelleği temizleyin
print("tamam")
```

Diğer `lru_cache` kuralları: yöntem üstünde kullanmak `self`'i önbellekte tutar ve nesne hiç silinmez (bellek
sızıntısı); zamanla değişen veriyi (veritabanı, dosya, saat) önbelleğe almak bayat veri demektir; sınırsız
`@cache` uzun süren süreçte belleği doldurabilir.

## logging

```python calistir
import io
import logging

cikti = io.StringIO()
logging.basicConfig(level=logging.WARNING, stream=cikti, format="%(levelname)s %(name)s: %(message)s")
logging.basicConfig(level=logging.DEBUG)  # YANLIŞ beklenti: ikinci çağrı HİÇBİR ŞEY yapmaz
assert logging.getLogger().level == logging.WARNING

log = logging.getLogger("uygulama.odeme")  # modülde: logging.getLogger(__name__)
log.info("görünmez")  # kök düzey WARNING: info ve debug yazılmaz
log.warning("Kart reddedildi: sipariş %s", "S-42")  # %s biçimi: ileti yalnız yazılacaksa kurulur

try:
    1 / 0
except ZeroDivisionError:
    log.exception("Komisyon hesaplanamadı")  # iz (traceback) de yazılır

logging.basicConfig(level=logging.INFO, stream=cikti, format="%(levelname)s %(name)s: %(message)s", force=True)
log.info("artık görünür")
satirlar = cikti.getvalue().splitlines()
assert satirlar[0] == "WARNING uygulama.odeme: Kart reddedildi: sipariş S-42"
assert satirlar[1] == "ERROR uygulama.odeme: Komisyon hesaplanamadı" and "ZeroDivisionError" in cikti.getvalue()
assert satirlar[-1] == "INFO uygulama.odeme: artık görünür" and "görünmez" not in cikti.getvalue()
print("tamam")
```

Kurallar: `basicConfig` yalnız programın giriş noktasında (`main`) bir kez; kütüphane kodu yapılandırma yapmaz,
yalnız `getLogger(__name__)` kullanır; `print` yerine `log`; günlüğe parola, belirteç, tam kart numarası, kişisel
veri yazılmaz.

## Komut satırı argümanı ve ortam değişkeni

```python calistir
import argparse

# YANLIŞ: type=bool metni bool() ile çevirir; boş olmayan HER metin True'dur
p = argparse.ArgumentParser()
p.add_argument("--ayrinti", type=bool, default=False)
assert p.parse_args(["--ayrinti", "False"]).ayrinti is True

# DOĞRU: --ayrinti / --no-ayrinti (3.9+)
p = argparse.ArgumentParser()
p.add_argument("--ayrinti", action=argparse.BooleanOptionalAction, default=False)
assert p.parse_args(["--no-ayrinti"]).ayrinti is False
assert p.parse_args(["--ayrinti"]).ayrinti is True

# Ortam değişkeni her zaman METİNDİR: "false" ve "0" doğru (truthy) sayılır
ortam = {"HATA_AYIKLA": "false", "ISCI_SAYISI": "4"}
assert bool(ortam["HATA_AYIKLA"]) is True  # YANLIŞ okuma


def bayrak(deger: str | None, varsayilan: bool = False) -> bool:
    if deger is None or deger.strip() == "":
        return varsayilan
    temiz = deger.strip().lower()
    if temiz in {"1", "true", "evet", "on"}:
        return True
    if temiz in {"0", "false", "hayir", "hayır", "off"}:
        return False
    raise ValueError(f"Anlaşılmayan değer: {deger!r} (1/0, true/false bekleniyor)")


assert bayrak(ortam["HATA_AYIKLA"]) is False
assert int(ortam["ISCI_SAYISI"]) == 4  # sayıyı açıkça çevirin ve doğrulayın
print("tamam")
```

Ayarların tamamını açılışta tek yerde okuyup doğrulamak (eksik ya da bozuk ayarda anlaşılır hata vermek) için:
[Yapılandırma ve sırlar](../30-arkauc/yapilandirma-ve-sirlar.md).

## subprocess

```python calistir
import subprocess
import sys

# YANLIŞ: check yok → komut başarısız olsa da program devam eder
sonuc = subprocess.run([sys.executable, "-c", "import sys; sys.exit(3)"])
assert sonuc.returncode == 3  # kimse bakmazsa hata kaybolur

# DOĞRU: check=True + çıktıyı metin olarak yakala + zaman aşımı
try:
    subprocess.run([sys.executable, "-c", "import sys; sys.exit(3)"], check=True, capture_output=True, text=True, timeout=30)
    raise AssertionError("hata bekleniyordu")
except subprocess.CalledProcessError as hata:
    assert hata.returncode == 3

# YANLIŞ: shell=True + kullanıcı girdisi = komut enjeksiyonu
girdi = "rapor.txt; echo SIZINTI"
kotu = subprocess.run(f"echo {girdi}", shell=True, capture_output=True, text=True)
assert "SIZINTI" in kotu.stdout.splitlines()  # ikinci komut çalıştı
# DOĞRU: liste biçimi; girdi tek bir argüman olarak kalır
iyi = subprocess.run(["echo", girdi], capture_output=True, text=True, check=True)
assert iyi.stdout.strip() == "rapor.txt; echo SIZINTI"
print("tamam")
```

## Zaman ölçümü, rastgelelik ve sıralama

| İş                                         | Kullanın                         | Kullanmayın                    | Neden                                           |
| ------------------------------------------ | -------------------------------- | ------------------------------ | ----------------------------------------------- |
| Süre ölçmek (performans)                    | `time.perf_counter()`            | `time.time()`                  | Duvar saati ileri/geri ayarlanabilir            |
| Zaman aşımı, bekleme hesabı                 | `time.monotonic()`               | `datetime.now()`               | Monoton saat geri gitmez                        |
| Kayıt zamanı                               | `datetime.now(timezone.utc)`     | `datetime.now()`, `utcnow()`   | Saat dilimli olmalı                             |
| Parola sıfırlama kodu, oturum belirteci     | `secrets.token_urlsafe(32)`      | `random`                       | `random` tahmin edilebilir                      |
| Yeniden üretilebilir test verisi            | `random.Random(42)` örneği       | Küresel `random.seed()`        | Küresel tohum başka kodu da etkiler             |
| Türkçe sıralama                             | Türkçe alfabe anahtarı           | `sorted()` (kod noktası), `str.lower` anahtarı | ç, ğ, ı, ö, ş, ü yanlış yere düşer |

```python calistir
import random
import secrets

# random tohumla birebir tekrarlanır: belirteç için güvensiz, test için ideal
assert random.Random(42).random() == random.Random(42).random()
belirtec = secrets.token_urlsafe(32)  # 32 bayt rastgelelik → 43 karakter
assert len(belirtec) == 43

# Türkçe sıralama: kod noktası sırası ç, ı, ş harflerini sona atar
ALFABE = "abcçdefgğhıijklmnoöprsştuüvyz"
SIRA = {harf: i for i, harf in enumerate(ALFABE)}


def tr_kucuk(metin: str) -> str:
    return metin.replace("I", "ı").replace("İ", "i").lower()


def tr_anahtar(metin: str) -> list[int]:
    return [SIRA.get(h, 100 + ord(h)) for h in tr_kucuk(metin)]


iller = ["Zonguldak", "Çorum", "Iğdır", "İzmir", "Şırnak", "Sivas", "Ordu", "Ödemiş"]
assert sorted(iller) == ["Iğdır", "Ordu", "Sivas", "Zonguldak", "Çorum", "Ödemiş", "İzmir", "Şırnak"]
assert sorted(iller, key=tr_anahtar) == ["Çorum", "Iğdır", "İzmir", "Ordu", "Ödemiş", "Sivas", "Şırnak", "Zonguldak"]
print("tamam")
```

`locale.strxfrm` ile Türkçe sıralama, işletim sisteminde `tr_TR` yerel ayarının kurulu olmasına bağlıdır ve sunucuda
çoğu zaman yoktur; yukarıdaki gibi açık bir anahtar daha güvenilirdir. Tam gerçekleme (harmanlama, katlama):
[`kutuphane/py/kutuphane/turkce.py`](../../kutuphane/py/kutuphane/turkce.py).

## Tuzaklar

| Belirti                                                   | Neden                                                | Çözüm                                                   |
| --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Aynı il raporda iki kez çıkıyor                            | `groupby` sıralanmamış girdi                          | Önce aynı anahtarla `sorted`; ya da sözlükte toplama     |
| Boş listeler sözlükte çoğaldı                              | `defaultdict` okumada anahtar oluşturur              | `.get()` ya da `in` ile bakın                           |
| Bir ekranda değiştirilen ayar her yerde değişti             | `lru_cache` değişebilir nesne döndürüyor              | Değişmez değer döndürün ya da kopyalayın                 |
| `unhashable type: 'list'`                                 | Önbellekli işleve liste verildi                       | `tuple` verin                                           |
| `log.info` çıktısı görünmüyor                              | Kök düzey WARNING ya da `basicConfig` ikinci kez çağrıldı | Girişte bir kez `basicConfig(level=…)`; gerekirse `force=True` |
| Hata günlüğünde iz (traceback) yok                         | `log.error(e)`                                        | `except` içinde `log.exception("…")`                    |
| `--ayrinti False` verildi ama açık                          | `type=bool`                                          | `BooleanOptionalAction` ya da `store_true`              |
| `DEBUG=false` ama hata ayıklama açık                        | Ortam değişkeni metindir                              | Açık ayrıştırıcı (`bayrak()`)                           |
| Dış komut başarısız oldu, betik sessizce devam etti          | `subprocess.run` `check` olmadan                      | `check=True`, `timeout`                                 |
| Kullanıcı girdisiyle beklenmeyen komut çalıştı               | `shell=True` + metin birleştirme                     | Liste biçimi, `shell=False`                             |
| Süre ölçümü eksi çıktı                                     | `time.time()` saat ayarından etkilendi                | `perf_counter()` / `monotonic()`                        |
| Sıfırlama kodları tahmin edildi                            | `random` ile üretildi                                 | `secrets`                                               |
| Liste Z'den sonra Ç, Ş ile devam ediyor                     | Kod noktası sıralaması                                | Türkçe alfabe anahtarı                                  |

## Denetim listesi

- [ ] Her `groupby` çağrısının girdisi aynı anahtarla sıralanmış.
- [ ] `lru_cache`/`cache` yalnız saf işlevlerde ve değişmez dönüş değerleriyle; yöntemlerde yok.
- [ ] `logging.basicConfig` yalnız giriş noktasında; modüller `getLogger(__name__)` kullanıyor; `print` yok.
- [ ] Mantıksal komut satırı seçenekleri `BooleanOptionalAction`/`store_true`; ortam değişkenleri açıkça
      ayrıştırılıp doğrulanıyor.
- [ ] Her `subprocess.run` liste biçiminde, `check=True` ve `timeout` ile; `shell=True` yok.
- [ ] Güvenlikle ilgili her rastgele değer `secrets` ile.
- [ ] Süre ölçümleri `perf_counter`, zaman aşımları `monotonic`.
- [ ] Türkçe metin sıralanıyorsa Türkçe anahtar kullanılıyor ve testte `Ç`, `I`, `İ`, `Ş` örnekleri var.

## Küçük modele yaptırırken

- **İsteme yazın:** "`groupby`'dan önce sırala; `lru_cache`'li işlevden değişmez değer döndür; günlük için
  `logging.getLogger(__name__)` kullan ve `basicConfig`'i yalnız `main`'de çağır; `subprocess.run`'u liste biçimi,
  `check=True` ve `timeout` ile kullan; belirteçleri `secrets` ile üret."
- **Modelin tipik hatası:** `argparse`'ta `type=bool` yazar; `os.environ.get("X")` sonucunu doğrudan `if` içinde
  kullanır; `subprocess.run(f"… {girdi}", shell=True)` yazar; her modülde `basicConfig` çağırır; `random.choice`
  ile parola üretir; `sorted(isimler)` ile Türkçe sıralar.
- **Çıktıda arayın:** `type=bool`, `shell=True`, `basicConfig(` (kaç yerde), `@lru_cache` (dönüş tipi değişebilir
  mi), `import random` (güvenlik bağlamında), `time.time()` ile süre, `groupby(` (önünde `sorted` var mı).

## İlgili

- [Python tuzakları](python-tuzaklar.md): dilin kendi tuzakları
- [Python tipleme ve proje düzeni](python-tipleme-ve-proje.md): `ruff` kuralları ve proje ayarı
- [Kabuk ve bash](kabuk-ve-bash.md): kabuk yerine Python ne zaman
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md): günlükleme ve hata sınırı
- [Enjeksiyon](../50-guvenlik/enjeksiyon.md): kabuk ve SQL enjeksiyonu
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)
