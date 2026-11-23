"""`dosyalar/` klasörünü hedefe yerleştirme ve çalışma kopyasından geri yakalama.

Kural (testle korunur, tests/test_bicim.py):
  - `dosyalar/<temel>/<yol>`          YENİ dosya: hedefte `proje/<temel>/<yol>` olarak kopyalanır.
                                      Havuzdaki temelde aynı yolda dosya OLMAMALI (değişiklik ise yama).
  - `dosyalar/<temel>/<yol>.patch`    DEĞİŞİKLİK: `proje/<temel>/<yol>`'a birleşik fark olarak uygulanır.
  - `dosyalar/<ek-klasör>/<yol>`      tarif.json → ekKlasorler'deki temel olmayan klasör (hep yeni dosya).
Yakalama (`yakala`): bir çalışma kopyasında elle yapılan değişiklikleri bu kurala göre dosyalar/'a yazar;
yeni tarif yazmanın ya da var olanı güncellemenin önerilen yoludur (AGENTS.md → "Yeni tarif ekle").
Genişletme: yakalamada atlanacak yeni bir klasör/desen → `ATLANAN_ADLAR` ya da `ATLANAN_DESENLER`.
"""

from __future__ import annotations

import fnmatch
import json
import shutil
from pathlib import Path

from tarifcik.yama import yama_uret, yama_uygula
from tarifcik.yollar import Tarif, TarifHatasi, temel_klasoru

YAMA_UZANTISI = ".patch"
# yeni_proje.py'nin kopyalamadığı klasörler ve üretilen dosyalar: yakalamada da atlanır.
ATLANAN_ADLAR = frozenset(
    {
        "node_modules", ".venv", "venv", "__pycache__", ".mypy_cache", ".ruff_cache",
        ".pytest_cache", ".hypothesis", ".astro", "test-results", "playwright-report", ".data",
        ".npm-kilit", ".DS_Store", "dist", "dist-alt", "dist-yerel", "dev-dist", "build",
        "ciktilar", "calisma", ".yz", ".git", ".env",
    }
)  # fmt: skip
ATLANAN_DESENLER = ("*.egg-info", "*.pyc", "*.tsbuildinfo", "*.log", ".env.*")


def atlanir_mi(goreli: Path) -> bool:
    """Bu göreli yol yakalamada (ve kural testinde) yok sayılan bir yer mi?"""
    for parca in goreli.parts:
        if parca in ATLANAN_ADLAR and parca != ".env.example":
            return True
        if any(fnmatch.fnmatch(parca, desen) for desen in ATLANAN_DESENLER):
            return parca != ".env.example"
    return False


def tarif_dosyalari(tarif: Tarif) -> list[Path]:
    """dosyalar/ altındaki bütün dosyalar (dosyalar/'a göre göreli, sıralı)."""
    if not tarif.dosyalar.is_dir():
        return []
    return sorted(p.relative_to(tarif.dosyalar) for p in tarif.dosyalar.rglob("*") if p.is_file())


def hedef_yolu(goreli: Path) -> Path:
    """`uygulama/api/x.ts.patch` → `uygulama/api/x.ts` (yama değilse aynı yol)."""
    if goreli.name.endswith(YAMA_UZANTISI):
        return goreli.with_name(goreli.name[: -len(YAMA_UZANTISI)])
    return goreli


def dosyalari_yerlestir(tarif: Tarif, proje: Path) -> list[str]:
    """dosyalar/'ı `proje`ye yerleştirir; yapılanları ("yeni: …", "yama: …") döndürür."""
    yapilan: list[str] = []
    for goreli in tarif_dosyalari(tarif):
        kok = goreli.parts[0]
        if kok not in tarif.koklar:
            raise TarifHatasi(
                f"dosyalar/{goreli}: ilk klasör '{kok}' tarif.json'da yok (temeller ya da ekKlasorler)."
            )
        kaynak = tarif.dosyalar / goreli
        hedef = proje / hedef_yolu(goreli)
        if goreli.name.endswith(YAMA_UZANTISI):
            if not hedef.is_file():
                raise TarifHatasi(f"Yamanın hedefi yok: {hedef}. Önce temeli kopyalayın.")
            eski = hedef.read_text(encoding="utf-8")
            yama = kaynak.read_text(encoding="utf-8")
            hedef.write_text(yama_uygula(eski, yama, str(hedef_yolu(goreli))), encoding="utf-8")
            yapilan.append(f"yama: {hedef_yolu(goreli)}")
        else:
            if hedef.exists():
                raise TarifHatasi(
                    f"{hedef} zaten var: tarif bu hedefe daha önce uygulanmış olabilir. "
                    "Boş bir hedef klasörü verin."
                )
            hedef.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(kaynak, hedef)
            yapilan.append(f"yeni: {goreli}")
    return yapilan


