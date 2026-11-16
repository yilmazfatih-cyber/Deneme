#!/usr/bin/env python3
"""Temelleri kurar ve denetler: her temelin havuz.json'daki komutlarını sırayla çalıştırır.

Kullanım:
  python havuz/araclar/denetle.py site                 # yalnız denetim (kurulu ortamla)
  python havuz/araclar/denetle.py site --kur           # önce bağımlılıkları kur, sonra denetle
  python havuz/araclar/denetle.py --kur                # bütün temeller
  python havuz/araclar/denetle.py yz --uzun            # uzun denetimi de çalıştır (tarayıcı/ağ isteyebilir)
  python havuz/araclar/denetle.py --liste              # temelleri ve komutlarını göster

Kurulum nasıl yapılır:
  - Node temelleri: havuz.json → `kur` komutları (genellikle `npm ci`).
  - Python temelleri: temelin içinde `.venv` açılır. `uv` varsa o kullanılır (çok hızlı), yoksa `python -m venv` + pip.
    Kilit dosyası varsa ondan kurulur (`uv.lock` → `uv sync --frozen`; `requirements*.lock` → `pip install -r`),
    yoksa `pip install -e ".[<ekstralar>]"`. Ekstralar havuz.json → `python.ekstra` alanından gelir.
  - Denetim komutlarındaki `python`, PATH'in başına konan `.venv` sayesinde temelin kendi ortamını kullanır.

Çıkış kodu: herhangi bir adım başarısızsa 1. Sonda özet tablo basılır.

Genişletme: yeni bir kurulum yolu (ör. başka bir kilit dosyası) için `python_kur` işlevine bir dal ekleyin.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from ortak import Temel, node_surumu, ortam_venv_ile, python_surumu, surum_uygun, temel_sec, venv_bin

KILITLER = ("requirements.lock", "requirements-dev.lock")


@dataclass
class Sonuc:
    temel: str
    adimlar: list[tuple[str, bool, float]] = field(default_factory=list)

    @property
    def basarili(self) -> bool:
        return all(ok for _, ok, _ in self.adimlar)


def calistir(komut: str | list[str], klasor: Path, venv: Path | None) -> tuple[bool, float]:
    """`komut`u `klasor`de çalıştırır; `venv` verilirse o klasörün .venv'i PATH'in başına konur."""
    gosterim = komut if isinstance(komut, str) else " ".join(komut)
    print(f"\n$ {gosterim}    [{klasor.name}]", flush=True)
    baslangic = time.monotonic()
    ortam = ortam_venv_ile(venv) if venv else None
    try:
        kod = subprocess.run(komut, cwd=klasor, shell=isinstance(komut, str), env=ortam, check=False).returncode
    except OSError as hata:
        print(f"Çalıştırılamadı: {hata}", flush=True)
        kod = 127
    return kod == 0, time.monotonic() - baslangic


def python_kur(temel: Temel) -> list[str | list[str]]:
    """Python ortamını kuracak komutları döndürür (sırayla çalıştırılır)."""
    uv = shutil.which("uv")
    ekstralar = temel.python_ekstralari
    klasor = temel.python_klasoru
    py = str(venv_bin(klasor) / "python")
    kilit = next((ad for ad in KILITLER if (klasor / ad).exists()), None)
    if uv and (klasor / "uv.lock").exists():
        komut = [uv, "sync", "--frozen"]
        for ekstra in ekstralar:
            komut += ["--extra", ekstra]
        return [komut]
    komutlar: list[str | list[str]] = []
    if uv:
        if not (klasor / ".venv").exists():
            komutlar.append([uv, "venv", ".venv", "--python", sys.executable])
        kurucu = [uv, "pip", "install", "--python", py]
    else:
        if not (klasor / ".venv").exists():
            komutlar.append([sys.executable, "-m", "venv", ".venv"])
        komutlar.append([py, "-m", "pip", "install", "--upgrade", "pip"])
        kurucu = [py, "-m", "pip", "install"]
    if kilit:
        komutlar.append([*kurucu, "-r", kilit])
        komutlar.append([*kurucu, "--no-deps", "-e", "."])
    else:
        hedef = f".[{','.join(ekstralar)}]" if ekstralar else "."
        komutlar.append([*kurucu, "-e", hedef])
    return komutlar


def gereksinim_uyarilari(temel: Temel) -> list[str]:
    uyarilar = []
    kosul = temel.gereksinim("node")
    if kosul:
        gercek = node_surumu()
        if gercek is None:
            uyarilar.append(f"Node.js bulunamadı (gereken: {kosul}). https://nodejs.org adresinden LTS sürümü kurun.")
        elif not surum_uygun(gercek, kosul):
            uyarilar.append(f"Node.js {gercek} kurulu, bu temel {kosul} istiyor. Daha yeni bir sürüm kurun.")
    kosul = temel.gereksinim("python")
    if kosul and not surum_uygun(python_surumu(), kosul):
        uyarilar.append(f"Python {python_surumu()} ile çalıştırıyorsunuz, bu temel {kosul} istiyor.")
    return uyarilar


def denetle_temel(temel: Temel, kur: bool, uzun: bool) -> Sonuc:
    sonuc = Sonuc(temel.goreli)
    print(f"\n{'=' * 78}\n{temel.goreli} — {temel.bildirim.get('baslik', '')}\n{'=' * 78}", flush=True)
    for uyari in gereksinim_uyarilari(temel):
        print(f"UYARI: {uyari}", flush=True)
    if kur:
        for komut in temel.liste("kur"):
            ok, sure = calistir(komut, temel.yol, venv=None)
            sonuc.adimlar.append((f"kur: {komut}", ok, sure))
            if not ok:
                return sonuc
        if temel.python_var:
            for komut in python_kur(temel):
                ok, sure = calistir(komut, temel.python_klasoru, venv=None)
                sonuc.adimlar.append(("kur: python ortamı", ok, sure))
                if not ok:
                    return sonuc
    elif temel.python_var and not (temel.python_klasoru / ".venv").exists():
        print("Bu temelin Python ortamı (.venv) kurulu değil. `--kur` ile çalıştırın.", flush=True)
        sonuc.adimlar.append(("ortam yok", False, 0.0))
        return sonuc
    komutlar = temel.liste("denetle") + (temel.liste("uzunDenetim") if uzun else [])
    for komut in komutlar:
        ok, sure = calistir(komut, temel.yol, venv=temel.python_klasoru if temel.python_var else None)
        sonuc.adimlar.append((komut, ok, sure))
    return sonuc


def ozet(sonuclar: list[Sonuc]) -> None:
    print(f"\n{'=' * 78}\nÖZET\n{'=' * 78}")
    for sonuc in sonuclar:
        toplam = sum(sure for _, _, sure in sonuc.adimlar)
        print(f"{'✓' if sonuc.basarili else '✗'} {sonuc.temel:<22} {toplam:7.1f} sn")
        for adim, ok, sure in sonuc.adimlar:
            if not ok:
                print(f"    başarısız: {adim} ({sure:.1f} sn)")
    basarisiz = [s.temel for s in sonuclar if not s.basarili]
    if basarisiz:
        print(f"\n{len(basarisiz)} temel başarısız: {', '.join(basarisiz)}")
        print("Hatanın ayrıntısı yukarıdaki çıktıda. Bir modelden yardım isterken o bölümü olduğu gibi yapıştırın.")
    else:
        print(f"\nHepsi yeşil ({len(sonuclar)} temel).")


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Havuz temellerini kurar ve denetler.")
    ayristirici.add_argument("temel", nargs="*", help="temel adı ya da yolu (boşsa hepsi)")
    ayristirici.add_argument("--kur", action="store_true", help="önce bağımlılıkları kur")
    ayristirici.add_argument("--uzun", action="store_true", help="uzun denetimi de çalıştır")
    ayristirici.add_argument("--liste", action="store_true", help="temelleri ve komutlarını listele")
    ayristirici.add_argument("--json", metavar="DOSYA", help="özeti JSON olarak bu dosyaya da yaz")
    secenekler = ayristirici.parse_args()

    temeller = temel_sec(secenekler.temel)
    if secenekler.liste:
        for temel in temeller:
            print(f"{temel.goreli:<22} {temel.tur:<6} denetle: {' && '.join(temel.liste('denetle'))}")
        return 0
    sonuclar = [denetle_temel(temel, secenekler.kur, secenekler.uzun) for temel in temeller]
    ozet(sonuclar)
    if secenekler.json:
        veri = [{"temel": s.temel, "basarili": s.basarili,
                 "adimlar": [{"adim": a, "basarili": ok, "sure_sn": round(sure, 1)} for a, ok, sure in s.adimlar]}
                for s in sonuclar]
        Path(secenekler.json).write_text(json.dumps(veri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0 if all(s.basarili for s in sonuclar) else 1


if __name__ == "__main__":
    sys.exit(main())
