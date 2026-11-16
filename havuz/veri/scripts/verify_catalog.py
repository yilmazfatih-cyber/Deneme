"""Kataloğu Hugging Face API'siyle doğrular ve sonucu ``katalog/dogrulama-<tarih>.json``a yazar.

Kullanım:
  python scripts/verify_catalog.py            # AĞ İSTER: her kaydı API'den denetler, dosyayı yazar
  python scripts/verify_catalog.py --denetle  # ağsız: kataloğu en son doğrulama dosyasıyla
                                              # karşılaştırır (her kayıt "dogrulandi" olmalı)
Aynı iş komut satırından: ``python -m verihavuzu katalog dogrula [--cevrimdisi]``.
Kurallar: AGENTS.md → "Kataloğa küme ekle". İstekler nazik getiriciyle (saniyede ≤ 1 istek,
robots.txt'ye uyarak, yeniden denemeli) yapılır.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from verihavuzu.hat.fetch import FetchConfig, Fetcher
from verihavuzu.katalog.catalog import load_catalog
from verihavuzu.katalog.verify import latest_report, unverified, write_verification

USER_AGENT = "verihavuzu-katalog-dogrulama/0.1"


def main() -> int:
    parser = argparse.ArgumentParser(description="Kataloğu Hugging Face API'siyle doğrular.")
    parser.add_argument(
        "--denetle", action="store_true", help="ağsız: son doğrulamayla karşılaştır"
    )
    args = parser.parse_args()
    entries = load_catalog()
    if args.denetle:
        problems = unverified(entries, latest_report())
        for problem in problems:
            print(f"doğrulanmamış: {problem}")
        if problems:
            print("Düzeltmek için (ağ ister): python scripts/verify_catalog.py")
            return 1
        print(f"{len(entries)} kaydın hepsi son doğrulama dosyasında 'dogrulandi'.")
        return 0
    fetcher = Fetcher(FetchConfig(user_agent=USER_AGENT, min_interval=1.0))
    path, report = write_verification(entries, fetcher)
    print(f"Yazıldı: {path} · özet: {report['ozet']}")
    return 0 if set(report["ozet"]) == {"dogrulandi"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
