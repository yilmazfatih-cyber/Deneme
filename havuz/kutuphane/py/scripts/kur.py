"""kur — py/.venv sanal ortamını kurar ve geliştirme araçlarını kilit dosyasından (requirements-dev.lock) yükler.

Kullanım (py/ klasöründen; yalnız ilk kurulumda internet gerekir):
    python scripts/kur.py            # .venv yoksa oluşturur, araçları sabit sürümleriyle kurar
    python scripts/kur.py --yeniden  # .venv'i silip baştan kurar

`uv` kuruluysa onu kullanır (saniyeler sürer); yoksa `python -m venv` + `pip`. Kütüphanenin kendisinin çalışma
zamanı bağımlılığı yoktur; kurulan yalnız denetim araçlarıdır (pytest, ruff, mypy).
Genişletme: Yeni geliştirme aracı pyproject.toml [dev] listesine eklenir ve kilit yeniden üretilir:
    uv pip compile pyproject.toml --extra dev --python-version 3.11 -o requirements-dev.lock
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
LOCK = ROOT / "requirements-dev.lock"


def _venv_python() -> Path:
    windows = VENV / "Scripts" / "python.exe"
    return windows if windows.exists() else VENV / "bin" / "python"


def _run(command: list[str]) -> None:
    print("$", " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    if sys.version_info < (3, 11):  # noqa: UP036 — eski Python ile çalıştırana açık ileti vermek için
        print("Python 3.11 ya da daha yenisi gerekir.")
        return 1
    if "--yeniden" in sys.argv[1:] and VENV.exists():
        shutil.rmtree(VENV)
    uv = shutil.which("uv")
    try:
        if not VENV.exists():
            _run(
                [uv, "venv", str(VENV), "--python", sys.executable]
                if uv
                else [sys.executable, "-m", "venv", str(VENV)]
            )
        if uv:
            _run([uv, "pip", "install", "--python", str(_venv_python()), "-r", str(LOCK)])
        else:
            _run(
                [
                    str(_venv_python()),
                    "-m",
                    "pip",
                    "install",
                    "--disable-pip-version-check",
                    "-r",
                    str(LOCK),
                ]
            )
    except subprocess.CalledProcessError as error:
        print(
            f"\nKurulum başarısız (çıkış kodu {error.returncode}). İnternet bağlantısını denetleyip yeniden deneyin."
        )
        return 1
    print("\nKurulum tamam. Denetim için: python scripts/check.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
