"""Derleyici: Tohum AST'sini (yorumlayici ön ucundan) yığın makinesi bayt koduna çevirir.

Yerel değişkenler yığın yuvalarında durur: deyim sınırında yığında YALNIZ yereller vardır, bu
yüzden bir kapsam bitince `END_SCOPE n` tepedeki n değeri atar (kapanımların yakaladığı yuvaları
önce "kapatarak"). Üst değer çözümü clox'taki gibidir: ad bu işlevin yerelinde yoksa çevreleyen
işlevlerde aranır, bulunursa her ara işleve bir üst değer eklenir. Üst düzey (kapsam 0) adlar
geneldir. Değerlendirme sırası ve hata konumları yorumlayıcıyla birebir aynıdır.
Genişletme: yeni deyim için `stmt`, yeni ifade için `expr` içine bir `case` ekleyin; gerekiyorsa
opcodes.py'ye komut, vm.py'ye çalıştırma dalı ekleyin.
"""

from __future__ import annotations

from yorumlayici.errors import Pos
from yorumlayici.nodes import (
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

from .opcodes import OP_FOR_BINARY, FunctionProto, Op
from .scope import FunctionState, Local, Loop


class Compiler:
    def __init__(self) -> None:
        self.fn = FunctionState("<betik>", 0, None)

    # --- yayım yardımcıları ------------------------------------------------
    def emit(self, op: Op, *operands: int, pos: Pos | None = None, note: str = "") -> int:
        proto = self.fn.proto
        start = len(proto.code)
        proto.code.append(int(op))
        proto.code.extend(operands)
        proto.positions.extend([pos] * (1 + len(operands)))
        if note:
            proto.notes[start] = note
        return start

    def patch(self, at: int, operand: int = 1) -> None:
        """`at` konumundaki atlamanın hedefini şu anki konuma ayarlar."""
        self.fn.proto.code[at + operand] = len(self.fn.proto.code)

    def const(self, value: object) -> int:
        consts = self.fn.proto.constants
        for i, existing in enumerate(consts):  # aynı türden aynı değeri yeniden kullan
            if type(existing) is type(value) and existing == value:
                return i
        consts.append(value)
        return len(consts) - 1

    # --- kapsam -------------------------------------------------------------
    def add_local(self, name: str) -> int:
        self.fn.locals.append(Local(name, self.fn.scope_depth))
        return len(self.fn.locals) - 1

    def begin_scope(self) -> None:
        self.fn.scope_depth += 1

    def end_scope(self, pos: Pos | None) -> None:
        self.fn.scope_depth -= 1
        count = 0
        while self.fn.locals and self.fn.locals[-1].depth > self.fn.scope_depth:
            self.fn.locals.pop()
            count += 1
        if count:
            self.emit(Op.END_SCOPE, count, pos=pos)

    def block(self, body: list[Stmt], pos: Pos | None) -> None:
        self.begin_scope()
        for stmt in body:
            self.stmt(stmt)
        self.end_scope(pos)

    # --- adlar --------------------------------------------------------------
    def load(self, name: str, pos: Pos) -> None:
        slot = self.fn.resolve_local(name)
        if slot is not None:
            self.emit(Op.GET_LOCAL, slot, pos=pos, note=name)
        elif (index := self.fn.resolve_upvalue(name)) is not None:
            self.emit(Op.GET_UPVALUE, index, pos=pos, note=name)
        else:
            self.emit(Op.GET_GLOBAL, self.const(name), pos=pos)

    def store(self, name: str, pos: Pos) -> None:
        slot = self.fn.resolve_local(name)
        if slot is not None:
            self.emit(Op.SET_LOCAL, slot, pos=pos, note=name)
        elif (index := self.fn.resolve_upvalue(name)) is not None:
            self.emit(Op.SET_UPVALUE, index, pos=pos, note=name)
        else:
            self.emit(Op.SET_GLOBAL, self.const(name), pos=pos)

    # --- deyimler ----------------------------------------------------------
    def stmt(self, stmt: Stmt) -> None:
        match stmt:
            case ExprStmt(expr=expr):
                self.expr(expr)
                self.emit(Op.POP)
            case VarDecl(name=name, value=value, pos=pos):
                if value is None:
                    self.emit(Op.CONST, self.const(None), pos=pos)
                else:
                    self.expr(value)
                self.declare(name, pos)
            case FuncDecl(func=func, pos=pos):
                if self.fn.scope_depth == 0:
                    self.function(func)
                    self.emit(Op.DEFINE_GLOBAL, self.const(func.name), pos=pos)
                else:
                    self.add_local(func.name)  # gövdeden önce: özyineleme kendini görsün
                    self.function(func)
            case Assign():
                self.assign(stmt)
            case If(cond=cond, then=then, otherwise=otherwise, pos=pos):
                self.expr(cond)
                to_else = self.emit(Op.POP_JUMP_IF_FALSE, 0, pos=pos)
                self.block(then, pos)
                if otherwise is None:
                    self.patch(to_else)
                else:
                    to_end = self.emit(Op.JUMP, 0)
                    self.patch(to_else)
                    self.block(otherwise, pos)
                    self.patch(to_end)
            case While():
                self.while_loop(stmt)
            case For():
                self.for_loop(stmt)
            case Return(value=value, pos=pos):
                if value is None:
                    self.emit(Op.CONST, self.const(None), pos=pos)
                else:
                    self.expr(value)
                self.emit(Op.RETURN, pos=pos)
            case Break(pos=pos):
                loop = self.fn.loops[-1]
                self.unwind_to(loop, pos)
                loop.breaks.append(self.emit(Op.JUMP, 0, pos=pos))
            case Continue(pos=pos):
                loop = self.fn.loops[-1]
                self.unwind_to(loop, pos)
                self.emit(Op.JUMP, loop.continue_target, pos=pos)

    def declare(self, name: str, pos: Pos) -> None:
        """Değer yığının tepesinde: genel kapsamda adlandır, yerelde yuva olarak bırak."""
        if self.fn.scope_depth == 0:
            self.emit(Op.DEFINE_GLOBAL, self.const(name), pos=pos)
        else:
            self.add_local(name)

    def unwind_to(self, loop: Loop, pos: Pos) -> None:
        extra = len(self.fn.locals) - loop.local_count
        if extra:
            self.emit(Op.END_SCOPE, extra, pos=pos)

    def while_loop(self, stmt: While) -> None:
        start = len(self.fn.proto.code)
        self.expr(stmt.cond)
        to_exit = self.emit(Op.POP_JUMP_IF_FALSE, 0, pos=stmt.pos)
        loop = Loop(start, len(self.fn.locals))
        self.fn.loops.append(loop)
        self.block(stmt.body, stmt.pos)
        self.emit(Op.JUMP, start, pos=stmt.pos)
        self.fn.loops.pop()
        self.patch(to_exit)
        for at in loop.breaks:
            self.patch(at)

    def for_loop(self, stmt: For) -> None:
        self.expr(stmt.iterable)
        self.emit(Op.GET_ITER, pos=stmt.iterable.pos)
        self.begin_scope()  # gizli yereller: dolaşılan liste ve sıradaki dizin
        list_slot = self.add_local("(liste)")
        self.emit(Op.CONST, self.const(0))
        index_slot = self.add_local("(sıra)")
        start = self.emit(Op.FOR_NEXT, list_slot, index_slot, 0, pos=stmt.pos)
        loop = Loop(start, len(self.fn.locals))
        self.fn.loops.append(loop)
        self.begin_scope()  # her tur yeni kapsam: döngü değişkeni her turda yeni bir bağ
        self.add_local(stmt.var)
        for inner in stmt.body:
            self.stmt(inner)
        self.end_scope(stmt.pos)
        self.emit(Op.JUMP, start, pos=stmt.pos)
        self.fn.loops.pop()
        self.patch(start, operand=3)
        for at in loop.breaks:
            self.patch(at)
        self.end_scope(stmt.pos)

    def assign(self, stmt: Assign) -> None:
        target = stmt.target
        if isinstance(target, Name):
            if stmt.op:
                self.load(target.name, target.pos)
                self.expr(stmt.value)
                self.emit(OP_FOR_BINARY[stmt.op], pos=stmt.pos)
            else:
                self.expr(stmt.value)
            self.store(target.name, target.pos)
            return
        self.expr(target.target)
        self.expr(target.index)
        if stmt.op:
            self.emit(Op.DUP2)
            self.emit(Op.INDEX_GET, pos=target.pos)
            self.expr(stmt.value)
            self.emit(OP_FOR_BINARY[stmt.op], pos=stmt.pos)
        else:
            self.expr(stmt.value)
        self.emit(Op.INDEX_SET, pos=target.pos)

    # --- ifadeler ----------------------------------------------------------
    def expr(self, expr: Expr) -> None:
        match expr:
            case Literal(value=value, pos=pos):
                self.emit(Op.CONST, self.const(value), pos=pos)
            case Name(name=name, pos=pos):
                self.load(name, pos)
            case Unary(op=op, operand=operand, pos=pos):
                self.expr(operand)
                self.emit(Op.NEGATE if op == "-" else Op.NOT, pos=pos)
            case Binary(op=op, left=left, right=right, pos=pos):
                self.expr(left)
                self.expr(right)
                self.emit(OP_FOR_BINARY[op], pos=pos)
            case Logical(op=op, left=left, right=right, pos=pos):
                self.expr(left)
                jump = Op.JUMP_IF_FALSE if op == "ve" else Op.JUMP_IF_TRUE
                skip = self.emit(jump, 0, pos=pos)
                self.emit(Op.POP)
                self.expr(right)
                self.patch(skip)
            case Call(callee=callee, args=args, pos=pos):
                self.expr(callee)
                for arg in args:
                    self.expr(arg)
                self.emit(Op.CALL, len(args), pos=pos)
            case Index(target=target, index=index, pos=pos):
                self.expr(target)
                self.expr(index)
                self.emit(Op.INDEX_GET, pos=pos)
            case ListLit(items=items, pos=pos):
                for item in items:
                    self.expr(item)
                self.emit(Op.BUILD_LIST, len(items), pos=pos)
            case DictLit(pairs=pairs, pos=pos):
                for key, value in pairs:
                    self.expr(key)
                    self.emit(Op.CHECK_KEY, pos=key.pos)
                    self.expr(value)
                self.emit(Op.BUILD_DICT, len(pairs), pos=pos)
            case FuncLit():
                self.function(expr)

    def function(self, func: FuncLit) -> None:
        """İşlevi ayrı bir FunctionProto'ya derler ve CLOSURE komutunu yayar."""
        state = FunctionState(func.name, len(func.params), self.fn)
        self.fn = state
        state.scope_depth = 1
        for param in func.params:
            self.add_local(param)
        for stmt in func.body:
            self.stmt(stmt)
        self.emit(Op.CONST, self.const(None))
        self.emit(Op.RETURN)
        assert state.enclosing is not None
        self.fn = state.enclosing
        self.emit(Op.CLOSURE, self.const(state.proto), pos=func.pos, note=func.name)


def compile_program(program: Program) -> FunctionProto:
    """Çözümlenmiş (resolver'dan geçmiş) programı en dış işlev olarak derler."""
    compiler = Compiler()
    for stmt in program.body:
        compiler.stmt(stmt)
    compiler.emit(Op.CONST, compiler.const(None))
    compiler.emit(Op.RETURN)
    return compiler.fn.proto
