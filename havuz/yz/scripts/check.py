"""Tek komutluk denetim: ruff (lint) + ruff (biçim) + mypy + pytest.

Kullanım (bu klasörden):
    .venv/bin/python scripts/check.py            hepsini çalıştırır
    .venv/bin/python scripts/check.py --duzelt   önce otomatik düzeltilebilenleri düzeltir
Kural: denetim yeşil değilse iş bitmemiştir. Ağ gerekmez; hedef süre 2 dakikanın altıdır.
Genişletme: yeni bir denetim adımı → `ADIMLAR` listesine ekleyin.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
PY = sys.executable

ADIMLAR: list[tuple[str, list[str]]] = [
    ("ruff (lint)", [PY, "-m", "ruff", "check", "."]),
    ("ruff (biçim)", [PY, "-m", "ruff", "format", "--check", "."]),
    ("mypy (tipler)", [PY, "-m", "mypy"]),
    ("pytest (testler)", [PY, "-m", "pytest"]),
]
DUZELTME: list[list[str]] = [
    [PY, "-m", "ruff", "check", "--fix", "."],
    [PY, "-m", "ruff", "format", "."],
]


def main() -> int:
    if "--duzelt" in sys.argv[1:]:
        for komut in DUZELTME:
            subprocess.run(komut, cwd=KOK, check=False)
    sonuclar: list[tuple[str, bool, float]] = []
    for ad, komut in ADIMLAR:
        print(f"\n=== {ad} ===", flush=True)
        baslangic = time.perf_counter()
        kod = subprocess.run(komut, cwd=KOK, check=False).returncode
        sonuclar.append((ad, kod == 0, time.perf_counter() - baslangic))
    print("\n=== Özet ===")
    for ad, gecti, sure in sonuclar:
        print(f"  {'GEÇTİ ' if gecti else 'KALDI '} {ad:<18} {sure:6.1f} sn")
    if all(gecti for _, gecti, _ in sonuclar):
        print("\nDenetim yeşil.")
        return 0
    print(
        "\nDenetim kırmızı. Yukarıdaki ilk hatayı düzeltin; biçim hataları için:\n"
        "    .venv/bin/python scripts/check.py --duzelt"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
