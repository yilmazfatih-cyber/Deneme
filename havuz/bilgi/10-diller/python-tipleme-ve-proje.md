---
baslik: Python tipleme ve proje düzeni
ozet: Tip ipuçları (Protocol, TypedDict, jenerik), dataclass ile Pydantic arasında seçim, pyproject.toml, sanal ortam ve uv, paket düzeni ve içe aktarma hataları, ruff ve mypy ile çalışma.
etiketler: [python, tipleme, pydantic, pyproject, uv, mypy]
duzey: orta
guncellik: 2026-11
---

# Python tipleme ve proje düzeni

> Bu notu ne zaman okumalı: yeni bir Python projesi ya da paketi kurarken; veri sınıfı tanımlarken; `ModuleNotFoundError`,
> `attempted relative import`, `has no attribute` gibi içe aktarma hatalarında; `ruff` ya da `mypy` çıktısını
> düzeltirken.

## Temel fikir

- Tip ipuçları (type hints) **çalışma zamanında denetlenmez**. Yanlış tipli değer sessizce geçer; denetimi `mypy`
  yapar, ayrı bir komut olarak.
- Dışarıdan gelen veri için tip ipucu yetmez, **doğrulama** gerekir: Pydantic. İçeride üretilen güvenilir veri için
  `dataclass` yeterlidir.
- Proje tek bir `pyproject.toml` ile tanımlanır: ad, bağımlılıklar, komutlar ve araç ayarları (`ruff`, `mypy`, `pytest`).
- Her proje kendi **sanal ortamında** (`.venv`) çalışır. Sistem Python'una paket kurulmaz.
- İçe aktarma hatalarının çoğu "dosyayı yanlış yerden ya da yanlış biçimde çalıştırmak"tan gelir; kod doğrudur.

## Tip ipuçları

```python calistir
from typing import NotRequired, Protocol, TypedDict, assert_never, runtime_checkable


@runtime_checkable
class Bildirici(Protocol):  # yapısal: kalıtım gerekmez, aynı yöntemi taşımak yeter
    def gonder(self, alici: str, ileti: str) -> bool: ...


class EpostaBildirici:
    def gonder(self, alici: str, ileti: str) -> bool:
        return True


class BozukBildirici:
    def gonder(self) -> bool:  # imza yanlış
        return True


# runtime_checkable isinstance yalnız yöntem ADINA bakar, imzaya bakmaz: imzayı mypy denetler
assert isinstance(EpostaBildirici(), Bildirici)
assert isinstance(BozukBildirici(), Bildirici)


class KullaniciJson(TypedDict):  # JSON biçimli sözlüğün tipi; çalışma zamanında düz dict
    ad: str
    telefon: NotRequired[str]


k = KullaniciJson(ad=5)  # tip ipucu denetlenmez: çalışır
assert k == {"ad": 5} and type(k) is dict


def ilk[T](ogeler: list[T]) -> T | None:  # Python 3.12+ jenerik sözdizimi
    return ogeler[0] if ogeler else None


assert ilk([3, 4]) == 3 and ilk([]) is None


def etiket(durum: str) -> str:
    match durum:
        case "taslak":
            return "Taslak"
        case "yayinda":
            return "Yayında"
        case _:
            assert_never(durum)  # mypy'da Literal ile tüketicilik denetimi; çalışırken AssertionError


try:
    etiket("iptal")
    raise SystemExit("hata bekleniyordu")
except AssertionError as hata:
    assert "iptal" in str(hata)
print("tamam")
```

`mypy --strict` aynı türden hataları çalıştırmadan gösterir (mypy 2.4.1 ile denendi):

```text
tip.py:24: error: Argument 1 to "duyur" has incompatible type "BozukBildirici"; expected "Bildirici"  [arg-type]
tip.py:33: error: Missing key "eposta" for TypedDict "KullaniciJson"  [typeddict-item]
tip.py:41: error: Argument 1 to "len" has incompatible type "str | None"; expected "Sized"  [arg-type]
tip.py:51: error: Argument 1 to "assert_never" has incompatible type "Literal['yayinda']"; expected "Never"  [arg-type]
tip.py:54: error: Function is missing a type annotation  [no-untyped-def]
```

