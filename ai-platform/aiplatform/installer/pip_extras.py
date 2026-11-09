"""Python ek bağımlılıklarının (`pyproject` optional-dependencies) kurulumu ve sistem paketi ipuçları.

Sistem paketleri (apt/brew) otomatik KURULMAZ; yalnız kullanıcıya çalıştırması gereken komut gösterilir.
"""

from __future__ import annotations

import asyncio
import importlib.metadata as md
import json
import logging
import platform
import re
import shutil
import sys
import tomllib
from collections.abc import Callable
from pathlib import Path

log = logging.getLogger("aiplatform.pip")

LogCb = Callable[[str], None]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DIST_NAME = "aiplatform"


class PipError(RuntimeError):
    pass


# ───────────────────────────── kaynak ve gereksinimler ─────────────────────────────


def _dist() -> md.Distribution | None:
    try:
        return md.distribution(DIST_NAME)
    except md.PackageNotFoundError:
        return None


def editable_root() -> Path | None:
    """Paket kaynaktan (`pip install -e`) kurulduysa proje kökü."""
    d = _dist()
    if d is None:
        return None
    raw = d.read_text("direct_url.json")
    if not raw:
        return None
    try:
        info = json.loads(raw)
    except ValueError:
        return None
    if not info.get("dir_info", {}).get("editable"):
        return None
    url = info.get("url", "")
    if url.startswith("file://"):
        return Path(url[len("file://") :])
    return None


def extra_requirements(extra: str) -> list[str] | None:
    """Bir extra'nın gereksinim satırları; bulunamazsa None (emin değiliz → pip'e bırak)."""
    d = _dist()
    if d is not None and d.requires is not None:
        out = []
        for r in d.requires:
            m = re.search(r"""extra\s*==\s*["']([^"']+)["']""", r)
            if m and _norm(m.group(1)) == _norm(extra):
                out.append(r.split(";")[0].strip())
        if out:
            return out
    pp = PROJECT_ROOT / "pyproject.toml"
    if pp.exists():
        try:
            data = tomllib.loads(pp.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError):
            return None
        opt = data.get("project", {}).get("optional-dependencies", {})
        for k, v in opt.items():
            if _norm(k) == _norm(extra):
                return list(v)
    return None


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_satisfied(req: str) -> bool | None:
    """True/False ya da emin değilsek None."""
    try:
        from packaging.requirements import Requirement
    except ImportError:
        return None
    try:
        r = Requirement(req)
    except Exception:  # noqa: BLE001
        return None
    try:
        version = md.version(r.name)
    except md.PackageNotFoundError:
        return False
    if not r.specifier:
        return True
    try:
        return r.specifier.contains(version, prereleases=True)
    except Exception:  # noqa: BLE001
        return None


def missing_extras(extras: list[str]) -> list[str]:
    """Kurulu olmayan (ya da emin olunamayan) extra'lar."""
    out = []
    for e in dict.fromkeys(extras):
        reqs = extra_requirements(e)
        if reqs is None:
            out.append(e)
            continue
        if not all(requirement_satisfied(r) is True for r in reqs):
            out.append(e)
    return out


def pip_command(extras: list[str]) -> list[str]:
    spec = ",".join(extras)
    root = editable_root()
    if root is not None:
        return [sys.executable, "-m", "pip", "install", "-e", f"{root}[{spec}]"]
    if _dist() is not None:
        return [sys.executable, "-m", "pip", "install", f"{DIST_NAME}[{spec}]"]
    # Kaynak ağacından kurulmadan çalışıyor: extra gereksinimlerini doğrudan kur
    reqs: list[str] = []
    for e in extras:
        reqs += extra_requirements(e) or []
    if not reqs:
        raise PipError(f"Ek bağımlılıklar çözümlenemedi: {', '.join(extras)}")
    return [sys.executable, "-m", "pip", "install", *reqs]


async def install_extras(extras: list[str], progress_cb: LogCb | None = None) -> list[str]:
    """Eksik extra'ları pip ile kurar; kurulanların listesini döner. Çıktı satırları `progress_cb`'ye akar."""
    say = progress_cb or (lambda line: log.info(line))
    todo = missing_extras(extras)
    skipped = [e for e in dict.fromkeys(extras) if e not in todo]
    if skipped:
        say(f"Zaten kurulu Python ekleri atlandı: {', '.join(skipped)}")
    if not todo:
        return []
    cmd = pip_command(todo)
    say("Çalıştırılıyor: " + " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    assert proc.stdout is not None
    try:
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                say(line)
        rc = await proc.wait()
    except asyncio.CancelledError:
        proc.kill()
        raise
    if rc != 0:
        raise PipError(f"pip kurulumu başarısız oldu (çıkış kodu {rc}): {', '.join(todo)}")
    return todo


# ───────────────────────────── sistem paketleri ─────────────────────────────

# apt adı → Homebrew adı (yalnız katalogda geçen sistem paketleri için eşleme)
_BREW_NAMES = {"tesseract-ocr": "tesseract", "tesseract-ocr-tur": "tesseract-lang"}


def system_package_hint(pkgs: list[str]) -> str | None:
    """Kullanıcının elle çalıştırması gereken komut metni; paket yoksa None."""
    pkgs = list(dict.fromkeys(pkgs))
    if not pkgs:
        return None
    system = platform.system()
    if system == "Darwin":
        names = list(dict.fromkeys(_BREW_NAMES.get(p, p) for p in pkgs))
        return "brew install " + " ".join(names)
    if system == "Windows":
        return (
            "Windows'ta sistem paketleri elle kurulur: "
            + ", ".join(pkgs)
            + " (ör. Tesseract için https://github.com/UB-Mannheim/tesseract/wiki adresindeki kurulum dosyası)."
        )
    if shutil.which("apt-get") or shutil.which("apt"):
        return "sudo apt install " + " ".join(pkgs)
    if shutil.which("dnf"):
        return "sudo dnf install " + " ".join(pkgs)
    return "Sistem paket yöneticinizle kurun: " + " ".join(pkgs)


def missing_system_binaries(pkgs: list[str]) -> list[str]:
    """Bilinen paketlerin ikili dosyası PATH'te var mı (kaba denetim; bilinmeyenler eksik sayılır)."""
    binaries = {"tesseract-ocr": "tesseract"}
    out = []
    for p in pkgs:
        b = binaries.get(p)
        if b is None or shutil.which(b) is None:
            out.append(p)
    return out
