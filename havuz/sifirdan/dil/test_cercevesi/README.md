# test_cercevesi — mini test çerçevesi (pytest'in içinde ne var?)

Küçük ama gerçek bir test çerçevesi: **test keşfi** (`test_*.py` içindeki `test_` işlevleri),
**fixture** (kurulum/temizlik, bağımlılık zinciri, `scope="modul"`, yerleşik `tmp_dir`),
**parametreli test** (`@parametrize`, üst üste çarpım), **beklenen istisna** (`with raises(...)`),
**zaman aşımı** (`@timeout`), **atlama** (`@skip`, `skip_now`), sade **raporlayıcı** (geçti/kaldı/
atlandı/hata; başarısızlıkta değerler) ve **komut satırı**. Düz `assert` yazılır: çerçeve test
dosyasını yüklerken assert'leri yeniden yazar, kalan testte iki tarafın değerini gösterir:

```
--- test_ornek_kasitli.py::test_esitlik_kalir (kaldı) [test_ornek_kasitli.py:18]
Beklenti tutmadı: topla(2, 2) == 5
  sol taraf: 4
  sağ taraf: 5
```

## Çalıştır (dil/ klasöründen)

```bash
python -m test_cercevesi test_cercevesi/ornekler -v          # örnek testler (hepsi geçer)
python -m test_cercevesi test_cercevesi/ornekler_hatali      # BİLEREK kalan testler: raporu görün
python -m test_cercevesi test_cercevesi/ornekler -k indirim  # yalnız adında "indirim" geçenler
python -m pytest tests/test_cercevesi -q                     # çerçevenin kendi testleri (pytest ile)
```

Bir test dosyası:

```python
from test_cercevesi import fixture, parametrize, raises, timeout


@fixture
def sepet():
    s = Sepet()
    yield s  # yield sonrası temizliktir; test kalsa da çalışır
    s.bosalt()


@parametrize("indirim, beklenen", [(0, 1500), (10, 1350)])
def test_indirim(sepet, indirim, beklenen):
    assert sepet.toplam(indirim) == beklenen


def test_hatali_adet(sepet):
    with raises(ValueError, match="adet"):
        sepet.ekle("su", 500, adet=0)
```

## Nasıl çalışır

```
yollar
  │ discovery.py   test_*.py dosyalarını bulur; klasörü geçici olarak sys.path'e ekler
  │ rewrite.py     dosyayı ast ile ayrıştırır, işlev içindeki her assert'i
  │                `assert (_tc_sol := a) == (_tc_sag := b), _tc_compare_message(...)` yapar,
  │                derleyip yeni bir modül olarak çalıştırır (değerler bir kez hesaplanır)
  ▼
TestCase listesi (parametreler açılmış: test_indirim[0-1500], test_indirim[10-1350])
  │ runner.py      her test için: @skip? → fixtures.py ile argümanları kur → zaman aşımıyla çağır
  │                → sonucu sınıfla (AssertionError/istisna = kaldı, fixture sorunu = hata)
  │                → test kapsamlı fixture'ları ters sırayla temizle; sonda modül kapsamlıları
  ▼
Result listesi
  │ report.py      ilerleme (. K A H ya da -v ile satır satır), kalanların ayrıntısı, özet
  ▼
"10 geçti, 0 kaldı, 2 atlandı, 0 hata (0,02 sn)"   (çıkış kodu: 0 / 1 kalan var / 2 test yok)
```

**Zaman aşımı:** ana iş parçacığında `signal.setitimer` + SIGALRM testi gerçekten keser
(`time.sleep` dahil). Ana iş parçacığı değilse (ya da Windows'ta) test ayrı bir iş parçacığında
çalıştırılır; süre dolunca "zaman aşımı" raporlanır ama o iş parçacığı arka planda sürer.

## Dosya haritası

| Dosya          | Görev                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| `markers.py`   | `fixture`, `parametrize`, `skip`, `skip_now`, `timeout`, `raises`      |
| `rewrite.py`   | assert yeniden yazımı ve modül yükleme (exec/compile YALNIZ burada)    |
| `discovery.py` | dosya bulma, test toplama, parametre açma, `-k` süzgeci (Türkçe kurallı) |
| `fixtures.py`  | fixture çözümü, bağımlılık/döngü denetimi, temizlik, `tmp_dir`         |
| `runner.py`    | çalıştırma, zaman aşımı, sonuç sınıflama, `run_all`                    |
| `report.py`    | ilerleme, ayrıntı, özet                                                |
| `__main__.py`  | komut satırı                                                           |
| `ornekler/`, `ornekler_hatali/` | çerçeveyle yazılmış örnek testler (geçen / bilerek kalan) |

## Sınırlar

- Sınıf içi testler (`class TestX`), `conftest.py`, eklenti sistemi, paralel koşu, kapsam
  (coverage) raporu yok. Fixture kapsamı yalnız `test` ve `modul`.
- Assert yeniden yazımı yalnız işlev gövdelerinde ve tek karşılaştırmalı (`a == b`, `x in y`…) ya da
  tek değerli ifadelerde ayrıntı verir; `a == b == c` gibi zincirlerde yalnız değer gösterilir.
  Sınıf gövdesindeki ve modül düzeyindeki assert'ler yeniden yazılmaz.
- İş parçacığı tabanlı zaman aşımı testi durduramaz (yukarıya bakın).
- Test dosyaları kendi modül adlarıyla (`tc_<ad>_<özet>`) `sys.modules`'a eklenir ve kaldırılmaz.
- `-k` yalnız alt dizgi araması yapar (pytest'teki `and/or/not` ifadeleri yok).

## Buradan nereye (küçük modele alıştırmalar)

1. **Sınıf içi testler:** `discovery.collect_module`'da `class Test*` içindeki `test_` yöntemlerini
   toplayın (her test için yeni örnek).
2. **`conftest.py`:** klasördeki `conftest.py` fixture'larını o klasördeki tüm dosyalara açın.
3. **JUnit XML raporu:** `report.py`'ye `Result` listesini XML'e çeviren işlev + `--junit dosya`.
4. **`-k` ifadeleri:** `"indirim and not 100"` gibi küçük bir mantık ayrıştırıcısı.
5. **Yavaş test listesi:** en uzun süren 5 testi özetin altında gösterin (`Result.duration`).
6. **`approx`:** ondalık karşılaştırma yardımcısı (`assert x == approx(0.3)`), değer gösterimiyle.
