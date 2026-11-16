"""Tek komutluk denetim: ruff check + ruff format --check + mypy + pytest.

Kullanım (py/ klasöründen):
    python scripts/check.py            # hepsini sırayla koşar; biri kırılırsa durur ve 1 döner
    python scripts/check.py --duzelt   # biçimi ve düzeltilebilir lint hatalarını önce düzeltir

Araçlar (ruff, mypy, pytest) bu yorumlayıcıda kurulu değilse ve `py/.venv` varsa betik kendini o ortamın
Python'uyla yeniden çalıştırır; yoksa `python scripts/kur.py` çalıştırmanızı söyler.

Genişletme: Yeni bir denetim adımı `STEPS` listesine bir satır olarak eklenir.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ("ruff", "mypy", "pytest")

# (ad, komut) — komutlar bu betiği çalıştıran Python ile `-m` üzerinden çağrılır.
STEPS: list[tuple[str, list[str]]] = [
    ("ruff check", ["ruff", "check", "."]),
    ("ruff format --check", ["ruff", "format", "--check", "."]),
    ("mypy", ["mypy"]),
    ("pytest", ["pytest"]),
]
FIX_STEPS: list[tuple[str, list[str]]] = [
    ("ruff check --fix", ["ruff", "check", "--fix", "."]),
    ("ruff format", ["ruff", "format", "."]),
]


def _venv_python() -> Path | None:
    for candidate in (ROOT / ".venv" / "bin" / "python", ROOT / ".venv" / "Scripts" / "python.exe"):
        if candidate.exists():
            return candidate
    return None


def _ensure_tools() -> None:
    """`.venv` varsa betiği onunla yeniden çalıştırır (kilitli araç sürümleri); yoksa eksik aracı söyler.

    Sanal ortamın python'u çoğu zaman sistem python'una sembolik bağdır; bu yüzden yol değil `sys.prefix`
    karşılaştırılır.
    """
    venv_python = _venv_python()
    in_venv = Path(sys.prefix).resolve() == (ROOT / ".venv").resolve()
    if venv_python is not None and not in_venv and os.environ.get("KUTUPHANE_CHECK_REEXEC") != "1":
        env = dict(os.environ, KUTUPHANE_CHECK_REEXEC="1")
        sys.exit(subprocess.call([str(venv_python), __file__, *sys.argv[1:]], cwd=ROOT, env=env))
    missing = [tool for tool in TOOLS if importlib.util.find_spec(tool) is None]
    if missing:
        print(f"Eksik araç: {', '.join(missing)}. Önce şunu çalıştırın:  python scripts/kur.py")
        sys.exit(1)


def _run(name: str, command: list[str]) -> bool:
    started = time.monotonic()
    result = subprocess.run([sys.executable, "-m", *command], cwd=ROOT, check=False)
    seconds = time.monotonic() - started
    status = "tamam" if result.returncode == 0 else "HATA"
    print(f"== {name}: {status} ({seconds:.1f} sn)", flush=True)
    return result.returncode == 0


def main() -> int:
    _ensure_tools()
    steps = [*FIX_STEPS, *STEPS] if "--duzelt" in sys.argv[1:] else STEPS
    for name, command in steps:
        if not _run(name, command):
            print(
                f"\nDenetim '{name}' adımında kırıldı. Yukarıdaki iletiyi düzeltip yeniden çalıştırın."
            )
            return 1
    print("\nDenetim yeşil.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
