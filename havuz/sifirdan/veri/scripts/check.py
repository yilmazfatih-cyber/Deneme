"""Tek komutluk denetim: ruff (lint) + ruff (biçim) + mypy (tip) + pytest (test).

Kullanım (bu temelin klasöründen, sanal ortamın Python'uyla):
    python scripts/check.py                 hızlı denetim (uzun senaryolar atlanır; hedef < 3 dakika)
    python scripts/check.py --uzun          uzun rastgele senaryolar dahil her şey
    python scripts/check.py --duzelt        önce ruff'ın kendiliğinden düzeltebildiklerini düzeltir
    python scripts/check.py --sistem raft   yalnız bir mini sistemin testleri (lint/tip yine tümü)

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


def build_steps(long_run: bool, system: str | None) -> list[tuple[str, list[str]]]:
    """Koşulacak adımları (ad, komut) çiftleri olarak döndürür."""
    py = sys.executable
    pytest_cmd = [py, "-m", "pytest"]
    if system is not None:
        pytest_cmd.append(f"tests/{system}")
    if not long_run:
        pytest_cmd += ["-m", "not uzun"]
    return [
        ("ruff (lint)", [py, "-m", "ruff", "check", "."]),
        ("ruff (biçim)", [py, "-m", "ruff", "format", "--check", "."]),
        ("mypy (tip)", [py, "-m", "mypy"]),
        ("pytest (test)", pytest_cmd),
    ]


def run_step(name: str, command: list[str], long_run: bool) -> bool:
    """Bir adımı çalıştırır; başarılıysa True döndürür."""
    print(f"\n=== {name} ===", flush=True)
    env = dict(os.environ)
    # Özellik testleri bu değişkene bakarak örnek sayısını seçer (bkz. tests/conftest.py).
    env["SIFIRDAN_UZUN"] = "1" if long_run else "0"
    started = time.perf_counter()
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    elapsed = time.perf_counter() - started
    status = "tamam" if result.returncode == 0 else "HATA"
    print(f"--- {name}: {status} ({elapsed:.1f} sn)", flush=True)
    return result.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description="sifirdan/veri tek komutluk denetim")
    parser.add_argument("--uzun", action="store_true", help="uzun rastgele senaryoları da koş")
    parser.add_argument("--duzelt", action="store_true", help="önce ruff ile kendiliğinden düzelt")
    parser.add_argument("--sistem", help="yalnız bu mini sistemin testlerini koş (ör. raft)")
    args = parser.parse_args()

    if args.sistem is not None and not (ROOT / "tests" / args.sistem).is_dir():
        print(f"tests/{args.sistem} klasörü yok. Mini sistem adını denetleyin (ör. btree, raft).")
        return 2

    if args.duzelt:
        py = sys.executable
        subprocess.run([py, "-m", "ruff", "check", "--fix", "."], cwd=ROOT, check=False)
        subprocess.run([py, "-m", "ruff", "format", "."], cwd=ROOT, check=False)

    started = time.perf_counter()
    steps = build_steps(args.uzun, args.sistem)
    failed = [name for name, command in steps if not run_step(name, command, args.uzun)]
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
