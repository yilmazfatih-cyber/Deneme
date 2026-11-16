"""Etkileşimli kabuk: `python -m mini_sql` (deyimler `;` ile biter; `.cikis` ile çıkılır).

Bir dosyadaki deyimleri çalıştırmak için: `python -m mini_sql dosya.sql`.

Genişletme: yeni nokta komutu (`.tablolar` gibi) için `_dot_command`'a bir dal ekleyin.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .engine import Database, Result
from .errors import SqlError
from .values import to_text


def format_result(result: Result) -> str:
    if not result.columns:
        return f"Tamam ({result.rowcount} satır etkilendi)."
    cells = [[to_text(value) if value is not None else "NULL" for value in row] for row in result.rows]
    widths = [len(name) for name in result.columns]
    for row in cells:
        widths = [max(width, len(cell or "")) for width, cell in zip(widths, row, strict=True)]
    lines = [" | ".join(name.ljust(width) for name, width in zip(result.columns, widths, strict=True))]
    lines.append("-+-".join("-" * width for width in widths))
    for row in cells:
        lines.append(" | ".join((c or "").ljust(w) for c, w in zip(row, widths, strict=True)))
    lines.append(f"({len(result.rows)} satır)")
    return "\n".join(lines)


def _dot_command(db: Database, command: str) -> bool:
    """Nokta komutu işlendiyse True; `.cikis` için False."""
    if command in (".cikis", ".exit", ".quit"):
        return False
    if command == ".tablolar":
        for name, table in sorted(db.tables.items()):
            columns = ", ".join(f"{c.name} {c.type_name}".strip() for c in table.columns)
            print(f"{name} ({columns}) — {len(table.rows)} satır, dizinler: {sorted(table.indexes)}")
    else:
        print("Komutlar: .tablolar, .cikis")
    return True


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    db = Database()
    if args:
        try:
            for result in db.execute_script(Path(args[0]).read_text(encoding="utf-8")):
                print(format_result(result))
        except SqlError as error:
            print(f"Hata: {error}", file=sys.stderr)
            return 1
        return 0
    print("mini_sql kabuğu. Deyimleri ';' ile bitirin. Yardım: .tablolar · çıkış: .cikis")
    buffer = ""
    for line in sys.stdin:
        stripped = line.strip()
        if not buffer and stripped.startswith("."):
            if not _dot_command(db, stripped):
                break
            continue
        buffer += line
        if stripped.endswith(";"):
            try:
                for result in db.execute_script(buffer):
                    print(format_result(result))
            except SqlError as error:
                print(f"Hata: {error}")
            buffer = ""
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
