---
baslik: Python eşzamanlılık
ozet: asyncio zihinsel modeli, olay döngüsünü tıkayan çağrı, iş parçacığı/süreç/async seçimi, GIL'in pratik anlamı, yarış durumu ve kilit, zaman aşımı ve iptal; ölçen ve kanıtlayan örneklerle.
etiketler: [python, asyncio, eszamanlilik, is-parcacigi, gil]
duzey: ileri
guncellik: 2026-11
---

# Python eşzamanlılık

> Bu notu ne zaman okumalı: `async def`, `asyncio`, `threading`, `concurrent.futures` ya da `multiprocessing` görünce;
> "async yaptım ama hızlanmadı", "sayaç eksik sayıyor", "zaman aşımı çalışmıyor", "macOS'ta süreç havuzu açılmıyor"
> gibi sorunlarda.

## Temel fikir

- **asyncio:** tek iş parçacığı, tek olay döngüsü. Görevler yalnız `await` noktalarında sırayı bırakır (iş birlikçi
  çoklu görev). `await` içermeyen her uzun iş, **bütün** görevleri durdurur.
- `async def` çağrısı yalnız bir coroutine nesnesi üretir; `await` edilmeden ya da görev yapılmadan **çalışmaz**.
- **GIL:** standart CPython'da aynı anda tek iş parçacığı Python kodu çalıştırır. Beklerken (ağ, disk, `sleep`) GIL
  bırakılır; bu yüzden iş parçacığı G/Ç'yi hızlandırır, saf Python hesabını hızlandırmaz.
- GIL **veri yarışını önlemez**: "oku → değiştir → yaz" arasında başka iş araya girebilir. Paylaşılan durum kilit ister.
- İptal ve zaman aşımı asyncio'da `CancelledError` ile çalışır; bu istisnayı yutan kod zaman aşımını bozar.

## Karar tablosu

| İş türü                                                  | Seçim                                              | Neden                                              |
| -------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Az sayıda iş, basit betik                                 | Sıralı kod                                         | Eşzamanlılık hata yüzeyi açar; gerekmedikçe kullanmayın |
| Çok sayıda ağ/disk beklemesi, kütüphaneler async (httpx)  | `asyncio` + `TaskGroup`                            | Binlerce bekleyen iş tek iş parçacığında           |
| Çok sayıda ağ beklemesi, kütüphane engelleyen (requests)   | `ThreadPoolExecutor`                               | Bekleme sırasında GIL bırakılır                    |
| async kod içinde engelleyen çağrı (sqlite3, dosya, requests) | `await asyncio.to_thread(f, ...)`                | Olay döngüsü tıkanmaz                              |
| Saf Python CPU işi (ayrıştırma, döngülü hesap)            | `ProcessPoolExecutor`                              | Her süreç kendi GIL'ine sahip                      |
| numpy/torch gibi C ağırlıklı hesap                         | Önce tek iş parçacığı; kütüphanenin kendi paralelliği | Bu kütüphaneler içeride GIL'i bırakır          |
| Web sunucusunda uzun iş (rapor, e-posta toplu gönderim)    | İş kuyruğu (ayrı işçi süreç)                       | İstek-yanıt döngüsünü bekletmemek                  |

## asyncio: engelleyen çağrı tuzağı

```python calistir
import asyncio
import time


async def engelleyen():
    time.sleep(0.1)  # YANLIŞ: olay döngüsünü 100 ms durdurur


async def bekleyen():
    await asyncio.sleep(0.1)  # DOĞRU: beklerken sırayı bırakır


async def is_parcaciginda():
    await asyncio.to_thread(time.sleep, 0.1)  # engelleyen kütüphane çağrısı için çıkış yolu


async def olc(is_):
    t0 = time.perf_counter()
    await asyncio.gather(is_(), is_(), is_())
    return time.perf_counter() - t0


async def main():
    assert await olc(engelleyen) >= 0.28  # üç iş SIRAYLA: ~0.3 s
    assert await olc(bekleyen) < 0.2  # birlikte: ~0.1 s
    assert await olc(is_parcaciginda) < 0.2


asyncio.run(main())
print("tamam")
```

