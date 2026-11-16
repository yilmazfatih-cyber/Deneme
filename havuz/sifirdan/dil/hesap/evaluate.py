"""RPN değerlendirici ve `Calculator` (değişkenleri hatırlayan hesap makinesi). `eval` YOKTUR.

RPN öğeleri sırayla işlenir: sayı/ad yığına iter, işleç iki (tekli işleç bir) değer alıp sonucu
iter, `birim` tepedeki sayıya birim takar, `dönüştür` tepedeki değeri hedef birime çevirir.
Ondalık taşma (sonsuz/NaN) ve aralık dışı işlev girdileri Türkçe hataya çevrilir.
`Calculator.calculate("x = 5 km")` atama yapar; `son` son sonucu tutar.
Genişletme: yeni işleç için `binary` içine bir dal; yeni işlev için functions.py.
"""

from __future__ import annotations

import math

from .errors import CalcError
from .functions import CONSTANTS, FUNCTIONS, factorial
from .lexer import tokenize
from .numfmt import format_number
from .shunting import Item, to_rpn
from .units import UNITS, Quantity, add, divide, multiply

RESERVED = set(CONSTANTS) | set(FUNCTIONS) | set(UNITS) | {"son", "kaç", "kac", "to"}


def checked(value: float, pos: int) -> float:
    if math.isinf(value) or math.isnan(value):
        raise CalcError("sonuç sonlu bir sayı değil (çok büyük ya da tanımsız)", pos)
    return value


def plain(q: Quantity, what: str, pos: int) -> float:
    if q.unit is not None:
        raise CalcError(f"{what} yalnız birimsiz sayılarla yapılır, {q.describe()} verildi", pos)
    return q.value


def binary(op: str, a: Quantity, b: Quantity, pos: int) -> Quantity:
    if op in ("+", "-", "*", "/"):
        if op == "*":
            result = multiply(a, b, pos)
        elif op == "/":
            result = divide(a, b, pos)
        else:
            result = add(a, b, 1 if op == "+" else -1, pos)
        return Quantity(checked(result.value, pos), result.unit)
    if op == "%":
        divisor = plain(b, "kalan (%)", pos)
        if divisor == 0:
            raise CalcError("sıfıra göre kalan alınamaz", pos)
        return Quantity(math.fmod(plain(a, "kalan (%)", pos), divisor))
    base, exponent = plain(a, "üs alma", pos), plain(b, "üs alma", pos)
    try:
        result = base**exponent
    except (OverflowError, ZeroDivisionError):
        raise CalcError("üs alma sonucu tanımsız ya da çok büyük", pos) from None
    if isinstance(result, complex):
        raise CalcError("negatif sayının kesirli kuvveti gerçel değil", pos)
    return Quantity(checked(result, pos))


class Calculator:
    def __init__(self, turkish: bool = False) -> None:
        self.turkish = turkish
        self.variables: dict[str, Quantity] = {}

    def calculate(self, text: str) -> Quantity:
        tokens = tokenize(text, self.turkish)
        target = None
        if len(tokens) >= 2 and tokens[0].kind == "ad" and tokens[1].text == "=":
            target = tokens[0]
            if target.text in RESERVED:
                raise CalcError(
                    f"'{target.text}' ayrılmış bir ad", target.pos, "Başka bir ad seçin."
                )
            tokens = tokens[2:]
        result = self.run(to_rpn(tokens, self.turkish))
        if target is not None:
            self.variables[target.text] = result
        self.variables["son"] = result
        return result

    def format(self, q: Quantity) -> str:
        text = format_number(q.value, self.turkish)
        return text if q.unit is None else f"{text} {q.unit.name}"

    def run(self, program: list[Item]) -> Quantity:
        stack: list[Quantity] = []
        for item in program:
            if item.kind == "sayı":
                stack.append(Quantity(item.value))
            elif item.kind == "ad":
                stack.append(self.lookup(item))
            elif item.kind == "birim":
                value = stack.pop()
                if value.unit is not None:
                    raise CalcError(
                        "değerin zaten birimi var", item.pos, "Dönüşüm için: 5 km kaç m"
                    )
                stack.append(Quantity(value.value, UNITS[item.text]))
            elif item.kind == "dönüştür":
                stack.append(stack.pop().convert(UNITS[item.text], item.pos))
            elif item.kind == "çağrı":
                args = [stack.pop() for _ in range(item.argc)][::-1]
                stack.append(self.call(item, args))
            elif item.text == "neg":
                negated = stack.pop()
                stack.append(Quantity(-negated.value, negated.unit))
            elif item.text == "!":
                number = plain(stack.pop(), "faktöriyel", item.pos)
                stack.append(Quantity(self.safely(factorial, [number], item)))
            else:
                right, left = stack.pop(), stack.pop()
                stack.append(binary(item.text, left, right, item.pos))
        assert len(stack) == 1, "RPN dengesiz: shunting.py'de bir hata var"
        return Quantity(checked(stack[0].value, 0), stack[0].unit)

    def lookup(self, item: Item) -> Quantity:
        if item.text in self.variables:
            return self.variables[item.text]
        if item.text in CONSTANTS:
            return Quantity(CONSTANTS[item.text])
        known = sorted(set(self.variables) | set(CONSTANTS))
        raise CalcError(
            f"'{item.text}' tanımlı değil",
            item.pos,
            f"Önce atayın: {item.text} = 5"
            + (f" (tanımlılar: {', '.join(known)})" if known else ""),
        )

    def call(self, item: Item, args: list[Quantity]) -> Quantity:
        low, high, fn = FUNCTIONS[item.text]
        if len(args) < low or (high is not None and len(args) > high):
            want = f"{low}" if low == high else f"en az {low}" if high is None else f"{low}–{high}"
            raise CalcError(
                f"'{item.text}' {want} bağımsız değişken alır, {len(args)} verildi", item.pos
            )
        values = [plain(a, f"'{item.text}' işlevi", item.pos) for a in args]
        return Quantity(self.safely(fn, values, item))

    @staticmethod
    def safely(fn: object, values: list[float], item: Item) -> float:
        assert callable(fn)
        try:
            result = fn(*values)
        except (ValueError, OverflowError) as exc:
            detail = str(exc) if any(c in str(exc) for c in "çğıöşü") else "tanım aralığı dışında"
            raise CalcError(f"'{item.text}': {detail}", item.pos) from None
        return checked(float(result), item.pos)


def calculate(text: str, turkish: bool = False) -> Quantity:
    """Tek seferlik hesap: `calculate("5 km + 300 m")` → Quantity(5.3, km)."""
    return Calculator(turkish).calculate(text)
