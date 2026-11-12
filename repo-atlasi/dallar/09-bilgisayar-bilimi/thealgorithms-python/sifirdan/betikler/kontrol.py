#!/usr/bin/env python3
"""
Tek komutluk yerel "CI": TheAlgorithms/Python'da pre-commit kancaları ve
GitHub Actions iş akışlarının yaptığını küçük ölçekte sırayla yapar.

1. Adlandırma ve içerik kuralları  (orijinal: validate-filenames kancası + ruff)
2. Tüm doctest'ler                 (orijinal: pytest --doctest-modules, build.yml)
3. DIRECTORY.md güncel mi          (orijinal: build_directory_md.py, directory_writer.yml)

Kullanım: python3 betikler/kontrol.py   (hepsi geçerse 0, yoksa 1)
"""

import doctest
import importlib
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
if str(KOK) not in sys.path:
    sys.path.insert(0, str(KOK))

from betikler import dizin_olustur, kurallari_denetle  # noqa: E402


def modul_adlari(kok: Path = KOK) -> list[str]:
    """
    Doctest'i çalıştırılacak modüllerin içe aktarma adları: algoritmalar ve betikler.

    >>> "arama.ikili_arama" in modul_adlari()
    True
    >>> "betikler.dizin_olustur" in modul_adlari()
    True
    """
    algoritmalar = [y.removesuffix(".py").replace("/", ".") for y in dizin_olustur.algoritma_dosyalari(kok)]
    algoritmalar = [ad for ad in algoritmalar if not ad.startswith("testler.")]
    betikler = sorted(f"betikler.{p.stem}" for p in (kok / "betikler").glob("*.py") if p.stem != "__init__")
    return algoritmalar + betikler


def doctestleri_calistir(kok: Path = KOK) -> tuple[int, int]:
    """Tüm modüllerin doctest'lerini çalıştırır; (başarısız, toplam) döndürür."""
    basarisiz = toplam = 0
    for ad in modul_adlari(kok):
        sonuc = doctest.testmod(importlib.import_module(ad), optionflags=doctest.ELLIPSIS)
        basarisiz += sonuc.failed
        toplam += sonuc.attempted
    return basarisiz, toplam


def main() -> int:
    adimlar_basarili = True

    bulgular = kurallari_denetle.depoyu_denetle(KOK)
    print(f"[1/3] kurallar: {len(bulgular)} bulgu")
    for bulgu in bulgular:
        print(f"      {bulgu}")
    adimlar_basarili &= not bulgular

    basarisiz, toplam = doctestleri_calistir(KOK)
    print(f"[2/3] doctest: {toplam - basarisiz}/{toplam} örnek geçti")
    adimlar_basarili &= basarisiz == 0

    guncel = dizin_olustur.main(["--kontrol"]) == 0
    print(f"[3/3] DIRECTORY.md: {'güncel' if guncel else 'GÜNCEL DEĞİL'}")
    adimlar_basarili &= guncel

    return 0 if adimlar_basarili else 1


if __name__ == "__main__":
    sys.exit(main())
