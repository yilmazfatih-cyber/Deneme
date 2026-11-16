"""Tek komutluk denetim: ruff (lint) + ruff (biçim) + mypy (tip) + pytest (hızlı testler).

Kullanım (sinav klasöründen):
    python scripts/check.py            hızlı denetim (~1 dk; görevlerin biçimi, hazırlıkları, araçların testleri)
    python scripts/check.py --tam      bütün görevleri baştan sona doğrular (SINAV_TAM=1; uzun, 20–40 dk)
    python scripts/check.py --duzelt   önce ruff'ın kendiliğinden düzeltebildiklerini düzeltir

Bir adım kırmızıysa iş bitmemiştir; çıkış kodu sıfırdan farklı olur.
Genişletme: yeni bir denetim adımı için `build_steps` listesine bir satır ekleyin.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build_steps(full: bool) -> list[tuple[str, list[str]]]:
    py = sys.executable
    pytest_cmd = [py, "-m", "pytest"] + ([] if full else ["-m", "not tam"])
    return [
        ("ruff (lint)", [py, "-m", "ruff", "check", "."]),
        ("ruff (biçim)", [py, "-m", "ruff", "format", "--check", "."]),
        ("mypy (tip)", [py, "-m", "mypy"]),
        ("pytest (test)", pytest_cmd),
    ]


def run_step(name: str, command: list[str], env: dict[str, str]) -> bool:
    print(f"\n=== {name} ===", flush=True)
    started = time.perf_counter()
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    status = "tamam" if result.returncode == 0 else "HATA"
    print(f"--- {name}: {status} ({time.perf_counter() - started:.1f} sn)", flush=True)
    return result.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="sınav: tek komutluk denetim")
    parser.add_argument(
        "--tam", action="store_true", help="bütün görevleri baştan sona doğrula (uzun)"
    )
    parser.add_argument("--duzelt", action="store_true", help="önce ruff ile kendiliğinden düzelt")
    args = parser.parse_args()
    env = dict(os.environ)
    if args.tam:
        env["SINAV_TAM"] = "1"
    if args.duzelt:
        subprocess.run([sys.executable, "-m", "ruff", "check", "--fix", "."], cwd=ROOT, check=False)
        subprocess.run([sys.executable, "-m", "ruff", "format", "."], cwd=ROOT, check=False)
    started = time.perf_counter()
    failed = [name for name, command in build_steps(args.tam) if not run_step(name, command, env)]
    total = time.perf_counter() - started
    if failed:
        print(f"\nDENETİM KIRMIZI ({total:.1f} sn). Düzeltilecek adımlar: {', '.join(failed)}")
        print("İpucu: biçim ve basit lint hataları için `python scripts/check.py --duzelt`.")
        return 1
    print(f"\nDENETİM YEŞİL ({total:.1f} sn).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
