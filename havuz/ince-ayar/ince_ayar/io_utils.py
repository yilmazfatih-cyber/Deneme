"""Dosya okuma/yazma: JSONL ve CSV satırlarını satır numarasıyla okur, JSONL/JSON yazar.

Kim kullanır: veri doğrulayıcı (`data/validate.py`), sentetik veri hattı, görev eylemleri.
Türkçe'ye özgü tuzaklar burada çözülür: Excel'in eklediği BOM (`utf-8-sig`), noktalı virgülle
ayrılmış CSV (Türkçe Excel varsayılanı) ve UTF-8 olmayan (Windows-1254) dosyalar için yol
gösteren hata.

Genişletme: yeni bir dosya türü için `read_rows` içindeki uzantı dallanmasına satır ekleyin.
"""

from __future__ import annotations

import csv
import hashlib
import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.text_tr import lower_ascii

JSONL_SUFFIXES = (".jsonl", ".ndjson")
TABLE_SUFFIXES = (".csv", ".tsv")


@dataclass(frozen=True)
class RawRow:
    """Dosyadan okunan tek satır: ya `data` doludur ya da `error` (Türkçe açıklama)."""

    line: int
    data: dict[str, Any] | None
    error: str | None = None


def read_text(path: Path, encoding: str = "utf-8") -> str:
    """Dosyayı metin olarak okur; BOM'u atar; kodlama hatasında ne yapılacağını söyler."""
    if not path.is_file():
        raise UserError(t("dosya.yok", yol=path))
    codec = "utf-8-sig" if lower_ascii(encoding).replace("_", "-") == "utf-8" else encoding
    try:
        return path.read_text(encoding=codec)
    except UnicodeDecodeError as exc:
        raise UserError(t("dosya.kodlama", yol=path, kodlama=encoding)) from exc


def read_rows(path: Path, encoding: str = "utf-8") -> list[RawRow]:
    """JSONL ya da CSV/TSV dosyasını satır numaralarıyla okur. Boş satırlar atlanır."""
    suffix = lower_ascii(path.suffix)
    text = read_text(path, encoding)
    if suffix in JSONL_SUFFIXES:
        return _read_jsonl(text)
    if suffix in TABLE_SUFFIXES:
        return _read_table(text, tab=suffix == ".tsv")
    raise UserError(t("dosya.uzanti", yol=path))


def _read_jsonl(text: str) -> list[RawRow]:
    rows: list[RawRow] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            rows.append(RawRow(number, None, t("veri.json_gecersiz", ayrinti=exc.msg)))
            continue
        if not isinstance(value, dict):
            rows.append(RawRow(number, None, t("veri.json_nesne_degil")))
            continue
        rows.append(RawRow(number, value))
    return rows


def sniff_delimiter(header_line: str) -> str:
    """Başlık satırına bakarak ayırıcıyı seçer: virgül, noktalı virgül ya da sekme."""
    counts = {delimiter: header_line.count(delimiter) for delimiter in (",", ";", "\t")}
    best = max(counts, key=lambda delimiter: counts[delimiter])
    return best if counts[best] > 0 else ","


def _read_table(text: str, tab: bool) -> list[RawRow]:
    lines = text.splitlines()
    if not lines:
        return []
    delimiter = "\t" if tab else sniff_delimiter(lines[0])
    reader = csv.DictReader(text.splitlines(keepends=True), delimiter=delimiter)
    rows: list[RawRow] = []
    for record in reader:
        number = reader.line_num
        if None in record:  # başlıktan fazla sütun
            rows.append(RawRow(number, None, t("veri.csv_fazla_sutun")))
            continue
        cleaned = {str(key).strip(): (value or "") for key, value in record.items()}
        if not any(value.strip() for value in cleaned.values()):
            continue
        rows.append(RawRow(number, cleaned))
    return rows


def write_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> int:
    """Satırları JSONL olarak yazar; yazılan satır sayısını döndürür."""
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def append_jsonl(path: Path, row: Mapping[str, Any]) -> None:
    """Tek satır ekler (uzun süren üretimde yarıda kesilince eldekiler kaybolmasın)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: Path, payload: Any) -> None:
    """Okunaklı JSON yazar (Türkçe karakterler kaçışsız, sonda satır sonu)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    """JSON dosyası okur; yoksa ya da bozuksa yol gösteren hata verir."""
    text = read_text(path)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise UserError(t("dosya.json_bozuk", yol=path, ayrinti=exc.msg)) from exc


def sha256_file(path: Path) -> str:
    """Dosyanın SHA-256 özeti (veri kartı ve kaynak kaydı için)."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    """Metnin SHA-256 özeti (istem sürümü kaydı için)."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
