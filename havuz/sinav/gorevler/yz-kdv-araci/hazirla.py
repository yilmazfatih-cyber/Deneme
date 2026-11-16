"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelde zaten bir KDV aracı varsa görev anlamını yitirir; aşağıdaki denetim bunu söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if (kopya / "yz/arac/hazir/kdv.py").exists():
        raise RuntimeError("yz temelinde zaten yz/arac/hazir/kdv.py var; görevi güncelleyin.")
