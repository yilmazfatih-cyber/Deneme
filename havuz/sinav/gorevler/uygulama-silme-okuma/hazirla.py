"""Başlangıç: temiz temel (okuma görevi; değişiklik yok).

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: soruların dayandığı dosyalar taşınırsa aşağıdaki denetim görevi güncellemeyi hatırlatır.
"""

from pathlib import Path


def hazirla(kopya: Path) -> None:
    for required in ("docs/MEZAR_TASI.md", "web/src/lib/store/records.ts", "shared/src/sync.ts"):
        if not (kopya / required).is_file():
            raise RuntimeError(f"uygulama temelinde {required} yok; soruları güncelleyin.")
