"""Temel kopyalama ve kurulum: hedefe `yeni_proje.py` ile kopya, npm ve Python ortamı, temelin denetimi.

    hedef = temeli_kopyala(gunluk, "uygulama", proje)   # proje/uygulama (havuz/uygulama'ya DOKUNMAZ)
    node_kur(gunluk, hedef)                              # npm ci (kilit dosyasından)
    python_kur(gunluk, proje / "yz")                     # .venv + kilitten kurulum (uv varsa uv)
    temeli_denetle(gunluk, hedef)                        # havuz.json → denetle (npm run check …)

Python kurulum kuralları `havuz/araclar/denetle.py → python_kur` ile aynıdır (kaynak oradadır; bu temel
kardeş klasörden içe aktarmaz, mantığı kopyalar): `uv.lock` varsa `uv sync --frozen`, `requirements*.lock`
varsa ondan, yoksa `pip install -e ".[ekstralar]"`. Ekstralar havuz.json → `python.ekstra`.
Genişletme: yeni bir kilit biçimi → `python_kur_komutlari`'na dal + tests/test_kurulum.py'ye örnek.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import sys
from pathlib import Path
from typing import Any

from tarifcik.komut import Gunluk
from tarifcik.yollar import TarifHatasi, havuz_koku

KILITLER = ("requirements.lock", "requirements-dev.lock")


def temeli_kopyala(gunluk: Gunluk, temel: str, proje: Path) -> Path:
    """`havuz/<temel>`'i `proje/<temel>`'e kopyalar (ortam, önbellek, .env, derleme çıktısı hariç)."""
    arac = havuz_koku() / "araclar" / "yeni_proje.py"
    if not arac.is_file():
        raise TarifHatasi(f"Kopyalama aracı bulunamadı: {arac}. Tarifler havuz/ içinden çalışır.")
    hedef = proje / temel
    proje.mkdir(parents=True, exist_ok=True)
    gunluk.calistir(f"{temel}: kopyala", [sys.executable, str(arac), temel, str(hedef)], proje)
    return hedef


def bildirim(klasor: Path) -> dict[str, Any]:
    """Temelin havuz.json'u (kopyada da durur)."""
    veri = json.loads((klasor / "havuz.json").read_text(encoding="utf-8"))
    if not isinstance(veri, dict):
        raise TarifHatasi(f"{klasor / 'havuz.json'} bir nesne olmalı.")
    return veri


def python_klasoru(klasor: Path) -> Path:
    """pyproject.toml'un ve .venv'in durduğu klasör (havuz.json → python.klasor)."""
    python = bildirim(klasor).get("python", {})
    alt = python.get("klasor") if isinstance(python, dict) else None
    return klasor / str(alt) if alt else klasor


def venv_bin(klasor: Path) -> Path:
    return klasor / ".venv" / ("Scripts" if os.name == "nt" else "bin")


def venv_python(klasor: Path) -> Path:
    """Temelin sanal ortamındaki python (kurulmamışsa yol yine döner; varlığını çağıran denetler)."""
    return venv_bin(python_klasoru(klasor)) / ("python.exe" if os.name == "nt" else "python")


def venv_ortami(klasor: Path, ek: dict[str, str] | None = None) -> dict[str, str]:
    """PATH'in başına temelin .venv'ini koyan ortam (komutlardaki `python` o ortamı kullanır)."""
    ortam = dict(os.environ)
    kok = python_klasoru(klasor)
    ortam["PATH"] = str(venv_bin(kok)) + os.pathsep + ortam.get("PATH", "")
    ortam["VIRTUAL_ENV"] = str(kok / ".venv")
    ortam.pop("PYTHONHOME", None)
    ortam.setdefault("OMP_NUM_THREADS", "2")  # makine paylaşımlı olabilir
    ortam.update(ek or {})
    return ortam


def _ekstralar(klasor: Path) -> list[str]:
    python = bildirim(klasor).get("python", {})
    ekstra = python.get("ekstra", "") if isinstance(python, dict) else ""
    return [parca.strip() for parca in str(ekstra).split(",") if parca.strip()]


