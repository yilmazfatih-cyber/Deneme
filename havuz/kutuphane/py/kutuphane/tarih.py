"""tarih — Türkçe tarih biçimleme/ayrıştırma ("16 Kasım 2026 Pazartesi", "16.11.2026"), göreli zaman ("dün",
"3 gün önce", "2 saat sonra"), iş günü hesabı (hafta sonu + sabit tarihli resmî tatiller; dinî bayramlar dışarıdan
liste olarak verilir), yaş, ISO hafta.

Kullanım:
    format_date_tr("2026-11-16", "uzun")                     # "16 Kasım 2026 Pazartesi"
    format_date_tr("2026-11-16T21:30:00Z", "tam")            # "17 Kasım 2026 Salı 00:30"  (Türkiye saatiyle!)
    parse_date_tr("16 kasım 2026")                           # date(2026, 11, 16)
    relative_time_tr("2026-11-15T10:00:00+03:00", "2026-11-16T12:00:00+03:00")   # "dün"
    add_business_days("2026-10-27", 2)                       # date(2026, 10, 30)  (29 Ekim tatil)
    is_business_day("2026-03-20", holidays=["2026-03-20"])   # False (bayramı siz verirsiniz)

İki tür girdi vardır ve karıştırılmaz:
 - TAKVİM GÜNÜ: `date` ya da "YYYY-MM-DD" metni. Saat dilimi yoktur; doğum günü, fatura tarihi, tatil böyledir.
   Çıktıdaki tarihler hep `date` nesnesidir.
 - AN: saat dilimli `datetime` ya da saat dilimi yazılı ISO metni ("…T21:30:00Z", "…+03:00"). Önce Türkiye
   saatine (UTC+3) çevrilir, sonra takvim gününe. Saat dilimi OLMAYAN datetime (`datetime.now()`) ve saatli metin
   HATA verir; çünkü makinenin yerel saatine göre başka gün çıkar. `datetime.now(timezone.utc)` kullanın.
Saat dilimi tuzağı: Türkiye 2016'dan beri yaz saati uygulamaz, sabit UTC+3'tür. Sunucu UTC'de çalışırken
`date.today()` gece 00:00–03:00 arası YANLIŞ (önceki) günü verir. Başka sabit fark için `offset_minutes` verin.

Sınırlar: Yaz saati olan saat dilimleri desteklenmez (sabit fark). Dinî bayramlar (Ramazan, Kurban) ve arife yarım
günleri hesaplanmaz; liste olarak verin. 28 Ekim öğleden sonra ve arife yarım günleri iş günü sayılır. Sabit
tatiller 2394 sayılı Kanun'a göredir: 1 Mayıs 2009'dan, 15 Temmuz 2017'den beri; 1981 öncesi doğrulanmadı.

Genişletme: Yeni sabit tatil `_FIXED_HOLIDAYS`'e (ay, gün, ad, başlangıç yılı) eklenir; yeni biçim kalıbı
`_PRESETS`'e. Her ekleme için `vektorler/tarih.json` dosyasına örnek yazın; aynı örnek TypeScript eşini de sınar.
"""

from __future__ import annotations

import calendar
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

__all__ = [
    "TURKEY_OFFSET_MINUTES",
    "DateError",
    "Holiday",
    "IsoWeek",
    "add_business_days",
    "add_days",
    "age_on",
    "business_days_between",
    "day_name_tr",
    "day_of_week",
    "days_in_month",
    "fixed_holidays_tr",
    "format_date_tr",
    "is_business_day",
    "is_leap_year",
    "iso_week",
    "parse_date_tr",
    "relative_time_tr",
    "to_iso_date",
]

TURKEY_OFFSET_MINUTES = 180
"""Türkiye'nin UTC'ye göre sabit farkı (dakika)."""

DateInput = date | datetime | str

_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]  # fmt: skip
_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
_DAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
_PRESETS = {
    "kisa": "dd.MM.yyyy",
    "orta": "d MMMM yyyy",
    "uzun": "d MMMM yyyy EEEE",
    "saat": "dd.MM.yyyy HH:mm",
    "tam": "d MMMM yyyy EEEE HH:mm",
}
# (ay, gün, ad, ilk yıl) — 2394 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun.
_FIXED_HOLIDAYS = [
    (1, 1, "Yılbaşı", 0),
    (4, 23, "Ulusal Egemenlik ve Çocuk Bayramı", 0),
    (5, 1, "Emek ve Dayanışma Günü", 2009),
    (5, 19, "Atatürk'ü Anma, Gençlik ve Spor Bayramı", 0),
    (7, 15, "Demokrasi ve Millî Birlik Günü", 2017),
    (8, 30, "Zafer Bayramı", 0),
    (10, 29, "Cumhuriyet Bayramı", 0),
]
_TOKEN = re.compile("'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|ss")
_INSTANT = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})"
)


