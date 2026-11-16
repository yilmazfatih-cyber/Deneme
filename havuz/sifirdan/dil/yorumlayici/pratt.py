"""İfade ayrıştırıcı (Pratt / "üst sınır öncelikli" ayrıştırma) ve belirteç imleci.

Her işlecin bir bağlama gücü (binding power) vardır; `expression(min_bp)` yalnız gücü `min_bp`'den
büyük işleçleri tüketir. Sol birleşmeli işlecin sağ tarafı aynı güçle, sağ birleşmeli `**`
bir eksiğiyle ayrıştırılır. Karşılaştırmalar zincirlenemez (`a < b < c` → yol gösteren hata).
Kullanan: parser.py (`Parser` bu sınıftan türer ve `parse_block`'u sağlar).
Genişletme: yeni ikili işleç için `INFIX` tablosuna bir satır, ops.py `binary` içine bir dal
ekleyin.
"""

from __future__ import annotations

from .errors import Pos, syntax_error
from .nodes import (
    Binary,
    Call,
    DictLit,
    Expr,
    FuncLit,
    Index,
    ListLit,
    Literal,
    Logical,
    Name,
    Stmt,
    Unary,
)
from .tokens import Token, TokenType

T = TokenType
MAX_NESTING = 100  # iç içe ifade/blok sınırı: kötü niyetli girdi yığını taşırmasın

# Bağlama güçleri (büyük olan daha sıkı bağlar).
BP_OR, BP_AND, BP_NOT, BP_EQUALITY, BP_COMPARE, BP_SUM, BP_PRODUCT, BP_UNARY, BP_POWER = range(
    1, 10
)

# Ara (infix) işleçler: belirteç -> (güç, AST'deki işleç adı). YENİ İŞLEÇ BURAYA.
INFIX: dict[TokenType, tuple[int, str]] = {
    T.OR: (BP_OR, "veya"),
    T.AND: (BP_AND, "ve"),
    T.EQ: (BP_EQUALITY, "=="),
    T.NE: (BP_EQUALITY, "!="),
    T.LT: (BP_COMPARE, "<"),
    T.LE: (BP_COMPARE, "<="),
    T.GT: (BP_COMPARE, ">"),
    T.GE: (BP_COMPARE, ">="),
    T.PLUS: (BP_SUM, "+"),
    T.MINUS: (BP_SUM, "-"),
    T.STAR: (BP_PRODUCT, "*"),
    T.SLASH: (BP_PRODUCT, "/"),
    T.PERCENT: (BP_PRODUCT, "%"),
    T.POWER: (BP_POWER, "**"),
}
COMPARISONS = {T.EQ, T.NE, T.LT, T.LE, T.GT, T.GE}


