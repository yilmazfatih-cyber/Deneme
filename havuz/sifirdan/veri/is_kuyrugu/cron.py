"""Cron ifadesi: "dakika saat ayın_günü ay haftanın_günü" (5 alan, UTC).

Her alan: `*`, sayı, aralık `a-b`, adım `*/n` ya da `a-b/n`, liste `a,b,c`. Haftanın günü 0–6 (0 =
Pazar; 7 de Pazar kabul edilir). Ay günü ve hafta günü İKİSİ DE kısıtlıysa (ikisi de `*` değilse)
biri tutması yeter (Vixie cron kuralı): "0 9 1 * 1" = her ayın 1'i VE her Pazartesi 09:00.

Genişletme: saat dilimi için `next_after`'a `zoneinfo.ZoneInfo` alın; yaz saati geçişlerinde
atlanan ve iki kez yaşanan saatlere dikkat (testini yazın). `@daily` gibi kısaltmalar `_ALIASES`'a
eklenir.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

_LIMITS = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
_NAMES = ["dakika", "saat", "ayın günü", "ay", "haftanın günü"]
_ALIASES = {
    "@hourly": "0 * * * *",
    "@daily": "0 0 * * *",
    "@weekly": "0 0 * * 0",
    "@monthly": "0 0 1 * *",
}


class CronError(ValueError):
    """Cron ifadesi geçersiz; ileti hangi alanın neden yanlış olduğunu söyler."""


def _parse_field(text: str, index: int) -> frozenset[int]:
    low, high = _LIMITS[index]
    values: set[int] = set()
    for part in text.split(","):
        base, _, step_text = part.partition("/")
        step = int(step_text) if step_text.isdigit() else (1 if not step_text else -1)
        if step <= 0:
            raise CronError(f"{_NAMES[index]}: '{part}' adımı pozitif tamsayı olmalı")
        if base == "*":
            start, end = low, high
        elif "-" in base:
            first, _, last = base.partition("-")
            if not (first.isdigit() and last.isdigit()):
                raise CronError(f"{_NAMES[index]}: '{part}' aralığı anlaşılmadı")
            start, end = int(first), int(last)
        elif base.isdigit():
            start = int(base)
            end = high if step_text else start
        else:
            raise CronError(f"{_NAMES[index]}: '{part}' anlaşılmadı (sayı, *, a-b, */n bekleniyor)")
        if not low <= start <= end <= high:
            raise CronError(f"{_NAMES[index]}: '{part}' {low}–{high} aralığında olmalı")
        values.update(range(start, end + 1, step))
    if index == 4 and 7 in values:  # 7 = Pazar
        values = (values - {7}) | {0}
    return frozenset(values)


@dataclass(frozen=True)
class Cron:
    minutes: frozenset[int]
    hours: frozenset[int]
    days: frozenset[int]
    months: frozenset[int]
    weekdays: frozenset[int]  # 0 = Pazar
    day_restricted: bool
    weekday_restricted: bool

    @classmethod
    def parse(cls, expression: str) -> Cron:
        text = _ALIASES.get(expression.strip(), expression)
        fields = text.split()
        if len(fields) != 5:
            raise CronError(
                f"Cron ifadesi 5 alan ister (dakika saat gün ay haftagünü), {len(fields)} verildi: "
                f"'{expression}'"
            )
        minutes, hours, days, months, weekdays = (_parse_field(f, i) for i, f in enumerate(fields))
        return cls(
            minutes, hours, days, months, weekdays,
            day_restricted=fields[2] != "*", weekday_restricted=fields[4] != "*",
        )  # fmt: skip

    def matches(self, moment: datetime) -> bool:
        weekday = (moment.weekday() + 1) % 7  # Python: Pazartesi=0 → cron: Pazar=0
        day_ok = moment.day in self.days
        weekday_ok = weekday in self.weekdays
        if self.day_restricted and self.weekday_restricted:
            calendar_ok = day_ok or weekday_ok
        else:
            calendar_ok = day_ok and weekday_ok
        return (
            calendar_ok
            and moment.month in self.months
            and moment.hour in self.hours
            and moment.minute in self.minutes
        )

    def next_after(self, moment: datetime) -> datetime:
        """`moment`'tan KESİN sonraki ilk eşleşen dakika (UTC). En çok 5 yıl ileri bakar."""
        candidate = moment.astimezone(UTC).replace(second=0, microsecond=0) + timedelta(minutes=1)
        limit = candidate + timedelta(days=366 * 5)
        while candidate < limit:
            if candidate.month not in self.months:  # ayı atla
                year, month = candidate.year + candidate.month // 12, candidate.month % 12 + 1
                candidate = candidate.replace(year=year, month=month, day=1, hour=0, minute=0)
                continue
            if not self._day_possible(candidate):  # bugün hiç uymaz: günü atla
                candidate = (candidate + timedelta(days=1)).replace(hour=0, minute=0)
                continue
            if candidate.hour not in self.hours:
                candidate = (candidate + timedelta(hours=1)).replace(minute=0)
                continue
            if self.matches(candidate):
                return candidate
            candidate += timedelta(minutes=1)
        raise CronError("5 yıl içinde eşleşen zaman yok (ör. 31 Şubat)")

    def _day_possible(self, moment: datetime) -> bool:
        weekday = (moment.weekday() + 1) % 7
        day_ok, weekday_ok = moment.day in self.days, weekday in self.weekdays
        if self.day_restricted and self.weekday_restricted:
            return day_ok or weekday_ok
        return day_ok and weekday_ok
