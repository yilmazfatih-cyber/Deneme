"""İfade ayrıştırıcısı: belirteç akışı üstünde gezinme + öncelik basamaklı (recursive descent)
ifadeler.

Öncelik (düşükten yükseğe, SQLite ile aynı): OR · AND · NOT · (= <> IS IN LIKE BETWEEN) · (< <= >
>=) · (+ -) · (* / %) · || · tekli (- +) · birincil (sabit, sütun, işlev, parantez, CASE).

Genişletme: yeni bir işleç → uygun öncelik basamağındaki işleve bir dal; yeni ifade düğümü
`syntax.py`'de.
"""

from __future__ import annotations

from .errors import SqlError
from .lexer import Token
from .syntax import (
    Between,
    Binary,
    Call,
    Case,
    Column,
    Expr,
    InList,
    Like,
    Literal,
    Param,
    Unary,
)


class ExprParser:
    """Belirteç imleci ve ifade kuralları; deyim ayrıştırıcısı (`parser.Parser`) bunu genişletir."""

    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0
        self.param_count = 0

    # ── İmleç yardımcıları ──────────────────────────────────────────────────────────────────────

    def peek(self, offset: int = 0) -> Token:
        return self.tokens[min(self.pos + offset, len(self.tokens) - 1)]

    def advance(self) -> Token:
        token = self.peek()
        self.pos += 1
        return token

    def accept_kw(self, *words: str) -> bool:
        if self.peek().kind == "KEYWORD" and self.peek().value in words:
            self.pos += 1
            return True
        return False

    def accept_op(self, *ops: str) -> str | None:
        if self.peek().kind == "OP" and self.peek().value in ops:
            return self.advance().value
        return None

    def expect_kw(self, word: str) -> None:
        if not self.accept_kw(word):
            self.fail(f"'{word.upper()}' bekleniyordu")

    def expect_op(self, op: str) -> None:
        if self.accept_op(op) is None:
            self.fail(f"'{op}' bekleniyordu")

    def ident(self) -> str:
        token = self.peek()
        if token.kind != "IDENT":
            what = "anahtar sözcük" if token.kind == "KEYWORD" else "belirteç"
            self.fail(f'ad bekleniyordu ({what} {token.value!r}; ad olarak "..." içinde yazın)')
        return self.advance().value

    def fail(self, message: str) -> None:
        token = self.peek()
        near = token.value if token.kind != "EOF" else "metnin sonu"
        raise SqlError(f"Sözdizimi hatası, {token.position}. karakter ({near!r} yakını): {message}")

    # ── İfadeler ────────────────────────────────────────────────────────────────────────────────

    def expr(self) -> Expr:
        left = self._and()
        while self.accept_kw("or"):
            left = Binary("or", left, self._and())
        return left

    def _and(self) -> Expr:
        left = self._not()
        while self.accept_kw("and"):
            left = Binary("and", left, self._not())
        return left

    def _not(self) -> Expr:
        if self.accept_kw("not"):
            return Unary("not", self._not())
        return self._equality()

    def _equality(self) -> Expr:
        left = self._relational()
        while True:
            op = self.accept_op("=", "==", "!=", "<>")
            if op is not None:
                left = Binary("=" if op in ("=", "==") else "<>", left, self._relational())
                continue
            if self.accept_kw("is"):
                op = "is not" if self.accept_kw("not") else "is"
                left = Binary(op, left, self._relational())
                continue
            start = self.pos
            negated = self.accept_kw("not")
            if self.accept_kw("in"):
                left = InList(left, self._in_items(), negated)
            elif self.accept_kw("between"):
                low = self._relational()
                self.expect_kw("and")
                left = Between(left, low, self._relational(), negated)
            elif self.accept_kw("like"):
                left = Like(left, self._relational(), negated)
            else:
                self.pos = start  # "not" bu basamağa ait değilmiş
                return left

    def _in_items(self) -> tuple[Expr, ...]:
        self.expect_op("(")
        items = [self.expr()]
        while self.accept_op(","):
            items.append(self.expr())
        self.expect_op(")")
        return tuple(items)

    def _relational(self) -> Expr:
        left = self._additive()
        while (op := self.accept_op("<", "<=", ">", ">=")) is not None:
            left = Binary(op, left, self._additive())
        return left

    def _additive(self) -> Expr:
        left = self._multiplicative()
        while (op := self.accept_op("+", "-")) is not None:
            left = Binary(op, left, self._multiplicative())
        return left

    def _multiplicative(self) -> Expr:
        left = self._concat()
        while (op := self.accept_op("*", "/", "%")) is not None:
            left = Binary(op, left, self._concat())
        return left

    def _concat(self) -> Expr:
        left = self._unary()
        while self.accept_op("||") is not None:
            left = Binary("||", left, self._unary())
        return left

    def _unary(self) -> Expr:
        op = self.accept_op("-", "+")
        if op is not None:
            return Unary(op, self._unary())
        return self._primary()

    def _primary(self) -> Expr:
        token = self.peek()
        if token.kind == "NUMBER":
            self.advance()
            is_real = any(ch in token.value for ch in ".eE")
            return Literal(float(token.value) if is_real else int(token.value))
        if token.kind == "STRING":
            self.advance()
            return Literal(token.value)
        if token.kind == "PARAM":
            self.advance()
            self.param_count += 1
            return Param(self.param_count - 1)
        if self.accept_kw("null"):
            return Literal(None)
        if self.accept_kw("true", "false"):
            return Literal(1 if self.tokens[self.pos - 1].value == "true" else 0)
        if self.accept_op("("):
            inner = self.expr()
            self.expect_op(")")
            return inner
        if self.accept_kw("case"):
            return self._case()
        if token.kind == "IDENT":
            name = self.advance().value
            if self.accept_op("("):
                return self._call(name)
            if self.accept_op("."):
                return Column(name, self.ident())
            return Column(None, name)
        self.fail("ifade bekleniyordu")
        raise AssertionError("ulaşılamaz")

    def _call(self, name: str) -> Expr:
        if self.accept_op("*"):
            self.expect_op(")")
            return Call(name, (), star=True)
        distinct = self.accept_kw("distinct")
        args: list[Expr] = []
        if self.accept_op(")") is None:
            args.append(self.expr())
            while self.accept_op(","):
                args.append(self.expr())
            self.expect_op(")")
        return Call(name, tuple(args), distinct=distinct)

    def _case(self) -> Expr:
        operand = None if self.peek().value == "when" else self.expr()
        whens: list[tuple[Expr, Expr]] = []
        while self.accept_kw("when"):
            condition = self.expr()
            self.expect_kw("then")
            whens.append((condition, self.expr()))
        if not whens:
            self.fail("CASE en az bir WHEN ister")
        default = self.expr() if self.accept_kw("else") else None
        self.expect_kw("end")
        return Case(operand, tuple(whens), default)