class DateError(ValueError):
    """Tarih okunamadığında ya da geçersiz olduğunda fırlatılır; ileti ne yapılacağını söyler."""


@dataclass(frozen=True)
class Holiday:
    date: date
    name: str


@dataclass(frozen=True)
class IsoWeek:
    year: int
    week: int


@dataclass(frozen=True)
class _Clock:
    day: date
    hour: int
    minute: int
    second: int


def is_leap_year(year: int) -> bool:
    return calendar.isleap(year)


def days_in_month(year: int, month: int) -> int:
    if not 1 <= month <= 12:
        raise DateError(f"Ay 1–12 arasında olmalı: {month}.")
    return calendar.monthrange(year, month)[1]


def _checked(year: int, month: int, day: int, source: str) -> date:
    if not (1 <= year <= 9999 and 1 <= month <= 12 and 1 <= day <= days_in_month(year, month)):
        raise DateError(
            f'"{source}" geçerli bir tarih değil (gün.ay.yıl sırasını ve ayın gün sayısını denetleyin).'
        )
    return date(year, month, day)


def _clock(value: DateInput, offset_minutes: int) -> _Clock:
    """Girdiyi duvar saatine çevirir: takvim günü → 00:00; an → `offset_minutes` farkla yerel saat."""
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise DateError(
                "Saat dilimi olmayan datetime verildi. datetime.now(timezone.utc) kullanın "
                "ya da takvim günü için date verin."
            )
        local = value.astimezone(timezone(timedelta(minutes=offset_minutes)))
        return _Clock(local.date(), local.hour, local.minute, local.second)
    if isinstance(value, date):
        return _Clock(value, 0, 0, 0)
    text = value.strip()
    date_only = re.fullmatch("([0-9]{4})-([0-9]{2})-([0-9]{2})", text)
    if date_only:
        year, month, day = (int(part) for part in date_only.groups())
        return _Clock(_checked(year, month, day, text), 0, 0, 0)
    if not _INSTANT.fullmatch(text):
        raise DateError(
            f'"{text}" okunamadı. Takvim günü için "YYYY-MM-DD", an için saat dilimli ISO '
            '("2026-11-16T10:00:00+03:00") verin.'
        )
    return _clock(datetime.fromisoformat(text.replace(" ", "T")), offset_minutes)


def _instant_seconds(value: DateInput, offset_minutes: int) -> float:
    """Girdinin UTC saniyesi; takvim günü `offset_minutes` saat diliminde gece yarısı sayılır."""
    clock = _clock(value, offset_minutes)  # biçimi de denetler
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str) and _INSTANT.fullmatch(value.strip()):
        return datetime.fromisoformat(value.strip().replace(" ", "T")).timestamp()
    midnight = datetime(clock.day.year, clock.day.month, clock.day.day, tzinfo=UTC)
    return midnight.timestamp() - offset_minutes * 60


def to_iso_date(value: DateInput, offset_minutes: int = TURKEY_OFFSET_MINUTES) -> date:
    """Takvim gününü verir; an girdisi Türkiye saatine göre güne çevrilir."""
    return _clock(value, offset_minutes).day


def add_days(value: DateInput, days: int) -> date:
    return _clock(value, TURKEY_OFFSET_MINUTES).day + timedelta(days=days)


def day_of_week(value: DateInput) -> int:
    """ISO gün numarası: 1 = Pazartesi … 7 = Pazar."""
    return _clock(value, TURKEY_OFFSET_MINUTES).day.isoweekday()


def day_name_tr(value: DateInput) -> str:
    return _DAYS[day_of_week(value) - 1]


