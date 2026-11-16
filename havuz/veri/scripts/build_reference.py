"""Başvuru tablolarının CSV kopyalarını JSON'dan üretir: ``tr/<ad>.json`` → ``tr/<ad>.csv``.

JSON asıl kaynaktır; CSV yalnız insan ve Excel için bir kopyadır. Bir JSON dosyasını elle
değiştirdikten sonra bu betiği çalıştırın; kural testi (tests/test_rules.py) ikisinin
eşleşmediğini görürse sizi buraya yönlendirir.
Kullanım:  python scripts/build_reference.py          (CSV'leri yazar)
           python scripts/build_reference.py --denetle (yalnız denetler; fark varsa 1 ile çıkar)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from verihavuzu.files import csv_text, write_text_atomic
from verihavuzu.paths import tr_dir
from verihavuzu.reference import dataset_names, load


def expected_csv(name: str) -> str:
    """Tablonun CSV karşılığını metin olarak üretir (liste alanları ``|`` ile birleşir)."""
    return csv_text(load(name))


def main() -> int:
    parser = argparse.ArgumentParser(description="tr/ altındaki CSV kopyalarını JSON'dan üretir.")
    parser.add_argument("--denetle", action="store_true", help="yazmadan yalnız eşleşmeyi denetle")
    args = parser.parse_args()
    stale: list[str] = []
    for name in dataset_names():
        path = tr_dir() / f"{name}.csv"
        text = expected_csv(name)
        current = path.read_text(encoding="utf-8") if path.is_file() else None
        if current == text:
            continue
        stale.append(path.name)
        if not args.denetle:
            write_text_atomic(path, text)
    if args.denetle and stale:
        print("Güncel olmayan CSV dosyaları: " + ", ".join(stale))
        print("Düzeltmek için: python scripts/build_reference.py")
        return 1
    print(f"{len(dataset_names())} tablo denetlendi; {len(stale)} CSV yeniden yazıldı.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
