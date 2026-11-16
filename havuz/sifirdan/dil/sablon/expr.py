"""Etiket içi ifadeler: belirteçleme + öncelikli ayrıştırma → doğrudan Python kapanımlarına derleme.

Dilbilgisi (gevşekten sıkıya): `or` → `and` → `not` → karşılaştırma (== != < <= > >= in, not in)
→ `~` (birleştirme) → `+ -` → `* / %` → tekli `-` → sonek (`.ad`, `[ifade]`, `| süzgeç(arg)`).
Çağrı sözdizimi YOKTUR (şablon kod çalıştıramaz); `_` ile başlayan adlara erişilemez.
Her ifade `Callable[[Context], object]` bir kapanıma derlenir; hata, ifadenin konumuyla verilir.
Genişletme: yeni işleç için `BINARY` tablosuna ve ilgili ayrıştırma düzeyine bir satır ekleyin.
"""

from __future__ import annotations

import operator
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .filters import FILTERS
from .markup import Markup, RenderProblem, TemplateError, Undefined, escape

if TYPE_CHECKING:
    from .environment import Context

Expr = Callable[["Context"], object]

TWO_CHAR = ("==", "!=", "<=", ">=")
ONE_CHAR = "<>+-*/%~()[].,|=:"
CONSTANTS = {"true": True, "false": False, "none": None, "True": True, "False": False, "None": None}
BINARY: dict[str, Callable[[Any, Any], object]] = {
    "==": operator.eq,
    "!=": operator.ne,
    "<": operator.lt,
    "<=": operator.le,
    ">": operator.gt,
    ">=": operator.ge,
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "%": operator.mod,
    "in": lambda a, b: operator.contains(b, a),
    "not in": lambda a, b: not operator.contains(b, a),
}


@dataclass
class Tok:
    kind: str  # "ad", "sayı", "dizgi", "işaret", "son"
    text: str
    value: object
    line: int
    col: int


def tokenize(src: str, name: str, line: int, col: int) -> list[Tok]:
    toks: list[Tok] = []
    i = 0
    while i < len(src):
        c = src[i]
        here = (line, col)
        if c == "\n":
            line, col, i = line + 1, 1, i + 1
            continue
        if c in " \t\r":
            i, col = i + 1, col + 1
            continue
        start = i
        if c.isalpha() or c == "_":
            while i < len(src) and (src[i].isalnum() or src[i] == "_"):
                i += 1
            toks.append(Tok("ad", src[start:i], src[start:i], *here))
        elif c.isdigit():
            while i < len(src) and (src[i].isdigit() or src[i] == "."):
                i += 1
            text = src[start:i]
            try:
                value: object = float(text) if "." in text else int(text)
            except ValueError:
                raise TemplateError(f"geçersiz sayı '{text}'", name, *here) from None
            toks.append(Tok("sayı", text, value, *here))
        elif c in "'\"":
            i += 1
            out: list[str] = []
            while i < len(src) and src[i] != c:
                if src[i] == "\\" and i + 1 < len(src):
                    i += 1
                    out.append({"n": "\n", "t": "\t"}.get(src[i], src[i]))
                else:
                    out.append(src[i])
                i += 1
            if i >= len(src):
                raise TemplateError("dizgi kapanmadı", name, *here, f"Dizgiyi {c} ile kapatın.")
            i += 1
            toks.append(Tok("dizgi", src[start:i], "".join(out), *here))
        elif src[i : i + 2] in TWO_CHAR:
            i += 2
            toks.append(Tok("işaret", src[start:i], None, *here))
        elif c in ONE_CHAR:
            i += 1
            toks.append(Tok("işaret", c, None, *here))
        else:
            raise TemplateError(f"beklenmeyen karakter '{c}'", name, *here)
        col += i - start
    toks.append(Tok("son", "", None, line, col))
    return toks


def get_attr(obj: object, name: str) -> object:
    """`a.b`: sözlükte anahtar, nesnede (yöntem olmayan) öznitelik; yoksa Undefined."""
    if name.startswith("_"):
        raise RenderProblem(f"'_' ile başlayan '{name}' adına erişilemez", "Güvenlik kuralıdır.")
    if isinstance(obj, Undefined):
        return Undefined(f"{obj.path}.{name}")
    if isinstance(obj, dict):
        return obj[name] if name in obj else Undefined(name)
    value = getattr(obj, name, Undefined(name))
    if callable(value) and not isinstance(value, Undefined):
        raise RenderProblem(f"'{name}' bir yöntem; şablondan yöntem çağrılamaz")
    return value


