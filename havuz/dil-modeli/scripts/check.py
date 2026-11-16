"""Tek komutluk denetim: ruff + biçim + mypy + pytest (+ JS biçim ve testleri).

Kullanım (dil-modeli klasöründen):
    python scripts/check.py          # hızlı denetim: ağ gerekmez, ~1-2 dakika
    python scripts/check.py --uzun   # + uzun testler + tarayıcı uçtan uca testi (Chromium ister)
Bir adım başarısız olursa sonraki adımlar yine çalışır; sonda özet ve çıkış kodu 1 döner.

Genişletme: Yeni bir denetim adımı için `steps` listesine (ad, komut) ekleyin.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _node_steps(long: bool) -> list[tuple[str, list[str]]]:
    if shutil.which("node") is None:
        print("Uyarı: node bulunamadı; tarayıcı testleri atlandı (Node 22 kurun).")
        return []
    if (ROOT / "node_modules" / ".bin" / "prettier").exists():
        steps = [("js biçim (prettier)", ["npm", "run", "--silent", "check"])]
    else:
        print("Uyarı: node_modules yok (npm ci); JS biçim denetimi atlandı, testler yine koşar.")
        steps = [("js testleri", ["node", "--test", "tarayici/"])]
    if long:
        steps.append(("tarayıcı uçtan uca", ["npm", "run", "--silent", "e2e"]))
    return steps


def main() -> int:
    parser = argparse.ArgumentParser(description="dil-modeli denetimi")
    parser.add_argument(
        "--uzun", action="store_true", help="uzun testleri ve tarayıcı testini de çalıştır"
    )
    args = parser.parse_args()
    python = sys.executable
    steps: list[tuple[str, list[str]]] = [
        ("ruff", [python, "-m", "ruff", "check", "."]),
        ("biçim", [python, "-m", "ruff", "format", "--check", "."]),
        ("mypy", [python, "-m", "mypy"]),
        ("pytest", [python, "-m", "pytest"]),
    ]
    if args.uzun:
        steps.append(("pytest (uzun)", [python, "-m", "pytest", "-m", "uzun"]))
    steps += _node_steps(args.uzun)
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    failed: list[str] = []
    for name, command in steps:
        started = time.perf_counter()
        print(
            f"\n=== {name}: {' '.join(Path(c).name if c == python else c for c in command)}",
            flush=True,
        )
        code = subprocess.run(command, cwd=ROOT, env=env, check=False).returncode
        status = "tamam" if code == 0 else f"BAŞARISIZ (çıkış {code})"
        print(f"--- {name}: {status} ({time.perf_counter() - started:.1f} sn)", flush=True)
        if code != 0:
            failed.append(name)
    if failed:
        print(f"\nDenetim BAŞARISIZ: {', '.join(failed)}. Yukarıdaki hata iletilerini düzeltin.")
        return 1
    print("\nDenetim yeşil.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
