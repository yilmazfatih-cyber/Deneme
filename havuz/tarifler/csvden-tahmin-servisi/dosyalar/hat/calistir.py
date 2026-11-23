#!/usr/bin/env python3
"""Uçtan uca hat: sentetik kirli veri → profil → temizlik → sızıntı sütununu atma → model eğitimi.

Kullanım (proje kökünden; yalnız standart kütüphane, temellerin .venv'leri kurulu olmalı):
    python hat/calistir.py                 # 3000 müşteri, tohum 42, hızlı eğitim
    python hat/calistir.py --adet 10000 --tam
Çıktılar hat/calisma/ altında: ham/ (temiz + kirli + bozulma kaydı), profil.md, temiz.csv,
degisiklikler.jsonl, egitim.csv, model/ (model.npz, rapor.md, model_karti.md, metrikler.json).
Sonra servis: ml-temel/.venv/bin/python -m ml_temel sun --model hat/calisma/model/model.npz
Genişletme: yeni bir adım (ör. `verihavuzu dogrula` ile şema denetimi) → `ADIMLAR` sırasına bir işlev.
"""

from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
from pathlib import Path

PROJE = Path(__file__).resolve().parent.parent
CALISMA = PROJE / "hat" / "calisma"
HEDEF = "churn"
GRUP = "musteri_id"  # aynı müşterinin yinelenen satırları ya eğitimde ya sınamada kalsın
# Tahmin anında BİLİNEMEYECEK sütunlar: modele girerse "kusursuz" ama işe yaramaz model çıkar.
SIZINTI_SUTUNLARI = ("gercek_olasilik",)


def python(temel: str) -> str:
    """Temelin sanal ortamındaki python (yoksa yol gösteren hata)."""
    alt = "Scripts/python.exe" if os.name == "nt" else "bin/python"
    yol = PROJE / temel / ".venv" / alt
    if not yol.exists():
        raise SystemExit(f"{yol} yok: önce {temel} temelinin ortamını kurun (tarifin uygula.py'si).")
    return str(yol)


def calistir(baslik: str, komut: list[str]) -> None:
    print(f"\n== {baslik}\n$ {' '.join(komut)}", flush=True)
    ortam = dict(os.environ, OMP_NUM_THREADS=os.environ.get("OMP_NUM_THREADS", "2"))
    if subprocess.run(komut, cwd=PROJE, env=ortam, check=False).returncode != 0:
        raise SystemExit(f"Adım başarısız: {baslik}. Hata yukarıda.")


def hazirla(kaynak: Path, hedef: Path) -> None:
    """Sızıntı sütunlarını atar; satırlara dokunmaz (eksik hedefleri ml-temel kendisi çıkarır)."""
    with kaynak.open(encoding="utf-8", newline="") as giris:
        okuyucu = csv.DictReader(giris)
        alanlar = [a for a in okuyucu.fieldnames or [] if a not in SIZINTI_SUTUNLARI]
        satirlar = [{a: satir[a] for a in alanlar} for satir in okuyucu]
    with hedef.open("w", encoding="utf-8", newline="") as cikis:
        yazici = csv.DictWriter(cikis, fieldnames=alanlar)
        yazici.writeheader()
        yazici.writerows(satirlar)
    print(f"\n== 4/5 hazırla: {len(satirlar)} satır; atılan sızıntı sütunları: {list(SIZINTI_SUTUNLARI)}")


def main(argv: list[str]) -> int:
    ayristirici = argparse.ArgumentParser(description="Kirli CSV'den tahmin modeline uçtan uca hat.")
    ayristirici.add_argument("--adet", type=int, default=3000, help="müşteri sayısı")
    ayristirici.add_argument("--tohum", type=int, default=42, help="rastgelelik tohumu")
    ayristirici.add_argument("--tam", action="store_true", help="hızlı değil, tam eğitim")
    secenek = ayristirici.parse_args(argv)
    veri, ml = python("veri"), python("ml-temel")
    ham, kirli = CALISMA / "ham", CALISMA / "ham" / "churn.kirli.csv"
    CALISMA.mkdir(parents=True, exist_ok=True)
    calistir("1/5 üret (kirli + temiz + bozulma kaydı)", [
        veri, "-m", "verihavuzu", "uret", "churn", "--adet", str(secenek.adet),
        "--tohum", str(secenek.tohum), "--kirli", "--cikti", str(ham),
    ])  # fmt: skip
    calistir("2/5 profil", [
        veri, "-m", "verihavuzu", "profil", str(kirli), "--rapor", str(CALISMA / "profil.md"),
        "--json", str(CALISMA / "profil.json"),
    ])  # fmt: skip
    # DİKKAT: --yineleme-sutunlari musteri_id VERMEYİN: kimlikler (C000001, C000002…) birbirine
    # "benzer" sayılır ve bulanık yineleme bütün satırları tek satıra indirir (README → Sık sorunlar).
    calistir("3/5 temizle (boşluk, biçim, birebir yinelenenler)", [
        veri, "-m", "verihavuzu", "temizle", str(kirli), "--cikti", str(CALISMA / "temiz.csv"),
        "--degisiklikler", str(CALISMA / "degisiklikler.jsonl"),
    ])  # fmt: skip
    hazirla(CALISMA / "temiz.csv", CALISMA / "egitim.csv")
    egit = [ml, "-m", "ml_temel", "egit", "--veri", str(CALISMA / "egitim.csv"), "--hedef", HEDEF,
            "--grup", GRUP, "--cikti", str(CALISMA / "model"), "--tohum", str(secenek.tohum)]  # fmt: skip
    calistir("5/5 eğit (gruplu ayrım, sızıntısız değerlendirme)", egit + ([] if secenek.tam else ["--hizli"]))
    model = CALISMA / "model" / "model.npz"
    print(f"\nHat bitti. Rapor: {CALISMA / 'model' / 'rapor.md'}")
    print(f"Servisi başlatın:  {ml} -m ml_temel sun --model {model}")
    print("Tahmin isteyin:    curl -s http://127.0.0.1:8445/tahmin -H 'Content-Type: application/json' "
          "-d @hat/ornek_istek.json")  # fmt: skip
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
