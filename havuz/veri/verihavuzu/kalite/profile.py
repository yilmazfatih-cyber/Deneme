"""Sütun profili: tür sezme, eksiklik, tekillik, dağılım özeti, aykırı değer, desen ve
kişisel veri ipucu.

``profile_table(rows)`` her sütun için bir sözlük üretir; ``report.profile_markdown`` bunu Türkçe
rapora çevirir. Türler: tam_sayi, ondalik, mantiksal, tarih, zaman, kod (rakamdan oluşan kimlik:
sabit uzunluklu ya da başında 0 olan; sayısal özet anlamsız olduğu için ayrı tutulur), metin.
"kod": tüm değerler rakam (başta "+" olabilir) ve başında 0/+ olan var ya da hepsi aynı uzunlukta
(≥ 5 hane) — bu bir sezgidir, yanılabilir. Diğer türler eksik olmayan değerlerin en az %95'i
o türe uyuyorsa seçilir; uymayanlar "tur_uyumsuz"
olarak sayılır. Aykırı değer iki yolla sayılır: IQR çitleri (Q1 − 1,5·IQR, Q3 + 1,5·IQR) ve
sağlam z (|x − ortanca| / (1,4826·MAD) > 3,5).
Genişletme: yeni bir özet için ``_numeric_summary`` ya da ``_text_summary``ye alan ekleyin.
"""

from __future__ import annotations

import math
import re
import statistics
from collections import Counter
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from verihavuzu.calendar_tr import parse_date_tr
from verihavuzu.kalite.validators import VALIDATORS
from verihavuzu.kalite.values import is_missing, parse_number
from verihavuzu.text import lower_tr

TYPE_THRESHOLD = 0.95
PII_KINDS = ("tckn", "vkn", "iban_tr", "kart_no", "eposta", "cep_tr", "telefon_tr")
_BOOL_WORDS = {"true", "false", "evet", "hayır", "doğru", "yanlış"}
_HAS_TIME = re.compile(r"\d{1,2}:\d{2}")
_CODE = re.compile(r"\+?\d+")  # telefon, TCKN, posta kodu gibi rakamdan kimlikler


def _as_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _matches(kind: str, text: str) -> bool:
    if kind == "mantiksal":
        return lower_tr(text.strip()) in _BOOL_WORDS
    if kind == "tam_sayi":
        number = parse_number(text)
        return number is not None and number == number.to_integral_value() and "." not in text
    if kind == "ondalik":
        return parse_number(text) is not None
    if kind == "tarih":
        return not _HAS_TIME.search(text) and parse_date_tr(text) is not None
    if kind == "zaman":
        if not _HAS_TIME.search(text):
            return False
        try:
            datetime.fromisoformat(text.strip())
        except ValueError:
            return False
        return True
    return True


def infer_type(values: Sequence[str]) -> tuple[str, int]:
    """(tür, türe uymayan değer sayısı). Eksik değerler verilmemelidir."""
    values = [v.replace("\u00a0", " ").strip() for v in values]
    if not values:
        return "metin", 0
    if all(_CODE.fullmatch(v) for v in values):
        lengths = {len(v) for v in values}
        if any(v[0] in "0+" and len(v) > 1 for v in values) or (
            len(lengths) == 1 and min(lengths) >= 5
        ):
            return "kod", 0
    for kind in ("mantiksal", "tam_sayi", "ondalik", "tarih", "zaman"):
        misses = sum(not _matches(kind, v) for v in values)
        if misses <= (1 - TYPE_THRESHOLD) * len(values):
            return kind, misses
    return "metin", 0


def quantile(sorted_values: Sequence[float], q: float) -> float:
    """Doğrusal aradeğerlemeli yüzdelik (numpy'nin varsayılanı ile aynı yöntem)."""
    if not sorted_values:
        raise ValueError("Boş listenin yüzdeliği olmaz.")
    position = (len(sorted_values) - 1) * q
    low = math.floor(position)
    high = min(low + 1, len(sorted_values) - 1)
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (position - low)


