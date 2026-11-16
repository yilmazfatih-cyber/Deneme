"""Başlangıç: temiz temel (işlev ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelde işlev zaten varsa görev anlamını yitirir; aşağıdaki denetim bunu söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if "initials_tr" in (kopya / "verihavuzu/text.py").read_text(encoding="utf-8"):
        raise RuntimeError("veri temelinde initials_tr zaten var; görevi güncelleyin.")