def attribute(obj: object, name: object) -> object:
    return get_attr(obj, str(name))


def get_item(obj: object, key: object) -> object:
    if isinstance(obj, Undefined):
        return Undefined(f"{obj.path}[{key!r}]")
    if isinstance(obj, dict):
        return obj[key] if key in obj else Undefined(repr(key))
    if isinstance(obj, (list, tuple, str)) and isinstance(key, int) and not isinstance(key, bool):
        return obj[key] if -len(obj) <= key < len(obj) else Undefined(f"[{key}]")
    if isinstance(key, str):
        return get_attr(obj, key)
    return Undefined(f"[{key!r}]")


class ExprParser:
    def __init__(self, toks: list[Tok], name: str) -> None:
        self.toks = toks
        self.i = 0
        self.name = name

    def peek(self) -> Tok:
        return self.toks[self.i]

    def next(self) -> Tok:
        tok = self.toks[self.i]
        self.i = min(self.i + 1, len(self.toks) - 1)
        return tok

    def accept(self, text: str) -> bool:
        tok = self.peek()
        if tok.kind in ("işaret", "ad") and tok.text == text:
            self.next()
            return True
        return False

    def expect(self, text: str, where: str) -> Tok:
        tok = self.peek()
        if not self.accept(text):
            found = f"'{tok.text}'" if tok.text else "ifade sonu"
            raise self.error(tok, f"{where} '{text}' bekleniyordu, {found} bulundu")
        return tok

    def error(self, tok: Tok, message: str, hint: str | None = None) -> TemplateError:
        return TemplateError(message, self.name, tok.line, tok.col, hint)

    def guard(self, tok: Tok, fn: Callable[[Context], object]) -> Expr:
        """Değerlendirme hatalarını bu belirtecin konumuyla şablon hatasına çevirir."""

        def run(ctx: Context) -> object:
            try:
                return fn(ctx)
            except RenderProblem as problem:
                raise self.error(tok, problem.message, problem.hint) from None
            except (TypeError, ValueError, IndexError) as exc:
                detail = f" ({type(exc).__name__})" if not isinstance(exc, IndexError) else ""
                raise self.error(tok, f"'{tok.text}' değerlendirilemedi{detail}") from None

        return run

    # --- öncelik düzeyleri ---------------------------------------------------
    def parse(self) -> Expr:
        return self.or_expr()

    def or_expr(self) -> Expr:
        left = self.and_expr()
        while self.accept("or"):
            left = either(left, self.and_expr())
        return left

    def and_expr(self) -> Expr:
        left = self.not_expr()
        while self.accept("and"):
            left = both(left, self.not_expr())
        return left

    def not_expr(self) -> Expr:
        if self.accept("not"):
            inner = self.not_expr()
            return lambda ctx: not inner(ctx)
        return self.comparison()

    def comparison(self) -> Expr:
        left = self.binary_level(0)
        tok = self.peek()
        op = tok.text if tok.text in ("==", "!=", "<", "<=", ">", ">=", "in") else ""
        if not op and tok.text == "not" and self.toks[self.i + 1].text == "in":
            self.next()
            op = "not in"
        if not op:
            return left
        self.next()
        return self.guard(tok, apply(BINARY[op], left, self.binary_level(0), op))

    LEVELS = (("~",), ("+", "-"), ("*", "/", "%"))

    def binary_level(self, level: int) -> Expr:
        if level == len(self.LEVELS):
            return self.unary()
        left = self.binary_level(level + 1)
        while self.peek().kind == "işaret" and self.peek().text in self.LEVELS[level]:
            tok = self.next()
            fn = concat if tok.text == "~" else BINARY[tok.text]
            left = self.guard(tok, apply(fn, left, self.binary_level(level + 1), tok.text))
        return left

    def unary(self) -> Expr:
        tok = self.peek()
        if self.accept("-"):
            return self.guard(tok, apply(operator.sub, constant(0), self.unary(), "-"))
        return self.postfix(self.primary())

    def postfix(self, value: Expr) -> Expr:
        while True:
            tok = self.peek()
            if self.accept("."):
                attr = self.next()
                if attr.kind != "ad":
                    raise self.error(attr, "'.' sonrasında ad bekleniyordu")
                value = self.guard(attr, apply(attribute, value, constant(attr.text)))
            elif self.accept("["):
                key = self.parse()
                self.expect("]", "dizinden sonra")
                value = self.guard(tok, apply(get_item, value, key))
            elif self.accept("|"):
                value = self.filter_call(value)
            else:
                return value

    def filter_call(self, value: Expr) -> Expr:
        tok = self.next()
        if tok.kind != "ad" or tok.text not in FILTERS:
            known = ", ".join(sorted(FILTERS))
            raise self.error(tok, f"bilinmeyen süzgeç '{tok.text}'", f"Süzgeçler: {known}.")
        args: list[Expr] = []
        if self.accept("("):
            while not self.accept(")"):
                args.append(self.parse())
                if not self.accept(","):
                    self.expect(")", "süzgeç bağımsız değişkeninden sonra")
                    break
        fn = FILTERS[tok.text]
        return self.guard(tok, lambda ctx: fn(ctx.env, value(ctx), *[a(ctx) for a in args]))

    def primary(self) -> Expr:
        tok = self.next()
        if tok.kind in ("sayı", "dizgi"):
            return constant(tok.value)
        if tok.kind == "ad" and tok.text in CONSTANTS:
            return constant(CONSTANTS[tok.text])
        if tok.kind == "ad":
            if tok.text.startswith("_"):
                raise self.error(tok, f"'_' ile başlayan '{tok.text}' adı kullanılamaz")
            name = tok.text
            return lambda ctx: ctx.lookup(name)
        if tok.text == "(":
            inner = self.parse()
            self.expect(")", "ifadeden sonra")
            return inner
        if tok.text == "[":
            items: list[Expr] = []
            while not self.accept("]"):
                items.append(self.parse())
                if not self.accept(","):
                    self.expect("]", "liste öğesinden sonra")
                    break
            return lambda ctx: [item(ctx) for item in items]
        found = f"'{tok.text}'" if tok.text else "ifade sonu"
        raise self.error(tok, f"ifade bekleniyordu, {found} bulundu")