def _numeric_summary(numbers: list[float]) -> dict[str, Any]:
    data = sorted(numbers)
    q1, median, q3 = quantile(data, 0.25), quantile(data, 0.5), quantile(data, 0.75)
    iqr = q3 - q1
    low_fence, high_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    iqr_outliers = [x for x in data if x < low_fence or x > high_fence]
    mad = statistics.median(abs(x - median) for x in data)
    robust = [x for x in data if mad > 0 and abs(x - median) / (1.4826 * mad) > 3.5]
    return {
        "en_kucuk": data[0],
        "en_buyuk": data[-1],
        "ortalama": statistics.fmean(data),
        "std": statistics.stdev(data) if len(data) > 1 else 0.0,
        "yuzdelikler": {
            f"p{int(q * 100):02d}": quantile(data, q)
            for q in (0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99)
        },
        "iqr_aykiri": len(iqr_outliers),
        "iqr_citleri": [low_fence, high_fence],
        "saglam_z_aykiri": len(robust),
        "aykiri_ornekleri": sorted(set(iqr_outliers), key=lambda x: -abs(x - median))[:5],
    }


def shape_of(text: str) -> str:
    """Değerin deseni: büyük harf → A, küçük → a, rakam → 9 ("SP0000123" → "AA9999999")."""
    return "".join(
        "9" if ch.isdigit() else "A" if ch.isupper() else "a" if ch.islower() else ch for ch in text
    )


def _text_summary(texts: list[str]) -> dict[str, Any]:
    lengths = [len(t) for t in texts]
    return {
        "uzunluk": {
            "en_kisa": min(lengths),
            "en_uzun": max(lengths),
            "ortalama": statistics.fmean(lengths),
        },
        "desenler": Counter(shape_of(t) for t in texts).most_common(3),
        "bas_son_bosluk": sum(t != t.strip() for t in texts),
    }


def profile_column(name: str, values: Sequence[Any]) -> dict[str, Any]:
    """Tek sütunun profili."""
    present = [_as_text(v) for v in values if not is_missing(v)]
    kind, mismatched = infer_type(present)
    counts = Counter(present)
    result: dict[str, Any] = {
        "sutun": name,
        "tur": kind,
        "tur_uyumsuz": mismatched,
        "satir": len(values),
        "eksik": len(values) - len(present),
        "eksik_orani": (len(values) - len(present)) / len(values) if values else 0.0,
        "farkli_deger": len(counts),
        "tekillik_orani": len(counts) / len(present) if present else 0.0,
        "aday_anahtar": bool(present) and len(counts) == len(values),
        "en_sik": counts.most_common(5),
    }
    if kind in ("tam_sayi", "ondalik") and present:
        numbers = [float(n) for n in (parse_number(v) for v in present) if n is not None]
        result["sayisal"] = _numeric_summary(numbers)
    elif kind in ("tarih", "zaman") and present:
        days = sorted(d for d in (parse_date_tr(v) for v in present) if d is not None)
        if days:
            iso = sum(len(v) >= 10 and v[4] == "-" for v in present)
            result["tarih"] = {
                "en_erken": days[0].isoformat(),
                "en_gec": days[-1].isoformat(),
                "iso_disi_bicim": len(present) - iso,
            }
    if present:
        result["metin"] = _text_summary(present)
        hints = {
            k: sum(VALIDATORS[k](v.strip()) for v in present) / len(present) for k in PII_KINDS
        }
        result["kisisel_veri_ipucu"] = {k: round(r, 3) for k, r in hints.items() if r >= 0.5}
    return result


def profile_table(rows: Sequence[dict[str, Any]], name: str = "tablo") -> dict[str, Any]:
    """Tablonun profili: satır/sütun sayısı, birebir yinelenen satır sayısı ve sütun profilleri."""
    columns = list(dict.fromkeys(key for row in rows for key in row))
    signatures = Counter(tuple(_as_text(row.get(c)) for c in columns) for row in rows)
    return {
        "tablo": name,
        "satir_sayisi": len(rows),
        "sutun_sayisi": len(columns),
        "yinelenen_satir": sum(count - 1 for count in signatures.values() if count > 1),
        "sutunlar": [profile_column(c, [row.get(c) for row in rows]) for c in columns],
    }
