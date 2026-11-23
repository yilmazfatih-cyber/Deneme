"""Tarif betiklerinin (uygula.py, dogrula.py) ortak kalıbı: hedef klasörü alma, dosyaları yerleştirme adımı.

Bir uygula.py'nin iskeleti (kopyalayıp uyarlayın):

    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=True)
    gunluk = Gunluk(f"{tarif.ad} · uygula → {proje}")
    return calistir_ve_ozetle(gunluk, [
        lambda: temeli_kopyala(gunluk, "uygulama", proje),
        lambda: yerlestir_adimi(gunluk, tarif, proje),
        lambda: node_kur(gunluk, proje / "uygulama"),
    ])

Genişletme: bütün tariflerde yinelenen yeni bir adım → buraya `<ad>_adimi(gunluk, …)` işlevi.
"""

from __future__ import annotations

import sys
from collections.abc import Sequence
from pathlib import Path

from tarifcik.komut import Gunluk
from tarifcik.yerlestir import dosyalari_yerlestir
from tarifcik.yollar import Tarif, tarif_oku


def bu_tarif(betik_dosyasi: str) -> Tarif:
    """Betiğin bulunduğu klasördeki tarif."""
    return tarif_oku(Path(betik_dosyasi).resolve().parent)


def hedef_al(argv: Sequence[str], yeni: bool) -> Path:
    """Komut satırındaki tek argüman: proje klasörü. `yeni=True` ise yok ya da boş olmalı."""
    if len(argv) != 1 or argv[0] in ("-h", "--help", "--yardim"):
        betik = Path(sys.argv[0]).name
        print(f"Kullanım: python {betik} <proje-klasörü>", file=sys.stderr)
        raise SystemExit(2)
    proje = Path(argv[0]).expanduser().resolve()
    if yeni and proje.exists() and any(proje.iterdir()):
        print(f"Hedef boş değil: {proje}. Yeni ya da boş bir klasör verin.", file=sys.stderr)
        raise SystemExit(2)
    if not yeni and not proje.is_dir():
        print(f"Proje klasörü yok: {proje}. Önce uygula.py ile kurun.", file=sys.stderr)
        raise SystemExit(2)
    return proje


def yerlestir_adimi(gunluk: Gunluk, tarif: Tarif, proje: Path) -> None:
    """dosyalar/'ı hedefe yerleştirir (yeni dosyalar kopyalanır, yamalar uygulanır)."""
    with gunluk.adim(f"dosyalar/ yerleştir ({tarif.ad})"):
        for satir in dosyalari_yerlestir(tarif, proje):
            print(f"  {satir}")