| Ne yazılır                         | Ne zaman                                                   | Sürüm   |
| ---------------------------------- | ---------------------------------------------------------- | ------- |
| `str \| None`                       | `Optional[str]` yerine                                     | 3.10+   |
| `list[int]`, `dict[str, int]`       | `typing.List` yerine                                       | 3.9+    |
| `Protocol`                         | "Şu yöntemi olan her şey" (bağımlılığı tersine çevirmek, testte sahte nesne) | 3.8+ |
| `TypedDict` + `NotRequired`         | JSON biçimli sözlük, nesneye çevirmeden                    | 3.11+   |
| `Literal["a", "b"]`                 | Sabit seçenek kümesi; `assert_never` ile birlikte          | 3.8+    |
| `def f[T](x: list[T]) -> T`         | Jenerik işlev (eskisi: `T = TypeVar("T")`)                  | 3.12+   |
| `TypeIs[X]`                         | Kendi tip daraltma işleviniz                                | 3.13+   |

`requires-python` 3.11 olan projede 3.12+ sözdizimi (jenerik köşeli ayraç) **sözdizimi hatası** verir; sürümü
`pyproject.toml`'a bakarak seçin.

## dataclass mı Pydantic mi?

| Durum                                                         | Seçim                                     | Neden                                          |
| ------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| İçeride üretilen, güvenilir veri (hesap sonucu, ara nesne)     | `@dataclass` (`frozen=True, slots=True`)   | Standart kütüphane, hızlı; doğrulama yapmaz    |
| Dışarıdan gelen veri (istek, dosya, ortam değişkeni, model çıktısı) | Pydantic `BaseModel`                 | Doğrular, dönüştürür, okunur hata verir        |
| JSON biçimli sözlüğü yalnız tiplemek                          | `TypedDict`                               | Çalışma zamanı maliyeti yok                    |
| Küçük, değişmez, sıralı kayıt                                  | `NamedTuple`                              | Demet gibi açılır, karşılaştırılır             |
| Ayarlar (`.env`, ortam değişkenleri)                           | Pydantic ayar modeli                       | Eksik/yanlış ayar açılışta yakalanır           |

`dataclass` tuzakları:

```python calistir
from dataclasses import FrozenInstanceError, dataclass, field

try:

    @dataclass
    class Yanlis:
        etiketler: list[str] = []  # değişebilir varsayılan: sınıf tanımlanırken hata

except ValueError as hata:
    assert "use default_factory" in str(hata)


@dataclass
class Ham:
    ad: str
    fiyat_kurus: int


h = Ham(ad="Çay", fiyat_kurus="4000")  # type: ignore[arg-type]  ← dataclass tip DENETLEMEZ
assert h.fiyat_kurus == "4000"


@dataclass(frozen=True, slots=True)
class Urun:
    ad: str
    fiyat_kurus: int
    etiketler: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:  # doğrulama gerekiyorsa elle yazılır
        if type(self.fiyat_kurus) is not int or self.fiyat_kurus < 0:
            raise ValueError("fiyat_kurus negatif olmayan tamsayı olmalı")


for kotu in (-1, "4000", 12.5):
    try:
        Urun(ad="Çay", fiyat_kurus=kotu)  # type: ignore[arg-type]
        raise AssertionError("hata bekleniyordu")
    except ValueError:
        pass
try:
    Urun(ad="Çay", fiyat_kurus=1).ad = "Kahve"  # type: ignore[misc]
    raise AssertionError("hata bekleniyordu")
except FrozenInstanceError:
    pass
print("tamam")
```

Pydantic tuzakları (Pydantic 2.14.3 ile denendi; dış paket olduğu için `calistir` almaz):

```python
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class Siparis(BaseModel):
    model_config = ConfigDict(extra="forbid")  # bilinmeyen alan = hata (yazım hatasını yakalar)
    id: str
    tutar_kurus: int = Field(ge=0)
    tarih: AwareDatetime  # saat dilimsiz zamanı reddeder
    etiketler: list[str] = []  # Pydantic'te güvenli: her örneğe kopyalanır


Siparis.model_validate({"id": "s1", "tutar_kurus": "1250", "tarih": "2026-11-16T10:00:00Z"})
# → tutar_kurus == 1250: varsayılan (lax) kip "1250" metnini SESSİZCE sayıya çevirir.
#   Çevirmesin istiyorsanız: ConfigDict(strict=True)
# extra="forbid" yazılmazsa bilinmeyen alanlar sessizce atılır.
# AwareDatetime yerine datetime yazılırsa "2026-11-16" saat dilimsiz (naive) zamana dönüşür.
```

