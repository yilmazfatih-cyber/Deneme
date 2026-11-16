"""Başlangıç: temiz temel (özellik ekleme görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelde ölçüt zaten varsa görev anlamını yitirir; aşağıdaki denetim bunu söyler.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    if "matthews_corrcoef" in (kopya / "ml_temel/olcut/classification.py").read_text(
        encoding="utf-8"
    ):
        raise RuntimeError("ml-temel'de matthews_corrcoef zaten var; görevi güncelleyin.")