async işlev içinde engelleyen tipik çağrılar: `time.sleep`, `requests.get`, `sqlite3`, `open().read()` (büyük
dosya), `subprocess.run`, CPU yoğun döngü. ruff `ASYNC` kuralları (`ASYNC251` gibi) bunların bir kısmını yakalar.

## Unutulan await ve kaybolan görev

```python calistir
import asyncio
import gc
import warnings


async def kaydet():
    return "kaydedildi"


with warnings.catch_warnings(record=True) as uyarilar:
    warnings.simplefilter("always")
    kaydet()  # YANLIŞ: await yok → hiç çalışmaz, yalnız uyarı bırakır
    gc.collect()
assert any("was never awaited" in str(u.message) for u in uyarilar)


async def main():
    arka_plan = set()  # create_task sonucunun referansını tutun; tutulmayan görev çöpe gidebilir (RUF006)
    gorev = asyncio.create_task(kaydet())
    arka_plan.add(gorev)
    gorev.add_done_callback(arka_plan.discard)
    assert await gorev == "kaydedildi"

    # Çalışan döngünün içinden asyncio.run çağrılamaz (Jupyter'de sık görülür): await kullanın
    eszamansiz = asyncio.sleep(0)
    try:
        asyncio.run(eszamansiz)
    except RuntimeError as hata:
        assert "cannot be called from a running event loop" in str(hata)
        eszamansiz.close()


asyncio.run(main())
print("tamam")
```

## gather ve TaskGroup

```python calistir
import asyncio

biten = []


async def is_(ad, ms, hata=False):
    try:
        await asyncio.sleep(ms / 1000)
        if hata:
            raise ValueError(f"{ad} bozuk")
        biten.append(ad)
    except asyncio.CancelledError:
        biten.append(f"{ad}:iptal")
        raise  # CancelledError her zaman yeniden atılır


async def main():
    # gather: biri hata verince ötekiler İPTAL EDİLMEZ, arka planda sürer
    try:
        await asyncio.gather(is_("a", 10, hata=True), is_("b", 50))
    except ValueError:
        pass
    await asyncio.sleep(0.08)
    assert biten == ["b"]

    # TaskGroup (3.11+): biri hata verince kardeşleri iptal eder, hataları ExceptionGroup'ta toplar
    biten.clear()
    try:
        async with asyncio.TaskGroup() as grup:
            grup.create_task(is_("a", 10, hata=True))
            grup.create_task(is_("b", 50))
    except* ValueError as hatalar:
        assert [str(h) for h in hatalar.exceptions] == ["a bozuk"]
    assert biten == ["b:iptal"]


asyncio.run(main())
print("tamam")
```

Toplu işte bazıları başarısız olabilir ve hepsinin sonucu isteniyorsa: `gather(..., return_exceptions=True)` ve
sonuçları tek tek denetleyin.

## Yarış durumu ve kilit

asyncio'da yarış yalnız `await` noktasında olur, ama olur:

```python calistir
import asyncio


async def main():
    stok = {"adet": 0}

    async def ekle(kilit=None):
        for _ in range(100):
            if kilit is None:
                eski = stok["adet"]
                await asyncio.sleep(0)  # oku ile yaz arasında await: başka görev araya girer
                stok["adet"] = eski + 1
            else:
                async with kilit:
                    eski = stok["adet"]
                    await asyncio.sleep(0)
                    stok["adet"] = eski + 1

    await asyncio.gather(ekle(), ekle(), ekle())
    assert stok["adet"] == 100  # 300 olmalıydı: 200 güncelleme kayboldu

    stok["adet"] = 0
    kilit = asyncio.Lock()
    await asyncio.gather(ekle(kilit), ekle(kilit), ekle(kilit))
    assert stok["adet"] == 300


asyncio.run(main())
print("tamam")
```