def _temel_yorumlayici() -> str:
    """Sanal ortam içinden çalışılsa bile asıl Python yorumlayıcısı (yeni ortam ondan kurulur)."""
    return str(getattr(sys, "_base_executable", sys.executable) or sys.executable)


def python_kur_komutlari(kok: Path, ekstralar: list[str]) -> list[list[str]]:
    """Python ortamını kuracak komutlar (sırayla, `kok` klasöründe çalışır)."""
    uv = shutil.which("uv")
    py = str(venv_bin(kok) / "python")
    if uv and (kok / "uv.lock").exists():
        komut = [uv, "sync", "--frozen"]
        for ekstra in ekstralar:
            komut += ["--extra", ekstra]
        return [komut]
    komutlar: list[list[str]] = []
    if uv:
        if not (kok / ".venv").exists():
            komutlar.append([uv, "venv", ".venv", "--python", _temel_yorumlayici()])
        kurucu = [uv, "pip", "install", "--python", py]
    else:
        if not (kok / ".venv").exists():
            komutlar.append([_temel_yorumlayici(), "-m", "venv", ".venv"])
        kurucu = [py, "-m", "pip", "install"]
    kilit = next((ad for ad in KILITLER if (kok / ad).exists()), None)
    if kilit:
        komutlar.append([*kurucu, "-r", kilit])
        komutlar.append([*kurucu, "--no-deps", "-e", "."])
    else:
        komutlar.append([*kurucu, "-e", f".[{','.join(ekstralar)}]" if ekstralar else "."])
    return komutlar


def python_kur(gunluk: Gunluk, klasor: Path, ekstralar: list[str] | None = None) -> None:
    """Temelin .venv'ini kurar. `ekstralar` verilmezse havuz.json → python.ekstra kullanılır."""
    kok = python_klasoru(klasor)
    secilen = _ekstralar(klasor) if ekstralar is None else ekstralar
    # Etkin bir sanal ortam (ör. denetle.py tarifler'in .venv'ini açtıysa) hedef temelin değildir:
    # VIRTUAL_ENV taşınırsa `uv sync` uyarı basar; kurulum her zaman temelin kendi .venv'ine gider.
    ortam = {ad: deger for ad, deger in os.environ.items() if ad != "VIRTUAL_ENV"}
    for komut in python_kur_komutlari(kok, secilen):
        gunluk.calistir(f"{klasor.name}: python ortamı ({komut[1]})", komut, kok, ortam)


def node_kur(gunluk: Gunluk, klasor: Path) -> None:
    """`npm ci`: bağımlılıkları kilit dosyasından birebir kurar."""
    ortam = dict(os.environ, npm_config_fund="false", npm_config_audit="false")
    gunluk.calistir(f"{klasor.name}: npm ci", ["npm", "ci"], klasor, ortam)


def komut_ayir(komut: str) -> tuple[list[str], dict[str, str]]:
    """`A=1 B=2 python x.py` → (["python", "x.py"], {"A": "1", "B": "2"}) (kabuk kullanmadan)."""
    parcalar = shlex.split(komut)
    ortam: dict[str, str] = {}
    while parcalar and "=" in parcalar[0] and not parcalar[0].startswith("="):
        ad, _, deger = parcalar.pop(0).partition("=")
        ortam[ad] = deger
    return parcalar, ortam


def temeli_denetle(gunluk: Gunluk, klasor: Path, alan: str = "denetle") -> None:
    """Temelin kendi denetimini (havuz.json → `alan`) temelin ortamıyla çalıştırır."""
    veri = bildirim(klasor)
    komutlar = veri.get(alan, [])
    for komut in [komutlar] if isinstance(komutlar, str) else komutlar:
        parcalar, ek = komut_ayir(str(komut))
        ortam = (
            venv_ortami(klasor, ek)
            if (python_klasoru(klasor) / "pyproject.toml").exists()
            else None
        )
        if ortam is None and ek:
            ortam = dict(os.environ, **ek)
        gunluk.calistir(f"{klasor.name}: {komut}", parcalar, klasor, ortam)
