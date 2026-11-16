"""DuckDB analiz tarifleri: ``docs/ANALIZ_TARIFLERI.md`` içindeki her ```sql bloğunu çalıştırır ve
hemen ardından gelen ```text bloğundaki beklenen çıktıyla karşılaştırır (ya da onu yeniden yazar).

Kullanım:  python -m verihavuzu.analiz            (denetler; fark varsa 1 ile çıkar)
           python -m verihavuzu.analiz --yaz      (beklenen çıktıları yeniden yazar)
DuckDB gerekir: ``pip install -e ".[analiz]"``. Sorgular temel klasöründen çalışır (yollar
``ornekler/...`` ve ``tr/...`` biçimindedir). Çıktı biçimi: sütunlar " | " ile ayrılır, boş → NULL.
Genişletme: belgeye yeni bir ```sql bloğu ve ardından boş bir ```text bloğu ekleyip ``--yaz``
ile çalıştırın; çıktıyı gözle doğrulayın (test bundan sonra onu korur).
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

from verihavuzu.paths import root_dir

DOC = "docs/ANALIZ_TARIFLERI.md"
_BLOCK = re.compile(
    r"```sql\n(?P<sql>.*?)```\s*\n(?:[^`]*?\n)?```text\n(?P<text>.*?)```", re.DOTALL
)


def _cell(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, float):
        return repr(round(value, 6))
    return str(value)


def run_sql(sql: str, workdir: Path) -> str:
    """Sorguyu çalıştırır; başlık + satırlar biçiminde metin döndürür."""
    import duckdb

    previous = Path.cwd()
    os.chdir(workdir)
    try:
        connection = duckdb.connect()
        cursor = connection.execute(sql)
        columns = [item[0] for item in cursor.description]
        rows = cursor.fetchall()
        connection.close()
    finally:
        os.chdir(previous)
    lines = [" | ".join(columns)] + [" | ".join(_cell(v) for v in row) for row in rows]
    return "\n".join(lines) + "\n"


def recipes(markdown: str) -> list[tuple[str, str]]:
    """(sql, beklenen çıktı) çiftleri."""
    return [(m.group("sql"), m.group("text")) for m in _BLOCK.finditer(markdown)]


def refresh(markdown: str, workdir: Path) -> str:
    """Her beklenen çıktı bloğunu gerçek çıktıyla değiştirilmiş belge metni."""

    def replace(match: re.Match[str]) -> str:
        whole = match.group(0)
        start = match.start("text") - match.start()
        end = match.end("text") - match.start()
        return whole[:start] + run_sql(match.group("sql"), workdir) + whole[end:]

    return _BLOCK.sub(replace, markdown)


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    root = root_dir()
    path = root / DOC
    text = path.read_text(encoding="utf-8")
    if "--yaz" in args:
        path.write_text(refresh(text, root), encoding="utf-8")
        print(f"{len(recipes(text))} tarifin çıktısı yazıldı: {path}")
        return 0
    failed = [
        i for i, (sql, expected) in enumerate(recipes(text), 1) if run_sql(sql, root) != expected
    ]
    for index in failed:
        print(
            f"{index}. tarifin çıktısı belgeyle uyuşmuyor. "
            "Bilerek değiştiyse: python -m verihavuzu.analiz --yaz"
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