İş parçacıklarında GIL olmasına rağmen aynı hata:

```python calistir
import threading
import time

bakiye = 0


def yatir(baslangic, kilit=None):
    global bakiye
    baslangic.wait()  # dört iş parçacığı aynı anda başlasın
    for _ in range(200):
        if kilit is None:
            eski = bakiye
            time.sleep(0)  # GIL'i bırakır: araya başka iş parçacığı girer
            bakiye = eski + 1
        else:
            with kilit:
                eski = bakiye
                time.sleep(0)
                bakiye = eski + 1


def calistir(kilit=None):
    global bakiye
    bakiye = 0
    baslangic = threading.Barrier(4)
    isler = [threading.Thread(target=yatir, args=(baslangic, kilit)) for _ in range(4)]
    for t in isler:
        t.start()
    for t in isler:
        t.join()
    return bakiye


assert calistir() < 800  # güncelleme kaybı (denemede ~200)
assert calistir(threading.Lock()) == 800
print("tamam")
```

Kilit yerine çoğu zaman daha iyi yol **paylaşımı kaldırmaktır**: her iş kendi sonucunu döndürsün, toplamı ana iş
parçacığı yapsın; ya da `queue.Queue` / `asyncio.Queue` ile tek bir yazar olsun. Veritabanındaki karşılığı (kayıp
güncelleme): [SQL performans ve işlem](sql-performans-ve-islem.md).

## Zaman aşımı ve iptal

```python calistir
import asyncio
import time


async def main():
    # DOĞRU: asyncio.timeout (3.11+) süre dolunca işi iptal eder ve TimeoutError atar
    temizlendi = []
    try:
        async with asyncio.timeout(0.05):
            try:
                await asyncio.sleep(1)
            finally:
                temizlendi.append(True)  # iptalde de çalışır: kaynak burada bırakılır
    except TimeoutError:
        pass
    assert temizlendi == [True]

    # YANLIŞ: CancelledError'ı yutmak zaman aşımını SESSİZCE bozar
    t0 = time.perf_counter()
    async with asyncio.timeout(0.05):
        try:
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass  # iptal yutuldu
        await asyncio.sleep(0.2)
    gecen = time.perf_counter() - t0
    assert gecen >= 0.2  # 0.05 s'de kesilmesi gerekirdi; TimeoutError da atılmadı


asyncio.run(main())
print("tamam")
```

Kural: `except asyncio.CancelledError` yazacaksanız temizlikten sonra **mutlaka `raise`** edin; temizliği tercihen
`finally` içinde yapın. `except Exception` 3.8'den beri `CancelledError`'ı yakalamaz, ama çıplak `except:` ve
`except BaseException` yakalar.

İş parçacığında zaman aşımı **işi durdurmaz**, yalnız beklemeyi bırakır:

```python calistir
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as GelecekZamanAsimi

durum = {"bitti": False}


def uzun_is():
    time.sleep(0.2)
    durum["bitti"] = True  # zaman aşımından SONRA da çalışır


with ThreadPoolExecutor(max_workers=1) as havuz:
    gelecek = havuz.submit(uzun_is)
    try:
        gelecek.result(timeout=0.05)
    except GelecekZamanAsimi:
        assert gelecek.running()  # iş hâlâ sürüyor
assert durum["bitti"]  # with bloğu işin bitmesini bekledi
print("tamam")
```

İş parçacığı dışarıdan öldürülemez. Durdurulabilir iş istiyorsanız işin içine bir `threading.Event` koyup düzenli
aralıkla denetleyin ya da işi ayrı bir **süreçte** çalıştırıp süreci sonlandırın.

## GIL'in pratik anlamı

