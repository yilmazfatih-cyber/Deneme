"""Ağaç yürüyen yorumlayıcı: AST'yi doğrudan çalıştırır.

Boru hattı: kaynak → lexer → parser (Pratt) → resolver → `Interpreter.execute`.
Ortam (Environment) zinciri kapsamları taşır: her blok, her döngü turu ve her işlev çağrısı yeni
bir ortam açar (çözümleyicideki kapsamlarla birebir). Kapanım = işlev + tanımlandığı ortam.
`döndür`/`kır`/`devam` Python istisnasıyla taşınır. Güvenlik: adım sınırı (sonsuz döngü), çağrı
derinliği sınırı (sonsuz özyineleme), ops.py'deki boyut sınırları.
Genişletme: yeni deyim için `execute`, yeni ifade için `evaluate` içine bir `case` ekleyin.
"""

from __future__ import annotations

import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass

from . import ops
from .errors import Pos, limit_error
from .natives import Builtin, make_builtins
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
from .optimize import fold_constants
from .parser import parse
from .resolver import resolve
from .values import FunctionValue, is_truthy


@dataclass(frozen=True)
class Limits:
    """Güvenlik sınırları. Testlerde küçük değerler verilerek sınır davranışı sınanır."""

    max_steps: int = 5_000_000  # yürütülen deyim + döngü turu sayısı
    max_depth: int = 200  # iç içe işlev çağrısı


class Environment:
    __slots__ = ("parent", "values")

    def __init__(self, parent: Environment | None) -> None:
        self.values: dict[str, object] = {}
        self.parent = parent

    def ancestor(self, depth: int) -> Environment:
        env = self
        for _ in range(depth):
            assert env.parent is not None, "çözümleyici ile ortam zinciri uyuşmuyor"
            env = env.parent
        return env


class UserFunction(FunctionValue):
    def __init__(self, decl: FuncLit, closure: Environment) -> None:
        self.decl = decl
        self.closure = closure
        self.name = decl.name


class ReturnSignal(Exception):
    def __init__(self, value: object) -> None:
        self.value = value


class BreakSignal(Exception):
    pass


class ContinueSignal(Exception):
    pass


@contextmanager
def recursion_room(frames: int) -> Iterator[None]:
    """Derin (ama sınırlı) Tohum özyinelemesi için Python yığın sınırını geçici olarak yükseltir."""
    old = sys.getrecursionlimit()
    if old < frames:
        sys.setrecursionlimit(frames)
    try:
        yield
    finally:
        sys.setrecursionlimit(old)


