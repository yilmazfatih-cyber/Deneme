"""Birimler ve birimli değer (Quantity): uzunluk, ağırlık, sıcaklık.

Her birim bir boyuta (uzunluk/ağırlık/sıcaklık) ve temel birime (m, kg, K) göre çarpana sahiptir;
sıcaklıkta ayrıca kayma vardır (°C → K: +273,15). Aynı boyuttaki birimler toplanır/çıkarılır
(sonuç soldakinin biriminde), boyut farklıysa yol gösteren hata verilir. Sıcaklıkla aritmetik
yapılmaz (yalnız dönüşüm ve eksi işareti): "20 °C + 10 °C" fiziksel olarak belirsizdir.
Genişletme: yeni birim için `UNITS` sözlüğüne bir satır (ad, boyut, çarpan); yeni boyut için
`DIMENSIONS`'a ad ekleyin. Testler: tests/hesap/test_hesap_birim.py.
"""

from __future__ import annotations

from dataclasses import dataclass

from .errors import CalcError

LENGTH, MASS, TEMPERATURE = "uzunluk", "ağırlık", "sıcaklık"


@dataclass(frozen=True)
class Unit:
    name: str
    dimension: str
    factor: float  # temel birime çarpan (m, kg; sıcaklıkta K ölçeği)
    offset: float = 0.0  # sıcaklık: temel = (değer + offset) * factor … bkz. to_base


def _temp(name: str, factor: float, offset: float) -> Unit:
    return Unit(name, TEMPERATURE, factor, offset)


# Ad -> birim. Aynı birimin Türkçe ve kısaltma adları ayrı satırdır. YENİ BİRİM BURAYA.
UNITS: dict[str, Unit] = {
    "mm": Unit("mm", LENGTH, 0.001),
    "cm": Unit("cm", LENGTH, 0.01),
    "m": Unit("m", LENGTH, 1.0),
    "km": Unit("km", LENGTH, 1000.0),
    "inç": Unit("inç", LENGTH, 0.0254),
    "in": Unit("inç", LENGTH, 0.0254),
    "ft": Unit("ft", LENGTH, 0.3048),
    "ayak": Unit("ft", LENGTH, 0.3048),
    "yd": Unit("yd", LENGTH, 0.9144),
    "mil": Unit("mil", LENGTH, 1609.344),
    "mi": Unit("mil", LENGTH, 1609.344),
    "mg": Unit("mg", MASS, 1e-6),
    "g": Unit("g", MASS, 0.001),
    "kg": Unit("kg", MASS, 1.0),
    "ton": Unit("ton", MASS, 1000.0),
    "t": Unit("ton", MASS, 1000.0),
    "lb": Unit("lb", MASS, 0.45359237),
    "libre": Unit("lb", MASS, 0.45359237),
    "oz": Unit("oz", MASS, 0.028349523125),
    "ons": Unit("oz", MASS, 0.028349523125),
    "°C": _temp("°C", 1.0, 273.15),
    "C": _temp("°C", 1.0, 273.15),
    "°F": _temp("°F", 5 / 9, 459.67),
    "F": _temp("°F", 5 / 9, 459.67),
    "K": _temp("K", 1.0, 0.0),
}


@dataclass(frozen=True)
class Quantity:
    """Sayı (unit=None) ya da birimli değer."""

    value: float
    unit: Unit | None = None

    def to_base(self) -> float:
        assert self.unit is not None
        return (self.value + self.unit.offset) * self.unit.factor

    def convert(self, target: Unit, pos: int) -> Quantity:
        if self.unit is None:
            raise CalcError(
                "dönüştürülecek değerin birimi yok", pos, f"Örnek: 5 km kaç {target.name}"
            )
        if self.unit.dimension != target.dimension:
            raise CalcError(
                f"{self.unit.dimension} ({self.unit.name}) {target.dimension} birimine "
                f"({target.name}) dönüştürülemez",
                pos,
            )
        return Quantity(self.to_base() / target.factor - target.offset, target)

    def describe(self) -> str:
        return "birimsiz sayı" if self.unit is None else f"{self.unit.dimension} ({self.unit.name})"


def add(a: Quantity, b: Quantity, sign: int, pos: int) -> Quantity:
    """a + b (sign=1) ya da a - b (sign=-1); birimler uyumlu olmalı."""
    if a.unit is None and b.unit is None:
        return Quantity(a.value + sign * b.value)
    if a.unit is None or b.unit is None:
        with_unit = a if a.unit is not None else b
        assert with_unit.unit is not None
        raise CalcError(
            "birimsiz sayı ile birimli değer toplanamaz",
            pos,
            f"Sayıya birim ekleyin: ör. 5 {with_unit.unit.name}.",
        )
    if TEMPERATURE in (a.unit.dimension, b.unit.dimension):
        raise CalcError(
            "sıcaklıklarla toplama/çıkarma yapılmaz", pos, "Yalnız dönüşüm: 100 °F kaç °C"
        )
    if a.unit.dimension != b.unit.dimension:
        raise CalcError(f"{a.describe()} ile {b.describe()} toplanamaz", pos)
    converted = b.convert(a.unit, pos)
    return Quantity(a.value + sign * converted.value, a.unit)


def multiply(a: Quantity, b: Quantity, pos: int) -> Quantity:
    if a.unit is not None and b.unit is not None:
        raise CalcError("iki birimli değer çarpılamaz", pos, "Alan/hacim birimleri desteklenmiyor.")
    unit = a.unit or b.unit
    if unit is not None and unit.dimension == TEMPERATURE:
        raise CalcError("sıcaklık bir sayıyla çarpılamaz", pos, "Yalnız dönüşüm: 100 °F kaç °C")
    return Quantity(a.value * b.value, unit)


def divide(a: Quantity, b: Quantity, pos: int) -> Quantity:
    if b.value == 0:
        raise CalcError("sıfıra bölme", pos)
    if b.unit is None:
        if a.unit is not None and a.unit.dimension == TEMPERATURE:
            raise CalcError("sıcaklık bir sayıya bölünemez", pos)
        return Quantity(a.value / b.value, a.unit)
    if a.unit is None:
        raise CalcError(f"sayı {b.describe()} ile bölünemez", pos)
    if a.unit.dimension != b.unit.dimension or a.unit.dimension == TEMPERATURE:
        raise CalcError(f"{a.describe()} {b.describe()} ile bölünemez", pos)
    return Quantity(a.to_base() / b.to_base())  # aynı boyut: birimsiz oran (5 km / 500 m = 10)
