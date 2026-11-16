"""Dosya okuma/yazma: CSV (standart ve Excel-TR), JSONL, JSON ve isteğe bağlı Parquet.

Paketteki her modül dosyaya buradan yazar; böylece aynı veri her zaman aynı baytları üretir
(örnek kümelerin "bayt bayt yeniden üretim" testi buna dayanır).
  - Standart CSV : UTF-8, virgül ayraç, ``\\n`` satır sonu, ondalık nokta.
  - Excel-TR CSV : UTF-8 + BOM, noktalı virgül ayraç, ``\\r\\n`` satır sonu, ondalık VİRGÜL.
    (Türkçe Excel bu dosyayı çift tıklamayla doğru açar; standart CSV'de "12.5" tarihe dönebilir.)
Genişletme: yeni bir biçim için ``write_x`` / ``read_x`` çifti ekleyin ve ``write_table`` içindeki
dallanmaya bir satır ekleyin.
"""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterable, Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

Row = dict[str, Any]

LIST_SEPARATOR = "|"


def cell_text(value: Any, *, decimal_comma: bool = False) -> str:
    """Tek bir hücreyi metne çevirir (None → boş; bool → true/false; liste → a|b|c)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float | Decimal):
        text = format(value, "f") if isinstance(value, Decimal) else repr(value)
        return text.replace(".", ",") if decimal_comma else text
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, list | tuple):
        return LIST_SEPARATOR.join(cell_text(item, decimal_comma=decimal_comma) for item in value)
    return str(value)


def columns_of(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """Sütun adlarını ilk görülme sırasıyla toplar (bütün satırlara bakar)."""
    seen: dict[str, None] = {}
    for row in rows:
        for key in row:
            seen.setdefault(key, None)
    return list(seen)


def csv_text(
    rows: Sequence[Mapping[str, Any]],
    columns: Sequence[str] | None = None,
    *,
    excel_tr: bool = False,
) -> str:
    """Satırları CSV metnine çevirir (BOM hariç; BOM dosyaya yazarken eklenir)."""
    names = list(columns) if columns is not None else columns_of(rows)
    buffer = io.StringIO()
    writer = csv.writer(
        buffer,
        delimiter=";" if excel_tr else ",",
        lineterminator="\r\n" if excel_tr else "\n",
        quoting=csv.QUOTE_MINIMAL,
    )
    writer.writerow(names)
    for row in rows:
        writer.writerow([cell_text(row.get(name), decimal_comma=excel_tr) for name in names])
    return buffer.getvalue()


def write_text_atomic(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    """Önce geçici dosyaya yazar, sonra adını değiştirir; yarım dosya kalmaz."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".gecici")
    with temp.open("w", encoding=encoding, newline="") as handle:
        handle.write(text)
    temp.replace(path)


def write_csv(
    path: Path,
    rows: Sequence[Mapping[str, Any]],
    columns: Sequence[str] | None = None,
    *,
    excel_tr: bool = False,
) -> None:
    """CSV dosyası yazar. ``excel_tr=True``: noktalı virgül + BOM + ondalık virgül."""
    text = csv_text(rows, columns, excel_tr=excel_tr)
    write_text_atomic(path, text, encoding="utf-8-sig" if excel_tr else "utf-8")


def read_csv(path: Path, *, delimiter: str | None = None) -> list[dict[str, str]]:
    """CSV okur; her değer METİN olarak döner (tür çıkarımı ``kalite`` paketinin işidir).

    BOM varsa atılır. Ayraç verilmezse ilk satıra bakılır: noktalı virgül çoksa ``;`` seçilir.
    """
    text = path.read_text(encoding="utf-8-sig")
    if delimiter is None:
        first_line = text.split("\n", 1)[0]
        delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    return [{key: (value or "") for key, value in row.items() if key is not None} for row in reader]


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"JSON'a çevrilemeyen tür: {type(value).__name__}")


