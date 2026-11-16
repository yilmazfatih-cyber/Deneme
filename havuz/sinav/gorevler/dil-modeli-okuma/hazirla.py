"""Başlangıç: temiz temel (okuma görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: soruların dayandığı dosyalar taşınırsa aşağıdaki denetim görevi güncellemeyi hatırlatır.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    for required in ("dil_modeli/sampling.py", "dil_modeli/cli_common.py", "dil_modeli/optim.py"):
        if not (kopya / required).is_file():
            raise RuntimeError(f"dil-modeli temelinde {required} yok; soruları güncelleyin.")
