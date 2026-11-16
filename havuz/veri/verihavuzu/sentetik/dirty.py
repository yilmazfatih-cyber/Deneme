"""Kirli veri kipi: temiz tabloya İZLENEBİLİR bozulmalar uygular (temizleme alıştırması ve testi).

Bozulmalar: eksik değer, yinelenen satır, yazım hatası, karışık tarih biçimi, ondalık virgül/nokta
karışıklığı, bozuk kodlama (mojibake: "İ" → "Ä°"), baştaki/sondaki/çift boşluk.
Çıktı üç parçadır: ``temiz`` (metin olarak temiz satırlar), ``kirli`` (bozulmuş satırlar,
yinelenenler dahil) ve ``kayitlar`` (her bozulmanın satırı, sütunu, türü, temiz ve kirli değeri).
Kirli satır k'nin temiz karşılığı: k − (k'den önceki yineleme satırı sayısı). Temizleme tarafı:
``kalite/clean.py``. Genişletme: yeni bozulma için ``KINDS``e ekleyin, ``_corrupt`` içinde
uygulayın, ``kalite/clean.py``ye (geri alınabiliyorsa) temizleyicisini yazın.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from verihavuzu.calendar_tr import format_date_tr
from verihavuzu.files import cell_text
from verihavuzu.sentetik.base import Rng, Row
from verihavuzu.text import fold_ascii, upper_tr

KINDS = ["eksik", "yineleme", "yazim_hatasi", "tarih_bicimi", "ondalik", "mojibake", "bosluk"]
MISSING_TOKENS = ["", "NULL", "-", "yok", "N/A", "nan"]
DATE_STYLES = ["noktali", "egik", "uzun", "uzun_gunlu", "bitisik"]
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_INT = re.compile(r"-?\d+")
_DEC = re.compile(r"-?\d+\.\d+")
_TURKISH = re.compile(r"[çğıöşüÇĞİÖŞÜ]")


@dataclass
class DirtyResult:
    temiz: list[Row]
    kirli: list[Row]
    kayitlar: list[Row]


def column_kind(values: Sequence[str]) -> str:
    """Metin değerlerden sütun türü: tarih, ondalik, tam_sayi ya da metin."""
    present = [value for value in values if value != ""]
    if not present:
        return "metin"
    if all(_ISO_DATE.fullmatch(value) for value in present):
        return "tarih"
    if all(_INT.fullmatch(value) for value in present):
        return "tam_sayi"
    if all(_INT.fullmatch(value) or _DEC.fullmatch(value) for value in present):
        return "ondalik"
    return "metin"


def mojibake(text: str) -> str | None:
    """UTF-8 metni yanlışlıkla Windows-1252 diye okunmuş gibi bozar ("İstanbul" → "Ä°stanbul")."""
    try:
        broken = text.encode("utf-8").decode("cp1252")
    except UnicodeDecodeError:
        return None
    return broken if broken != text else None


def _typo(rng: Rng, text: str) -> tuple[str, str] | None:
    options = []
    if len(text) >= 3:
        options += ["harf_degisimi", "harf_tekrari"]
    if len(text) >= 4:
        options.append("harf_dusmesi")
    if _TURKISH.search(text):
        options += ["ascii", "ascii"]
    if "i" in text or "İ" in text:
        options.append("buyuk_harf_hatasi")
    if not options:
        return None
    kind = rng.choice(options)
    if kind == "ascii":
        return fold_ascii(text), kind
    if kind == "buyuk_harf_hatasi":  # Türkçe kural bilmeyen .upper() sonucu: "İzmir" → "IZMIR"
        return upper_tr(text).replace("İ", "I"), kind
    position = rng.randint(1, len(text) - 2)
    if kind == "harf_degisimi":
        chars = list(text)
        chars[position], chars[position + 1] = chars[position + 1], chars[position]
        swapped = "".join(chars)
        return (swapped, kind) if swapped != text else None
    if kind == "harf_tekrari":
        return text[: position + 1] + text[position:], kind
    return text[:position] + text[position + 1 :], kind


def _decimal_variant(rng: Rng, text: str) -> tuple[str, str]:
    value = Decimal(text)
    if abs(value) < 1000 or rng.bernoulli(0.3):
        return text.replace(".", ","), "virgul"
    whole, cents = f"{abs(value):,.2f}".split(".")
    sign = "-" if value < 0 else ""
    style = rng.choice(["binlik_tr", "binlik_en", "bosluklu"])
    if style == "binlik_tr":
        return f"{sign}{whole.replace(',', '.')},{cents}", style
    if style == "binlik_en":
        return f"{sign}{whole}.{cents}", style
    return f"{sign}{whole.replace(',', ' ')},{cents}", style


def _whitespace(rng: Rng, text: str) -> tuple[str, str]:
    style = rng.choice(["bas", "son", "iki_yan", "nbsp"] + (["ic_cift"] if " " in text else []))
    if style == "bas":
        return " " + text, style
    if style == "son":
        return text + "  ", style
    if style == "iki_yan":
        return "  " + text + " ", style
    if style == "nbsp":
        return text + "\u00a0", style
    return text.replace(" ", "  ", 1), style


def _corrupt(rng: Rng, kind_of_column: str, text: str) -> tuple[str, str, str] | None:
    """(kirli değer, bozulma türü, ayrıntı) ya da uygulanamıyorsa None."""
    options = ["eksik", "bosluk"]
    if kind_of_column == "metin":
        options += ["yazim_hatasi", "yazim_hatasi"] + (
            ["mojibake"] if _TURKISH.search(text) else []
        )
    elif kind_of_column == "tarih":
        options += ["tarih_bicimi", "tarih_bicimi"]
    elif kind_of_column == "ondalik":
        options += ["ondalik", "ondalik"]
    kind = rng.choice(options)
    if kind == "eksik":
        token = rng.choice(MISSING_TOKENS)
        return token, kind, f"'{token}'"
    if kind == "bosluk":
        spaced, style = _whitespace(rng, text)
        return spaced, kind, style
    if kind == "yazim_hatasi":
        typo = _typo(rng, text)
        return None if typo is None else (typo[0], kind, typo[1])
    if kind == "mojibake":
        broken = mojibake(text)
        return None if broken is None else (broken, kind, "utf8_cp1252")
    if kind == "tarih_bicimi":
        style = rng.choice(DATE_STYLES)
        return format_date_tr(date.fromisoformat(text), style), kind, style
    variant, style = _decimal_variant(rng, text)
    return variant, kind, style


def make_dirty(
    rows: Sequence[Row],
    seed: int,
    *,
    rate: float = 0.08,
    duplicate_rate: float | None = None,
    protected: Sequence[str] = (),
) -> DirtyResult:
    """Satırları bozar. ``rate``: hücre başına bozulma olasılığı; ``protected``: dokunulmayacak
    sütunlar (ör. kimlik sütunları). Yineleme oranı verilmezse ``rate / 2`` alınır."""
    rng = Rng(seed, "kirli")
    clean = [{key: cell_text(value) for key, value in row.items()} for row in rows]
    columns = list(clean[0]) if clean else []
    kinds = {name: column_kind([row[name] for row in clean]) for name in columns}
    dup_rate = rate / 2 if duplicate_rate is None else duplicate_rate
    copies_after: dict[int, list[int]] = {}
    for index in range(len(clean)):
        r = rng.child(f"yineleme/{index}")
        if r.bernoulli(dup_rate):  # kopya, kaynağından 0–25 satır sonra yer alır
            target = min(len(clean) - 1, index + r.randint(0, 25))
            copies_after.setdefault(target, []).append(index)
    order: list[tuple[int, bool]] = []
    for index in range(len(clean)):
        order.append((index, False))
        order.extend((source, True) for source in copies_after.get(index, []))
    dirty: list[Row] = []
    log: list[Row] = []
    first_position: dict[int, int] = {}
    for number, (index, is_copy) in enumerate(order, start=1):
        row = dict(clean[index])
        if is_copy:
            log.append(
                {
                    "satir": number,
                    "sutun": None,
                    "bozulma": "yineleme",
                    "ayrinti": "kopya",
                    "temiz": None,
                    "kirli": None,
                    "kaynak_satir": first_position[index],
                }
            )
        else:
            first_position[index] = number
        r = rng.child(f"hucre/{number}")
        for name in columns:
            if name in protected or row[name] == "" or not r.bernoulli(rate):
                continue
            result = _corrupt(r, kinds[name], row[name])
            if result is None:
                continue
            new_value, kind, detail = result
            log.append(
                {
                    "satir": number,
                    "sutun": name,
                    "bozulma": kind,
                    "ayrinti": detail,
                    "temiz": row[name],
                    "kirli": new_value,
                    "kaynak_satir": None,
                }
            )
            row[name] = new_value
        dirty.append(row)
    return DirtyResult(temiz=clean, kirli=dirty, kayitlar=log)
