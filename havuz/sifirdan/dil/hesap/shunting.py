"""Shunting-yard (Dijkstra'nın "manevra sahası") algoritması: belirteçler → ters Lehçe gösterim.

İşleçler bir yığında bekler; önceliği düşük ya da eşit (sol birleşmeli) bir işleç gelince yığından
çıktıya aktarılır. Öncelik: `+ -` < `* / %` < tekli `-` < `^` (sağ birleşmeli) < sonek `!` ve
birim (`5 km`). Dönüşüm (`kaç`, `->`, `to`) en düşüktür: o ana kadarki bütün ifadeye uygulanır.
İşlev çağrıları için her açık parantezin bağımsız değişken sayısı ayrı bir yığında tutulur.
Özyineleme YOKTUR: derin parantezler yığın taşırmaz (yalnız uzunluk sınırı vardır).
Genişletme: yeni ikili işleç için `PRECEDENCE`'a öncelik ekleyin, evaluate.py'de anlamını yazın.
"""

from __future__ import annotations

from dataclasses import dataclass

from .errors import CalcError
from .functions import FUNCTIONS
from .lexer import Token
from .units import UNITS

PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "neg": 3, "^": 4}
RIGHT_ASSOC = {"^", "neg"}


@dataclass(frozen=True)
class Item:
    """RPN öğesi: kind = sayı | ad | işleç | çağrı | birim | dönüştür."""

    kind: str
    text: str
    pos: int
    value: float = 0.0
    argc: int = 0


@dataclass
class Frame:
    """Açık parantez: işlev çağrısıysa adı ve o ana kadarki bağımsız değişken sayısı."""

    pos: int
    function: str | None
    argc: int = 1
    name_pos: int = 0  # işlev adının konumu (çağrı hataları adı gösterir)


def to_rpn(tokens: list[Token], turkish: bool) -> list[Item]:
    if not tokens:
        raise CalcError("boş ifade", 0, "Örnek: 2 + 3 * 4")
    output: list[Item] = []
    stack: list[Item | Frame] = []
    expect_operand = True
    n = 0
    while n < len(tokens):
        tok = tokens[n]
        nxt = tokens[n + 1] if n + 1 < len(tokens) else None
        n += 1
        if tok.kind == "sayı":
            if not expect_operand:
                raise CalcError("iki değer arasında işleç eksik", tok.pos, "Örnek: 2 * 3")
            output.append(Item("sayı", tok.text, tok.pos, tok.value))
            expect_operand = False
        elif tok.kind == "ad":
            expect_operand = name(tok, nxt, stack, output, expect_operand)
        elif tok.kind == "(":
            open_paren(tok, nxt, stack, expect_operand)
        elif tok.kind == ")":
            frame = pop_until_paren(stack, output, tok)
            if expect_operand and not (frame.function and frame.argc == 0):
                raise CalcError("')' öncesinde değer bekleniyordu", tok.pos)
            if frame.function is not None:
                output.append(Item("çağrı", frame.function, frame.name_pos, argc=frame.argc))
            expect_operand = False
        elif tok.kind == "ayraç":
            in_call = any(isinstance(f, Frame) and f.function for f in stack)
            inner = pop_until_paren(stack, output, tok, keep=True) if in_call else None
            if inner is None or inner.function is None or expect_operand:
                hint = None if turkish else "Ondalık ayırıcı noktadır (1.5); Türkçe biçim: --tr"
                raise CalcError("ayraç yalnız işlev bağımsız değişkenlerini ayırır", tok.pos, hint)
            inner.argc += 1
            expect_operand = True
        elif tok.kind == "dönüştür":
            if expect_operand:
                raise CalcError("dönüşümden önce değer bekleniyordu", tok.pos)
            if nxt is None or nxt.kind != "ad" or nxt.text not in UNITS:
                raise CalcError("dönüşümden sonra birim bekleniyordu", tok.pos, unit_hint())
            flush_operators(stack, output)
            output.append(Item("dönüştür", nxt.text, nxt.pos))
            n += 1  # birim belirteci tüketildi
        else:
            expect_operand = operator(tok, stack, output, expect_operand)
    if expect_operand:
        last = tokens[-1]
        raise CalcError("ifade yarım kaldı", last.pos + len(last.text), "Sonuna bir değer ekleyin.")
    flush_operators(stack, output, final=True)
    return output


