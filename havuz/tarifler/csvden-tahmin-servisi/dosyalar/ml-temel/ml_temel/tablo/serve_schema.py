"""Tahmin servisinin girdi şeması: istek gövdesini modelin beklediği sütunlara göre SIKI doğrular.

Şema model dosyasından kurulur (eğitimde sezilen sütun türleri, `sonuclar.sutunlar`):
  sayisal → JSON sayısı ya da null (metin "12,5" kabul EDİLMEZ; NaN/Infinity yazılamaz)
  kategori, metin → JSON metni ya da null (baştaki/sondaki boşluk eğitimdeki gibi atılır)
  tarih → "gg.aa.yyyy" ya da "yyyy-aa-gg" gibi tanınan bir tarih metni ya da null
Her satırda modelin BÜTÜN girdi alanları bulunmalı (bilinmiyorsa null yazılır); bilinmeyen alan
reddedilir (yazım hatası sessizce "eksik değer" olmasın). `_kimlik` alanı isteğe bağlıdır ve yanıtta
aynen geri döner. Hatalar `InputError.details` içinde alan yoluyla listelenir.
Genişletme: yeni bir sütun türü → `_KINDS`'e eşlem + `_cell` içinde dönüşüm + tests/test_serve.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.tablo.csv_reader import is_missing_token
from ml_temel.tablo.messages import t
from ml_temel.tablo.model import TabularModel
from ml_temel.tablo.schema import parse_dates

ID_FIELD = "_kimlik"
MAX_ROWS = 1000
MAX_TEXT = 2000
MAX_ID = 100
MAX_DETAILS = 50
_KINDS = {"sayisal": "sayi", "kategori": "metin", "metin": "metin", "tarih": "tarih"}


class InputError(ValueError):
    """Gövde şemaya uymuyor; `details` = [{"yol": "satirlar[0].yas", "ileti": "..."}]."""

    def __init__(self, message: str, details: list[dict[str, str]] | None = None) -> None:
        super().__init__(message)
        self.details = details or []


@dataclass(frozen=True)
class Field:
    name: str
    kind: str  # "sayi" | "metin" | "tarih"


@dataclass(frozen=True)
class InputSchema:
    fields: tuple[Field, ...]

    @classmethod
    def from_model(cls, model: TabularModel, extra: dict[str, Any]) -> InputSchema:
        """Modelin girdi sütunları + model dosyasındaki sütun türleri."""
        columns = extra.get("sonuclar", {}).get("sutunlar", [])
        kinds = {c.get("ad"): c.get("tur") for c in columns if isinstance(c, dict)}
        fields = []
        for name in model.input_columns:
            kind = _KINDS.get(str(kinds.get(name)))
            if kind is None:
                raise ValueError(t("sunucu_tur_bilinmiyor", sutun=name))
            fields.append(Field(name, kind))
        return cls(tuple(fields))

    def describe(self) -> dict[str, Any]:
        """`GET /sema` yanıtı."""
        return {
            "alanlar": [{"ad": f.name, "tur": f.kind, "bos_olabilir": True} for f in self.fields],
            "kimlik_alani": ID_FIELD,
            "en_cok_satir": MAX_ROWS,
        }

    def validate(self, body: Any) -> tuple[Table, list[Any]]:
        """Gövdeyi doğrular; (modelin okuyacağı tablo, satır kimlikleri) döndürür."""
        if not isinstance(body, dict) or set(body) != {"satirlar"}:
            raise InputError(t("sunucu_govde_bicimi"))
        rows = body["satirlar"]
        if not isinstance(rows, list) or not rows:
            raise InputError(t("sunucu_satir_yok"))
        if len(rows) > MAX_ROWS:
            raise InputError(t("sunucu_cok_satir", sinir=MAX_ROWS, sayi=len(rows)))
        problems: list[dict[str, str]] = []
        columns: dict[str, list[Any]] = {f.name: [] for f in self.fields}
        ids = [self._row(index, row, columns, problems) for index, row in enumerate(rows)]
        if problems:
            raise InputError(t("sunucu_gecersiz", sayi=len(problems)), problems[:MAX_DETAILS])
        return Table({f.name: _array(f, columns[f.name]) for f in self.fields}), ids

    def _row(
        self, index: int, row: Any, columns: dict[str, list[Any]], problems: list[dict[str, str]]
    ) -> Any:
        path = f"satirlar[{index}]"
        if not isinstance(row, dict):
            problems.append({"yol": path, "ileti": t("sunucu_satir_nesne")})
            return None
        expected = {f.name for f in self.fields}
        for unknown in sorted(set(row) - expected - {ID_FIELD}):
            problems.append({"yol": f"{path}.{unknown}", "ileti": t("sunucu_bilinmeyen_alan")})
        for field in self.fields:
            if field.name not in row:
                problems.append({"yol": f"{path}.{field.name}", "ileti": t("sunucu_eksik_alan")})
                columns[field.name].append(None)
                continue
            value, message = _cell(field, row[field.name])
            if message:
                problems.append({"yol": f"{path}.{field.name}", "ileti": message})
            columns[field.name].append(value)
        row_id = row.get(ID_FIELD)
        valid_id = isinstance(row_id, str | int) and not isinstance(row_id, bool)
        if row_id is not None and not (valid_id and len(str(row_id)) <= MAX_ID):
            problems.append({"yol": f"{path}.{ID_FIELD}", "ileti": t("sunucu_kimlik")})
        return row_id


def _array(field: Field, values: list[Any]) -> Any:
    """Sütunu CSV okuyucusunun ürettiği biçime çevirir: sayı → float64 (NaN), diğer → object."""
    if field.kind == "sayi":
        return np.array([math.nan if v is None else v for v in values], dtype=np.float64)
    array = np.empty(len(values), dtype=object)
    array[:] = values
    return array


def _cell(field: Field, value: Any) -> tuple[Any, str]:
    """Tek hücre: (modelin göreceği değer, hata iletisi ya da "")."""
    if value is None:
        return None, ""
    if field.kind == "sayi":
        if isinstance(value, bool) or not isinstance(value, int | float):
            return None, t("sunucu_sayi_olmali")
        if not math.isfinite(float(value)):
            return None, t("sunucu_sayi_olmali")
        return float(value), ""
    if not isinstance(value, str):
        return None, t("sunucu_metin_olmali")
    if len(value) > MAX_TEXT:
        return None, t("sunucu_metin_uzun", sinir=MAX_TEXT)
    text = value.strip()
    if is_missing_token(text):
        return None, ""
    if field.kind == "tarih":
        days = parse_dates(np.array([text], dtype=object), threshold=0.0)
        if days is None or not np.isfinite(days[0]):
            return None, t("sunucu_tarih_olmali")
    return text, ""