class ExpressionParser:
    """Belirteç imleci + ifade ayrıştırma. Deyimleri `Parser` (parser.py) ekler."""

    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.i = 0
        self.nesting = 0

    # --- imleç -------------------------------------------------------------
    def peek(self, offset: int = 0) -> Token:
        return self.tokens[min(self.i + offset, len(self.tokens) - 1)]

    def advance(self) -> Token:
        tok = self.tokens[self.i]
        if tok.type is not T.EOF:
            self.i += 1
        return tok

    def check(self, *types: TokenType) -> bool:
        return self.peek().type in types

    def match(self, *types: TokenType) -> Token | None:
        return self.advance() if self.check(*types) else None

    def skip_newlines(self) -> None:
        while self.peek().type is T.NEWLINE:
            self.advance()

    def expect(self, type_: TokenType, where: str, hint: str | None = None) -> Token:
        """`type_` bekler; yoksa "nerede: 'x' bekleniyordu, 'y' bulundu" hatası verir."""
        if self.check(type_):
            return self.advance()
        found = self.peek()
        raise syntax_error(
            f"{where} '{type_.value}' bekleniyordu, {found.describe()} bulundu",
            found.pos,
            hint,
            at_eof=found.type is T.EOF,
        )

    def enter(self, pos: Pos) -> None:
        self.nesting += 1
        if self.nesting > MAX_NESTING:
            raise syntax_error(
                f"çok derin iç içe yapı (en fazla {MAX_NESTING} düzey)",
                pos,
                "İfadeyi ara değişkenlere bölün.",
            )

    def parse_block(self) -> list[Stmt]:  # pragma: no cover - Parser geçersiz kılar
        raise NotImplementedError

    # --- ifadeler ----------------------------------------------------------
    def expression(self, min_bp: int = 0) -> Expr:
        self.enter(self.peek().pos)
        left = self.prefix()
        while True:
            tok = self.peek()
            if tok.type is T.LPAREN:
                left = self.call(left)
                continue
            if tok.type is T.LBRACKET:
                self.advance()
                index = self.expression()
                self.expect(T.RBRACKET, "dizinden sonra")
                left = Index(left, index, tok.pos)
                continue
            info = INFIX.get(tok.type)
            if info is None or info[0] <= min_bp:
                break
            bp, op = info
            self.advance()
            self.skip_newlines()  # işleçten sonra satır bölünebilir: `a +\n b`
            right = self.expression(bp - 1 if tok.type is T.POWER else bp)
            if tok.type in (T.AND, T.OR):
                left = Logical(op, left, right, tok.pos)
            else:
                left = Binary(op, left, right, tok.pos)
            nxt = self.peek().type
            if tok.type in COMPARISONS and nxt in COMPARISONS and INFIX[nxt][0] == bp:
                raise syntax_error(
                    "karşılaştırmalar zincirlenemez",
                    self.peek().pos,
                    "`a < b < c` yerine `a < b ve b < c` yazın.",
                )
        self.nesting -= 1
        return left

    def prefix(self) -> Expr:
        tok = self.advance()
        match tok.type:
            case T.NUMBER | T.STRING:
                return Literal(tok.value, tok.pos)
            case T.TRUE:
                return Literal(True, tok.pos)
            case T.FALSE:
                return Literal(False, tok.pos)
            case T.NONE:
                return Literal(None, tok.pos)
            case T.IDENT:
                return Name(tok.text, tok.pos)
            case T.MINUS:
                return Unary("-", self.expression(BP_UNARY), tok.pos)
            case T.NOT:
                return Unary("değil", self.expression(BP_NOT), tok.pos)
            case T.LPAREN:
                inner = self.expression()
                self.expect(T.RPAREN, "ifadeden sonra", f"'(' {tok.pos} konumunda açılmıştı.")
                return inner
            case T.LBRACKET:
                return ListLit(self.items(T.RBRACKET, "liste öğesinden sonra"), tok.pos)
            case T.LBRACE:
                return self.dict_literal(tok)
            case T.FUNC:
                return self.function_literal("<adsız>", tok.pos)
        raise self.unexpected(tok)

    def unexpected(self, tok: Token) -> Exception:
        hint = None
        if tok.type is T.RPAREN:
            hint = "Fazladan bir ')' olabilir."
        elif tok.type in (T.NEWLINE, T.EOF):
            hint = "Satır yarıda kalmış; ifadeyi tamamlayın."
        elif tok.type in (T.VAR, T.IF, T.WHILE, T.FOR, T.RETURN):
            hint = f"'{tok.text}' bir deyimdir; ifade içinde kullanılamaz."
        elif tok.type is T.ASSIGN:
            hint = "Karşılaştırma için `==` yazın."
        return syntax_error(
            f"ifade bekleniyordu, {tok.describe()} bulundu", tok.pos, hint, at_eof=tok.type is T.EOF
        )

    def items(self, closer: TokenType, where: str) -> list[Expr]:
        """Virgülle ayrılmış ifadeler; sondaki virgüle izin verilir: `[1, 2,]`."""
        items: list[Expr] = []
        while not self.check(closer):
            items.append(self.expression())
            if not self.match(T.COMMA):
                break
        self.expect(closer, where)
        return items

    def call(self, callee: Expr) -> Expr:
        open_tok = self.advance()
        args = self.items(T.RPAREN, "bağımsız değişkenden sonra")
        return Call(callee, args, open_tok.pos)

    def dict_literal(self, open_tok: Token) -> Expr:
        pairs: list[tuple[Expr, Expr]] = []
        self.skip_newlines()
        while not self.check(T.RBRACE):
            key = self.expression()
            self.expect(T.COLON, "sözlük anahtarından sonra", 'Biçim: {"ad": "Ayşe", "yaş": 40}')
            self.skip_newlines()
            pairs.append((key, self.expression()))
            self.skip_newlines()
            if not self.match(T.COMMA):
                break
            self.skip_newlines()
        self.expect(T.RBRACE, "sözlük öğesinden sonra", f"'{{' {open_tok.pos} konumunda açılmıştı.")
        return DictLit(pairs, open_tok.pos)

    def function_literal(self, name: str, pos: Pos) -> FuncLit:
        self.expect(T.LPAREN, "işlev parametrelerinden önce")
        params: list[str] = []
        while not self.check(T.RPAREN):
            tok = self.expect(T.IDENT, "parametre olarak")
            if tok.text in params:
                raise syntax_error(f"'{tok.text}' parametresi iki kez yazılmış", tok.pos)
            params.append(tok.text)
            if not self.match(T.COMMA):
                break
        self.expect(T.RPAREN, "parametrelerden sonra")
        return FuncLit(name, params, self.parse_block(), pos)