```python calistir
import sys
import time
from concurrent.futures import ThreadPoolExecutor


def hesap(n=1_000_000):
    toplam = 0
    for i in range(n):
        toplam += i
    return toplam


def olc(islev, adet, is_parcacigi):
    t0 = time.perf_counter()
    if is_parcacigi:
        with ThreadPoolExecutor(adet) as havuz:
            list(havuz.map(lambda _: islev(), range(adet)))
    else:
        for _ in range(adet):
            islev()
    return time.perf_counter() - t0


cpu_oran = olc(hesap, 4, True) / olc(hesap, 4, False)
gc_oran = olc(lambda: time.sleep(0.05), 4, True) / olc(lambda: time.sleep(0.05), 4, False)
assert cpu_oran > 0.7  # CPU işi: iş parçacığı hızlandırmadı (~1.0)
assert gc_oran < 0.5  # bekleme işi: ~4 kat hızlandı
assert sys._is_gil_enabled()  # standart derlemede GIL açık (3.13+ ile sorulabilir)
print("tamam")
```

Python 3.13'ün GIL'siz deneysel derlemesi (`python3.13t`) ayrı bir kurulumdur; standart derlemede bu davranış
değişmez. CPU işini hızlandırmanın yolu süreç havuzudur.

## Süreç havuzu ve `__main__` koruması

macOS ve Windows'ta yeni süreç **"spawn"** yöntemiyle açılır: çocuk süreç ana dosyayı baştan içe aktarır. Havuzu
kuran kod `if __name__ == "__main__":` korumasında değilse çocuk da havuz kurmaya çalışır ve hata verir. Linux'ta
varsayılan farklı olduğu için hata orada **görünmez**; aşağıdaki örnek spawn'ı zorlayarak gösterir:

```python calistir
import subprocess
import sys
from pathlib import Path

GOVDE = """import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor

def kare(x):
    return x * x

"""
HAVUZ = """with ProcessPoolExecutor(2, mp_context=mp.get_context("spawn")) as havuz:
    print(list(havuz.map(kare, range(4))))
"""
Path("korumasiz.py").write_text(GOVDE + HAVUZ, encoding="utf-8")
korumali = GOVDE + 'if __name__ == "__main__":\n' + "".join(f"    {s}\n" for s in HAVUZ.splitlines())
Path("korumali.py").write_text(korumali, encoding="utf-8")

kotu = subprocess.run([sys.executable, "korumasiz.py"], capture_output=True, text=True, timeout=60)
assert kotu.returncode != 0 and "bootstrapping phase" in kotu.stderr
iyi = subprocess.run([sys.executable, "korumali.py"], capture_output=True, text=True, timeout=60)
assert iyi.stdout.strip() == "[0, 1, 4, 9]"
print("tamam")
```

Süreçlere gönderilen işlev ve argümanlar **pickle** ile taşınır: `lambda`, iç içe tanımlı işlev, açık dosya ya da
veritabanı bağlantısı gönderilemez. İşlevi modülün üst düzeyinde tanımlayın.

## Tuzaklar

| Belirti                                                        | Neden                                                  | Çözüm                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| async'e geçildi ama süre değişmedi                              | async işlevde engelleyen çağrı (`time.sleep`, `requests`) | async kütüphane ya da `asyncio.to_thread` (ASYNC251)        |
| `coroutine '…' was never awaited` uyarısı; iş yapılmamış        | `await` unutuldu                                       | `await` ya da `create_task` + referans                         |
| Arka plan görevi ara sıra hiç bitmiyor                          | `create_task` sonucu tutulmadı, görev çöpe gitti        | Görevleri bir kümede tutun (RUF006)                           |
| `asyncio.run() cannot be called from a running event loop`     | Çalışan döngü içinde (Jupyter, async işlev) `asyncio.run` | `await` kullanın                                             |
| Bir iş patladı, öteki işler yine de yan etki üretti             | `gather` kardeşleri iptal etmez                        | `TaskGroup`                                                   |
| Sayaç/stok eksik çıkıyor                                        | Oku-değiştir-yaz arasında araya girme                  | Kilit, tek yazar (kuyruk) ya da atomik veritabanı güncellemesi |
| Zaman aşımı hiç tetiklenmiyor, istek uzuyor                     | `CancelledError` yutuluyor                             | Temizlik `finally`'de; `except CancelledError` sonrası `raise` |
| Zaman aşımına rağmen iş parçacığı çalışmayı sürdürüyor          | İş parçacığı dışarıdan durdurulamaz                    | `threading.Event` ile iş birlikçi durdurma ya da ayrı süreç    |
| İş parçacığı eklendi, CPU işi hızlanmadı                         | GIL                                                    | `ProcessPoolExecutor`                                          |
| macOS'ta süreç havuzu "bootstrapping phase" hatası              | `__main__` koruması yok                                | `if __name__ == "__main__":`                                  |
| `Can't pickle <function <lambda>>`                              | Süreçe gönderilen işlev üst düzeyde değil              | Modül düzeyinde adlandırılmış işlev                            |
| Ctrl+C ile durmayan program                                     | Arka plan iş parçacıkları `daemon` değil ve sonsuz döngüde | Durdurma olayı (`Event`) + `join(timeout)`                 |