## pyproject.toml

Havuzdaki Python temelleri bu iskeleti kullanır (örnek: [`kutuphane/py/pyproject.toml`](../../kutuphane/py/pyproject.toml)).
Aşağıdaki blok, iskeleti `tomllib` ile okuyup sık hataları denetleyen küçük bir denetçidir:

```python calistir
import tomllib

PYPROJECT = """
[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[project]
name = "havuz-sayac"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["httpx>=0.28,<1"]

[project.optional-dependencies]
dev = ["pytest==9.2.*", "ruff==0.17.*", "mypy==2.4.*"]

[project.scripts]
sayac = "sayac.cli:main"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "SIM", "RUF", "PLW1514", "DTZ"]
ignore = ["RUF001", "RUF002", "RUF003"]  # Türkçe ı/İ harfleri "belirsiz karakter" sayılmasın

[tool.mypy]
strict = true

[tool.pytest.ini_options]
testpaths = ["tests"]
"""


def denetle(veri: dict) -> list[str]:
    sorunlar = []
    proje = veri.get("project", {})
    for alan in ("name", "version", "requires-python", "dependencies"):
        if alan not in proje:
            sorunlar.append(f"[project] {alan} eksik")
    for bagimlilik in proje.get("dependencies", []):
        if not any(isaret in bagimlilik for isaret in (">", "=", "<", "~")):
            sorunlar.append(f"sürüm aralığı yok: {bagimlilik}")
    if "build-system" not in veri:
        sorunlar.append("[build-system] eksik: `pip install -e .` çalışmaz")
    if not veri.get("tool", {}).get("mypy", {}).get("strict"):
        sorunlar.append("mypy strict kapalı")
    return sorunlar


assert denetle(tomllib.loads(PYPROJECT)) == []
eksik = tomllib.loads('[project]\nname = "x"\ndependencies = ["requests"]\n')
assert "sürüm aralığı yok: requests" in denetle(eksik)
assert "[build-system] eksik: `pip install -e .` çalışmaz" in denetle(eksik)
print("tamam")
```

Notlar: `ruff` `RUF001-003` kuralları Türkçe `ı` harfini "belirsiz karakter" diye işaretler (ruff 0.16.9 ile
denendi); Türkçe metin taşıyan projede kapatın. Uygulamada bağımlılık aralığı (`>=0.28,<1`) yazılır, kesin sürümü
kilit dosyası sabitler. Ayrıntı: [Modül ve bağımlılık](modul-ve-bagimlilik.md).

## Sanal ortam ve uv

`uv` 0.11.32 ile denendi (komut adları sürümle değişebilir):

| İş                                   | uv ile                                                  | Yalnız Python ile                           |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------- |
| Sanal ortam kur                      | `uv venv .venv`                                         | `python -m venv .venv`                      |
| Projeyi geliştirme kipinde kur        | `uv pip install --python .venv/bin/python -e ".[dev]"`  | `.venv/bin/python -m pip install -e ".[dev]"` |
| Bağımlılık ekle (kilit dosyası yazar) | `uv add httpx`; yalnız geliştirme için `uv add --dev pytest` | `pyproject.toml`'a elle yaz, yeniden kur |
| Kilit dosyasından birebir kur          | `uv sync`                                               | `pip install -r requirements.lock`          |
| Ortamın içinde komut çalıştır          | `uv run pytest` (önce ortamı eşitler)                    | `.venv/bin/python -m pytest`                |
| Kilit `pyproject.toml` ile uyumlu mu   | `uv lock --check`                                       | —                                           |

- `uv add --dev` aracı `[dependency-groups]` tablosuna yazar; havuz standardı ise `[project.optional-dependencies]
  dev` kullanır. Bir projede **ikisinden birini** seçin.
- Ortamı etkinleştirmeyi (`source .venv/bin/activate`) unutmak en sık hatadır. Etkinleştirmeye güvenmeyin:
  komutu `.venv/bin/python -m …` ya da `uv run …` ile verin.
