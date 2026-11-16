"""``ornekler/`` hazır kümelerini (veri + şema + veri kartı + uretim.json) yeniden üretir.

Kullanım:  python scripts/build_examples.py
Üreteçlerde bilinçli bir değişiklik yaptıysanız çalıştırın; sonra ``git diff --stat ornekler``
ile neyin değiştiğine bakın. Boyut sınırı: dosya başına ~1 MB, toplam ~8 MB (aşılırsa uyarır).
Tanımlar: ``verihavuzu/sentetik/examples.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from verihavuzu.paths import examples_dir
from verihavuzu.sentetik.examples import build_all

FILE_LIMIT = 1_200_000
TOTAL_LIMIT = 8_000_000


def main() -> int:
    manifest = build_all(examples_dir())
    total = 0
    status = 0
    for item in manifest["kumeler"]:
        for record in item["dosyalar"]:
            total += record["bayt"]
            flag = ""
            if record["bayt"] > FILE_LIMIT:
                flag, status = "  ← ÇOK BÜYÜK", 1
            print(
                f"{item['ad']}/{record['ad']}: {record['satir']} satır, {record['bayt']} bayt{flag}"
            )
    print(f"Toplam: {total / 1e6:.2f} MB")
    if total > TOTAL_LIMIT:
        print("Toplam boyut sınırı aşıldı; örneklerin --adet değerlerini küçültün.")
        status = 1
    return status


if __name__ == "__main__":
    raise SystemExit(main())