## Denetim listesi

- [ ] Eşzamanlılığın gerçekten gerekip gerekmediği soruldu; ölçümle (önce/sonra süre) kanıtlandı.
- [ ] async işlevlerde engelleyen çağrı yok (ruff `ASYNC` kuralları temiz); kalanlar `to_thread` içinde.
- [ ] Her coroutine `await` ediliyor; `create_task` sonuçları saklanıyor.
- [ ] Birlikte başarılı ya da birlikte iptal olması gereken işler `TaskGroup`'ta.
- [ ] Paylaşılan her değişebilir durum için kilit ya da tek yazar var; yarışı gösteren bir test var.
- [ ] Her dış çağrının zaman aşımı var; `CancelledError` hiçbir yerde yutulmuyor.
- [ ] Süreç havuzu kodu `if __name__ == "__main__":` içinde; işlevler modül düzeyinde.
- [ ] İş parçacığı ve süreç sayısı sınırlı (paylaşımlı makinede 2–4).

## Küçük modele yaptırırken

- **İsteme yazın:** "Önce sıralı çözümü yaz ve süresini ölç. Eşzamanlılık gerekiyorsa: G/Ç için `asyncio` +
  `TaskGroup` (engelleyen çağrıları `asyncio.to_thread` ile), CPU için `ProcessPoolExecutor`. `CancelledError`'ı
  yutma; her dış çağrıya zaman aşımı koy; paylaşılan durumu kilitle ya da kaldır."
- **Modelin tipik hatası:** `async def` içine `requests.get` ya da `time.sleep` koyar; `create_task` sonucunu atar;
  `except Exception` ile yetinmeyip çıplak `except:` yazar (iptali yutar); CPU işini `ThreadPoolExecutor`'a verip
  hızlandırdığını iddia eder; `__main__` korumasını unutur.
- **Çıktıda arayın:** `time.sleep(` ve `requests.` (async işlev içinde), `create_task(` (sonucu atanmış mı),
  `except:` ve `except BaseException`, `except asyncio.CancelledError` (ardından `raise` var mı), `ProcessPool`
  (koruma var mı).
- **Kanıt isteyin:** "Önce/sonra sürelerini ölçen ve yarış durumunu gösteren bir test ekle" deyin; hızlandı iddiasını
  ölçümsüz kabul etmeyin.

## İlgili

- [JavaScript async kalıpları](javascript-async.md): aynı kavramlar JavaScript'te
- [Python tuzakları](python-tuzaklar.md)
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md): yeniden deneme, iptal ve temizlik
- [SQL performans ve işlem](sql-performans-ve-islem.md): kayıp güncelleme, işlem yalıtımı
- Kuyruk ve hız sınırı gerçeklemeleri: [`kutuphane/py/kutuphane/kuyruk.py`](../../kutuphane/py/kutuphane/kuyruk.py),
  [`kutuphane/py/kutuphane/hiz_siniri.py`](../../kutuphane/py/kutuphane/hiz_siniri.py)