class Interpreter:
    def __init__(
        self,
        write: Callable[[str], None] | None = None,
        limits: Limits | None = None,
        optimize: bool = False,
    ):
        self.write = write or (lambda text: print(text, end=""))
        self.limits = limits or Limits()
        self.optimize = optimize  # True: çalıştırmadan önce sabit katlama (optimize.py)
        self.globals = Environment(None)
        self.globals.values.update(make_builtins())
        self.depths: dict[Name, int] = {}
        self.steps = 0
        self.call_depth = 0

    # --- giriş noktaları ---------------------------------------------------
    def run(self, source: str) -> object:
        """Kaynağı çalıştırır; son deyim bir ifadeyse onun değerini döndürür (REPL için)."""
        return self.run_program(parse(source))

    def run_program(self, program: Program) -> object:
        self.depths.update(resolve(program, set(self.globals.values)))
        if self.optimize:
            program, _ = fold_constants(program)
        self.steps = 0
        last: object = None
        with recursion_room(2_000 + self.limits.max_depth * 60):
            try:
                for stmt in program.body:
                    last = None
                    if isinstance(stmt, ExprStmt):
                        self.tick(stmt.pos)
                        last = self.evaluate(stmt.expr, self.globals)
                    else:
                        self.execute(stmt, self.globals)
            except RecursionError:
                raise limit_error("Python yığını doldu: iç içe yapı çok derin", None) from None
        return last

    def tick(self, pos: Pos) -> None:
        self.steps += 1
        if self.steps > self.limits.max_steps:
            raise ops.steps_error(self.limits.max_steps, pos)

    # --- deyimler ----------------------------------------------------------
    def execute_block(self, body: list[Stmt], env: Environment) -> None:
        for stmt in body:
            self.execute(stmt, env)

    def execute(self, stmt: Stmt, env: Environment) -> None:
        self.tick(stmt.pos)
        match stmt:
            case ExprStmt(expr=expr):
                self.evaluate(expr, env)
            case VarDecl(name=name, value=value):
                env.values[name] = None if value is None else self.evaluate(value, env)
            case Assign():
                self.assign(stmt, env)
            case If(cond=cond, then=then, otherwise=otherwise):
                if is_truthy(self.evaluate(cond, env)):
                    self.execute_block(then, Environment(env))
                elif otherwise is not None:
                    self.execute_block(otherwise, Environment(env))
            case While(cond=cond, body=body, pos=pos):
                while is_truthy(self.evaluate(cond, env)):
                    self.tick(pos)
                    try:
                        self.execute_block(body, Environment(env))
                    except BreakSignal:
                        break
                    except ContinueSignal:
                        continue
            case For(var=var, iterable=iterable, body=body, pos=pos):
                for item in ops.iterate(self.evaluate(iterable, env), iterable.pos):
                    self.tick(pos)
                    loop_env = Environment(env)
                    loop_env.values[var] = item
                    try:
                        self.execute_block(body, loop_env)
                    except BreakSignal:
                        break
                    except ContinueSignal:
                        continue
            case FuncDecl(func=func):
                env.values[func.name] = UserFunction(func, env)
            case Return(value=value):
                raise ReturnSignal(None if value is None else self.evaluate(value, env))
            case Break():
                raise BreakSignal
            case Continue():
                raise ContinueSignal

    def assign(self, stmt: Assign, env: Environment) -> None:
        """Atama. Değerlendirme sırası soldan sağa: hedef (ve bileşikte eski değer), sonra değer."""
        target = stmt.target
        if isinstance(target, Name):
            if stmt.op:
                current = self.lookup(target, env)
                value = ops.binary(stmt.op, current, self.evaluate(stmt.value, env), stmt.pos)
            else:
                value = self.evaluate(stmt.value, env)
            depth = self.depths.get(target)
            if depth is not None:
                env.ancestor(depth).values[target.name] = value
            elif target.name in self.globals.values:
                self.globals.values[target.name] = value
            else:
                raise ops.undefined_global(target.name, target.pos)
            return
        container = self.evaluate(target.target, env)
        key = self.evaluate(target.index, env)
        if stmt.op:
            current = ops.index_get(container, key, target.pos)
            value = ops.binary(stmt.op, current, self.evaluate(stmt.value, env), stmt.pos)
        else:
            value = self.evaluate(stmt.value, env)
        ops.index_set(container, key, value, target.pos)

    # --- ifadeler ----------------------------------------------------------
    def evaluate(self, expr: Expr, env: Environment) -> object:
        match expr:
            case Literal(value=value):
                return value
            case Name():
                return self.lookup(expr, env)
            case Unary(op=op, operand=operand, pos=pos):
                return ops.unary(op, self.evaluate(operand, env), pos)
            case Binary(op=op, left=left, right=right, pos=pos):
                return ops.binary(op, self.evaluate(left, env), self.evaluate(right, env), pos)
            case Logical(op=op, left=left, right=right):
                first = self.evaluate(left, env)
                if (op == "veya") == is_truthy(first):
                    return first
                return self.evaluate(right, env)
            case Call(callee=callee, args=args, pos=pos):
                fn = self.evaluate(callee, env)
                values = [self.evaluate(a, env) for a in args]
                return self.call(fn, values, pos)
            case Index(target=target, index=index, pos=pos):
                return ops.index_get(self.evaluate(target, env), self.evaluate(index, env), pos)
            case ListLit(items=items):
                return [self.evaluate(i, env) for i in items]
            case DictLit(pairs=pairs, pos=pos):
                result: dict[object, object] = {}
                for k, v in pairs:
                    key = self.evaluate(k, env)
                    ops.check_key(key, k.pos)
                    result[key] = self.evaluate(v, env)
                return result
            case FuncLit():
                return UserFunction(expr, env)
        raise TypeError(f"bilinmeyen ifade: {expr!r}")

    def lookup(self, node: Name, env: Environment) -> object:
        depth = self.depths.get(node)
        if depth is not None:
            return env.ancestor(depth).values[node.name]
        try:
            return self.globals.values[node.name]
        except KeyError:
            raise ops.undefined_global(node.name, node.pos) from None

    def call(self, fn: object, args: list[object], pos: Pos) -> object:
        if isinstance(fn, Builtin):
            return fn.call(args, self, pos)
        if not isinstance(fn, UserFunction):
            raise ops.not_callable(fn, pos)
        params = fn.decl.params
        if len(args) != len(params):
            raise ops.arity_error(fn.name, len(params), len(args), pos)
        if self.call_depth >= self.limits.max_depth:
            raise ops.depth_error(self.limits.max_depth, pos)
        env = Environment(fn.closure)
        env.values.update(zip(params, args, strict=True))
        self.call_depth += 1
        try:
            self.execute_block(fn.decl.body, env)
        except ReturnSignal as signal:
            return signal.value
        finally:
            self.call_depth -= 1
        return None


def run(source: str, limits: Limits | None = None) -> str:
    """Kaynağı yeni bir yorumlayıcıda çalıştırır ve yazdırılan metni döndürür."""
    out: list[str] = []
    Interpreter(out.append, limits).run(source)
    return "".join(out)
