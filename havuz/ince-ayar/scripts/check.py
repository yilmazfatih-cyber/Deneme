"""Tek komutluk denetim: ruff (lint) + ruff (biçim) + mypy (tip) + pytest (test).

Kullanım (temel klasöründen, sanal ortamın Python'uyla):
    .venv/bin/python scripts/check.py            hızlı denetim (ağ istemez; hedef < 3 dakika)
    .venv/bin/python scripts/check.py --duzelt   önce ruff'ın kendiliğinden düzeltebildiklerini düzeltir
    INCE_AYAR_AG=1 .venv/bin/python scripts/check.py   ağ isteyen duman testleri de koşar (yavaş)

Bir adım kırmızıysa iş bitmemiştir; çıkış kodu sıfırdan farklı olur.
Genişletme: yeni bir denetim adımı için `build_steps` içindeki listeye bir satır ekleyin.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ["ince_ayar", "scripts", "tests"]


def build_steps(fix: bool) -> list[tuple[str, list[str]]]:
    """Koşulacak adımlar: (ad, komut)."""
    python = sys.executable
    steps: list[tuple[str, list[str]]] = []
    if fix:
        steps.append(("ruff düzelt", [python, "-m", "ruff", "check", "--fix", *TARGETS]))
        steps.append(("ruff biçimle", [python, "-m", "ruff", "format", *TARGETS]))
    steps += [
        ("ruff (lint)", [python, "-m", "ruff", "check", *TARGETS]),
        ("ruff (biçim)", [python, "-m", "ruff", "format", "--check", *TARGETS]),
        ("mypy (tip)", [python, "-m", "mypy", *TARGETS]),
        ("pytest (test)", [python, "-m", "pytest"]),
    ]
    return steps


def main() -> int:
    parser = argparse.ArgumentParser(description="ince_ayar tek komutluk denetim")
    parser.add_argument("--duzelt", action="store_true", help="önce otomatik düzeltmeleri uygular")
    args = parser.parse_args()
    env = {**os.environ, "OMP_NUM_THREADS": os.environ.get("OMP_NUM_THREADS", "2")}
    failed: list[str] = []
    started = time.perf_counter()
    for name, command in build_steps(args.duzelt):
        print(f"\n=== {name} ===", flush=True)
        step_start = time.perf_counter()
        result = subprocess.run(command, cwd=ROOT, env=env, check=False)
        status = "TAMAM" if result.returncode == 0 else "HATA"
        print(f"--- {name}: {status} ({time.perf_counter() - step_start:.1f} sn)", flush=True)
        if result.returncode != 0:
            failed.append(name)
    total = time.perf_counter() - started
    if failed:
        print(f"\nDENETİM KIRMIZI ({total:.0f} sn): {', '.join(failed)}")
        return 1
    print(f"\nDENETİM YEŞİL ({total:.0f} sn)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
