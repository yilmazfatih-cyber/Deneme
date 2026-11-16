"""İnsan onayı kancaları: tehlikeli (`tehlikeli=True`) araçlar çalışmadan önce sorulur.

Kanca imzası: `(arac, argumanlar) -> bool` (True = çalıştır). Kanca verilmezse tehlikeli
araçlar HİÇ çalışmaz (varsayılan güvenli taraf; arac/kutu.py).
Kim kullanır: AracKutusu(onay=...); cli.py `sohbet --arac` konsoldan sorar.
Genişletme: web arayüzünden onay gibi başka bir yol → aynı imzada bir işlev yazın.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Collection
from typing import Any

from yz.arac.kutu import OnayKancasi
from yz.arac.tanim import Arac
from yz.metin import kucuk_tr


def hepsini_reddet(arac: Arac, argumanlar: dict[str, Any]) -> bool:
    """Hiçbir tehlikeli aracı çalıştırmaz."""
    return False


def hepsini_onayla(arac: Arac, argumanlar: dict[str, Any]) -> bool:
    """Her şeyi onaylar — YALNIZ testlerde ve güvenli korumalı alanda kullanın."""
    return True


def listeden_onayla(adlar: Collection[str]) -> OnayKancasi:
    """Yalnız adı verilen tehlikeli araçları onaylar."""
    izinli = frozenset(adlar)

    def kanca(arac: Arac, argumanlar: dict[str, Any]) -> bool:
        return arac.ad in izinli

    return kanca


def konsoldan_sor(
    girdi: Callable[[str], str] = input, cikti: Callable[[str], None] = print
) -> OnayKancasi:
    """Terminalde kullanıcıya sorar ("e" / "evet" onaydır)."""

    def kanca(arac: Arac, argumanlar: dict[str, Any]) -> bool:
        cikti(f"\n⚠ `{arac.ad}` aracı şu argümanlarla çalışmak istiyor:")
        cikti(json.dumps(argumanlar, ensure_ascii=False, indent=2))
        try:
            cevap = girdi("Onaylıyor musunuz? (e/h): ")
        except EOFError:
            return False
        return kucuk_tr(cevap.strip()) in {"e", "evet", "y", "yes"}

    return kanca
