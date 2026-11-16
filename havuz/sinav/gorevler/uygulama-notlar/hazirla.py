"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: görev bir ön koşul isterse (ör. yarım kalmış bir dosya) burada kurun.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if not (kopya / "scripts/gen.ts").is_file():
        raise RuntimeError("uygulama temelinde üreteç (scripts/gen.ts) yok; görev bu temelle çalışmaz.")
