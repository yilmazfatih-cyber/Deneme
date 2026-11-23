"""Tek komutluk HIZLI denetim: ruff (lint) + ruff (biçim) + mypy + pytest (biçim kuralları dahil).

Kullanım (bu klasörden):
    .venv/bin/python scripts/check.py            hepsini çalıştırır (ağsız, ~30 sn)
    .venv/bin/python scripts/check.py --duzelt   önce otomatik düzeltilebilen lint/biçim hatalarını düzeltir
Tarifleri GERÇEKTEN kurup doğrulamak bu denetimin işi değildir (uzun sürer): `python tarif.py dogrula …`.
mypy, tarif betiklerini (her tarifin uygula.py + dogrula.py) klasör klasör ayrı denetler: hepsinin adı aynı
olduğundan tek seferde "aynı adlı modül" hatası verirdi.
Genişletme: yeni bir denetim adımı → `adimlar` listesine ekleyin.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
PY = sys.executable


def adimlar() -> list[tuple[str, list[str]]]:
    liste: list[tuple[str, list[str]]] = [
        ("ruff (lint)", [PY, "-m", "ruff", "check", "."]),
        ("ruff (biçim)", [PY, "-m", "ruff", "format", "--check", "."]),
        ("mypy (çekirdek)", [PY, "-m", "mypy"]),
    ]
    for klasor in sorted(p.parent for p in KOK.glob("*/uygula.py")):
        betikler = [
            str(klasor / ad) for ad in ("uygula.py", "dogrula.py") if (klasor / ad).exists()
        ]
        liste.append((f"mypy ({klasor.name})", [PY, "-m", "mypy", *betikler]))
    liste.append(("pytest (testler)", [PY, "-m", "pytest"]))
    return liste


def main() -> int:
    if "--duzelt" in sys.argv[1:]:
        subprocess.run([PY, "-m", "ruff", "check", "--fix", "."], cwd=KOK, check=False)
        subprocess.run([PY, "-m", "ruff", "format", "."], cwd=KOK, check=False)
    sonuclar: list[tuple[str, bool, float]] = []
    for ad, komut in adimlar():
        print(f"\n=== {ad} ===", flush=True)
        baslangic = time.perf_counter()
        kod = subprocess.run(komut, cwd=KOK, check=False).returncode
        sonuclar.append((ad, kod == 0, time.perf_counter() - baslangic))
    print("\n=== Özet ===")
    for ad, gecti, sure in sonuclar:
        print(f"  {'GEÇTİ ' if gecti else 'KALDI '} {ad:<34} {sure:6.1f} sn")
    if all(gecti for _, gecti, _ in sonuclar):
        print("\nDenetim yeşil.")
        return 0
    print(
        "\nDenetim kırmızı. İlk hatayı düzeltin; biçim için: .venv/bin/python scripts/check.py --duzelt"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
