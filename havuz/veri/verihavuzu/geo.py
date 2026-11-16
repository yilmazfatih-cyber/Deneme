"""Coğrafya yardımcıları: il, ilçe, plaka kodu, posta kodu ve telefon alan kodu tutarlılığı.

Veri ``tr/iller.json`` ve ``tr/ilceler.json`` dosyalarından gelir (doğrulama kayıtları yanlarında).
Bilinen kural: posta kodu 5 hanelidir ve ilk iki hanesi ilin plaka kodudur (34xxx → İstanbul).
Kalan üç hane burada DENETLENMEZ: posta kodunun gerçekten var olduğunu söylemez.
Genişletme: yeni bir tutarlılık kuralı için ``x_matches_province`` biçiminde bir işlev ekleyin ve
``kalite/checks.py`` içindeki ``VALIDATORS`` sözlüğüne kaydedin.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from verihavuzu.reference import load
from verihavuzu.text import match_key

Row = dict[str, Any]

REGIONS = (
    "Akdeniz",
    "Doğu Anadolu",
    "Ege",
    "Güneydoğu Anadolu",
    "İç Anadolu",
    "Karadeniz",
    "Marmara",
)


@lru_cache(maxsize=1)
def _by_plate() -> dict[int, Row]:
    return {row["plaka"]: row for row in load("iller")}


@lru_cache(maxsize=1)
def _by_name_key() -> dict[str, int]:
    index: dict[str, int] = {}
    for row in load("iller"):
        for name in (row["ad"], *row["diger_adlar"]):
            index[match_key(name)] = row["plaka"]
    return index


@lru_cache(maxsize=1)
def _districts_by_plate() -> dict[int, tuple[str, ...]]:
    grouped: dict[int, list[str]] = {}
    for row in load("ilceler"):
        grouped.setdefault(row["plaka"], []).append(row["ilce"])
    return {plate: tuple(names) for plate, names in grouped.items()}


@lru_cache(maxsize=1)
def _plate_by_area_code() -> dict[int, int]:
    return {code: row["plaka"] for row in load("iller") for code in row["alan_kodlari"]}


def provinces() -> list[Row]:
    """81 ilin kayıtları (plaka sırasıyla)."""
    return load("iller")


def province(plate: int) -> Row:
    """Plaka koduna göre il kaydı. Geçersiz plaka için ``KeyError``."""
    try:
        return dict(_by_plate()[plate])
    except KeyError:
        raise KeyError(f"Geçersiz plaka kodu: {plate} (1–81 arası olmalı).") from None


def find_province(name: str) -> Row | None:
    """Ada göre il bulur; büyük/küçük harf, Türkçe karakter ve eski adlar hoş görülür.

    ``find_province("ISTANBUL")``, ``find_province("istanbul")``, ``find_province("İçel")`` çalışır.
    """
    plate = _by_name_key().get(match_key(name))
    return None if plate is None else province(plate)


def plate_code(plate: int) -> str:
    """Plaka kodunu iki haneli metin olarak verir: 6 → "06"."""
    if plate not in _by_plate():
        raise KeyError(f"Geçersiz plaka kodu: {plate} (1–81 arası olmalı).")
    return f"{plate:02d}"


def districts(plate: int) -> list[str]:
    """İlin ilçe adları (Türk alfabesine göre sıralı)."""
    plate_code(plate)
    return list(_districts_by_plate()[plate])


def is_district_of(district: str, plate: int) -> bool:
    """Bu ilçe bu ile mi bağlı? (Büyük/küçük harf ve Türkçe karakter hoş görülür.)"""
    key = match_key(district)
    return any(match_key(name) == key for name in _districts_by_plate().get(plate, ()))


def is_postal_code(value: str) -> bool:
    """5 haneli ve ilk iki hanesi geçerli bir plaka kodu olan posta kodu biçimi mi?"""
    return len(value) == 5 and value.isascii() and value.isdigit() and 1 <= int(value[:2]) <= 81


def province_of_postal_code(value: str) -> Row | None:
    """Posta kodunun ait olduğu il (ilk iki haneden). Biçim bozuksa ``None``."""
    return province(int(value[:2])) if is_postal_code(value) else None


def postal_code_matches_province(postal_code: str, plate: int) -> bool:
    """Posta kodu bu ilin koduyla mı başlıyor?"""
    return is_postal_code(postal_code) and int(postal_code[:2]) == plate


def province_of_area_code(area_code: int) -> Row | None:
    """Sabit hat alan kodunun ait olduğu il (212 ve 216 → İstanbul)."""
    plate = _plate_by_area_code().get(area_code)
    return None if plate is None else province(plate)
