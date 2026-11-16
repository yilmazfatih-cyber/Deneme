"""Satırları tablo sözleşmesine göre doğrular; her sorunu satır ve sütunuyla, Türkçe raporlar.

İki kip vardır: ``typed=False`` (CSV: her değer metin; "12" tam sayıya, "12,5" ondalığa çevrilir)
ve ``typed=True`` (JSONL: değerin JSON türü de denetlenir; "12" metni tam sayı sayılmaz).
Boş metin ("") eksik değer sayılır. Raporlarda kişisel veri sızmasın diye ``x-denetim`` taşıyan
sütunların değerleri maskelenir.
Kullanan: ``cli`` (``dogrula`` komutu), testler, ``ornekler`` üretimi.
Genişletme: yeni bir değer kuralı için ``_value_issues`` içine bir blok ekleyin.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.kalite.validators import VALIDATOR_LABELS, VALIDATORS

_INT = re.compile(r"[+-]?\d+")
_DEC_DOT = re.compile(r"[+-]?\d+(\.\d+)?")
_DEC_COMMA = re.compile(r"[+-]?\d+(,\d+)?")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_BOOL = {"true": True, "false": False, "1": True, "0": False}


@dataclass
class Issue:
    """Tek bir sorun. ``satir`` 1'den başlar (başlık satırı sayılmaz); tablo düzeyinde None."""

    satir: int | None
    sutun: str | None
    kural: str
    mesaj: str
    deger: str | None = None


@dataclass
class ValidationResult:
    tablo: str
    satir_sayisi: int
    toplam_sorun: int = 0
    kural_sayilari: dict[str, int] = field(default_factory=dict)
    sutun_sayilari: dict[str, int] = field(default_factory=dict)
    sorunlar: list[Issue] = field(default_factory=list)

    @property
    def gecerli(self) -> bool:
        return self.toplam_sorun == 0

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["gecerli"] = self.gecerli
        return data


def _display(column: Column | None, value: Any) -> str:
    text = "" if value is None else str(value)
    if column is not None and column.denetim and len(text) > 2:
        return "•" * (len(text) - 2) + text[-2:]  # kişisel veri raporda görünmesin
    return text[:80]


def _coerce(column: Column, value: Any, *, typed: bool, decimal: str) -> tuple[Any, str | None]:
    """Değeri sütun türüne çevirir. Dönüş: (değer, hata iletisi ya da None)."""
    kind = column.tur
    if typed and not isinstance(value, str):
        # JSON türleri + bellekteki Python türleri (Decimal, date, datetime) kabul edilir.
        number = isinstance(value, int | float | Decimal) and not isinstance(value, bool)
        if kind == "tam_sayi" and isinstance(value, int) and not isinstance(value, bool):
            return value, None
        if kind == "ondalik" and number:
            return float(value), None
        if kind == "mantiksal" and isinstance(value, bool):
            return value, None
        if kind == "tarih" and isinstance(value, date) and not isinstance(value, datetime):
            return value, None
        if kind == "zaman" and isinstance(value, datetime):
            return value, None
        return value, f"JSON türü yanlış: {type(value).__name__}"
    text = str(value)
    if kind == "metin":
        return text, None
    if typed and kind in ("tam_sayi", "ondalik", "mantiksal"):
        return text, "sayı/mantıksal değer metin olarak yazılmış"
    if kind == "tam_sayi":
        return (int(text), None) if _INT.fullmatch(text) else (text, "tam sayı bekleniyordu")
    if kind == "ondalik":
        pattern = _DEC_COMMA if decimal == "," else _DEC_DOT
        if pattern.fullmatch(text):
            return float(text.replace(",", ".")), None
        return text, f"ondalık sayı bekleniyordu (ondalık ayırıcı '{decimal}')"
    if kind == "mantiksal":
        key = text.strip()
        return (_BOOL[key], None) if key in _BOOL else (text, "true ya da false bekleniyordu")
    if kind == "tarih":
        if _ISO_DATE.fullmatch(text):
            try:
                return date.fromisoformat(text), None
            except ValueError:
                pass
        return text, "tarih YYYY-AA-GG biçiminde olmalı (örnek: 2026-11-16)"
    try:
        return datetime.fromisoformat(text), None
    except ValueError:
        return text, "zaman ISO 8601 biçiminde olmalı (örnek: 2026-11-16T10:30:00)"


