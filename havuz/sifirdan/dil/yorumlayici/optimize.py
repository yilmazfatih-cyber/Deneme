"""Sabit katlama (constant folding): çalıştırmadan önce değişmez alt ifadeleri hesaplar.

`değişken alan = 60 * 60 * 24` → `değişken alan = 86400`; `yanlış ve f()` → `yanlış`
(kısa devre zaten f'yi çağırmazdı; `ve`/`veya` yalnız sonuç da sabitse katlanır). Hesap
ops.py ile yapılır, yani anlam BİREBİR aynıdır; hata verecek bir işlem (`1 / 0`) katlanmaz,
çalışma anında aynı iletiyle hata verir. Katlanan sabit, işlecin konumunu alır.
Çözümleyiciden (resolver) SONRA çalıştırılmalıdır: atılan dallardaki tanımsız adlar yine bulunsun.
`Name` düğümleri kopyalanmaz (çözümleyicinin derinlik tablosu onlara bağlıdır).
Kullanan: `Interpreter(optimize=True)`, `VM(optimize=True)`, `python -m sanal_makine dok --katla`.
Genişletme: ölü kod atma (`eğer yanlış { … }` bloğunu silme) için `stmt` içine bir dal ekleyin.
"""

from __future__ import annotations

from . import ops
from .errors import Pos, TohumError
from .nodes import (
    Assign,
    Binary,
    Call,
    DictLit,
    Expr,
    ExprStmt,
    For,
    FuncDecl,
    FuncLit,
    If,
    Index,
    ListLit,
    Literal,
    Logical,
    Name,
    Program,
    Return,
    Stmt,
    Unary,
    VarDecl,
    While,
)
from .values import is_truthy


class Folder:
    def __init__(self) -> None:
        self.folded = 0  # kaç işlem katlandı (bilgi ve test için)

    def block(self, body: list[Stmt]) -> list[Stmt]:
        return [self.stmt(s) for s in body]

    def stmt(self, stmt: Stmt) -> Stmt:
        match stmt:
            case VarDecl(name=name, value=value, pos=pos):
                return VarDecl(name, None if value is None else self.expr(value), pos)
            case Assign(target=target, op=op, value=value, pos=pos):
                folded_target = target if isinstance(target, Name) else self.index(target)
                return Assign(folded_target, op, self.expr(value), pos)
            case ExprStmt(expr=expr, pos=pos):
                return ExprStmt(self.expr(expr), pos)
            case If(cond=cond, then=then, otherwise=otherwise, pos=pos):
                rest = None if otherwise is None else self.block(otherwise)
                return If(self.expr(cond), self.block(then), rest, pos)
            case While(cond=cond, body=body, pos=pos):
                return While(self.expr(cond), self.block(body), pos)
            case For(var=var, iterable=iterable, body=body, pos=pos):
                return For(var, self.expr(iterable), self.block(body), pos)
            case FuncDecl(func=func, pos=pos):
                return FuncDecl(self.function(func), pos)
            case Return(value=value, pos=pos):
                return Return(None if value is None else self.expr(value), pos)
        return stmt  # kır, devam

    def function(self, func: FuncLit) -> FuncLit:
        return FuncLit(func.name, func.params, self.block(func.body), func.pos)

    def index(self, node: Index) -> Index:
        return Index(self.expr(node.target), self.expr(node.index), node.pos)

    def expr(self, expr: Expr) -> Expr:
        match expr:
            case Binary(op=op, left=left, right=right, pos=pos):
                a, b = self.expr(left), self.expr(right)
                if isinstance(a, Literal) and isinstance(b, Literal):
                    return self.attempt(
                        lambda: ops.binary(op, a.value, b.value, pos), pos, Binary(op, a, b, pos)
                    )
                return Binary(op, a, b, pos)
            case Unary(op=op, operand=operand, pos=pos):
                inner = self.expr(operand)
                if isinstance(inner, Literal):
                    return self.attempt(
                        lambda: ops.unary(op, inner.value, pos), pos, Unary(op, inner, pos)
                    )
                return Unary(op, inner, pos)
            case Logical(op=op, left=left, right=right, pos=pos):
                a, b = self.expr(left), self.expr(right)
                chosen = a if isinstance(a, Literal) and (op == "veya") == is_truthy(a.value) else b
                if isinstance(a, Literal) and isinstance(chosen, Literal):
                    # Yalnız sonuç da sabitse katlanır; konum işlecinki kalır (hata konumu aynı).
                    self.folded += 1
                    return Literal(chosen.value, pos)
                return Logical(op, a, b, pos)
            case Call(callee=callee, args=args, pos=pos):
                return Call(self.expr(callee), [self.expr(a) for a in args], pos)
            case Index():
                return self.index(expr)
            case ListLit(items=items, pos=pos):
                return ListLit([self.expr(i) for i in items], pos)
            case DictLit(pairs=pairs, pos=pos):
                return DictLit([(self.expr(k), self.expr(v)) for k, v in pairs], pos)
            case FuncLit():
                return self.function(expr)
        return expr  # Literal, Name

    def attempt(self, compute: object, pos: Pos, fallback: Expr) -> Expr:
        """Hesabı dener; hata verirse (ör. sıfıra bölme) düğüm katlanmadan kalır."""
        assert callable(compute)
        try:
            value = compute()
        except TohumError:
            return fallback
        self.folded += 1
        return Literal(value, pos)  # işlecin konumu: hata konumları katlamadan etkilenmez


def fold_constants(program: Program) -> tuple[Program, int]:
    """Katlanmış YENİ program ağacı ve katlanan işlem sayısı (özgün ağaç değişmez)."""
    folder = Folder()
    return Program(folder.block(program.body)), folder.folded
