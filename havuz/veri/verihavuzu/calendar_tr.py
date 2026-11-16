"""Türkçe takvim yardımcıları: ay/gün adları, sabit resmî tatiller, tarih yazma ve okuma.

Veri ``tr/aylar.json``, ``tr/gunler.json`` ve ``tr/resmi_tatiller.json`` dosyalarından gelir.
DİNÎ BAYRAMLAR YOKTUR (Hicrî takvime ve resmî ilana bağlıdır; bkz. docs/BASVURU_VERILERI.md).
Tarih okurken gün her zaman aydan ÖNCE kabul edilir (Türkiye yazımı): "03/04/2025" = 3 Nisan.
Genişletme: yeni bir yazım biçimi için ``DATE_STYLES`` sözlüğüne ekleyin ve ``parse_date_tr``
içindeki desen listesine karşılığını yazın; ikisi birlikte test edilir.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import date
from functools import lru_cache
from typing import Any

from verihavuzu.reference import load
from verihavuzu.text import lower_tr

Row = dict[str, Any]

FIRST_SUPPORTED_HOLIDAY_YEAR = 2017


@lru_cache(maxsize=1)
def _months() -> tuple[Row, ...]:
    return tuple(load("aylar"))


@lru_cache(maxsize=1)
def _days() -> tuple[Row, ...]:
    return tuple(load("gunler"))


@lru_cache(maxsize=1)
def _month_number_by_name() -> dict[str, int]:
    index: dict[str, int] = {}
    for row in _months():
        index[lower_tr(row["ad"])] = row["no"]
        index[lower_tr(row["kisaltma"])] = row["no"]
    return index


def month_name(month: int) -> str:
    """Ayın adı: 11 → "Kasım"."""
    if not 1 <= month <= 12:
        raise ValueError(f"Ay 1–12 arasında olmalı: {month}")
    return str(_months()[month - 1]["ad"])


def month_abbr(month: int) -> str:
    """Ayın üç harfli kısaltması: 11 → "Kas"."""
    month_name(month)
    return str(_months()[month - 1]["kisaltma"])


def day_name(day: date) -> str:
    """Tarihin gün adı: 2026-11-16 → "Pazartesi"."""
    return str(_days()[day.weekday()]["ad"])


def is_weekend(day: date) -> bool:
    """Cumartesi ya da Pazar mı?"""
    return day.weekday() >= 5


def fixed_holidays(year: int, *, include_half_days: bool = False) -> list[Row]:
    """Verilen yılın sabit tarihli resmî tatilleri: ``[{"tarih": date, "ad": …, "tur": …}]``.

    Yalnız 2017 ve sonrası için tanımlıdır; dinî bayramları İÇERMEZ.
    """
    if year < FIRST_SUPPORTED_HOLIDAY_YEAR:
        raise ValueError(
            f"Sabit tatil listesi {FIRST_SUPPORTED_HOLIDAY_YEAR} ve sonrası için geçerlidir "
            f"(istenen yıl: {year}). Daha eski yıllarda tatil günleri farklıydı."
        )
    result: list[Row] = []
    for row in load("resmi_tatiller"):
        if row["tur"] == "yarim_gun" and not include_half_days:
            continue
        day = date(year, row["ay"], row["gun"])
        result.append({"tarih": day, "ad": row["ad"], "tur": row["tur"]})
    return result


def is_fixed_holiday(day: date) -> bool:
    """Tam gün sabit resmî tatil mi? (Dinî bayramlar ve idari izinler bilinmez.)"""
    return any(item["tarih"] == day for item in fixed_holidays(day.year))


def _long(day: date) -> str:
    return f"{day.day} {month_name(day.month)} {day.year}"


DATE_STYLES: dict[str, Callable[[date], str]] = {
    "iso": lambda d: d.isoformat(),  # 2026-11-16
    "noktali": lambda d: f"{d.day:02d}.{d.month:02d}.{d.year}",  # 16.11.2026
    "egik": lambda d: f"{d.day:02d}/{d.month:02d}/{d.year}",  # 16/11/2026
    "uzun": _long,  # 16 Kasım 2026
    "uzun_gunlu": lambda d: f"{_long(d)} {day_name(d)}",  # 16 Kasım 2026 Pazartesi
    "bitisik": lambda d: f"{d.year}{d.month:02d}{d.day:02d}",  # 20261116
}


def format_date_tr(day: date, style: str = "uzun") -> str:
    """Tarihi seçilen biçimde yazar. Biçimler: ``DATE_STYLES`` anahtarları."""
    try:
        return DATE_STYLES[style](day)
    except KeyError:
        options = ", ".join(DATE_STYLES)
        raise ValueError(f"Bilinmeyen tarih biçimi: {style}. Seçenekler: {options}") from None


_ISO = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?")
_YMD_SLASH = re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})")
_DMY = re.compile(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})")
_COMPACT = re.compile(r"(\d{4})(\d{2})(\d{2})")
_LONG = re.compile(r"(\d{1,2})\s+([^\W\d_]+)\s+(\d{4})(?:\s+[^\W\d_]+)?", re.UNICODE)


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_date_tr(text: str) -> date | None:
    """Karışık biçimli tarihi okur; okunamıyorsa ``None`` döner (hata fırlatmaz).

    Tanınanlar: 2026-11-16, 2026/11/16, 16.11.2026, 16/11/2026, 16-11-2026, 20261116,
    "16 Kasım 2026", "16 Kas 2026", "16 Kasım 2026 Pazartesi". İki haneli yıl okunmaz (belirsiz).
    """
    value = " ".join(text.split())
    for pattern in (_ISO, _YMD_SLASH, _COMPACT):
        match = pattern.fullmatch(value)
        if match:
            return _safe_date(int(match[1]), int(match[2]), int(match[3]))
    match = _DMY.fullmatch(value)
    if match:
        return _safe_date(int(match[3]), int(match[2]), int(match[1]))
    match = _LONG.fullmatch(value)
    if match:
        month = _month_number_by_name().get(lower_tr(match[2]))
        if month is not None:
            return _safe_date(int(match[3]), month, int(match[1]))
    return None