def format_date_tr(
    value: DateInput, pattern: str = "kisa", offset_minutes: int = TURKEY_OFFSET_MINUTES
) -> str:
    """Kalıpla biçimler.

    Hazır kalıplar: kisa "16.11.2026", orta "16 Kasım 2026", uzun "16 Kasım 2026 Pazartesi", saat "16.11.2026 14:30",
    tam "16 Kasım 2026 Pazartesi 14:30". Simgeler: yyyy yy MMMM MMM MM M dd d EEEE EEE HH H mm ss; tek tırnak içi
    olduğu gibi yazılır ("'Saat' HH:mm").
    """
    clock = _clock(value, offset_minutes)
    day = clock.day
    weekday = day.weekday()
    tokens = {
        "yyyy": f"{day.year:04d}",
        "yy": f"{day.year % 100:02d}",
        "MMMM": _MONTHS[day.month - 1],
        "MMM": _MONTHS_SHORT[day.month - 1],
        "MM": f"{day.month:02d}",
        "M": str(day.month),
        "dd": f"{day.day:02d}",
        "d": str(day.day),
        "EEEE": _DAYS[weekday],
        "EEE": _DAYS_SHORT[weekday],
        "HH": f"{clock.hour:02d}",
        "H": str(clock.hour),
        "mm": f"{clock.minute:02d}",
        "ss": f"{clock.second:02d}",
    }

    def replace(match: re.Match[str]) -> str:
        literal = match.group(1)
        return literal if literal is not None else tokens[match.group(0)]

    return _TOKEN.sub(replace, _PRESETS.get(pattern, pattern))


def _fold_tr(text: str) -> str:
    lowered = text.replace("İ", "i").replace("I", "ı").lower()  # harf: İ/I önce elle çevrildi
    return lowered.replace("i\N{COMBINING DOT ABOVE}", "i").translate(
        str.maketrans("çğıöşü", "cgiosu")
    )


def _lookup(word: str, full: Sequence[str], short: Sequence[str]) -> int:
    key = _fold_tr(word)
    for index, (name, abbreviation) in enumerate(zip(full, short, strict=True)):
        if key in (_fold_tr(name), _fold_tr(abbreviation)):
            return index
    return -1


def parse_date_tr(text: str) -> date:
    """Türkçe yazılmış tarihi takvim gününe çevirir.

    Kabul edilenler: "16.11.2026", "16/11/2026", "16-11-2026", "16 Kasım 2026", "16 kasim 2026 Pazartesi",
    "Pazartesi, 16 Kas 2026", "2026-11-16". İki haneli yıl, olmayan gün (31.02) ve tutmayan gün adı açık hata verir.
    """
    clean = re.sub(r"\s+", " ", text.strip())
    iso = re.fullmatch("([0-9]{4})-([0-9]{2})-([0-9]{2})", clean)
    if iso:
        return _checked(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)), clean)
    numeric = re.fullmatch("([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{2,4})", clean)
    if numeric:
        if len(numeric.group(3)) != 4:
            raise DateError(f'"{clean}": yılı dört haneli yazın (16.11.2026).')
        return _checked(int(numeric.group(3)), int(numeric.group(2)), int(numeric.group(1)), clean)
    named = re.fullmatch(
        r"(?:([^\W\d_]+),? )?([0-9]{1,2})\.? ([^\W\d_]+) ([0-9]{4})(?:,? ([^\W\d_]+))?", clean
    )
    if not named:
        raise DateError(f'"{clean}" tarih olarak okunamadı. Örnek: 16.11.2026 ya da 16 Kasım 2026.')
    month = _lookup(named.group(3), _MONTHS, _MONTHS_SHORT) + 1
    if month == 0:
        raise DateError(f'"{named.group(3)}" bir ay adı değil (Ocak, Şubat, … Aralık).')
    result = _checked(int(named.group(4)), month, int(named.group(2)), clean)
    day_word = named.group(1) or named.group(5)
    if day_word is not None and _lookup(day_word, _DAYS, _DAYS_SHORT) != result.weekday():
        raise DateError(
            f'"{clean}": bu tarih {_DAYS[result.weekday()]} gününe denk gelir; yazılan gün tutmuyor.'
        )
    return result


def _months_between(start: date, end: date) -> int:
    return (
        (end.year - start.year) * 12 + (end.month - start.month) - (1 if end.day < start.day else 0)
    )


def relative_time_tr(
    target: DateInput, now: DateInput, offset_minutes: int = TURKEY_OFFSET_MINUTES
) -> str:
    """ "şimdi", "5 dakika önce", "2 saat sonra", "dün", "yarın", "3 gün önce", "2 hafta önce", "3 ay önce", "2 yıl sonra".

    24 saatten kısa farklar saatle, daha uzunları Türkiye takvim günüyle söylenir. `now` zorunludur (test edilebilirlik).
    """
    seconds = _instant_seconds(target, offset_minutes) - _instant_seconds(now, offset_minutes)
    seconds_abs = abs(seconds)
    direction = "sonra" if seconds > 0 else "önce"
    if seconds_abs < 45:
        return "şimdi"
    if seconds_abs < 3600:
        return f"{max(1, int(seconds_abs // 60))} dakika {direction}"
    if seconds_abs < 86_400:
        return f"{int(seconds_abs // 3600)} saat {direction}"
    target_day = _clock(target, offset_minutes).day
    now_day = _clock(now, offset_minutes).day
    day_diff = abs((target_day - now_day).days)
    if day_diff == 1:
        return "yarın" if seconds > 0 else "dün"
    if day_diff < 7:
        return f"{day_diff} gün {direction}"
    if day_diff < 30:
        return f"{day_diff // 7} hafta {direction}"
    months = max(1, _months_between(min(target_day, now_day), max(target_day, now_day)))
    if day_diff < 365:
        return f"{months} ay {direction}"
    return f"{max(1, months // 12)} yıl {direction}"