def name(
    tok: Token,
    nxt: Token | None,
    stack: list[Item | Frame],
    output: list[Item],
    expect_operand: bool,
) -> bool:
    """Ad: değerden sonra gelirse birim, `(` önündeyse işlev, yoksa değişken/sabit."""
    if not expect_operand:
        if tok.text not in UNITS:
            raise CalcError(f"bilinmeyen birim '{tok.text}'", tok.pos, unit_hint())
        output.append(Item("birim", tok.text, tok.pos))
        return False
    if nxt is not None and nxt.kind == "(":
        if tok.text not in FUNCTIONS:
            raise CalcError(f"bilinmeyen işlev '{tok.text}'", tok.pos, function_hint())
        stack.append(Item("işlev-adı", tok.text, tok.pos))
        return True
    output.append(Item("ad", tok.text, tok.pos))
    return False


def open_paren(
    tok: Token, nxt: Token | None, stack: list[Item | Frame], expect_operand: bool
) -> None:
    if not expect_operand:
        raise CalcError("'(' öncesinde işleç eksik", tok.pos, "2(3+4) yerine 2*(3+4) yazın.")
    top = stack[-1] if stack else None
    function, name_pos = None, tok.pos
    if isinstance(top, Item) and top.kind == "işlev-adı":
        stack.pop()
        function, name_pos = top.text, top.pos
    argc = 0 if function and nxt is not None and nxt.kind == ")" else 1
    stack.append(Frame(tok.pos, function, argc, name_pos))


def operator(
    tok: Token, stack: list[Item | Frame], output: list[Item], expect_operand: bool
) -> bool:
    """İşleci yerleştirir; yeni "değer bekleniyor" durumunu döndürür."""
    op = tok.text
    if op == "=":
        raise CalcError("atama yalnız başta yapılır", tok.pos, "Örnek: x = 5 * 2")
    if expect_operand:
        if op == "-":
            stack.append(Item("işleç", "neg", tok.pos))
            return True
        if op == "+":
            return True  # tekli artı: etkisiz
        raise CalcError(f"'{op}' öncesinde değer bekleniyordu", tok.pos)
    if op == "!":
        output.append(Item("işleç", "!", tok.pos))
        return False
    prec = PRECEDENCE[op]
    while stack and isinstance(stack[-1], Item) and stack[-1].kind == "işleç":
        top = stack[-1].text
        if PRECEDENCE[top] > prec or (PRECEDENCE[top] == prec and op not in RIGHT_ASSOC):
            item = stack.pop()
            assert isinstance(item, Item)
            output.append(item)
        else:
            break
    stack.append(Item("işleç", op, tok.pos))
    return True


def pop_until_paren(
    stack: list[Item | Frame], output: list[Item], tok: Token, keep: bool = False
) -> Frame:
    while stack and not isinstance(stack[-1], Frame):
        item = stack.pop()
        assert isinstance(item, Item)
        output.append(item)
    if not stack:
        what = "')'" if tok.kind == ")" else "ayraç"
        raise CalcError(f"eşi olmayan {what}", tok.pos, "Açılış parantezi eksik olabilir.")
    frame = stack[-1]
    assert isinstance(frame, Frame)
    if not keep:
        stack.pop()
    return frame


def flush_operators(stack: list[Item | Frame], output: list[Item], final: bool = False) -> None:
    while stack and isinstance(stack[-1], Item):
        output.append(stack.pop())  # type: ignore[arg-type]
    if final and stack:
        frame = stack[-1]
        assert isinstance(frame, Frame)
        raise CalcError("parantez kapanmadı", frame.pos, "Sonuna ')' ekleyin.")


def unit_hint() -> str:
    names = sorted({u.name for u in UNITS.values()})
    return "Birimler: " + ", ".join(names) + "."


def function_hint() -> str:
    return "İşlevler: " + ", ".join(sorted(FUNCTIONS)) + "."
