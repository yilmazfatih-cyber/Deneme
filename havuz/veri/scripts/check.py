"""Tek komutluk denetim: ruff check + ruff format --check + mypy + pytest (ağsız, hedef < 2 dakika).

Kullanım (temel klasöründen):  .venv/bin/python scripts/check.py
Bir adım başarısız olursa sonraki adımlar yine çalışır; sonunda özet basılır ve çıkış kodu 1 olur.
Ağ isteyen testler (``@pytest.mark.ag``) burada ATLANIR; açmak için: VERIHAVUZU_AG=1.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable
STEPS = [
    ("ruff check", [PY, "-m", "ruff", "check", "."]),
    ("ruff format --check", [PY, "-m", "ruff", "format", "--check", "."]),
    ("mypy", [PY, "-m", "mypy"]),
    ("pytest", [PY, "-m", "pytest", "-q"]),
]


def main() -> int:
    env = dict(os.environ)
    env.setdefault("PYTHONHASHSEED", "0")
    failed = []
    started = time.monotonic()
    for name, command in STEPS:
        step_start = time.monotonic()
        print(f"── {name}", flush=True)
        result = subprocess.run(command, cwd=ROOT, env=env, check=False)
        print(
            f"   {name}: {'geçti' if result.returncode == 0 else 'BAŞARISIZ'} "
            f"({time.monotonic() - step_start:.1f} sn)",
            flush=True,
        )
        if result.returncode != 0:
            failed.append(name)
    total = time.monotonic() - started
    if failed:
        print(f"Denetim BAŞARISIZ ({total:.1f} sn): {', '.join(failed)}")
        return 1
    print(f"Denetim yeşil ({total:.1f} sn).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
