"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: görev bir ön koşul isterse burada kurun.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if (kopya / "src/content/sayfalar/tr/kariyer.md").exists():
        raise RuntimeError("site temelinde zaten bir kariyer sayfası var; görev metnini güncelleyin.")