def _kopyalama_haric(temel: Path) -> tuple[set[str], list[str]]:
    """Temelin havuz.json → kopyalamaHaric: (yalnız kökte atlanan adlar, her derinlikte desenler)."""
    try:
        veri = json.loads((temel / "havuz.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set(), []
    liste = [str(oge) for oge in veri.get("kopyalamaHaric", [])] if isinstance(veri, dict) else []
    joker = [oge for oge in liste if any(isaret in oge for isaret in "*?[")]
    return {oge.strip("/") for oge in liste if oge not in joker}, joker


def _dosyalar(kok: Path, temel: Path | None = None) -> dict[Path, Path]:
    """`kok` altındaki dosyalar; `temel` verilirse onun kopyalamaHaric kuralları da uygulanır."""
    if not kok.is_dir():
        return {}
    kokte, joker = _kopyalama_haric(temel) if temel is not None else (set(), [])
    sonuc: dict[Path, Path] = {}
    for yol in kok.rglob("*"):
        goreli = yol.relative_to(kok)
        if not yol.is_file() or atlanir_mi(goreli) or goreli.parts[0] in kokte:
            continue
        if any(fnmatch.fnmatch(parca, desen) for parca in goreli.parts for desen in joker):
            continue
        sonuc[goreli] = yol
    return sonuc


def _oku(yol: Path) -> str:
    try:
        return yol.read_text(encoding="utf-8")
    except UnicodeDecodeError as hata:
        raise TarifHatasi(
            f"{yol} UTF-8 metin değil (ikili dosya?). Tarifler yalnız metin dosyası taşır; üretilen "
            "dosyaysa silin ya da ATLANAN_ADLAR'a ekleyin."
        ) from hata


def yakala(tarif: Tarif, calisma: Path) -> list[str]:
    """`calisma` (tarifin uygulandığı ve elle değiştirildiği klasör) → tarif.dosyalar.

    Var olan dosyalar/ tümüyle yeniden yazılır. Silinmiş dosya desteklenmez (tarif yalnız ekler/değiştirir).
    """
    planlanan: dict[Path, str] = {}
    for temel in tarif.temeller:
        asil_klasor = temel_klasoru(temel)
        asil = _dosyalar(asil_klasor, asil_klasor)
        kopya = _dosyalar(calisma / temel, asil_klasor)
        silinen = sorted(str(yol) for yol in asil if yol not in kopya)
        if silinen:
            raise TarifHatasi(
                f"{temel}: çalışma kopyasında silinmiş dosyalar var ({', '.join(silinen[:5])}…). "
                "Tarifler dosya silmez; dosyayı geri koyun."
            )
        for goreli, yol in sorted(kopya.items()):
            if goreli in asil and yol.read_bytes() == asil[goreli].read_bytes():
                continue  # değişmemiş (ikili dosyalar da burada elenir)
            yeni = _oku(yol)
            if goreli not in asil:
                planlanan[Path(temel) / goreli] = yeni
                continue
            eski = _oku(asil[goreli])
            if eski != yeni:
                ad = f"{goreli.as_posix()}{YAMA_UZANTISI}"
                planlanan[Path(temel) / ad] = yama_uret(eski, yeni, goreli.as_posix())
    for ek in tarif.ek_klasorler:
        for goreli, yol in sorted(_dosyalar(calisma / ek).items()):
            planlanan[Path(ek) / goreli] = _oku(yol)
    if tarif.dosyalar.exists():
        shutil.rmtree(tarif.dosyalar)
    for goreli, icerik in planlanan.items():
        hedef = tarif.dosyalar / goreli
        hedef.parent.mkdir(parents=True, exist_ok=True)
        hedef.write_text(icerik, encoding="utf-8")
    return [str(yol) for yol in sorted(planlanan)]
