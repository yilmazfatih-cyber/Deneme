"""para — tam sayı KURUŞ temelli para tipi: biçimleme (₺1.234,56 · 1.234,56 TL), ayrıştırma, en büyük kalan
yöntemiyle paylaştırma (toplam her zaman tutara eşit), KDV dahil/hariç hesap, oranla dağıtım.
Hiçbir hesapta float kullanılmaz: oranlar ondalık yazımlarından tam kesre çevrilir, bölmeler tam sayıyla yapılır.

Kullanım:
    fiyat = parse_money("1.234,56 TL")                 # Money(kurus=123456, currency="TRY")
    format_money(fiyat)                                # "₺1.234,56"   (style="code" → "1.234,56 TL")
    add_vat(money(10000), 20)                          # net ₺100,00 · KDV ₺20,00 · brüt ₺120,00
    remove_vat(money(10000), 20).net                   # Money(kurus=8333)  (KDV 1667; toplam yine 10000)
    [m.kurus for m in allocate(money(10000), [1, 1, 1])]   # [3334, 3333, 3333]
    from_decimal(0.1 + 0.2)                            # Money(kurus=30)  (sınırda bir kez yuvarlanır)

Yuvarlama: varsayılan "halfUp" (yarım kuruş sıfırdan uzağa: 0,5 → 1, -0,5 → -1; VUK uygulaması). Ayrıca
"halfEven" (bankacı), "down" (sıfıra doğru), "up" (sıfırdan uzağa).

Sınırlar: TypeScript eşiyle uyum için tutarlar 2^53 − 1 kuruşu (~90 trilyon TL) aşamaz; aşarsa hata. Döviz çevirimi
yok. Kuruştan küçük birim (ör. akaryakıt fiyatında 3 ondalık) için bu tip uygun değildir. KDV satır satır mı toplamda
mı hesaplanacağı işletmenin kuralıdır: satır bazında `add_vat` uygulayıp `sum_money` ile toplayın.

Genişletme: Yeni para birimi `_SYMBOLS`'e (simge, kod) eklenir. Yeni işlem Money alıp yeni Money döndüren saf bir
işlev olarak yazılır. Her ekleme için `vektorler/para.json` dosyasına örnek yazın.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

__all__ = [
    "Money",
    "MoneyError",
    "Rounding",
    "VatBreakdown",
    "add",
    "add_vat",
    "allocate",
    "compare",
    "format_money",
    "from_decimal",
    "is_negative",
    "is_zero",
    "money",
    "multiply",
    "negate",
    "parse_money",
    "percent_of",
    "remove_vat",
    "split",
    "subtract",
    "sum_money",
    "to_decimal_string",
]

Rounding = Literal["halfUp", "halfEven", "down", "up"]
_MAX = 2**53 - 1

_SYMBOLS = {"TRY": ("₺", "TL"), "USD": ("$", "USD"), "EUR": ("€", "EUR"), "GBP": ("£", "GBP")}
# Metinde para birimini belirten simge ya da kod (harfe bitişik olmayan): "TL", "₺", "usd"…
_CURRENCY_TOKENS = [
    (re.compile("₺|(?<![A-Za-z])(?:TRY|TL)(?![A-Za-z])", re.IGNORECASE), "TRY"),
    (re.compile(r"\$|(?<![A-Za-z])USD(?![A-Za-z])", re.IGNORECASE), "USD"),
    (re.compile("€|(?<![A-Za-z])EUR(?![A-Za-z])", re.IGNORECASE), "EUR"),
    (re.compile("£|(?<![A-Za-z])GBP(?![A-Za-z])", re.IGNORECASE), "GBP"),
]


class MoneyError(ValueError):
    """Geçersiz tutar, para birimi uyuşmazlığı ya da taşma."""


@dataclass(frozen=True)
class Money:
    """Değişmez para değeri: `kurus` tam sayı (12,50 TL → 1250), `currency` üç harfli kod."""

    kurus: int
    currency: str = "TRY"

    def __post_init__(self) -> None:
        if isinstance(self.kurus, bool) or not isinstance(self.kurus, int):
            raise MoneyError(
                f"Kuruş tam sayı olmalı (12,50 TL → 1250); verilen: {self.kurus!r}. "
                "Ondalık için from_decimal."
            )
        if abs(self.kurus) > _MAX:
            raise MoneyError("Tutar çok büyük: en çok 90 trilyon TL (2^53 − 1 kuruş) desteklenir.")
        if not re.fullmatch("[A-Z]{3}", self.currency):
            raise MoneyError(
                f"Para birimi üç büyük harfli kod olmalı (TRY); verilen: {self.currency}."
            )


@dataclass(frozen=True)
class VatBreakdown:
    """KDV hesabının parçaları; her zaman net + vat == gross."""

    net: Money
    vat: Money
    gross: Money


def money(kurus: int, currency: str = "TRY") -> Money:
    """Kuruş cinsinden tam sayıdan para oluşturur: money(123456) → ₺1.234,56."""
    return Money(kurus, currency)


def _to_rational(value: int | float | str | Decimal) -> tuple[int, int]:
    """Ondalık sayıyı tam kesre çevirir: 0.1 → (1, 10), "7.5" → (75, 10)."""
    if isinstance(value, bool):
        raise MoneyError("Mantıksal değer oran olarak kullanılamaz.")
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        raise MoneyError(f"Sonlu bir sayı verin: {value}.")
    text = repr(value) if isinstance(value, float) else str(value).strip()
    match = re.fullmatch(r"([+-]?)([0-9]+)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?", text)
    if not match:
        raise MoneyError(f'"{text}" bir ondalık sayı değil (nokta ondalık ayırıcıdır: "7.5").')
    fraction = match.group(3) or ""
    exponent = int(match.group(4) or "0") - len(fraction)
    numerator = int(match.group(2) + fraction)
    denominator = 1
    if exponent >= 0:
        numerator *= 10**exponent
    else:
        denominator = 10**-exponent
    return (-numerator if match.group(1) == "-" else numerator), denominator


def _divide_round(n: int, d: int, rounding: Rounding) -> int:
    """n / d bölümünü (d > 0) seçilen kurala göre tam sayıya yuvarlar."""
    q, r = divmod(abs(n), d)
    if (
        (rounding == "up" and r > 0)
        or (rounding == "halfUp" and 2 * r >= d)
        or (rounding == "halfEven" and (2 * r > d or (2 * r == d and q % 2 == 1)))
    ):
        q += 1
    return -q if n < 0 else q


def from_decimal(
    value: int | float | str | Decimal, currency: str = "TRY", rounding: Rounding = "halfUp"
) -> Money:
    """Ondalık tutardan para; kuruşa bir kez yuvarlanır: from_decimal(12.345) → 1235 kuruş."""
    n, d = _to_rational(value)
    return Money(_divide_round(n * 100, d, rounding), currency)


def to_decimal_string(m: Money) -> str:
    """Paranın ondalık metni (veritabanı/JSON için): ₺1.234,56 → "1234.56", -₺0,05 → "-0.05"."""
    lira, kurus = divmod(abs(m.kurus), 100)
    return f"{'-' if m.kurus < 0 else ''}{lira}.{kurus:02d}"


def parse_money(text: str, currency: str | None = None) -> Money:
    """Türkçe yazılmış tutarı ayrıştırır: "₺1.234,56", "1.234,56 TL", "-12,5", "1.234 TL" (= 1234 TL).

    Para birimi metinde yoksa `currency` (varsayılan TRY) kullanılır; ikisi çelişirse hata verir.
    """
    rest = text.strip()
    detected: str | None = None
    for pattern, code in _CURRENCY_TOKENS:
        if pattern.search(rest):
            if detected is not None:
                raise MoneyError(f'"{text}" içinde birden çok para birimi var.')
            detected = code
            rest = pattern.sub(" ", rest, count=1)
    if detected is not None and currency is not None and detected != currency:
        raise MoneyError(f'"{text}" {detected} tutarı; beklenen para birimi {currency}.')
    rest = re.sub("[ \xa0\u202f]+", "", rest)
    match = re.fullmatch(r"([+\-−]?)([0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)(?:,([0-9]{1,2}))?", rest)
    if not match:
        hint = (
            "Kuruştan küçük basamak olamaz (en çok 2 ondalık)."
            if re.search(r",[0-9]{3,}\Z", rest)
            else "Türkçe biçimde yazın: 1.234,56 (nokta binlik, virgül ondalık)."
        )
        raise MoneyError(f'"{text}" tutar olarak okunamadı. {hint}')
    kurus = int(match.group(2).replace(".", "")) * 100 + int((match.group(3) or "").ljust(2, "0"))
    negative = match.group(1) not in ("", "+")
    return Money(-kurus if negative else kurus, detected or currency or "TRY")


def format_money(m: Money, *, style: Literal["symbol", "code", "plain"] = "symbol") -> str:
    """ "₺1.234,56" (symbol, varsayılan) · "1.234,56 TL" (code) · "1.234,56" (plain). Negatif: "-₺1.234,56"."""
    lira, kurus = divmod(abs(m.kurus), 100)
    number = f"{lira:,}".replace(",", ".") + f",{kurus:02d}"
    sign = "-" if m.kurus < 0 else ""
    symbol, code = _SYMBOLS.get(m.currency, (None, m.currency))
    if style == "plain":
        return sign + number
    if style == "symbol" and symbol is not None:
        return f"{sign}{symbol}{number}"
    return f"{sign}{number} {code}"


def _same_currency(a: Money, b: Money) -> None:
    if a.currency != b.currency:
        raise MoneyError(
            f"Farklı para birimleri birlikte hesaplanamaz: {a.currency} ve {b.currency}."
        )


def add(a: Money, b: Money) -> Money:
    _same_currency(a, b)
    return Money(a.kurus + b.kurus, a.currency)


def subtract(a: Money, b: Money) -> Money:
    _same_currency(a, b)
    return Money(a.kurus - b.kurus, a.currency)


def negate(m: Money) -> Money:
    return Money(-m.kurus, m.currency)


def compare(a: Money, b: Money) -> int:
    """-1, 0 ya da 1 döner (sıralama için)."""
    _same_currency(a, b)
    return (a.kurus > b.kurus) - (a.kurus < b.kurus)


def is_zero(m: Money) -> bool:
    return m.kurus == 0


def is_negative(m: Money) -> bool:
    return m.kurus < 0


def sum_money(items: Sequence[Money], currency: str | None = None) -> Money:
    """Toplam; boş liste `currency` (varsayılan TRY) cinsinden sıfır döner."""
    total = Money(0, currency or (items[0].currency if items else "TRY"))
    for item in items:
        total = add(total, item)
    return total


def multiply(m: Money, factor: int | float | str | Decimal, rounding: Rounding = "halfUp") -> Money:
    """Çarpar ve kuruşa yuvarlar: multiply(money(1999), 3) → 5997; multiply(money(1000), "0.333") → 333."""
    n, d = _to_rational(factor)
    return Money(_divide_round(m.kurus * n, d, rounding), m.currency)


def percent_of(
    m: Money, percent: int | float | str | Decimal, rounding: Rounding = "halfUp"
) -> Money:
    """Yüzde: percent_of(money(10000), 18) → 1800 kuruş."""
    n, d = _to_rational(percent)
    return Money(_divide_round(m.kurus * n, d * 100, rounding), m.currency)


def allocate(m: Money, ratios: Sequence[int | float | str | Decimal]) -> list[Money]:
    """En büyük kalan yöntemiyle oranla paylaştırır; parçaların toplamı HER ZAMAN tutara eşittir.

    allocate(money(10000), [1, 1, 1]) → 3334, 3333, 3333. Eşit kalanlarda listede öndeki pay artırılır.
    Oranlar negatif olamaz; hepsi sıfır olamaz.
    """
    if not ratios:
        raise MoneyError("En az bir oran verin.")
    rationals = [_to_rational(r) for r in ratios]
    scale = max(d for _, d in rationals)
    if any(n < 0 for n, _ in rationals):
        raise MoneyError("Oranlar negatif olamaz.")
    weights = [n * scale // d for n, d in rationals]
    total_weight = sum(weights)
    if total_weight == 0:
        raise MoneyError("Oranların toplamı sıfırdan büyük olmalı.")
    amount = abs(m.kurus)
    shares = [amount * w // total_weight for w in weights]
    order = sorted(range(len(weights)), key=lambda i: (-(amount * weights[i] % total_weight), i))
    leftover = amount - sum(shares)
    for index in order[:leftover]:
        shares[index] += 1
    return [Money(-share if m.kurus < 0 else share, m.currency) for share in shares]


def split(m: Money, parts: int) -> list[Money]:
    """Eşit parçalara böler: split(money(10000), 3) → 3334, 3333, 3333."""
    if isinstance(parts, bool) or not isinstance(parts, int) or parts < 1:
        raise MoneyError("Parça sayısı 1 veya daha büyük bir tam sayı olmalı.")
    return allocate(m, [1] * parts)


def add_vat(
    net: Money, rate_percent: int | float | str | Decimal, rounding: Rounding = "halfUp"
) -> VatBreakdown:
    """KDV hariç tutara KDV ekler: add_vat(money(10000), 20) → net 10000, KDV 2000, brüt 12000."""
    n, d = _to_rational(rate_percent)
    if n < 0:
        raise MoneyError("KDV oranı negatif olamaz.")
    vat = Money(_divide_round(net.kurus * n, d * 100, rounding), net.currency)
    return VatBreakdown(net=net, vat=vat, gross=add(net, vat))


def remove_vat(
    gross: Money, rate_percent: int | float | str | Decimal, rounding: Rounding = "halfUp"
) -> VatBreakdown:
    """KDV dahil tutardan KDV'yi ayırır; net + KDV her zaman brüte eşittir."""
    n, d = _to_rational(rate_percent)
    if n < 0:
        raise MoneyError("KDV oranı negatif olamaz.")
    net = Money(_divide_round(gross.kurus * 100 * d, 100 * d + n, rounding), gross.currency)
    return VatBreakdown(net=net, vat=subtract(gross, net), gross=gross)
