"""Araçların ortak yardımcıları: temelleri bulma, havuz.json okuma, sürüm denetimi.

Yalnız Python standart kütüphanesi kullanılır (3.11+). Öteki araçlar bu dosyayı içe aktarır:
`durum.py`, `denetle.py`, `yeni_proje.py`.

Genişletme: havuz.json'a yeni bir alan eklerseniz `Temel` sınıfına bir özellik ve `STANDART_ALANLAR`'a
gerekiyorsa bir satır ekleyin; STANDARTLAR.md §4'ü de güncelleyin.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

HAVUZ = Path(__file__).resolve().parent.parent
ZORUNLU_ALANLAR = ("ad", "baslik", "ozet", "tur", "denetle")
TURLER = ("node", "python", "karma")


@dataclass(frozen=True)
class Temel:
    """Havuzdaki bir temel (içinde havuz.json olan klasör)."""

    yol: Path
    bildirim: dict[str, object]

    @property
    def ad(self) -> str:
        return str(self.bildirim.get("ad", self.yol.name))

    @property
    def goreli(self) -> str:
        return self.yol.relative_to(HAVUZ).as_posix()

    @property
    def tur(self) -> str:
        return str(self.bildirim.get("tur", ""))

    def liste(self, alan: str) -> list[str]:
        deger = self.bildirim.get(alan, [])
        if isinstance(deger, str):
            return [deger]
        return [str(oge) for oge in deger] if isinstance(deger, list) else []

    @property
    def python_ekstralari(self) -> list[str]:
        python = self.bildirim.get("python", {})
        ekstra = python.get("ekstra", "") if isinstance(python, dict) else ""
        return [parca.strip() for parca in str(ekstra).split(",") if parca.strip()]

    @property
    def python_var(self) -> bool:
        return self.tur in ("python", "karma") and (self.python_klasoru / "pyproject.toml").exists()

    @property
    def python_klasoru(self) -> Path:
        """pyproject.toml ve .venv'in durduğu klasör: havuz.json → `python.klasor` (yoksa temelin kökü)."""
        python = self.bildirim.get("python", {})
        alt = python.get("klasor") if isinstance(python, dict) else None
        return self.yol / str(alt) if alt else self.yol

    def gereksinim(self, arac: str) -> str | None:
        gereksinim = self.bildirim.get("gereksinim", {})
        deger = gereksinim.get(arac) if isinstance(gereksinim, dict) else None
        return str(deger) if deger else None


def temelleri_bul() -> list[Temel]:
    """`havuz/<ad>/havuz.json` ve `havuz/<grup>/<ad>/havuz.json` dosyalarını bulur (alfabetik)."""
    yollar = sorted(HAVUZ.glob("*/havuz.json")) + sorted(HAVUZ.glob("*/*/havuz.json"))
    temeller: list[Temel] = []
    for yol in yollar:
        if any(parca in {"node_modules", ".venv"} for parca in yol.parts):
            continue
        try:
            bildirim = json.loads(yol.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as hata:
            raise SystemExit(f"{yol.relative_to(HAVUZ)} okunamadı: {hata}") from hata
        temeller.append(Temel(yol.parent, bildirim))
    return temeller


def temel_sec(adlar: list[str]) -> list[Temel]:
    """Ada ya da göreli yola göre temelleri seçer; boşsa hepsi. Bilinmeyen ad yol gösteren hata verir."""
    hepsi = temelleri_bul()
    if not adlar:
        return hepsi
    secilen: list[Temel] = []
    for ad in adlar:
        aday = ad.strip("/")
        eslesen = [t for t in hepsi if aday in (t.ad, t.goreli, t.yol.name)]
        if not eslesen:
            bilinen = ", ".join(t.goreli for t in hepsi)
            raise SystemExit(f"'{ad}' adında bir temel yok. Bilinenler: {bilinen}")
        secilen.extend(t for t in eslesen if t not in secilen)
    return secilen


def surum_parcala(metin: str) -> tuple[int, ...]:
    return tuple(int(sayi) for sayi in re.findall(r"\d+", metin)[:3])


def surum_uygun(gercek: str, kosul: str) -> bool:
    """Yalnız `>=X.Y[.Z]` biçimini anlar; anlaşılmayan koşulu uygun sayar."""
    eslesme = re.match(r"^\s*>=\s*([\d.]+)\s*$", kosul)
    if not eslesme:
        return True
    return surum_parcala(gercek) >= surum_parcala(eslesme.group(1))


def node_surumu() -> str | None:
    try:
        cikti = subprocess.run(["node", "--version"], capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return cikti.stdout.strip().lstrip("v")


def python_surumu() -> str:
    return ".".join(str(parca) for parca in sys.version_info[:3])


def venv_bin(klasor: Path) -> Path:
    return klasor / ".venv" / ("Scripts" if os.name == "nt" else "bin")


def ortam_venv_ile(klasor: Path) -> dict[str, str]:
    """PATH'in başına temelin `.venv` klasörünü koyar: komutlardaki `python` o ortamı kullanır."""
    ortam = dict(os.environ)
    ortam["PATH"] = str(venv_bin(klasor)) + os.pathsep + ortam.get("PATH", "")
    ortam["VIRTUAL_ENV"] = str(klasor / ".venv")
    ortam.pop("PYTHONHOME", None)
    return ortam