# --- kapanım üreticileri (her biri bir ifade parçasını Python işlevine çevirir) ---------------


def constant(value: object) -> Expr:
    return lambda ctx: value


def label(value: object) -> str:
    """Hata iletisi için Türkçe tür adı."""
    if isinstance(value, Undefined):
        return f"tanımsız '{value.path}'"
    names = {
        bool: "mantıksal",
        int: "sayı",
        float: "sayı",
        str: "metin",
        list: "liste",
        dict: "sözlük",
    }
    return "boş (None)" if value is None else names.get(type(value), type(value).__name__)


def apply(
    fn: Callable[[object, object], object], left: Expr, right: Expr, symbol: str = ""
) -> Expr:
    """İkili işlem; Python'un İngilizce TypeError'ını Türkçe ve türleri söyleyen iletiye çevirir."""

    def run(ctx: Context) -> object:
        a, b = left(ctx), right(ctx)
        try:
            return fn(a, b)
        except ZeroDivisionError:
            raise RenderProblem("sıfıra bölme") from None
        except TypeError:
            raise RenderProblem(
                f"'{symbol}' işlemi {label(a)} ile {label(b)} arasında yapılamaz"
            ) from None

    return run


def either(left: Expr, right: Expr) -> Expr:
    return lambda ctx: left(ctx) or right(ctx)


def both(left: Expr, right: Expr) -> Expr:
    return lambda ctx: left(ctx) and right(ctx)


def concat(a: object, b: object) -> object:
    """`~`: iki değeri metin olarak birleştirir (güvenli işaretleme korunur)."""
    if isinstance(a, Markup) or isinstance(b, Markup):
        return escape(a) + escape(b)
    return f"{'' if a is None else a}{'' if b is None else b}"


def compile_expression(source: str, name: str, line: int, col: int) -> Expr:
    """Tek bir ifadeyi (ör. `kullanici.ad | upper`) kapanıma derler; artık belirteç kalmamalı."""
    parser = ExprParser(tokenize(source, name, line, col), name)
    expr = parser.parse()
    tail = parser.peek()
    if tail.kind != "son":
        hint = (
            "Satır içi `a if b else c` yok; {% if %} etiketi kullanın."
            if tail.text == "if"
            else None
        )
        raise parser.error(tail, f"ifadenin sonunda fazladan '{tail.text}'", hint)
    return expr