def fixed_holidays_tr(year: int) -> list[Holiday]:
    """O yılın sabit tarihli resmî tatilleri (dinî bayramlar HARİÇ)."""
    return [
        Holiday(date(year, month, day), name)
        for month, day, name, since in _FIXED_HOLIDAYS
        if year >= since
    ]


def _is_fixed_holiday(day: date) -> bool:
    return any(
        (m, d) == (day.month, day.day) and day.year >= since for m, d, _, since in _FIXED_HOLIDAYS
    )


def _business_day_at(
    day: date, holidays: Sequence[DateInput], weekend: Sequence[int], include_fixed: bool
) -> bool:
    if day.isoweekday() in weekend:
        return False
    if include_fixed and _is_fixed_holiday(day):
        return False
    return day not in {_clock(h, TURKEY_OFFSET_MINUTES).day for h in holidays}


def is_business_day(
    value: DateInput,
    *,
    holidays: Sequence[DateInput] = (),
    weekend: Sequence[int] = (6, 7),
    include_fixed_holidays: bool = True,
) -> bool:
    """Hafta sonu, sabit resmî tatil ya da `holidays` listesinde (dinî bayramlar vb.) değilse True."""
    day = _clock(value, TURKEY_OFFSET_MINUTES).day
    return _business_day_at(day, holidays, weekend, include_fixed_holidays)


def add_business_days(
    value: DateInput,
    count: int,
    *,
    holidays: Sequence[DateInput] = (),
    weekend: Sequence[int] = (6, 7),
    include_fixed_holidays: bool = True,
) -> date:
    """`count` iş günü ileri (negatifse geri) gider; başlangıç günü sayılmaz. 0 → tarihin kendisi."""
    if len(set(weekend)) >= 7:
        raise DateError("Haftanın her günü tatil olamaz.")
    day = _clock(value, TURKEY_OFFSET_MINUTES).day
    step = timedelta(days=-1 if count < 0 else 1)
    left = abs(count)
    while left > 0:
        day += step
        if _business_day_at(day, holidays, weekend, include_fixed_holidays):
            left -= 1
    return day


def business_days_between(
    start: DateInput,
    end: DateInput,
    *,
    holidays: Sequence[DateInput] = (),
    weekend: Sequence[int] = (6, 7),
    include_fixed_holidays: bool = True,
) -> int:
    """Başlangıçtan bitişe giderken üzerine basılan iş günü sayısı.

    İleri (başlangıç, bitiş], geri [bitiş, başlangıç) sayılır ve geri giderken sonuç negatiftir. Böylece
    add_business_days'in tam tersidir.
    """
    first = _clock(start, TURKEY_OFFSET_MINUTES).day
    last = _clock(end, TURKEY_OFFSET_MINUTES).day
    low, high = (
        (first + timedelta(days=1), last) if last >= first else (last, first - timedelta(days=1))
    )
    count = sum(
        1
        for offset in range((high - low).days + 1)
        if _business_day_at(low + timedelta(days=offset), holidays, weekend, include_fixed_holidays)
    )
    return count if last >= first else -count


def age_on(birth_date: DateInput, on_date: DateInput) -> int:
    """Tamamlanmış yaş. 29 Şubat doğumlular artık olmayan yıllarda 1 Mart'ta bir yaş büyür."""
    birth = _clock(birth_date, TURKEY_OFFSET_MINUTES).day
    on = _clock(on_date, TURKEY_OFFSET_MINUTES).day
    age = on.year - birth.year - (1 if (on.month, on.day) < (birth.month, birth.day) else 0)
    if age < 0:
        raise DateError("Doğum tarihi, yaşın hesaplandığı tarihten sonra olamaz.")
    return age


def iso_week(value: DateInput) -> IsoWeek:
    """ISO 8601 hafta numarası: yılın ilk perşembesini içeren hafta 1. haftadır."""
    year, week, _ = _clock(value, TURKEY_OFFSET_MINUTES).day.isocalendar()
    return IsoWeek(year, week)
