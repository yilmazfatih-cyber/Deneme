"""Derleyici: desen AST'sini Thompson NFA programına (komut listesine) çevirir.

Komutlar: CHAR/ANY/CLASS bir karakter tüketir; SPLIT iki yola ayrılır (x önceliklidir: açgözlü
niceleyicide gövde, tembelde çıkış önce); JMP atlar; SAVE yakalama konumunu yazar; ASSERT çapa
denetler; MATCH eşleşmedir. ENTER/BACK, Python `re`'nin "boş tur koruması"nı taklit eder: döngünün
bir turu hiç karakter tüketmeden biterse (ENTER aynı ε-yolunda görülmüşse) döngü yeniden denenmez,
çıkışa gidilir — `(a*)*` gibi desenlerde gruplar `re` ile aynı çıkar.
`{m,n}` açılarak derlenir: m zorunlu kopya + (n-m) iç içe isteğe bağlı kopya.
Genişletme: yeni düğüm için `node` içine bir dal; yeni komut için pikevm.py'yi de güncelleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from .nodes import (
    Alt,
    Anchor,
    AnyChar,
    Char,
    ClassNode,
    Concat,
    Group,
    Node,
    RegexError,
    Repeat,
)

CHAR, ANY, CLASS, SPLIT, JMP, SAVE, ASSERT, ENTER, BACK, MATCH = range(10)
NAMES = ["CHAR", "ANY", "CLASS", "SPLIT", "JMP", "SAVE", "ASSERT", "ENTER", "BACK", "MATCH"]
MAX_PROGRAM = 20_000  # açılmış `{m,n}` kopyaları dahil en fazla komut


@dataclass(frozen=True, slots=True)
class Inst:
    """Tek komut. x/y: hedefler (SPLIT, JMP, BACK) ya da yuva/döngü numarası; arg: karakter vb."""

    op: int
    x: int = 0
    y: int = 0
    arg: object = None

    def __str__(self) -> str:
        name = NAMES[self.op]
        if self.op in (SPLIT, BACK):
            extra = f" döngü {self.arg}" if self.op == BACK else ""
            return f"{name} {self.x}, {self.y}{extra}"
        if self.op in (JMP, SAVE, ENTER):
            return f"{name} {self.x}"
        if self.op in (CHAR, ASSERT):
            return f"{name} {self.arg!r}"
        return f"{name} {self.arg}" if self.arg is not None else name


class Compiler:
    def __init__(self, pattern: str) -> None:
        self.pattern = pattern
        self.prog: list[Inst] = []
        self.loops = 0

    def emit(self, op: int, x: int = 0, y: int = 0, arg: object = None) -> int:
        if len(self.prog) >= MAX_PROGRAM:
            raise RegexError(
                f"desen çok büyük (en fazla {MAX_PROGRAM} komut)",
                self.pattern,
                0,
                "Büyük {m,n} sayılarını ya da iç içe tekrarları azaltın.",
            )
        self.prog.append(Inst(op, x, y, arg))
        return len(self.prog) - 1

    def patch(self, pc: int, **fields: int) -> None:
        self.prog[pc] = replace(self.prog[pc], **fields)

    def node(self, node: Node) -> None:
        match node:
            case Char(ch=ch):
                self.emit(CHAR, arg=ch)
            case AnyChar():
                self.emit(ANY)
            case ClassNode(cls=cls):
                self.emit(CLASS, arg=cls)
            case Anchor(kind=kind):
                self.emit(ASSERT, arg=kind)
            case Group(node=inner, index=index):
                if index is None:
                    self.node(inner)
                else:
                    self.emit(SAVE, 2 * index)
                    self.node(inner)
                    self.emit(SAVE, 2 * index + 1)
            case Concat(items=items):
                for item in items:
                    self.node(item)
            case Alt(options=options):
                self.alternation(options)
            case Repeat():
                self.repeat(node)

    def alternation(self, options: tuple[Node, ...]) -> None:
        jumps: list[int] = []
        for option in options[:-1]:
            split = self.emit(SPLIT)
            self.patch(split, x=len(self.prog))
            self.node(option)
            jumps.append(self.emit(JMP))
            self.patch(split, y=len(self.prog))
        self.node(options[-1])
        for jump in jumps:
            self.patch(jump, x=len(self.prog))

    def split_to(self, split: int, body: int, out: int, greedy: bool) -> None:
        if greedy:
            self.patch(split, x=body, y=out)
        else:
            self.patch(split, x=out, y=body)

    def repeat(self, node: Repeat) -> None:
        for _ in range(node.min):
            self.node(node.node)
        if node.max is None:
            loop = self.new_loop()
            split = self.emit(SPLIT)
            body = self.emit(ENTER, loop)
            self.node(node.node)
            back = self.emit(BACK, split, 0, loop)
            out = len(self.prog)
            self.patch(back, y=out)
            self.split_to(split, body, out, node.greedy)
            return
        optional = node.max - node.min
        loop = self.new_loop()
        pending: list[tuple[int, int]] = []
        backs: list[int] = []
        for copy in range(optional):
            split = self.emit(SPLIT)
            body = len(self.prog)
            last = copy == optional - 1
            if not last:
                self.emit(ENTER, loop)
            self.node(node.node)
            if not last:
                backs.append(self.emit(BACK, len(self.prog) + 1, 0, loop))
            pending.append((split, body))
        out = len(self.prog)
        for split, body in pending:
            self.split_to(split, body, out, node.greedy)
        for back in backs:
            self.patch(back, y=out)

    def new_loop(self) -> int:
        self.loops += 1
        return self.loops


def compile_regex(pattern: str, node: Node) -> list[Inst]:
    """Programı kurar: SAVE 0, desen, SAVE 1, MATCH (grup 0 = eşleşmenin tamamı)."""
    compiler = Compiler(pattern)
    compiler.emit(SAVE, 0)
    compiler.node(node)
    compiler.emit(SAVE, 1)
    compiler.emit(MATCH)
    return compiler.prog
