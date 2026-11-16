"""Çözümleyici (resolver): çalıştırmadan önce adları kapsamlarına bağlar ve durağan hataları bulur.

Ne yapar: her `Name` düğümü için "kaç kapsam yukarıda tanımlı" sayısını hesaplar (genel adlar
için kayıt yoktur). Böylece kapanımlar adı TANIMLANDIĞI yerde bağlar, çağrıldığı yerde değil.
Durağan hatalar: tanımsız ad (benzer ad önerisiyle), aynı kapsamda iki tanım, değişkeni kendi
başlangıç değerinde kullanma, işlev dışında `döndür`, döngü dışında `kır`/`devam`.
Üst düzey (genel) adlar önceden toplanır: işlevler birbirini, tanım sırasından bağımsız çağırabilir.
Kapsam kuralları yorumlayıcıdaki ortamlarla (interp.py) ve derleyicideki yerellerle BİREBİR aynıdır.
Genişletme: yeni deyim/ifade için `stmt`/`expr` içine bir dal ekleyin.
"""

from __future__ import annotations

import difflib

from .errors import SCOPE, Pos, TohumError
from .nodes import (
    Assign,
    Binary,
    Break,
    Call,
    Continue,
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


def scope_error(message: str, pos: Pos, hint: str | None = None) -> TohumError:
    return TohumError(SCOPE, message, pos, hint)


class Resolver:
    def __init__(self, known_globals: set[str]) -> None:
        self.globals = set(known_globals)
        self.scopes: list[dict[str, bool]] = []  # ad -> tanımı tamamlandı mı
        self.depths: dict[Name, int] = {}
        self.function_depth = 0
        self.loop_depth = 0

    # --- giriş noktası -----------------------------------------------------
    def program(self, program: Program) -> dict[Name, int]:
        for stmt in program.body:
            if isinstance(stmt, VarDecl):
                self.globals.add(stmt.name)
            elif isinstance(stmt, FuncDecl):
                self.globals.add(stmt.func.name)
        self.block(program.body)
        return self.depths

    # --- kapsam yardımcıları -------------------------------------------------
    def declare(self, name: str, pos: Pos) -> None:
        if not self.scopes:
            return  # genel kapsam: yeniden tanım serbest (REPL kolaylığı)
        scope = self.scopes[-1]
        if name in scope:
            raise scope_error(
                f"'{name}' bu kapsamda zaten tanımlı",
                pos,
                f"Değerini değiştirmek için `değişken` yazmadan `{name} = …` kullanın.",
            )
        scope[name] = False

    def define(self, name: str) -> None:
        if self.scopes:
            self.scopes[-1][name] = True

    def lookup(self, node: Name) -> None:
        for i in range(len(self.scopes) - 1, -1, -1):
            scope = self.scopes[i]
            if node.name in scope:
                if not scope[node.name]:
                    raise scope_error(
                        f"'{node.name}' kendi başlangıç değerinde kullanılamaz",
                        node.pos,
                        "Başlangıç değerini başka bir adla hesaplayın.",
                    )
                self.depths[node] = len(self.scopes) - 1 - i
                return
        if node.name in self.globals:
            return
        visible = set(self.globals).union(*self.scopes)
        close = difflib.get_close_matches(node.name, sorted(visible), n=1)
        hint = f"'{close[0]}' mi demek istediniz?" if close else None
        if hint is None:
            hint = f"Yeni bir değişken için önce `değişken {node.name} = …` yazın."
        raise scope_error(f"'{node.name}' tanımlı değil", node.pos, hint)

    def scoped_block(self, body: list[Stmt]) -> None:
        self.scopes.append({})
        self.block(body)
        self.scopes.pop()

    def block(self, body: list[Stmt]) -> None:
        for stmt in body:
            self.stmt(stmt)

    def function(self, func: FuncLit) -> None:
        saved_loop = self.loop_depth
        self.loop_depth = 0
        self.function_depth += 1
        self.scopes.append(dict.fromkeys(func.params, True))
        self.block(func.body)
        self.scopes.pop()
        self.function_depth -= 1
        self.loop_depth = saved_loop

    # --- deyimler ----------------------------------------------------------
    def stmt(self, stmt: Stmt) -> None:
        match stmt:
            case VarDecl(name=name, value=value, pos=pos):
                self.declare(name, pos)
                if value is not None:
                    self.expr(value)
                self.define(name)
            case FuncDecl(func=func, pos=pos):
                self.declare(func.name, pos)
                self.define(func.name)  # özyineleme: gövde kendi adını görebilir
                self.function(func)
            case Assign(target=target, value=value):
                self.expr(value)
                self.expr(target)
            case ExprStmt(expr=expr):
                self.expr(expr)
            case If(cond=cond, then=then, otherwise=otherwise):
                self.expr(cond)
                self.scoped_block(then)
                if otherwise is not None:
                    self.scoped_block(otherwise)
            case While(cond=cond, body=body):
                self.expr(cond)
                self.loop_depth += 1
                self.scoped_block(body)
                self.loop_depth -= 1
            case For(var=var, iterable=iterable, body=body):
                self.expr(iterable)
                self.loop_depth += 1
                self.scopes.append({var: True})
                self.block(body)
                self.scopes.pop()
                self.loop_depth -= 1
            case Return(value=value, pos=pos):
                if self.function_depth == 0:
                    raise scope_error("'döndür' yalnız bir işlevin içinde kullanılabilir", pos)
                if value is not None:
                    self.expr(value)
            case Break(pos=pos) | Continue(pos=pos):
                if self.loop_depth == 0:
                    word = "kır" if isinstance(stmt, Break) else "devam"
                    raise scope_error(f"'{word}' yalnız bir döngünün içinde kullanılabilir", pos)

    # --- ifadeler ----------------------------------------------------------
    def expr(self, expr: Expr) -> None:
        match expr:
            case Literal():
                pass
            case Name():
                self.lookup(expr)
            case Unary(operand=operand):
                self.expr(operand)
            case Binary(left=left, right=right) | Logical(left=left, right=right):
                self.expr(left)
                self.expr(right)
            case Call(callee=callee, args=args):
                self.expr(callee)
                for arg in args:
                    self.expr(arg)
            case Index(target=target, index=index):
                self.expr(target)
                self.expr(index)
            case ListLit(items=items):
                for item in items:
                    self.expr(item)
            case DictLit(pairs=pairs):
                for key, value in pairs:
                    self.expr(key)
                    self.expr(value)
            case FuncLit():
                self.function(expr)


def resolve(program: Program, known_globals: set[str]) -> dict[Name, int]:
    """Programı çözümler; `Name` -> kapsam derinliği sözlüğü döndürür."""
    return Resolver(known_globals).program(program)
