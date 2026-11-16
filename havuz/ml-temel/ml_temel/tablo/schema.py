"""Şema sezme: her sütunun türü, görev türü (sınıflandırma/regresyon) ve pozitif sınıf.

Sütun türleri ve kuralları (hepsi rapora gerekçesiyle yazılır):
  sayisal   bütün dolu hücreler sayı
  tarih     dolu metin hücrelerinin %95'i aynı tarih biçiminde (gg.aa.yyyy, yyyy-aa-gg, gg/aa/yyyy)
  metin     uzun serbest metin (ortalama ≥ 3 kelime ve çok sayıda farklı değer) → TF-IDF
  kategori  diğer metin sütunları (şehir, paket, ödeme türü…)
  kimlik    her satırda farklı değer + adı "id/no/kod/numara" içeriyor ya da metin ve boşluksuz
            → modele ALINMAZ (ezber ve sızıntı kaynağı)
  sabit     tek bir değer → modele alınmaz
Görev: hedef metinse ya da en çok 10 farklı tam sayıdan oluşuyorsa sınıflandırma, yoksa regresyon.
Genişletme: yeni bir tür için `infer_column` içine bir kural ve `tablo/model.py`'ye bir hazırlık
ekleyin.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np

from ml_temel.ortak.turkish import lower_tr
from ml_temel.ortak.types import Array

DATE_FORMATS = (
    "%d.%m.%Y",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d.%m.%Y %H:%M",
    "%d.%m.%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
)
_ID_WORDS = frozenset({"id", "no", "numara", "numarası", "kod", "kodu", "kimlik", "tc", "uuid"})
_POSITIVE_WORDS = ("1", "1.0", "evet", "e", "var", "doğru", "true", "yes", "pozitif", "kayıp")
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class ColumnInfo:
    """Bir sütunun sezilen türü ve gerekçesi."""

    name: str
    kind: str
    missing_rate: float
    n_unique: int
    note: str


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def _parse_day(text: str, formats: tuple[str, ...]) -> float | None:
    """Metni verilen biçimleri sırayla deneyerek "1970'ten beri gün"e çevirir."""
    for fmt in formats:
        try:
            moment = datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
        return (moment - _EPOCH).total_seconds() / 86400.0
    return None


def parse_dates(values: Array, threshold: float = 0.95) -> Array | None:
    """Metin sütununu "1970'ten beri gün" sayısına çevirir; tarih sütunu değilse None.

    Baskın biçim ilk 200 dolu hücreden seçilir; o biçime uymayan hücrelerde diğer biçimler denenir.
    """
    present = [str(v).strip() for v in values.tolist() if not _is_missing(v)]
    if not present:
        return None
    sample = present[:200]
    hits = {
        fmt: sum(_parse_day(text, (fmt,)) is not None for text in sample) for fmt in DATE_FORMATS
    }
    best = max(DATE_FORMATS, key=lambda fmt: hits[fmt])
    if hits[best] == 0 or hits[best] < threshold * len(sample):
        return None
    ordered = (best, *[fmt for fmt in DATE_FORMATS if fmt != best])
    days = np.full(values.shape[0], np.nan)
    for position, value in enumerate(values.tolist()):
        if not _is_missing(value):
            day = _parse_day(str(value).strip(), ordered)
            days[position] = np.nan if day is None else day
    return days if np.isfinite(days).sum() >= threshold * len(present) else None


def _name_words(name: str) -> set[str]:
    return set(re.split(r"[^\w]+|_", lower_tr(name))) - {""}


def infer_column(name: str, values: Array) -> ColumnInfo:
    """Tek bir sütunun türünü sezer."""
    n_rows = values.shape[0]
    if values.dtype.kind == "f":
        present = values[~np.isnan(values)]
        missing = 1.0 - present.size / max(n_rows, 1)
        unique = int(np.unique(present).size)
        if unique <= 1:
            return ColumnInfo(name, "sabit", missing, unique, "tek değer")
        integers = bool(np.all(present == np.round(present)))
        if integers and unique == present.size and n_rows > 20 and _name_words(name) & _ID_WORDS:
            return ColumnInfo(name, "kimlik", missing, unique, "her satırda farklı numara")
        return ColumnInfo(name, "sayisal", missing, unique, "sayı")
    present_text = [str(v) for v in values.tolist() if not _is_missing(v)]
    missing = 1.0 - len(present_text) / max(n_rows, 1)
    unique = len(set(present_text))
    if unique <= 1:
        return ColumnInfo(name, "sabit", missing, unique, "tek değer")
    if parse_dates(values) is not None:
        return ColumnInfo(name, "tarih", missing, unique, "tarih biçimi")
    words = float(np.mean([len(text.split()) for text in present_text]))
    ratio = unique / max(len(present_text), 1)
    if ratio > 0.95 and n_rows > 20 and (words < 1.5 or _name_words(name) & _ID_WORDS):
        return ColumnInfo(name, "kimlik", missing, unique, "her satırda farklı değer")
    if words >= 3.0 and ratio >= 0.3:
        return ColumnInfo(
            name, "metin", missing, unique, f"serbest metin (ort. {words:.1f} kelime)"
        )
    return ColumnInfo(name, "kategori", missing, unique, f"{unique} farklı değer")


def infer_task(target: Array) -> str:
    """'siniflandirma' ya da 'regresyon'."""
    if target.dtype.kind != "f":
        return "siniflandirma"
    present = target[~np.isnan(target)]
    unique = np.unique(present)
    if unique.size <= 10 and bool(np.all(unique == np.round(unique))):
        return "siniflandirma"
    return "regresyon"


def label_text(value: Any) -> str:
    """Sınıf etiketini rapor ve CSV için metne çevirir (1.0 → "1")."""
    if isinstance(value, (float, np.floating)) and float(value).is_integer():
        return str(int(value))
    return str(value)


def choose_positive(classes: Array, counts: Array) -> Any:
    """İkili hedefte 'pozitif' sınıf: tanıdık bir "evet" sözcüğü, yoksa az görülen sınıf."""
    texts = [lower_tr(label_text(c)) for c in classes.tolist()]
    for word in _POSITIVE_WORDS:
        if word in texts:
            return classes[texts.index(word)]
    return classes[int(np.argmin(counts))]
