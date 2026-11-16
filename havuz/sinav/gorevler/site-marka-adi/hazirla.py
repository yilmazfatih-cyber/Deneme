"""Başlangıç: temiz temel (değişiklik görevi; başlangıçta bir şey bozulmaz).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin örnek markası değişirse görev metnini ve gizli testi güncelleyin; aşağıdaki denetim söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if "name: 'Sedir'" not in (kopya / "src/site.config.ts").read_text(encoding="utf-8"):
        raise RuntimeError("site temelinin örnek markası artık 'Sedir' değil; görevi güncelleyin.")
