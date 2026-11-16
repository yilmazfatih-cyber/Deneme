"""Tablo sözleşmesi (şema): sütun türü, zorunluluk, aralık, desen, izinli değerler ve
sağlama denetimi.

Sözleşme Python'da ``TableContract`` olarak yazılır, standart JSON Schema'ya (2020-12) çevrilip
``<tablo>.sema.json`` dosyasına kaydedilir; ``load_contract`` aynı dosyayı geri okur.
Desteklenen JSON Schema alt kümesi: type, format (date, date-time), enum, pattern, minimum,
maximum, minLength, maxLength, required, additionalProperties ve ek anahtarlar: ``x-denetim``
(tckn, vkn, iban… sağlama denetimi), ``x-benzersiz``, ``x-en-erken``/``x-en-gec`` (tarih aralığı),
``x-birincil-anahtar``. Desteklenmeyen bir anahtar görülürse sessizce geçilmez, hata verilir.
Doğrulama: ``validate.py``. Genişletme: yeni kural için ``Column``a alan, ``to_json_schema`` ve
``_column_from_property`` içine karşılığını, ``validate.py``ye denetimini ekleyin.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from verihavuzu.files import json_text, read_json, write_text_atomic
from verihavuzu.kalite.validators import VALIDATORS

ColumnType = Literal["metin", "tam_sayi", "ondalik", "mantiksal", "tarih", "zaman"]
Scalar = str | int | float | bool

JSON_TYPE = {
    "metin": "string",
    "tam_sayi": "integer",
    "ondalik": "number",
    "mantiksal": "boolean",
    "tarih": "string",
    "zaman": "string",
}
FORMAT = {"tarih": "date", "zaman": "date-time"}
SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"

_TOP_KEYS = {
    "$schema", "$id", "title", "description", "type", "properties", "required",
    "additionalProperties", "x-birincil-anahtar",
}  # fmt: skip
_PROPERTY_KEYS = {
    "type", "format", "enum", "pattern", "minimum", "maximum", "minLength", "maxLength",
    "description", "title", "examples", "default", "x-denetim", "x-benzersiz", "x-en-erken",
    "x-en-gec",
}  # fmt: skip


class Column(BaseModel):
    """Tek sütunun sözleşmesi. Alan adları Türkçe; JSON Schema karşılıkları yorumlarda."""

    model_config = ConfigDict(extra="forbid")
    ad: str = Field(pattern=r"^[a-z_][a-z0-9_]*$")  # sütun adı: küçük harf, ASCII, alt çizgi
    tur: ColumnType  # type (+ format)
    aciklama: str = ""  # description
    zorunlu: bool = True  # False → type'a "null" eklenir
    benzersiz: bool = False  # x-benzersiz
    en_az: float | None = None  # minimum
    en_cok: float | None = None  # maximum
    en_kisa: int | None = Field(default=None, ge=0)  # minLength
    en_uzun: int | None = Field(default=None, ge=0)  # maxLength
    desen: str | None = None  # pattern (re.search; ^ ve $ yazarak tam eşleşme isteyin)
    izinli: list[Scalar] | None = None  # enum
    denetim: str | None = None  # x-denetim: verihavuzu.kalite.validators.VALIDATORS anahtarı
    en_erken: date | None = None  # x-en-erken (tarih/zaman sütunları)
    en_gec: date | None = None  # x-en-gec
    ornek: Scalar | None = None  # examples[0]

    @field_validator("desen")
    @classmethod
    def _pattern_compiles(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                re.compile(value)
            except re.error as error:
                raise ValueError(f"desen derlenemedi: {error}") from error
        return value

    @field_validator("denetim")
    @classmethod
    def _known_validator(cls, value: str | None) -> str | None:
        if value is not None and value not in VALIDATORS:
            raise ValueError(f"bilinmeyen denetim '{value}'; seçenekler: {', '.join(VALIDATORS)}")
        return value


class TableContract(BaseModel):
    """Bir tablonun sözleşmesi: sütunlar ve (isteğe bağlı) birincil anahtar."""

    model_config = ConfigDict(extra="forbid")
    ad: str = Field(pattern=r"^[a-z_][a-z0-9_]*$")
    aciklama: str = ""
    birincil_anahtar: list[str] = []
    sutunlar: list[Column] = Field(min_length=1)

    @model_validator(mode="after")
    def _consistent(self) -> TableContract:
        names = [column.ad for column in self.sutunlar]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise ValueError(f"yinelenen sütun adı: {', '.join(duplicates)}")
        unknown = [key for key in self.birincil_anahtar if key not in names]
        if unknown:
            raise ValueError(f"birincil anahtar sütunu sözleşmede yok: {', '.join(unknown)}")
        return self

    def column_names(self) -> list[str]:
        return [column.ad for column in self.sutunlar]

    def column(self, name: str) -> Column:
        for column in self.sutunlar:
            if column.ad == name:
                return column
        raise KeyError(f"Sözleşmede böyle bir sütun yok: {name}")

    def to_json_schema(self) -> dict[str, Any]:
        """Standart JSON Schema (2020-12) belgesi üretir."""
        properties = {column.ad: _property_of(column) for column in self.sutunlar}
        schema: dict[str, Any] = {
            "$schema": SCHEMA_DIALECT,
            "title": self.ad,
            "description": self.aciklama,
            "type": "object",
            "properties": properties,
            "required": self.column_names(),
            "additionalProperties": False,
        }
        if self.birincil_anahtar:
            schema["x-birincil-anahtar"] = list(self.birincil_anahtar)
        return schema

    @classmethod
    def from_json_schema(cls, data: dict[str, Any]) -> TableContract:
        """JSON Schema belgesini sözleşmeye çevirir; desteklenmeyen anahtarda hata verir."""
        unknown = sorted(set(data) - _TOP_KEYS)
        if unknown:
            raise ValueError(f"Desteklenmeyen şema anahtarı: {', '.join(unknown)}")
        if data.get("type") != "object" or not isinstance(data.get("properties"), dict):
            raise ValueError("Şema bir nesne tanımı olmalı: type 'object' ve properties gerekli.")
        columns = [_column_from_property(name, spec) for name, spec in data["properties"].items()]
        return cls(
            ad=str(data.get("title") or "tablo"),
            aciklama=str(data.get("description") or ""),
            birincil_anahtar=list(data.get("x-birincil-anahtar", [])),
            sutunlar=columns,
        )


def _property_of(column: Column) -> dict[str, Any]:
    base = JSON_TYPE[column.tur]
    prop: dict[str, Any] = {"type": base if column.zorunlu else [base, "null"]}
    if column.tur in FORMAT:
        prop["format"] = FORMAT[column.tur]
    if column.aciklama:
        prop["description"] = column.aciklama
    enum: list[Any] | None = None
    if column.izinli is not None:  # JSON Schema'da enum null'u da kapsamalı (boş olabilen sütun)
        enum = list(column.izinli) + ([] if column.zorunlu else [None])
    optional_keys: list[tuple[str, Any]] = [
        ("enum", enum),
        ("pattern", column.desen),
        ("minimum", column.en_az),
        ("maximum", column.en_cok),
        ("minLength", column.en_kisa),
        ("maxLength", column.en_uzun),
        ("x-denetim", column.denetim),
        ("x-en-erken", column.en_erken.isoformat() if column.en_erken else None),
        ("x-en-gec", column.en_gec.isoformat() if column.en_gec else None),
    ]
    for key, value in optional_keys:
        if value is not None:
            prop[key] = value
    if column.benzersiz:
        prop["x-benzersiz"] = True
    if column.ornek is not None:
        prop["examples"] = [column.ornek]
    return prop


def _column_from_property(name: str, spec: dict[str, Any]) -> Column:
    unknown = sorted(set(spec) - _PROPERTY_KEYS)
    if unknown:
        raise ValueError(f"'{name}' sütununda desteklenmeyen anahtar: {', '.join(unknown)}")
    raw_type = spec.get("type", "string")
    types = raw_type if isinstance(raw_type, list) else [raw_type]
    nullable = "null" in types
    base = [t for t in types if t != "null"]
    if len(base) != 1:
        raise ValueError(f"'{name}' sütununun türü tek olmalı (null hariç): {raw_type}")
    by_json = {"integer": "tam_sayi", "number": "ondalik", "boolean": "mantiksal"}
    fmt = spec.get("format")
    kind = by_json.get(base[0]) or {"date": "tarih", "date-time": "zaman"}.get(str(fmt), "metin")
    examples = spec.get("examples") or [None]
    return Column(
        ad=name,
        tur=kind,
        aciklama=spec.get("description", ""),
        zorunlu=not nullable,
        benzersiz=bool(spec.get("x-benzersiz", False)),
        en_az=spec.get("minimum"),
        en_cok=spec.get("maximum"),
        en_kisa=spec.get("minLength"),
        en_uzun=spec.get("maxLength"),
        desen=spec.get("pattern"),
        izinli=None if spec.get("enum") is None else [v for v in spec["enum"] if v is not None],
        denetim=spec.get("x-denetim"),
        en_erken=spec.get("x-en-erken"),
        en_gec=spec.get("x-en-gec"),
        ornek=examples[0],
    )


def save_contract(contract: TableContract, path: Path) -> None:
    """Sözleşmeyi JSON Schema olarak yazar (``<tablo>.sema.json``)."""
    write_text_atomic(path, json_text(contract.to_json_schema()))


def load_contract(path: Path) -> TableContract:
    """``.sema.json`` dosyasını okur."""
    data = read_json(path)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: JSON nesnesi bekleniyordu.")
    return TableContract.from_json_schema(data)
