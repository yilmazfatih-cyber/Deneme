"""Temizleme: boşluk, bozuk kodlama (mojibake), eksik değer işaretleri, tarih ve sayı biçimleri,
birebir yinelenen satırlar. Her değişiklik kaydedilir (geri izlenebilir).

``clean_rows(rows)`` sütun türlerini kendisi sezer (``profile.infer_type``) ya da ``kinds`` ile
alır; tarih sütunlarını ISO'ya ("2026-11-16"), sayı sütunlarını düz yazıma ("1234.50") çevirir.
Yazım hatalarını DÜZELTMEZ (doğrusunu bilemez); onlar için ``dedupe`` ve elle gözden geçirme.
Kirli kipin (``sentetik/dirty.py``) her geri alınabilir bozulması burada geri alınır; test bunu
satır satır doğrular (``tests/test_kalite.py``).
Genişletme: yeni bir temizleyici için ``clean_value`` içine sırası doğru bir adım ekleyin ve
temiz değerlere dokunmadığını sınayın.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from verihavuzu.calendar_tr import parse_date_tr
from verihavuzu.kalite.values import canonical_number, is_missing

Row = dict[str, Any]
_MOJIBAKE_MARKERS = re.compile(r"[ÃÄÅÂ][\x80-\xbf\u0152-\u2122]|â€")
_SPACES = re.compile(r"[ \t\u00a0]+")
_TOKEN = re.compile(r"[^ \t\u00a0]+")


def _repair_token(match: re.Match[str]) -> str:
    token = match.group()
    if not _MOJIBAKE_MARKERS.search(token):
        return token
    for encoding in ("cp1252", "latin-1"):
        try:
            return token.encode(encoding).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return token


def fix_mojibake(text: str) -> str:
    """UTF-8 baytları Windows-1252/Latin-1 diye okunmuş metni onarır: "Ä°stanbul" → "İstanbul".

    Boşlukla ayrılmış her parça ayrı denenir; yalnız tipik bozulma izi taşıyan parçaya dokunulur,
    onarılamayan parça olduğu gibi kalır.
    """
    return _TOKEN.sub(_repair_token, text) if _MOJIBAKE_MARKERS.search(text) else text


def normalize_spaces(text: str) -> str:
    """Baştaki/sondaki boşluğu atar; bölünmez boşluğu ve boşluk dizilerini tek boşluğa indirir."""
    return _SPACES.sub(" ", text).strip()


def clean_value(value: Any, kind: str = "metin") -> str | None:
    """Tek değeri temizler. Eksikse ``None``; türe çevrilemiyorsa temizlenmiş metni döndürür."""
    if value is None:
        return None
    text = normalize_spaces(fix_mojibake(str(value)))
    if is_missing(text):
        return None
    if kind == "tarih":
        day = parse_date_tr(text)
        return day.isoformat() if day else text
    if kind in ("ondalik", "tam_sayi"):
        number = canonical_number(text)
        return number if number is not None else text
    return text


@dataclass
class CleanResult:
    satirlar: list[Row]
    degisiklikler: list[Row] = field(default_factory=list)
    atilan_yinelenenler: list[int] = field(default_factory=list)
    turler: dict[str, str] = field(default_factory=dict)


def _kind_for(values: Sequence[Any]) -> str:
    from verihavuzu.kalite.profile import infer_type  # döngüsel içe aktarmayı önler

    present = [normalize_spaces(fix_mojibake(str(v))) for v in values if not is_missing(v)]
    kind, _ = infer_type([v for v in present if v])
    return {"tam_sayi": "tam_sayi", "ondalik": "ondalik", "tarih": "tarih"}.get(kind, "metin")


def clean_rows(
    rows: Sequence[Row],
    kinds: dict[str, str] | None = None,
    *,
    drop_exact_duplicates: bool = True,
    max_changes: int = 100_000,
) -> CleanResult:
    """Bütün tabloyu temizler ve her değişikliği ``degisiklikler`` listesine yazar."""
    columns = list(dict.fromkeys(key for row in rows for key in row))
    resolved = {c: (kinds or {}).get(c) or _kind_for([row.get(c) for row in rows]) for c in columns}
    cleaned: list[Row] = []
    changes: list[Row] = []
    for number, row in enumerate(rows, start=1):
        new_row: Row = {}
        for column in columns:
            before = row.get(column)
            after = clean_value(before, resolved[column])
            new_row[column] = after
            changed = after != before and not (after is None and before in (None, ""))
            if changed and len(changes) < max_changes:
                changes.append({"satir": number, "sutun": column, "once": before, "sonra": after})
        cleaned.append(new_row)
    dropped: list[int] = []
    if drop_exact_duplicates:
        seen: set[tuple[Any, ...]] = set()
        kept: list[Row] = []
        for number, row in enumerate(cleaned, start=1):
            key = tuple(row[c] for c in columns)
            if key in seen:
                dropped.append(number)
                continue
            seen.add(key)
            kept.append(row)
        cleaned = kept
    return CleanResult(cleaned, changes, dropped, resolved)
