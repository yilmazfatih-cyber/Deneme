#!/usr/bin/env python3
"""
Adlandırma ve katkı kuralı denetleyicisi.

İki kural ailesi var:

1. Dosya adı kuralları (TheAlgorithms/Python `scripts/validate_filenames.py`
   ile aynı dört kural + bir ekleme):
   AD-BUYUK  büyük harf    AD-BOSLUK  boşluk    AD-TIRE  tire (-)
   AD-KOK    klasör dışında (kökte) duran dosya
   AD-ASCII  [a-z0-9_] dışında karakter (bizim eklememiz: ç, ş, ı gibi harfler
             dosya adında işletim sistemleri arasında sorun çıkarabilir)

2. İçerik kuralları (orijinalde CONTRIBUTING.md, ruff ANN kuralları ve inceleme
   sırasında konan `require tests` / `require type hints` etiketleriyle uygulanır;
   biz `ast` ile basitçe denetliyoruz):
   IC-KAYNAK   modül docstring'inde bir URL (http...) yok
   IC-DOCTEST  herkese açık fonksiyonun docstring'inde `>>>` örneği yok
   IC-HATA     modülde hatalı girdiyi gösteren bir doctest (Traceback) yok
   IC-TIP      parametre ya da dönüş değeri tip ipucu taşımıyor
   IC-YANETKI  fonksiyon gövdesinde print() ya da input() çağrısı var

Kullanım: python3 betikler/kurallari_denetle.py   (bulgu varsa 1 ile çıkar)
"""

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from betikler.dizin_olustur import KOK, algoritma_dosyalari
except ImportError:  # betik doğrudan çalıştırıldığında
    from dizin_olustur import KOK, algoritma_dosyalari  # type: ignore[no-redef]

# İçerik kuralları algoritma dosyaları içindir; test dosyaları yalnızca ad kurallarından geçer.
ICERIK_DISI_KLASORLER = frozenset({"testler"})
GECERLI_AD = re.compile(r"^[a-z0-9_/]+\.(py|ipynb)$")


@dataclass(frozen=True, order=True)
class Bulgu:
    yol: str
    kural: str
    mesaj: str

    def __str__(self) -> str:
        return f"{self.yol}: {self.kural} {self.mesaj}"


def ad_kurallari(yol: str) -> list[Bulgu]:
    """
    Tek bir göreli yolu dosya adı kurallarına göre denetler.

    >>> ad_kurallari("arama/ikili_arama.py")
    []
    >>> [b.kural for b in ad_kurallari("Arama/İkili-Arama.py")]
    ['AD-BUYUK', 'AD-TIRE', 'AD-ASCII']
    >>> [b.kural for b in ad_kurallari("tek dosya.py")]
    ['AD-BOSLUK', 'AD-KOK', 'AD-ASCII']
    """
    bulgular = []
    if yol != yol.lower():
        bulgular.append(Bulgu(yol, "AD-BUYUK", "dosya adında büyük harf var"))
    if " " in yol:
        bulgular.append(Bulgu(yol, "AD-BOSLUK", "dosya adında boşluk var"))
    if "-" in yol:
        bulgular.append(Bulgu(yol, "AD-TIRE", "tire yerine alt çizgi kullan"))
    if "/" not in yol:
        bulgular.append(Bulgu(yol, "AD-KOK", "dosya bir klasörün içinde olmalı"))
    if not GECERLI_AD.match(yol):
        bulgular.append(Bulgu(yol, "AD-ASCII", "yalnızca a-z, 0-9 ve _ kullan"))
    return bulgular


def _herkese_acik_fonksiyonlar(agac: ast.Module) -> list[ast.FunctionDef]:
    """Modül düzeyindeki ve sınıf içindeki, adı _ ile başlamayan fonksiyonlar."""
    fonksiyonlar: list[ast.FunctionDef] = []
    for dugum in agac.body:
        if isinstance(dugum, ast.FunctionDef):
            fonksiyonlar.append(dugum)
        elif isinstance(dugum, ast.ClassDef):
            fonksiyonlar += [f for f in dugum.body if isinstance(f, ast.FunctionDef)]
    return [f for f in fonksiyonlar if not f.name.startswith("_")]


