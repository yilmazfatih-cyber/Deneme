"""Yığın tabanlı sanal makine: derlenmiş Tohum bayt kodunu çalıştırır.

Yapı (clox'a benzer): tek bir değer yığını; her çağrı bir `Frame` (kapanım, komut sayacı, taban).
Yerel yuva i = `stack[base + i]`; çağrılan işlev `stack[base - 1]`'dedir. Üst değerler önce
"açık"tır (yığındaki yuvayı gösterir); yuva kapsamdan çıkarken (`END_SCOPE`/`RETURN`) değeri
kopyalanıp "kapanır" — böylece kapanım, değişkeni kendi ömrünün ötesinde de paylaşır.
Değer anlamı (işleçler, yerleşikler, hata iletileri) yorumlayıcıyla ORTAKTIR (yorumlayici/ops.py).
Genişletme: yeni komut için `run_frames` içindeki `match` bloğuna bir `case` ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from yorumlayici import ops
from yorumlayici.errors import Pos, limit_error
from yorumlayici.interp import Limits
from yorumlayici.natives import Builtin, make_builtins
from yorumlayici.optimize import fold_constants
from yorumlayici.parser import parse
from yorumlayici.resolver import resolve
from yorumlayici.values import FunctionValue, is_truthy

from .compiler import compile_program
from .opcodes import BINARY_OPS, FunctionProto, Op

DEFAULT_LIMITS = Limits(max_steps=50_000_000, max_depth=200)


class Upvalue:
    """Kapanımın yakaladığı değişken: açıkken yığın yuvasını, kapalıyken kendi değerini tutar."""

    __slots__ = ("closed", "index", "value")

    def __init__(self, index: int) -> None:
        self.index = index
        self.value: object = None
        self.closed = False


class Closure(FunctionValue):
    def __init__(self, proto: FunctionProto, upvalues: list[Upvalue]) -> None:
        self.proto = proto
        self.upvalues = upvalues
        self.name = proto.name


@dataclass
class Frame:
    closure: Closure
    ip: int
    base: int


class VM:
    def __init__(
        self,
        write: Callable[[str], None] | None = None,
        limits: Limits | None = None,
        optimize: bool = False,
    ):
        self.write = write or (lambda text: print(text, end=""))
        self.limits = limits or DEFAULT_LIMITS
        self.optimize = optimize  # True: derlemeden önce sabit katlama
        self.globals: dict[str, object] = dict(make_builtins())
        self.stack: list[object] = []
        self.open_upvalues: dict[int, Upvalue] = {}

    def run(self, source: str) -> None:
        program = parse(source)
        resolve(program, set(self.globals))
        if self.optimize:
            program, _ = fold_constants(program)
        self.execute(compile_program(program))

    def execute(self, proto: FunctionProto) -> object:
        script = Closure(proto, [])
        self.stack = [script]
        self.open_upvalues = {}
        try:
            return self.run_frames([Frame(script, 0, 1)])
        except RecursionError:  # yalnız çok derin iç içe değerlerin gösteriminde olabilir
            raise limit_error("Python yığını doldu: iç içe yapı çok derin", None) from None

    # --- üst değerler --------------------------------------------------------
    def capture(self, index: int) -> Upvalue:
        upvalue = self.open_upvalues.get(index)
        if upvalue is None:
            upvalue = self.open_upvalues[index] = Upvalue(index)
        return upvalue

    def close_upvalues(self, threshold: int) -> None:
        """`threshold` ve üstündeki yuvaları gösteren açık üst değerleri kapatır."""
        for index in [i for i in self.open_upvalues if i >= threshold]:
            upvalue = self.open_upvalues.pop(index)
            upvalue.value = self.stack[index]
            upvalue.closed = True

    # --- ana döngü -----------------------------------------------------------
    def run_frames(self, frames: list[Frame]) -> object:
        stack = self.stack
        frame = frames[-1]
        code, consts, positions = self.unpack(frame)
        ip, base = frame.ip, frame.base
        steps, max_steps = 0, self.limits.max_steps
        while True:
            start = ip
            op = code[ip]
            steps += 1
            if steps > max_steps:
                raise ops.steps_error(max_steps, positions[start])
            match op:
                case Op.CONST:
                    stack.append(consts[code[ip + 1]])
                    ip += 2
                case Op.POP:
                    stack.pop()
                    ip += 1
                case Op.DUP2:
                    stack.extend(stack[-2:])
                    ip += 1
                case Op.GET_LOCAL:
                    stack.append(stack[base + code[ip + 1]])
                    ip += 2
                case Op.SET_LOCAL:
                    stack[base + code[ip + 1]] = stack.pop()
                    ip += 2
                case Op.GET_UPVALUE:
                    upvalue = frame.closure.upvalues[code[ip + 1]]
                    stack.append(upvalue.value if upvalue.closed else stack[upvalue.index])
                    ip += 2
                case Op.SET_UPVALUE:
                    upvalue = frame.closure.upvalues[code[ip + 1]]
                    if upvalue.closed:
                        upvalue.value = stack.pop()
                    else:
                        stack[upvalue.index] = stack.pop()
                    ip += 2
                case Op.GET_GLOBAL:
                    name = str(consts[code[ip + 1]])
                    if name not in self.globals:
                        raise ops.undefined_global(name, positions[start])
                    stack.append(self.globals[name])
                    ip += 2
                case Op.SET_GLOBAL:
                    name = str(consts[code[ip + 1]])
                    if name not in self.globals:
                        raise ops.undefined_global(name, positions[start])
                    self.globals[name] = stack.pop()
                    ip += 2
                case Op.DEFINE_GLOBAL:
                    self.globals[str(consts[code[ip + 1]])] = stack.pop()
                    ip += 2
                case Op.INDEX_GET:
                    key = stack.pop()
                    stack[-1] = ops.index_get(stack[-1], key, positions[start])
                    ip += 1
                case Op.INDEX_SET:
                    value, key, target = stack.pop(), stack.pop(), stack.pop()
                    ops.index_set(target, key, value, positions[start])
                    ip += 1
                case Op.CHECK_KEY:
                    ops.check_key(stack[-1], positions[start])
                    ip += 1
                case Op.NEGATE:
                    stack[-1] = ops.unary("-", stack[-1], positions[start])
                    ip += 1
                case Op.NOT:
                    stack[-1] = not is_truthy(stack[-1])
                    ip += 1
                case Op.JUMP:
                    ip = code[ip + 1]
                case Op.JUMP_IF_FALSE:
                    ip = ip + 2 if is_truthy(stack[-1]) else code[ip + 1]
                case Op.JUMP_IF_TRUE:
                    ip = code[ip + 1] if is_truthy(stack[-1]) else ip + 2
                case Op.POP_JUMP_IF_FALSE:
                    ip = ip + 2 if is_truthy(stack.pop()) else code[ip + 1]
                case Op.CALL:
                    argc = code[ip + 1]
                    ip += 2
                    callee = stack[-argc - 1]
                    if isinstance(callee, Closure):
                        self.check_call(callee, argc, len(frames), positions[start])
                        frame.ip = ip
                        frame = Frame(callee, 0, len(stack) - argc)
                        frames.append(frame)
                        code, consts, positions = self.unpack(frame)
                        ip, base = 0, frame.base
                    elif isinstance(callee, Builtin):
                        args = stack[len(stack) - argc :]
                        del stack[len(stack) - argc - 1 :]
                        stack.append(callee.call(args, self, positions[start]))
                    else:
                        raise ops.not_callable(callee, positions[start])
                case Op.CLOSURE:
                    proto = consts[code[ip + 1]]
                    assert isinstance(proto, FunctionProto)
                    upvalues = [
                        self.capture(base + index) if is_local else frame.closure.upvalues[index]
                        for is_local, index in proto.upvalues
                    ]
                    stack.append(Closure(proto, upvalues))
                    ip += 2
                case Op.RETURN:
                    result = stack.pop()
                    self.close_upvalues(base)
                    del stack[base - 1 :]
                    frames.pop()
                    if not frames:
                        return result
                    stack.append(result)
                    frame = frames[-1]
                    code, consts, positions = self.unpack(frame)
                    ip, base = frame.ip, frame.base
                case Op.BUILD_LIST:
                    count = code[ip + 1]
                    items = stack[len(stack) - count :]
                    del stack[len(stack) - count :]
                    stack.append(items)
                    ip += 2
                case Op.BUILD_DICT:
                    count = code[ip + 1] * 2
                    flat = stack[len(stack) - count :]
                    del stack[len(stack) - count :]
                    stack.append(dict(zip(flat[0::2], flat[1::2], strict=True)))
                    ip += 2
                case Op.GET_ITER:
                    stack[-1] = ops.iterate(stack[-1], positions[start])
                    ip += 1
                case Op.FOR_NEXT:
                    seq = stack[base + code[ip + 1]]
                    index = stack[base + code[ip + 2]]
                    assert isinstance(seq, list)
                    assert isinstance(index, int)
                    if index < len(seq):
                        stack[base + code[ip + 2]] = index + 1
                        stack.append(seq[index])
                        ip += 4
                    else:
                        ip = code[ip + 3]
                case Op.END_SCOPE:
                    keep = len(stack) - code[ip + 1]
                    self.close_upvalues(keep)
                    del stack[keep:]
                    ip += 2
                case _:
                    right = stack.pop()
                    stack[-1] = ops.binary(BINARY_OPS[Op(op)], stack[-1], right, positions[start])
                    ip += 1

    @staticmethod
    def unpack(frame: Frame) -> tuple[list[int], list[object], list[Pos | None]]:
        proto = frame.closure.proto
        return proto.code, proto.constants, proto.positions

    def check_call(self, callee: Closure, argc: int, depth: int, pos: Pos | None) -> None:
        if argc != callee.proto.arity:
            raise ops.arity_error(callee.name, callee.proto.arity, argc, pos)
        if depth - 1 >= self.limits.max_depth:
            raise ops.depth_error(self.limits.max_depth, pos)


def run(source: str, limits: Limits | None = None) -> str:
    """Kaynağı derleyip sanal makinede çalıştırır ve yazdırılan metni döndürür."""
    out: list[str] = []
    VM(out.append, limits).run(source)
    return "".join(out)
