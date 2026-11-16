"""Deyim ayrıştırıcı: belirteçlerden `Program` ağacı kurar (dilbilgisi: DIL.md).

Deyimler yeni satır ya da `;` ile biter; bloklar `{ … }` içindedir. `değilse`, kapanan `}`
ile aynı satırda ya da bir alt satırda yazılabilir. İfadeler pratt.py'de ayrıştırılır.
Kullanan: interp.py, sanal_makine (`parse`). Genişletme: yeni deyim için `statement` içine bir
`case`, nodes.py'ye bir düğüm ekleyin; DIL.md'deki dilbilgisini güncelleyin.
"""

from __future__ import annotations

from .errors import syntax_error
from .lexer import tokenize
from .nodes import (
    Assign,
    Break,
    Continue,
    Expr,
    ExprStmt,
    For,
    FuncDecl,
    If,
    Index,
    Name,
    Program,
    Return,
    Stmt,
    VarDecl,
    While,
)
from .pratt import ExpressionParser
from .tokens import TokenType

T = TokenType
COMPOUND = {T.PLUS_ASSIGN: "+", T.MINUS_ASSIGN: "-", T.STAR_ASSIGN: "*", T.SLASH_ASSIGN: "/"}
STATEMENT_END = (T.NEWLINE, T.SEMICOLON, T.RBRACE, T.EOF)
BLOCK_STATEMENTS = (If, While, For, FuncDecl)


class Parser(ExpressionParser):
    def parse_program(self) -> Program:
        body: list[Stmt] = []
        self.skip_separators()
        while not self.check(T.EOF):
            if self.check(T.RBRACE):
                raise syntax_error(
                    "fazladan '}'", self.peek().pos, "Karşılığı olmayan bir blok kapanışı var."
                )
            stmt = self.statement()
            body.append(stmt)
            self.end_statement(stmt)
        return Program(body)

    def skip_separators(self) -> None:
        while self.check(T.NEWLINE, T.SEMICOLON):
            self.advance()

    def end_statement(self, stmt: Stmt) -> None:
        """Deyimden sonra yeni satır, `;`, `}` ya da dosya sonu gelmeli.

        Blokla biten deyimden (eğer/iken/için/işlev) sonra ayraç gerekmez: `eğer a { } yazdır(1)`.
        """
        tok = self.peek()
        if tok.type in (T.NEWLINE, T.SEMICOLON):
            self.skip_separators()
            return
        if tok.type in (T.RBRACE, T.EOF):
            return
        if isinstance(stmt, BLOCK_STATEMENTS) and self.tokens[self.i - 1].type is T.RBRACE:
            return
        hint = "İki deyimi yeni satırla ya da `;` ile ayırın."
        if tok.type is T.LBRACE:
            hint = "Blok yalnız eğer/iken/için/işlev'den sonra açılabilir."
        raise syntax_error(f"deyim burada bitmeliydi, {tok.describe()} bulundu", tok.pos, hint)

    def parse_block(self) -> list[Stmt]:
        if self.check(T.ASSIGN):
            raise syntax_error(
                "burada '=' kullanılamaz", self.peek().pos, "Karşılaştırma için `==` yazın."
            )
        open_tok = self.expect(
            T.LBRACE, "bloğun başında", "Tohum'da bloklar `{ … }` ile yazılır (`:` değil)."
        )
        self.enter(open_tok.pos)
        body: list[Stmt] = []
        self.skip_separators()
        while not self.check(T.RBRACE):
            if self.check(T.EOF):
                raise syntax_error(
                    "blok kapanmadı",
                    self.peek().pos,
                    f"{open_tok.pos} konumunda açılan '{{' için '}}' ekleyin.",
                    at_eof=True,
                )
            stmt = self.statement()
            body.append(stmt)
            self.end_statement(stmt)
        self.advance()
        self.nesting -= 1
        return body

    def statement(self) -> Stmt:
        tok = self.peek()
        match tok.type:
            case T.VAR:
                self.advance()
                name = self.expect(T.IDENT, "'değişken' sözcüğünden sonra", "Örnek: değişken x = 1")
                value: Expr | None = None
                if self.match(T.ASSIGN):
                    self.skip_newlines()
                    value = self.expression()
                elif not self.check(*STATEMENT_END):
                    raise syntax_error(
                        f"'=' bekleniyordu, {self.peek().describe()} bulundu",
                        self.peek().pos,
                        "Örnek: değişken x = 1",
                    )
                return VarDecl(name.text, value, tok.pos)
            case T.FUNC if self.peek(1).type is T.IDENT:
                self.advance()
                name = self.advance()
                return FuncDecl(self.function_literal(name.text, tok.pos), tok.pos)
            case T.RETURN:
                self.advance()
                value = None if self.check(*STATEMENT_END) else self.expression()
                return Return(value, tok.pos)
            case T.IF:
                return self.if_statement()
            case T.WHILE:
                self.advance()
                cond = self.expression()
                return While(cond, self.parse_block(), tok.pos)
            case T.FOR:
                self.advance()
                var = self.expect(T.IDENT, "'için' sözcüğünden sonra", "Örnek: için x içinde l { }")
                self.expect(T.IN, "döngü değişkeninden sonra", "Örnek: için x içinde liste { }")
                iterable = self.expression()
                return For(var.text, iterable, self.parse_block(), tok.pos)
            case T.BREAK:
                self.advance()
                return Break(tok.pos)
            case T.CONTINUE:
                self.advance()
                return Continue(tok.pos)
            case T.ELSE:
                raise syntax_error("'değilse' bir 'eğer' bloğundan sonra gelmeli", tok.pos)
        return self.expression_statement()

    def if_statement(self) -> Stmt:
        tok = self.advance()
        cond = self.expression()
        then = self.parse_block()
        otherwise: list[Stmt] | None = None
        # `değilse` bir alt satırda da olabilir: yeni satırları geçip bakarız, yoksa geri döneriz.
        save = self.i
        self.skip_newlines()
        if self.match(T.ELSE):
            if self.check(T.IF):
                otherwise = [self.if_statement()]
            else:
                otherwise = self.parse_block()
        else:
            self.i = save
        return If(cond, then, otherwise, tok.pos)

    def expression_statement(self) -> Stmt:
        start = self.peek()
        expr = self.expression()
        op_tok = self.peek()
        if op_tok.type is T.ASSIGN or op_tok.type in COMPOUND:
            if not isinstance(expr, (Name, Index)):
                raise syntax_error(
                    "bu ifadeye atama yapılamaz",
                    op_tok.pos,
                    "Atamanın solunda bir ad (`x`) ya da dizin (`l[0]`) olmalı; "
                    "karşılaştırma için `==` yazın.",
                )
            self.advance()
            self.skip_newlines()
            value = self.expression()
            return Assign(expr, COMPOUND.get(op_tok.type, ""), value, op_tok.pos)
        return ExprStmt(expr, start.pos)


def parse(source: str) -> Program:
    """Kaynak metni ayrıştırır; sözdizimi hatasında `TohumError` fırlatır."""
    return Parser(tokenize(source)).parse_program()
