"""Soyut sözdizim ağacı (AST) düğümleri ve okunur döküm (`dump`).

Düğümler `eq=False` dataclass'tır: kimlikle karşılaştırılır ve sözlük anahtarı olabilir
(çözümleyici, her `Name` düğümünün kaç kapsam yukarıda tanımlandığını böyle saklar).
Kullanan: parser.py (üretir), resolver.py ve interp.py (gezer), sanal_makine (derler).
Genişletme: yeni bir ifade/deyim için buraya bir dataclass, `Expr`/`Stmt` birleşimine adını ve
`dump` içine bir dal ekleyin; sonra ayrıştırıcı, çözümleyici, yorumlayıcı ve derleyiciyi
güncelleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .errors import Pos

# --- ifadeler -----------------------------------------------------------------


@dataclass(eq=False, slots=True)
class Literal:
    value: object  # int | float | str | bool | None
    pos: Pos


@dataclass(eq=False, slots=True)
class Name:
    name: str
    pos: Pos


@dataclass(eq=False, slots=True)
class Unary:
    op: str  # "-" ya da "değil"
    operand: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class Binary:
    op: str  # + - * / % ** == != < <= > >=
    left: Expr
    right: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class Logical:
    op: str  # "ve" ya da "veya" (kısa devre)
    left: Expr
    right: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class Call:
    callee: Expr
    args: list[Expr]
    pos: Pos


@dataclass(eq=False, slots=True)
class Index:
    target: Expr
    index: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class ListLit:
    items: list[Expr]
    pos: Pos


@dataclass(eq=False, slots=True)
class DictLit:
    pairs: list[tuple[Expr, Expr]]
    pos: Pos


@dataclass(eq=False, slots=True)
class FuncLit:
    name: str  # adsız işlevde "<adsız>"
    params: list[str]
    body: list[Stmt]
    pos: Pos


Expr = Literal | Name | Unary | Binary | Logical | Call | Index | ListLit | DictLit | FuncLit

# --- deyimler -----------------------------------------------------------------


@dataclass(eq=False, slots=True)
class VarDecl:
    name: str
    value: Expr | None
    pos: Pos


@dataclass(eq=False, slots=True)
class Assign:
    target: Name | Index
    op: str  # "" düz atama; "+", "-", "*", "/" bileşik atama (x += 1)
    value: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class ExprStmt:
    expr: Expr
    pos: Pos


@dataclass(eq=False, slots=True)
class If:
    cond: Expr
    then: list[Stmt]
    otherwise: list[Stmt] | None  # "değilse eğer" zinciri: [If(...)]
    pos: Pos


@dataclass(eq=False, slots=True)
class While:
    cond: Expr
    body: list[Stmt]
    pos: Pos


@dataclass(eq=False, slots=True)
class For:
    var: str
    iterable: Expr
    body: list[Stmt]
    pos: Pos


@dataclass(eq=False, slots=True)
class FuncDecl:
    func: FuncLit
    pos: Pos


@dataclass(eq=False, slots=True)
class Return:
    value: Expr | None
    pos: Pos


@dataclass(eq=False, slots=True)
class Break:
    pos: Pos


@dataclass(eq=False, slots=True)
class Continue:
    pos: Pos


Stmt = VarDecl | Assign | ExprStmt | If | While | For | FuncDecl | Return | Break | Continue


@dataclass(eq=False, slots=True)
class Program:
    body: list[Stmt] = field(default_factory=list)


# --- döküm --------------------------------------------------------------------


def dump(node: Expr | Stmt | Program | list[Stmt]) -> str:
    """Düğümü tek satırlık S-ifadesine çevirir: `(+ 1 (* 2 3))`. Testler ve `agac` komutu için."""
    match node:
        case list():
            return "(blok " + " ".join(dump(s) for s in node) + ")" if node else "(blok)"
        case Program():
            return "(program " + " ".join(dump(s) for s in node.body) + ")"
        case Literal(value=value):
            return repr(value) if isinstance(value, str) else _literal(value)
        case Name(name=name):
            return name
        case Unary(op=op, operand=operand):
            return f"({op} {dump(operand)})"
        case Binary(op=op, left=left, right=right) | Logical(op=op, left=left, right=right):
            return f"({op} {dump(left)} {dump(right)})"
        case Call(callee=callee, args=args):
            return "(çağır " + " ".join([dump(callee), *(dump(a) for a in args)]) + ")"
        case Index(target=target, index=index):
            return f"(dizin {dump(target)} {dump(index)})"
        case ListLit(items=items):
            return "(liste" + "".join(" " + dump(i) for i in items) + ")"
        case DictLit(pairs=pairs):
            return "(sözlük" + "".join(f" ({dump(k)} {dump(v)})" for k, v in pairs) + ")"
        case FuncLit(name=name, params=params, body=body):
            return f"(işlev {name} ({' '.join(params)}) {dump(body)})"
        case VarDecl(name=name, value=value):
            return f"(değişken {name} {dump(value) if value else 'yok'})"
        case Assign(target=target, op=op, value=value):
            return f"({op}= {dump(target)} {dump(value)})"
        case ExprStmt(expr=expr):
            return dump(expr)
        case If(cond=cond, then=then, otherwise=otherwise):
            tail = f" {dump(otherwise)}" if otherwise is not None else ""
            return f"(eğer {dump(cond)} {dump(then)}{tail})"
        case While(cond=cond, body=body):
            return f"(iken {dump(cond)} {dump(body)})"
        case For(var=var, iterable=iterable, body=body):
            return f"(için {var} {dump(iterable)} {dump(body)})"
        case FuncDecl(func=func):
            return dump(func)
        case Return(value=value):
            return f"(döndür {dump(value)})" if value else "(döndür)"
        case Break():
            return "(kır)"
        case Continue():
            return "(devam)"
    raise TypeError(f"bilinmeyen düğüm: {node!r}")


def _literal(value: object) -> str:
    if value is True:
        return "doğru"
    if value is False:
        return "yanlış"
    if value is None:
        return "yok"
    return repr(value)
