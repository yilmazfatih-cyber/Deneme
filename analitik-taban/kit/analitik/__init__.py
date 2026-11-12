"""Analitik taban: Mixpanel ve Hotjar verisini az token harcayarak özetleyen standart kütüphane araçları."""

import os
import sys

SURUM = "1.0.0"


def utf8_cikti() -> None:
    """Windows'ta borulu çıktı cp1254 olur ve → ▁ ⚠ gibi karakterlerde çöker; her zaman UTF-8 yaz."""
    for akis in (sys.stdout, sys.stderr):
        try:
            akis.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def boru_kapandi() -> int:
    """`komut | head` çıktıyı erken kapatınca yığın izi basmadan çık (boşa token harcanmasın)."""
    try:
        bos = os.open(os.devnull, os.O_WRONLY)
        os.dup2(bos, sys.stdout.fileno())
    except (OSError, ValueError, AttributeError):
        pass
    return 0
