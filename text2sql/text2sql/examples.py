"""Örnek soru/SQL çiftleri (Markdown) ve paketle gelen örnek veritabanının yeri.

Biçim (ornek/sorular.md ile aynı; --ornekler ile kendi dosyanızı da verebilirsiniz):

    ## 1. İstanbul'daki müşteriler kimler?

    ```sql
    SELECT ad, soyad FROM musteriler ...;
    ```
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from .errors import ConfigError

_HEADING_RE = re.compile(r"^#{2,4}\s*(?:\d+[.)]\s*)?(.+?)\s*$", re.M)
_SQL_BLOCK_RE = re.compile(r"```sql[ \t]*\r?\n(.*?)```", re.S | re.I)


def ornek_dir() -> Path:
    """Depodaki ``text2sql/ornek`` klasörü (paket düzenlenebilir kurulduğunda: pip install -e .)."""
    return Path(__file__).resolve().parents[1] / "ornek"


def parse_examples(text: str) -> list[tuple[str, str]]:
    """Her başlığın altındaki ilk ```sql bloğunu o başlığın sorusuyla eşler."""
    heads = list(_HEADING_RE.finditer(text))
    out = []
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        m = _SQL_BLOCK_RE.search(text, h.end(), end)
        if m:
            out.append((h.group(1).strip(), m.group(1).strip()))
    return out


def load_examples(path: str | Path) -> list[tuple[str, str]]:
    p = Path(path).expanduser()
    try:
        pairs = parse_examples(p.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigError(f"Örnek dosyası okunamadı: {p} ({exc.strerror})") from None
    if not pairs:
        raise ConfigError(f"Örnek dosyasında '## soru' + ```sql bloğu bulunamadı: {p}")
    return pairs


@lru_cache(maxsize=1)
def bundled_examples() -> tuple[tuple[str, str], ...]:
    p = ornek_dir() / "sorular.md"
    return tuple(parse_examples(p.read_text(encoding="utf-8"))) if p.is_file() else ()


def normalize_question(q: str) -> str:
    return re.sub(r"[\W_]+", " ", q.casefold()).strip()
