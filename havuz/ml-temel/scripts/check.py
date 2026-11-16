"""Tek komutluk denetim: ruff (lint) + ruff (biçim) + mypy (tip) + pytest (test).

Kullanım (temel klasöründen):
    python scripts/check.py            hızlı denetim (yavaş testler atlanır; hedef < 2 dakika)
    python scripts/check.py --uzun     yavaş testler ve örnek betikler dahil her şey
    python scripts/check.py --duzelt   önce ruff'ın kendiliğinden düzeltebildiklerini düzeltir

Bir adım kırmızıysa iş bitmemiştir; çıkış kodu sıfırdan farklı olur.
Genişletme: yeni bir denetim adımı eklemek için `build_steps` içindeki listeye bir satır ekleyin.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build_steps(long_run: bool) -> list[tuple[str, list[str]]]:
    """Koşulacak adımları (ad, komut) çiftleri olarak döndürür."""
    py = sys.executable
    pytest_cmd = [py, "-m", "pytest"]
    if not long_run:
        pytest_cmd += ["-m", "not yavas"]
    return [
        ("ruff (lint)", [py, "-m", "ruff", "check", "."]),
        ("ruff (biçim)", [py, "-m", "ruff", "format", "--check", "."]),
        ("mypy (tip)", [py, "-m", "mypy"]),
        ("pytest (test)", pytest_cmd),
    ]


def run_step(name: str, command: list[str]) -> bool:
    """Bir adımı çalıştırır; başarılıysa True döndürür."""
    print(f"\n=== {name} ===", flush=True)
    env = dict(os.environ)
    # Makine paylaşımlı olabilir: BLAS iş parçacıklarını kıs (ayarlıysa dokunma).
    for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        env.setdefault(var, "2")
    started = time.perf_counter()
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    elapsed = time.perf_counter() - started
    status = "tamam" if result.returncode == 0 else "HATA"
    print(f"--- {name}: {status} ({elapsed:.1f} sn)", flush=True)
    return result.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="ml-temel tek komutluk denetim")
    parser.add_argument("--uzun", action="store_true", help="yavaş testleri ve örnekleri de koş")
    parser.add_argument("--duzelt", action="store_true", help="önce ruff ile kendiliğinden düzelt")
    args = parser.parse_args()

    if args.duzelt:
        py = sys.executable
        subprocess.run([py, "-m", "ruff", "check", "--fix", "."], cwd=ROOT, check=False)
        subprocess.run([py, "-m", "ruff", "format", "."], cwd=ROOT, check=False)

    started = time.perf_counter()
    failed = [name for name, command in build_steps(args.uzun) if not run_step(name, command)]
    total = time.perf_counter() - started
    print()
    if failed:
        print(f"DENETİM KIRMIZI ({total:.1f} sn). Düzeltilecek adımlar: {', '.join(failed)}")
        print("İpucu: biçim ve basit lint hataları için `python scripts/check.py --duzelt`.")
        return 1
    print(f"DENETİM YEŞİL ({total:.1f} sn).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
