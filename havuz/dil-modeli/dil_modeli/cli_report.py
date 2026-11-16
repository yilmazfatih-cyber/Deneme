"""Komut: `rapor` (eğitim günlüğünden kayıp eğrisi raporu).

Örnek:
    python -m dil_modeli rapor --egitim calisma/cpu-deneme      # calisma/cpu-deneme/rapor.html

Genişletme: Rapora yeni bölüm için `report.py`deki `build_report`u değiştirin.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .report import build_report


def add_report_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--egitim", required=True, help="eğitim çıktı klasörü (gunluk.jsonl içeren)"
    )
    parser.add_argument("--cikti", help="HTML dosyası (varsayılan: <egitim>/rapor.html)")


def run_report(args: argparse.Namespace) -> int:
    out = Path(args.cikti) if args.cikti else Path(args.egitim) / "rapor.html"
    out.write_text(build_report(args.egitim), encoding="utf-8")
    print(f"Rapor yazıldı: {out} (tarayıcıda açın)")
    return 0