def icerik_kurallari(yol: str, kaynak: str) -> list[Bulgu]:
    """
    Bir modülün kaynak kodunu içerik kurallarına göre denetler.

    >>> icerik_kurallari("x/iyi.py", '''\"\"\"Kaynak: https://ornek.org\"\"\"
    ... def kare(sayi: int) -> int:
    ...     \"\"\"
    ...     >>> kare(3)
    ...     9
    ...     >>> kare("a")
    ...     Traceback (most recent call last):
    ...     TypeError: ...
    ...     \"\"\"
    ...     return sayi * sayi
    ... ''')
    []
    >>> sorted(b.kural for b in icerik_kurallari("x/kotu.py", "def f(a):\\n    print(a)\\n"))
    ['IC-DOCTEST', 'IC-HATA', 'IC-KAYNAK', 'IC-TIP', 'IC-TIP', 'IC-YANETKI']
    """
    agac = ast.parse(kaynak)
    bulgular = []
    modul_aciklamasi = ast.get_docstring(agac) or ""
    if "http" not in modul_aciklamasi:
        bulgular.append(Bulgu(yol, "IC-KAYNAK", "modül açıklamasına Wikipedia vb. bir URL ekle"))

    hata_doctesti_var = "Traceback (most recent call last)" in kaynak
    for fonksiyon in _herkese_acik_fonksiyonlar(agac):
        ad = fonksiyon.name
        aciklama = ast.get_docstring(fonksiyon) or ""
        if ad != "main" and ">>>" not in aciklama:
            bulgular.append(Bulgu(yol, "IC-DOCTEST", f"{ad}() için doctest yok"))
        parametreler = [*fonksiyon.args.posonlyargs, *fonksiyon.args.args, *fonksiyon.args.kwonlyargs]
        for parametre in parametreler:
            if parametre.arg not in {"self", "cls"} and parametre.annotation is None:
                bulgular.append(Bulgu(yol, "IC-TIP", f"{ad}(): '{parametre.arg}' parametresinin tipi yok"))
        if fonksiyon.returns is None and ad != "__init__":
            bulgular.append(Bulgu(yol, "IC-TIP", f"{ad}(): dönüş tipi yok"))
        for alt in ast.walk(fonksiyon):
            if isinstance(alt, ast.Call) and isinstance(alt.func, ast.Name) and alt.func.id in {"print", "input"}:
                bulgular.append(Bulgu(yol, "IC-YANETKI", f"{ad}(): {alt.func.id}() yerine sonucu döndür"))
    if not hata_doctesti_var:
        bulgular.append(Bulgu(yol, "IC-HATA", "hatalı girdiyi gösteren bir doctest ekle"))
    return bulgular


def depoyu_denetle(kok: Path = KOK) -> list[Bulgu]:
    """Depodaki tüm algoritma dosyalarını iki kural ailesine göre denetler."""
    bulgular: list[Bulgu] = []
    for yol in algoritma_dosyalari(kok):
        bulgular += ad_kurallari(yol)
        if yol.endswith(".py") and yol.split("/")[0] not in ICERIK_DISI_KLASORLER:
            bulgular += icerik_kurallari(yol, (kok / yol).read_text(encoding="utf-8"))
    return sorted(bulgular)


def main(argv: list[str] | None = None) -> int:
    kok = Path(argv[0]) if argv else KOK
    bulgular = depoyu_denetle(kok)
    for bulgu in bulgular:
        print(bulgu)
    print(f"{len(bulgular)} bulgu", file=sys.stderr)
    # Orijinal betik sys.exit(hatalı_dosya_sayısı) yapar; çıkış kodu 8 bittir ve 256 hatada 0'a sarar.
    # Bu yüzden biz yalnızca 0 ya da 1 döndürüyoruz.
    return 1 if bulgular else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
