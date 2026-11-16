#!/usr/bin/env python3
"""Bir temeli yeni bir projeye kopyalar: gereksiz klasörleri atlar, yer tutucuları değiştirir, sonraki adımları yazar.

Kullanım:
  python havuz/araclar/yeni_proje.py uygulama ../gorevlerim
  python havuz/araclar/yeni_proje.py uygulama ../gorevlerim --degistir havuz-uygulama=gorevlerim
  python havuz/araclar/yeni_proje.py site ../sitem --git          # kopyala + git deposu başlat

Ne kopyalanmaz: sanal ortamlar, node_modules, derleme çıktıları, önbellekler, yerel veri, ve temelin havuz.json'unda
`kopyalamaHaric` altında listelenenler. `kopyalamaHaric` içindeki bir ad (ör. `veri`) yalnız temelin kökündeki o
klasörü atlar; joker içeren desen (ör. `*.egg-info`) her derinlikte uygulanır.

Yer tutucular: temelin havuz.json'undaki `yerTutucular` listesi, kopyada değiştirmeniz önerilen metinlerdir
(paket adı, görünen ad…). `--degistir ESKI=YENI` ile bütün metin dosyalarında değiştirilir.

Genişletme: kopyalamadan sonra yapılacak yeni bir adım (ör. lisans dosyası) için `main` işlevinin sonuna ekleyin.
"""

from __future__ import annotations

import argparse
import fnmatch
import shutil
import subprocess
import sys
from pathlib import Path

from ortak import temel_sec

HER_DERINLIKTE = {
    "node_modules", ".venv", "venv", "__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache", ".hypothesis",
    ".astro", "test-results", "playwright-report", ".data", ".npm-kilit", ".DS_Store", "*.egg-info", "*.pyc",
    "*.tsbuildinfo",
}
KOKTE = {"dist", "dist-alt", "dist-yerel", "dev-dist", "build", "ciktilar", "calisma"}
METIN_SINIRI = 2 * 1024 * 1024


def atlanacaklar(kok: Path, temel_haric: list[str]):  # noqa: ANN201 - shutil.copytree imzası
    joker = {desen for desen in temel_haric if any(isaret in desen for isaret in "*?[")} | HER_DERINLIKTE
    kokte = {desen.strip("/") for desen in temel_haric if not any(isaret in desen for isaret in "*?[")} | KOKTE

    def ignore(klasor: str, adlar: list[str]) -> set[str]:
        goreli = Path(klasor).resolve().relative_to(kok)
        atla = {ad for ad in adlar if any(fnmatch.fnmatch(ad, desen) for desen in joker)}
        # Yerel ortam dosyaları sır taşıyabilir: kopyalanmaz (yalnız örnek dosya kopyalanır).
        atla |= {ad for ad in adlar if (ad == ".env" or ad.startswith(".env.")) and ad != ".env.example"}
        for ad in adlar:
            yol = (goreli / ad).as_posix()
            if yol in kokte or (goreli == Path(".") and ad in kokte):
                atla.add(ad)
        return atla

    return ignore


def degistir(hedef: Path, ciftler: list[tuple[str, str]]) -> int:
    degisen = 0
    for yol in hedef.rglob("*"):
        if not yol.is_file() or yol.stat().st_size > METIN_SINIRI or ".git" in yol.parts:
            continue
        try:
            metin = yol.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        yeni = metin
        for eski, yerine in ciftler:
            yeni = yeni.replace(eski, yerine)
        if yeni != metin:
            yol.write_text(yeni, encoding="utf-8")
            degisen += 1
    return degisen


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Bir temeli yeni bir projeye kopyalar.")
    ayristirici.add_argument("temel", help="kopyalanacak temel (ör. uygulama, site, yz, sifirdan/dil)")
    ayristirici.add_argument("hedef", help="yeni projenin klasörü (var olmamalı)")
    ayristirici.add_argument("--degistir", action="append", default=[], metavar="ESKI=YENI",
                             help="metin dosyalarında değiştirilecek yer tutucu (birden çok verilebilir)")
    ayristirici.add_argument("--git", action="store_true", help="kopyada git deposu başlat ve ilk kaydı at")
    secenekler = ayristirici.parse_args()

    temel = temel_sec([secenekler.temel])[0]
    hedef = Path(secenekler.hedef).expanduser().resolve()
    if hedef.exists():
        print(f"Hedef zaten var: {hedef}\nBoş olmayan bir klasörün üstüne yazmamak için yeni bir ad verin.")
        return 1
    if temel.yol.resolve() in hedef.parents:
        print("Hedef, kopyalanan temelin içinde olamaz.")
        return 1
    ciftler: list[tuple[str, str]] = []
    for oge in secenekler.degistir:
        if "=" not in oge or not oge.split("=", 1)[0]:
            print(f"`--degistir` ESKI=YENI biçiminde olmalı: {oge}")
            return 1
        eski, yerine = oge.split("=", 1)
        ciftler.append((eski, yerine))

    shutil.copytree(temel.yol, hedef, ignore=atlanacaklar(temel.yol.resolve(), temel.liste("kopyalamaHaric")))
    dosya_sayisi = sum(1 for yol in hedef.rglob("*") if yol.is_file())
    print(f"Kopyalandı: {temel.goreli} → {hedef} ({dosya_sayisi} dosya)")
    if ciftler:
        print(f"Yer tutucular değiştirildi: {degistir(hedef, ciftler)} dosya")

    yer_tutucular = temel.bildirim.get("yerTutucular", [])
    if isinstance(yer_tutucular, list) and yer_tutucular and not ciftler:
        print("\nDeğiştirmeniz önerilen yer tutucular (`--degistir ESKI=YENI` ile ya da elle):")
        for oge in yer_tutucular:
            if isinstance(oge, dict):
                print(f"  {oge.get('ara')!s:<28} {oge.get('anlam', '')}")

    if secenekler.git:
        for komut in (["git", "init", "-q"], ["git", "add", "-A"], ["git", "commit", "-q", "-m", f"{temel.ad} temelinden başlangıç"]):
            if subprocess.run(komut, cwd=hedef, check=False).returncode != 0:
                print(f"git adımı başarısız: {' '.join(komut)} (git kurulu mu, kullanıcı adı ayarlı mı?)")
                break

    print("\nSonraki adımlar:")
    print(f"  cd {hedef}")
    for komut in temel.liste("kur"):
        print(f"  {komut}")
    if temel.python_var:
        ekstra = ",".join(temel.python_ekstralari)
        if temel.python_klasoru != temel.yol:
            print(f"  cd {temel.python_klasoru.relative_to(temel.yol).as_posix()}")
        print("  python -m venv .venv && source .venv/bin/activate   (Windows: .venv\\Scripts\\activate)")
        print(f"  pip install -e \".[{ekstra}]\"" if ekstra else "  pip install -e .")
    for komut in temel.liste("denetle"):
        print(f"  {komut}")
    if temel.bildirim.get("baslat"):
        print(f"  {temel.bildirim['baslat']}")
    print("\nModele ilk iş olarak AGENTS.md dosyasını okutun.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