- `.venv` depoya girmez (`.gitignore`); kilit dosyası (`uv.lock`) girer.

## Paket düzeni ve içe aktarma

| Düzen                         | Nasıl görünür                         | Ne zaman                                   | Dikkat                                         |
| ----------------------------- | ------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Düz (flat)                    | `paket/`, `tests/`, `pyproject.toml`  | Uygulama, araç, küçük proje                | Kökten çalışınca kurulmamış kod da içe aktarılır |
| `src` düzeni                  | `src/paket/`, `tests/`                | Yayımlanacak kütüphane                     | Test için `pip install -e .` şart              |

```python calistir
import subprocess
import sys
from pathlib import Path

Path("uygulamam").mkdir()
Path("uygulamam/__init__.py").write_text("", encoding="utf-8")
Path("uygulamam/metin.py").write_text('def selam(ad):\n    return f"Merhaba {ad}"\n', encoding="utf-8")
Path("uygulamam/ana.py").write_text('from .metin import selam\nprint(selam("Ayşe"))\n', encoding="utf-8")


def calistir(*argumanlar: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, *argumanlar], capture_output=True, text=True)


# YANLIŞ: paketin içindeki dosyayı doğrudan çalıştırmak göreli içe aktarmayı bozar
assert "attempted relative import with no known parent package" in calistir("uygulamam/ana.py").stderr
# DOĞRU: proje kökünden modül olarak çalıştırmak
assert calistir("-m", "uygulamam.ana").stdout.strip() == "Merhaba Ayşe"

# Standart kütüphaneyle aynı adı taşıyan dosya onu gölgeler (Python 3.13 iletisi adı da söyler)
Path("json.py").write_text("x = 1\n", encoding="utf-8")
Path("rapor.py").write_text("import json\nprint(json.dumps({}))\n", encoding="utf-8")
assert "has no attribute 'dumps'" in calistir("rapor.py").stderr
print("tamam")
```

## ruff ve mypy ile çalışma

