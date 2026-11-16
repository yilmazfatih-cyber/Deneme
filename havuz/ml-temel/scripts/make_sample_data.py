"""Örnek CSV dosyasını (müşteri kaybı) tohumlu olarak üretir: `ornekler/veri/musteri_kaybi.csv`.

Dosya, Türkçe Excel'in "CSV (noktalı virgülle ayrılmış)" çıktısını taklit eder: UTF-8 BOM,
`;` ayırıcı, ondalık virgül, gg.aa.yyyy tarihler. İçerik `ml_temel.veri.make_churn_table` ile
üretilir (kurgusaldır; gerçek kişi ya da şirket verisi değildir).
Kural testi (tests/test_rules.py) dosyanın bu betikle birebir aynı üretildiğini denetler.

Kullanım:  python scripts/make_sample_data.py
Genişletme: yeni bir örnek dosya için `FILES` sözlüğüne (yol → üretici) ekleyin.
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ml_temel.ortak.table import Table  # noqa: E402
from ml_temel.tablo.csv_reader import CsvFormat, write_csv  # noqa: E402
from ml_temel.veri import make_churn_table  # noqa: E402

EXCEL_TR = CsvFormat(encoding="utf-8-sig", delimiter=";", decimal=",")

FILES: dict[str, Callable[[], Table]] = {
    "ornekler/veri/musteri_kaybi.csv": lambda: make_churn_table(2000, random_state=2026),
    # YENİ ÖRNEK DOSYA BURAYA
}


def write_all(root: Path = ROOT) -> list[Path]:
    """Bütün örnek dosyaları `root` altına yazar; yazılan yolları döndürür."""
    return [write_csv(make(), root / relative, EXCEL_TR) for relative, make in FILES.items()]


if __name__ == "__main__":
    for path in write_all():
        print(f"Yazıldı: {path.relative_to(ROOT)}")