def _value_issues(column: Column, raw: Any, value: Any) -> list[tuple[str, str]]:
    """Türü doğru bir değer için kural sorunları: [(kural, ileti)]."""
    found: list[tuple[str, str]] = []
    if column.izinli is not None and raw not in column.izinli and value not in column.izinli:
        options = ", ".join(str(item) for item in column.izinli[:12])
        found.append(("izinli", f"izinli değerlerden biri olmalı: {options}"))
    if column.desen is not None and not re.search(column.desen, str(raw)):
        found.append(("desen", f"desene uymuyor: {column.desen}"))
    if isinstance(value, str):
        if column.en_kisa is not None and len(value) < column.en_kisa:
            found.append(("uzunluk", f"en az {column.en_kisa} karakter olmalı"))
        if column.en_uzun is not None and len(value) > column.en_uzun:
            found.append(("uzunluk", f"en çok {column.en_uzun} karakter olmalı"))
    if isinstance(value, int | float) and not isinstance(value, bool):
        if column.en_az is not None and value < column.en_az:
            found.append(("aralik", f"en az {column.en_az:g} olmalı"))
        if column.en_cok is not None and value > column.en_cok:
            found.append(("aralik", f"en çok {column.en_cok:g} olmalı"))
    if isinstance(value, date):
        day = value.date() if isinstance(value, datetime) else value
        if column.en_erken is not None and day < column.en_erken:
            found.append(("aralik", f"{column.en_erken.isoformat()} tarihinden önce olamaz"))
        if column.en_gec is not None and day > column.en_gec:
            found.append(("aralik", f"{column.en_gec.isoformat()} tarihinden sonra olamaz"))
    if column.denetim is not None and not VALIDATORS[column.denetim](str(raw)):
        found.append(("denetim", f"geçerli bir {VALIDATOR_LABELS[column.denetim]} değil"))
    return found


class _Collector:
    def __init__(self, result: ValidationResult, max_issues: int) -> None:
        self.result = result
        self.max_issues = max_issues
        self.rules: Counter[str] = Counter()
        self.columns: Counter[str] = Counter()

    def add(self, issue: Issue) -> None:
        self.result.toplam_sorun += 1
        self.rules[issue.kural] += 1
        if issue.sutun:
            self.columns[issue.sutun] += 1
        if len(self.result.sorunlar) < self.max_issues:
            self.result.sorunlar.append(issue)

    def finish(self) -> ValidationResult:
        self.result.kural_sayilari = dict(sorted(self.rules.items()))
        self.result.sutun_sayilari = dict(sorted(self.columns.items()))
        return self.result


def validate_rows(
    rows: list[dict[str, Any]],
    contract: TableContract,
    *,
    typed: bool = False,
    decimal: str = ".",
    max_issues: int = 1000,
) -> ValidationResult:
    """Satırları sözleşmeye göre doğrular (``max_issues`` yalnız saklanan örnekleri sınırlar)."""
    collector = _Collector(ValidationResult(contract.ad, len(rows)), max_issues)
    present = list(dict.fromkeys(key for row in rows for key in row)) if rows else []
    if rows:
        for name in contract.column_names():
            if name not in present:
                collector.add(Issue(None, name, "eksik_sutun", f"eksik sütun: {name}"))
        for name in present:
            if name not in contract.column_names():
                collector.add(Issue(None, name, "fazla_sutun", f"sözleşmede olmayan sütun: {name}"))
    first_seen: dict[str, dict[Any, int]] = {c.ad: {} for c in contract.sutunlar if c.benzersiz}
    key_seen: dict[tuple[Any, ...], int] = {}
    for number, row in enumerate(rows, start=1):
        for column in contract.sutunlar:
            if column.ad not in row:
                continue
            raw = row[column.ad]
            if raw is None or raw == "":
                if column.zorunlu:
                    collector.add(Issue(number, column.ad, "zorunlu", "boş olamaz"))
                continue
            value, error = _coerce(column, raw, typed=typed, decimal=decimal)
            shown = _display(column, raw)
            if error:
                collector.add(Issue(number, column.ad, "tur", error, shown))
                continue
            for rule, message in _value_issues(column, raw, value):
                collector.add(Issue(number, column.ad, rule, message, shown))
            if column.benzersiz:
                seen = first_seen[column.ad]
                if value in seen:
                    message = f"yinelenen değer (ilk görüldüğü satır: {seen[value]})"
                    collector.add(Issue(number, column.ad, "benzersiz", message, shown))
                else:
                    seen[value] = number
        if contract.birincil_anahtar:
            key = tuple(row.get(name) for name in contract.birincil_anahtar)
            if key in key_seen:
                message = f"birincil anahtar yineleniyor (ilk satır: {key_seen[key]})"
                collector.add(
                    Issue(number, ",".join(contract.birincil_anahtar), "anahtar", message)
                )
            else:
                key_seen[key] = number
    return collector.finish()
