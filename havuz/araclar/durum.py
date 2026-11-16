#!/usr/bin/env python3
"""Havuzun envanteri ve standart denetimi. Kurulum gerektirmez, saniyeler sürer.

Ne yapar:
  1. Her temeli listeler: tür, özet, kaynak dosya ve satır sayısı, test dosyası sayısı.
  2. STANDARTLAR.md §4'teki zorunlu dosyaları ve havuz.json alanlarını denetler.

Kullanım:
  python havuz/araclar/durum.py            # tablo + denetim
  python havuz/araclar/durum.py --json     # makine okur çıktı
  python havuz/araclar/durum.py --markdown # README'ye yapıştırılacak tablo

Çıkış kodu: standart ihlali varsa 1.

Genişletme: yeni bir zorunluluk eklemek için `denetle_standart` işlevine bir kural ekleyin ve STANDARTLAR.md'ye yazın.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ortak import HAVUZ, TURLER, ZORUNLU_ALANLAR, Temel, temelleri_bul
from kacis import dosyalar as kaynak_dosyalari
from kacis import sayac as gorunmez_sayaci

KAYNAK_UZANTILARI = {".py", ".ts", ".tsx", ".js", ".mjs", ".astro", ".css", ".sql", ".html"}
ATLANAN = {
    "node_modules", ".venv", "__pycache__", "dist", "dist-alt", ".astro", ".mypy_cache", ".ruff_cache",
    ".pytest_cache", ".hypothesis", "test-results", "playwright-report", "build", ".data",
}
ZORUNLU_DOSYALAR = ("README.md", "AGENTS.md", "havuz.json", ".gitignore")


def dosyalar(kok: Path) -> list[Path]:
    sonuc: list[Path] = []
    for yol in kok.rglob("*"):
        goreli = yol.relative_to(kok).parts
        if yol.is_file() and not any(parca in ATLANAN or parca.endswith(".egg-info") for parca in goreli):
            sonuc.append(yol)
    return sonuc


def say(temel: Temel) -> dict[str, int]:
    kaynak = test = satir = 0
    for yol in dosyalar(temel.yol):
        if yol.suffix not in KAYNAK_UZANTILARI:
            continue
        ad = yol.name
        test_mi = (
            ad.startswith("test_")
            or ".test." in ad
            or ".spec." in ad
            or ad.endswith("_test.py")
            or any(parca in {"tests", "test", "e2e"} for parca in yol.relative_to(temel.yol).parts[:-1])
        )
        if test_mi:
            test += 1
        else:
            kaynak += 1
        try:
            satir += sum(1 for _ in yol.open(encoding="utf-8", errors="ignore"))
        except OSError:
            pass
    return {"kaynak_dosya": kaynak, "test_dosyasi": test, "satir": satir}


def denetle_standart(temel: Temel) -> list[str]:
    hatalar = [f"{ad} eksik" for ad in ZORUNLU_DOSYALAR if not (temel.yol / ad).exists()]
    hatalar += [f"havuz.json: `{alan}` alanı eksik" for alan in ZORUNLU_ALANLAR if not temel.bildirim.get(alan)]
    if temel.tur and temel.tur not in TURLER:
        hatalar.append(f"havuz.json: `tur` şunlardan biri olmalı: {', '.join(TURLER)}")
    if temel.tur in ("python", "karma") and not (temel.python_klasoru / "pyproject.toml").exists():
        hatalar.append("Python temeli ama pyproject.toml yok (alt klasördeyse havuz.json → python.klasor)")
    if temel.tur == "node" and not (temel.yol / "package.json").exists():
        hatalar.append("Node temeli ama package.json yok")
    if temel.tur == "node" and not any((temel.yol / kilit).exists() for kilit in ("package-lock.json", "ts/package-lock.json")):
        hatalar.append("Node temeli ama package-lock.json yok (`npm install` ile üretin)")
    benioku = temel.yol / "README.md"
    if benioku.exists() and "Sınırlar" not in benioku.read_text(encoding="utf-8"):
        hatalar.append("README.md'de `Sınırlar` bölümü yok (STANDARTLAR §11)")
    gorunmez = 0
    for dosya in kaynak_dosyalari([temel.yol]):
        try:
            gorunmez += gorunmez_sayaci(dosya.read_text(encoding="utf-8"), dosya.suffix)
        except (UnicodeDecodeError, OSError):
            continue
    if gorunmez:
        hatalar.append(f"kaynakta {gorunmez} görünmez karakter: python havuz/araclar/kacis.py havuz/{temel.goreli}")
    kararlar = [temel.yol / "docs" / "KARARLAR.md", temel.yol / "KARARLAR.md"]
    if not any(yol.exists() for yol in kararlar):
        hatalar.append("docs/KARARLAR.md yok (STANDARTLAR §4)")
    return hatalar


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Havuz envanteri ve standart denetimi.")
    ayristirici.add_argument("--json", action="store_true", help="JSON çıktı")
    ayristirici.add_argument("--markdown", action="store_true", help="Markdown tablo çıktısı")
    secenekler = ayristirici.parse_args()

    satirlar = []
    ihlal = 0
    for temel in temelleri_bul():
        sayilar = say(temel)
        hatalar = denetle_standart(temel)
        ihlal += len(hatalar)
        satirlar.append({"temel": temel.goreli, "tur": temel.tur, "baslik": temel.bildirim.get("baslik", ""),
                         "ozet": temel.bildirim.get("ozet", ""), **sayilar, "standart": hatalar})

    if secenekler.json:
        print(json.dumps(satirlar, ensure_ascii=False, indent=2))
    elif secenekler.markdown:
        print("| Temel | Tür | Ne işe yarar | Kaynak / test dosyası | Satır |")
        print("| --- | --- | --- | --- | ---: |")
        for s in satirlar:
            ozet = str(s["ozet"]).replace("|", "\\|")
            satir = f"{s['satir']:,}".replace(",", ".")  # Türkçe binlik ayırıcı: 12.345
            print(f"| [`{s['temel']}`]({s['temel']}/) | {s['tur']} | {ozet} | {s['kaynak_dosya']} / {s['test_dosyasi']} | {satir} |")
    else:
        genislik = max((len(str(s["temel"])) for s in satirlar), default=10)
        print(f"{'TEMEL':<{genislik}}  {'TÜR':<6}  {'KAYNAK':>6}  {'TEST':>5}  {'SATIR':>8}  DURUM")
        for s in satirlar:
            durum = "standart ✓" if not s["standart"] else f"{len(s['standart'])} eksik"
            print(f"{s['temel']:<{genislik}}  {s['tur']:<6}  {s['kaynak_dosya']:>6}  {s['test_dosyasi']:>5}  {s['satir']:>8}  {durum}")
            for hata in s["standart"]:
                print(f"{'':<{genislik}}    - {hata}")
        toplam = sum(int(s["satir"]) for s in satirlar)
        print(f"\n{len(satirlar)} temel, toplam {toplam:,} satır.".replace(",", "."))
    if ihlal:
        print(f"\nStandart ihlali: {ihlal}. Ayrıntı yukarıda; kurallar: {HAVUZ / 'STANDARTLAR.md'}", file=sys.stderr)
    return 1 if ihlal else 0


if __name__ == "__main__":
    sys.exit(main())
