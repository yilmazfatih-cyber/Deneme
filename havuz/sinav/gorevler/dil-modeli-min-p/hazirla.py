"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelde min-p zaten varsa görev anlamını yitirir; aşağıdaki denetim bunu söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if "min_p" in (kopya / "dil_modeli/sampling.py").read_text(encoding="utf-8"):
        raise RuntimeError("dil-modeli'nde min_p zaten var; görevi güncelleyin.")