| Komut                                  | Ne yapar                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| `ruff check .`                         | Hata ve kötü kalıp arar (kurallar `[tool.ruff.lint] select`)   |
| `ruff check --fix .`                   | Güvenli düzeltmeleri uygular; sonra farkı okuyun               |
| `ruff format .` / `ruff format --check .` | Biçimlendirir / yalnız denetler (CI'da `--check`)          |
| `mypy .` (ayarda `strict = true`)       | Tipleri denetler                                               |
| `reveal_type(x)` (kodda, geçici)        | mypy'ye `x`'in tipini yazdırır; hata ayıklarken                |

- Susturma her zaman **kodlu** yazılır: `# type: ignore[arg-type]`, `# noqa: B006`. Kodsuz `# type: ignore` hataların
  hepsini gizler.
- Üçüncü taraf paket tip taşımıyorsa önce `types-<paket>` arayın; `ignore_missing_imports`'u yalnız o modül için açın.
- Havuzdaki tek komutluk denetim örneği: [`kutuphane/py/scripts/check.py`](../../kutuphane/py/scripts/check.py)
  (`ruff check` + `ruff format --check` + `mypy` + `pytest`).

## Tuzaklar

| Belirti                                                          | Neden                                                 | Çözüm                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Yanlış tipli veri hiç hata vermeden içeri girdi                   | Tip ipucu çalışma zamanında denetlenmez               | Sınırda Pydantic; içeride `mypy --strict`                   |
| `"1250"` metni sayı alanına sessizce sayı olarak girdi             | Pydantic varsayılan (lax) kipte dönüştürür            | Gerekiyorsa `ConfigDict(strict=True)`                       |
| Alan adındaki yazım hatası fark edilmedi                          | Pydantic bilinmeyen alanı varsayılan olarak atar      | `extra="forbid"`                                            |
| Saat dilimi kayboldu, saatler 3 saat kaydı                         | `datetime` alanı naive değeri kabul eder              | `AwareDatetime`                                             |
| `mutable default … use default_factory`                          | dataclass'ta `= []`                                   | `field(default_factory=list)`                               |
| `isinstance(x, Protocol)` yanlış nesneyi kabul etti               | `runtime_checkable` imzaya bakmaz                     | İmzayı mypy denetlesin                                       |
| Testte `ModuleNotFoundError: No module named 'paket'`             | `src` düzeni kurulmamış ya da yanlış klasörden çalışıyor | `pip install -e .` ya da pytest `pythonpath`             |
| `attempted relative import with no known parent package`          | Paket dosyası doğrudan çalıştırıldı                    | `python -m paket.modul`                                     |
| `module 'json' has no attribute 'dumps'`                          | Yerel `json.py` standart modülü gölgeliyor             | Dosyayı yeniden adlandırın                                  |
| Editörde çalışıyor, uçbirimde `ModuleNotFoundError`               | Farklı yorumlayıcı (sanal ortam etkin değil)           | `.venv/bin/python -m …` ya da `uv run …`                    |
| `pip install` sistem Python'una kurdu                            | Sanal ortam dışında `pip`                              | `python -m pip` sanal ortamın yorumlayıcısıyla              |
| Jenerik köşeli ayraç sözdizimi hatası                             | `requires-python` 3.12'den eski                        | `TypeVar` ya da sürümü yükseltin                            |
| Türkçe metinde yüzlerce `RUF001` uyarısı                          | ruff `ı` harfini belirsiz sayar                        | `RUF001-003`'ü kapatın                                      |
| `# type: ignore` sonrası başka hatalar da kayboldu                 | Kodsuz susturma                                        | `# type: ignore[kod]`                                        |

## Denetim listesi

- [ ] `pyproject.toml`'da `[build-system]`, `requires-python`, aralıklı `dependencies`, `dev` grubu var.
- [ ] `ruff check`, `ruff format --check`, `mypy` (strict) ve `pytest` tek komutla (`scripts/check.py`) koşuyor.
- [ ] Dışarıdan gelen her veri Pydantic modelinden geçiyor; modellerde `extra="forbid"` ve zamanlar `AwareDatetime`.
- [ ] dataclass'larda değişebilir varsayılan yok; değişmez olması gerekenler `frozen=True`.
- [ ] Her işlevin tip imzası var (mypy `no-untyped-def` temiz).
- [ ] Susturmalar kodlu (`# type: ignore[…]`, `# noqa: …`) ve gerekçeli.
- [ ] `.venv` `.gitignore`'da; kilit dosyası depoda.
- [ ] Modüller `python -m paket.modul` ile çalışıyor; proje dosyalarında standart kütüphane adı yok.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her işlevin tip imzası olsun; dış veriyi Pydantic modeliyle (`extra=\"forbid\"`) doğrula;
  içeride `dataclass(frozen=True, slots=True)` kullan; komutları `.venv/bin/python -m …` ile çalıştır; bitince
  `python scripts/check.py`."
- **Modelin tipik hatası:** Sanal ortamı unutup sistem Python'una kurar; `from .x import y` içeren dosyayı doğrudan
  çalıştırır, hata alınca içe aktarmayı mutlak yola çevirip `sys.path.append` ekler; mypy hatasını kodsuz
  `# type: ignore` ile susturur; Pydantic'in sessiz dönüşümünü fark etmez.
- **Çıktıda arayın:** `sys.path.append`, kodsuz `type: ignore`, `Optional[` (eski yazım), `= []` içeren dataclass
  alanı, `datetime` tipli Pydantic alanı.
- **Hata yapıştırırken:** tam izi (traceback) ve çalıştırdığınız komutu birlikte verin; içe aktarma hatası çoğu
  zaman komuttan kaynaklanır.

## İlgili

- [Python tuzakları](python-tuzaklar.md)
- [Python standart kütüphanesi tuzakları](python-standart-kutuphane.md): `groupby`, `lru_cache`, `logging`, `subprocess`
- [Python eşzamanlılık](python-eszamanlilik.md)
- [Modül ve bağımlılık](modul-ve-bagimlilik.md): döngüsel içe aktarma, kilit dosyası, sürüm aralıkları
- [Hata yönetimi kalıpları](hata-yonetimi-kaliplari.md)
- Havuzdaki Python temelleri ve denetim betikleri: [`ml-temel/pyproject.toml`](../../ml-temel/pyproject.toml),
  [`algoritma/scripts/check.py`](../../algoritma/scripts/check.py)