def jsonl_text(rows: Iterable[Mapping[str, Any]]) -> str:
    """Her satırı tek satırlık JSON olarak yazar (JSON Lines)."""
    lines = [json.dumps(row, ensure_ascii=False, default=_json_default) for row in rows]
    return "".join(line + "\n" for line in lines)


def write_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    write_text_atomic(path, jsonl_text(rows))


def read_jsonl(path: Path) -> list[Row]:
    rows: list[Row] = []
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            item = json.loads(line)
            if not isinstance(item, dict):
                raise ValueError(f"{path}: {number}. satır bir JSON nesnesi değil.")
            rows.append(item)
    return rows


def json_text(data: Any) -> str:
    """Girintili, Türkçe karakterleri koruyan JSON metni (sonunda satır sonu)."""
    return json.dumps(data, ensure_ascii=False, indent=2, default=_json_default) + "\n"


def table_json_text(rows: Sequence[Mapping[str, Any]]) -> str:
    """Düz kayıt listesini "satır başına bir nesne" biçiminde yazar (fark okumak kolay olur)."""
    if not rows:
        return "[]\n"
    lines = [json.dumps(row, ensure_ascii=False, default=_json_default) for row in rows]
    return "[\n" + ",\n".join("  " + line for line in lines) + "\n]\n"


def write_json(path: Path, data: Any) -> None:
    write_text_atomic(path, json_text(data))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_parquet(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    """Parquet yazar. DuckDB gerekir: ``pip install -e ".[analiz]"``.

    Not: ``Decimal`` tutarlar JSON ara biçiminden geçtiği için DOUBLE olarak yazılır; kuruş
    kesinliği gereken işte CSV/JSONL kullanın ya da okurken yuvarlayın.
    """
    try:
        import duckdb
    except ImportError as error:  # pragma: no cover - ekstra kurulu değilse
        raise RuntimeError(
            'Parquet çıktısı için DuckDB gerekir. Şunu çalıştırın: pip install -e ".[analiz]"'
        ) from error
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_json = path.with_name(path.name + ".gecici.jsonl")
    write_jsonl(temp_json, rows)
    try:
        connection = duckdb.connect()
        connection.execute(
            "COPY (SELECT * FROM read_json_auto(?, format='newline_delimited')) "
            "TO ? (FORMAT parquet)",
            [str(temp_json), str(path)],
        )
        connection.close()
    finally:
        temp_json.unlink(missing_ok=True)


def read_table(path: Path) -> list[Row]:
    """Uzantıya göre okur: ``.csv`` (metin değerler), ``.jsonl`` ya da ``.json`` (kayıt listesi)."""
    suffix = path.suffix
    if suffix == ".csv":
        return [dict(row) for row in read_csv(path)]
    if suffix == ".jsonl":
        return read_jsonl(path)
    if suffix == ".json":
        data = read_json(path)
        if isinstance(data, list) and all(isinstance(item, dict) for item in data):
            return data
        raise ValueError(f"{path}: kayıt listesi (nesne dizisi) bekleniyordu.")
    raise ValueError(f"Desteklenmeyen dosya türü: {path.name} (csv, jsonl ya da json verin).")


def write_table(path: Path, rows: Sequence[Mapping[str, Any]], *, excel_tr: bool = False) -> None:
    """Uzantıya göre yazar: ``.csv``, ``.jsonl``, ``.json`` ya da ``.parquet``."""
    suffix = path.suffix
    if suffix == ".csv":
        write_csv(path, rows, excel_tr=excel_tr)
    elif suffix == ".jsonl":
        write_jsonl(path, rows)
    elif suffix == ".json":
        write_text_atomic(path, table_json_text(rows))
    elif suffix == ".parquet":
        write_parquet(path, rows)
    else:
        raise ValueError(f"Desteklenmeyen dosya türü: {path.name} (csv, jsonl, json, parquet).")
