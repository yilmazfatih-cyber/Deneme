"""cron — cron ifadesi ayrıştırma ve sonraki çalışma zamanını bulma (5 alan: dakika saat gün ay haftanın-günü).
`*`, liste (1,15), aralık (1-5), adım (*/15, 1-30/5, 5/15), ad (JAN–DEC, SUN–SAT), makrolar (@daily…) desteklenir.
Hesap SABİT bir saat farkıyla yapılır; varsayılan Türkiye (UTC+3, yaz saati yok). TypeScript eşiyle aynı kurallar.

Kullanım:
    next_run("0 9 * * 1-5", "2026-11-16T10:00:00+03:00")    # datetime: 17 Kasım 2026 Salı 09:00+03:00
    next_runs("*/15 * * * *", datetime.now(UTC), 4)         # sonraki 4 çeyrek saat
    parse_cron("@daily")                                    # CronSchedule(minutes=[0], hours=[0], …)
    matches_cron("30 8 1 * *", "2026-12-01T08:30:00+03:00") # True

Kural (Vixie cron): gün (ayın günü) ve haftanın günü İKİSİ DE kısıtlıysa (ikisi de "*" ile başlamıyorsa) biri tutması
yeter: "0 0 1 * 1" → her ayın 1'i VE her pazartesi. Haftanın günü 0 ve 7 pazardır.

Sınırlar: Saniye alanı, L/W/# (Quartz) ve @reboot yoktur. Yaz saati uygulayan saat dilimleri desteklenmez (sabit
fark). Hiç çalışmayan ifade (30 Şubat) 28 yıl aranıp CronError verir. Saat dilimi olmayan datetime reddedilir.

Genişletme: Yeni makro `_MACROS`'a, yeni ad `_MONTHS`/`_DAYS`'e eklenir; TypeScript eşine aynı kuralla eklenir ve
`vektorler/cron.json`'a örnek yazılır.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

__all__ = ["CronError", "CronSchedule", "matches_cron", "next_run", "next_runs", "parse_cron"]

_MACROS = {
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
    "@monthly": "0 0 1 * *",
    "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@hourly": "0 * * * *",
}
_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
# (etiket, en küçük, en büyük, adlar, adların ilk değeri)
_FIELDS = [
    ("Dakika", 0, 59, [], 0),
    ("Saat", 0, 23, [], 0),
    ("Ayın günü", 1, 31, [], 0),
    ("Ay", 1, 12, _MONTHS, 1),
    ("Haftanın günü", 0, 7, _DAYS, 0),
]
_SEARCH_DAYS = 366 * 28
_EPOCH = date(1970, 1, 1)


class CronError(ValueError):
    """İfade hatalı ya da hiç çalışmıyor."""


@dataclass(frozen=True)
class CronSchedule:
    minutes: list[int]
    hours: list[int]
    days_of_month: list[int]
    months: list[int]
    days_of_week: list[int]
    dom_restricted: bool
    dow_restricted: bool


def _number(text: str, field: tuple[str, int, int, list[str], int]) -> int:
    label, low, high, names, base = field
    upper = text.upper()  # harf: ay/gün adları ASCII
    if upper in names:
        return names.index(upper) + base
    if not re.fullmatch("[0-9]+", text):
        raise CronError(f'{label} alanında "{text}" anlaşılmadı.')
    value = int(text)
    if not low <= value <= high:
        raise CronError(f"{label} alanında {value} geçersiz ({low}–{high}).")
    return value


def _field(text: str, field: tuple[str, int, int, list[str], int]) -> list[int]:
    label, low, high, _, _ = field
    values: set[int] = set()
    for item in text.split(","):
        pieces = item.split("/")
        if len(pieces) > 2 or pieces[0] == "":
            raise CronError(f'{label} alanında "{item}" anlaşılmadı.')
        range_part = pieces[0]
        step_part = pieces[1] if len(pieces) == 2 else None
        if step_part is not None and not re.fullmatch("[0-9]+", step_part):
            raise CronError(f'{label} alanında adım "{step_part}" geçersiz.')
        step = int(step_part) if step_part is not None else 1
        if step < 1:
            raise CronError(f'{label} alanında adım "{step_part}" geçersiz.')
        if range_part == "*":
            start, end = low, high
        elif "-" in range_part:
            a, _, b = range_part.partition("-")
            start, end = _number(a, field), _number(b, field)
            if start > end:
                raise CronError(f'{label} alanında aralık ters: "{range_part}".')
        else:
            start = _number(range_part, field)
            end = start if step_part is None else high
        values.update(range(start, end + 1, step))
    return sorted(values)


def parse_cron(expression: str) -> CronSchedule:
    """Cron ifadesini çözümler; hatalıysa hangi alanda ne olduğunu söyleyen CronError."""
    trimmed = expression.strip()
    macro = _MACROS.get(trimmed.lower())  # harf: makro adları ASCII
    if trimmed.startswith("@") and macro is None:
        raise CronError(f"Desteklenmeyen makro: {trimmed}.")
    parts = (macro or trimmed).split()
    if len(parts) != 5:
        raise CronError(
            f"Cron ifadesi 5 alan olmalı (dakika saat gün ay haftanın-günü); {len(parts)} alan var."
        )
    minute, hour, dom, month, dow = parts
    days_of_week = sorted({0 if d == 7 else d for d in _field(dow, _FIELDS[4])})
    return CronSchedule(
        minutes=_field(minute, _FIELDS[0]),
        hours=_field(hour, _FIELDS[1]),
        days_of_month=_field(dom, _FIELDS[2]),
        months=_field(month, _FIELDS[3]),
        days_of_week=days_of_week,
        dom_restricted=not dom.startswith("*"),
        dow_restricted=not dow.startswith("*"),
    )


def _day_matches(schedule: CronSchedule, day_number: int) -> bool:
    day = _EPOCH + timedelta(days=day_number)
    if day.month not in schedule.months:
        return False
    weekday = day.isoweekday() % 7  # 0 = pazar
    dom_ok = day.day in schedule.days_of_month
    dow_ok = weekday in schedule.days_of_week
    if schedule.dom_restricted and schedule.dow_restricted:
        return dom_ok or dow_ok
    return dom_ok and dow_ok


def _to_minutes(value: datetime | str) -> int:
    """UTC dakika sayısı (1970'ten beri)."""
    if isinstance(value, str):
        text = value.strip()
        pattern = r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})"
        if not re.fullmatch(pattern, text):
            raise CronError(
                f'"{value}" okunamadı: saat dilimli ISO zaman verin ("2026-11-16T10:00:00+03:00").'
            )
        value = datetime.fromisoformat(text)
    if value.tzinfo is None or value.utcoffset() is None:
        raise CronError("Saat dilimi olmayan datetime verildi; datetime.now(UTC) kullanın.")
    return int(value.timestamp() // 60)


def _schedule(expression: str | CronSchedule) -> CronSchedule:
    return parse_cron(expression) if isinstance(expression, str) else expression


def next_run(
    expression: str | CronSchedule, after: datetime | str, *, offset_minutes: int = 180
) -> datetime:
    """`after` anından SONRAKİ ilk çalışma zamanı (dakika başı), `offset_minutes` saat diliminde."""
    schedule = _schedule(expression)
    start_local = _to_minutes(after) + offset_minutes + 1
    day = start_local // 1440
    from_minute = start_local - day * 1440
    zone = timezone(timedelta(minutes=offset_minutes))
    for _ in range(_SEARCH_DAYS):
        if _day_matches(schedule, day):
            for hour in schedule.hours:
                if hour * 60 + 59 < from_minute:
                    continue
                minute = next((m for m in schedule.minutes if hour * 60 + m >= from_minute), None)
                if minute is not None:
                    utc_minutes = day * 1440 + hour * 60 + minute - offset_minutes
                    return datetime.fromtimestamp(utc_minutes * 60, tz=zone)
        day += 1
        from_minute = 0
    raise CronError("Bu ifade önümüzdeki 28 yılda hiç çalışmıyor (ör. 30 Şubat).")


def next_runs(
    expression: str | CronSchedule, after: datetime | str, count: int, *, offset_minutes: int = 180
) -> list[datetime]:
    """Sonraki `count` çalışma zamanı."""
    schedule = _schedule(expression)
    runs: list[datetime] = []
    cursor: datetime | str = after
    for _ in range(count):
        cursor = next_run(schedule, cursor, offset_minutes=offset_minutes)
        runs.append(cursor)
    return runs


def matches_cron(
    expression: str | CronSchedule, at: datetime | str, *, offset_minutes: int = 180
) -> bool:
    """Verilen an (dakikası) ifadeye uyuyor mu?"""
    schedule = _schedule(expression)
    local = _to_minutes(at) + offset_minutes
    day = local // 1440
    minute_of_day = local - day * 1440
    return (
        _day_matches(schedule, day)
        and minute_of_day // 60 in schedule.hours
        and minute_of_day % 60 in schedule.minutes
    )
