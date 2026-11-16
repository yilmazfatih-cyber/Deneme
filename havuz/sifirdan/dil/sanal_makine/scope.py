"""Derleyicinin kapsam kayıtları: yerel değişkenler, döngüler ve işlev başına durum.

`FunctionState` derlenmekte olan bir işlevin yerellerini (yuva sırasıyla), kapsam derinliğini ve
açık döngülerini tutar; `resolve_upvalue` clox'taki gibi çevreleyen işlevlere doğru arar ve her
ara işleve bir üst değer kaydı ekler. Kullanan: compiler.py.
Genişletme: yeni bir kapsam türü (ör. `dene` bloğu) gerekiyorsa buraya bir kayıt sınıfı ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .opcodes import FunctionProto


@dataclass
class Local:
    name: str
    depth: int


@dataclass
class Loop:
    continue_target: int  # `devam` buraya atlar
    local_count: int  # `kır`/`devam` yerelleri bu sayıya kadar boşaltır
    breaks: list[int] = field(default_factory=list)  # yamalanacak `kır` atlamaları


class FunctionState:
    """Derlenmekte olan tek bir işlevin durumu (yereller, kapsam derinliği, döngüler)."""

    def __init__(self, name: str, arity: int, enclosing: FunctionState | None) -> None:
        self.proto = FunctionProto(name, arity)
        self.enclosing = enclosing
        self.locals: list[Local] = []
        self.scope_depth = 0
        self.loops: list[Loop] = []

    def resolve_local(self, name: str) -> int | None:
        for slot in range(len(self.locals) - 1, -1, -1):
            if self.locals[slot].name == name:
                return slot
        return None

    def resolve_upvalue(self, name: str) -> int | None:
        if self.enclosing is None:
            return None
        slot = self.enclosing.resolve_local(name)
        if slot is not None:
            return self.add_upvalue(True, slot)
        index = self.enclosing.resolve_upvalue(name)
        if index is not None:
            return self.add_upvalue(False, index)
        return None

    def add_upvalue(self, is_local: bool, index: int) -> int:
        entry = (is_local, index)
        if entry in self.proto.upvalues:
            return self.proto.upvalues.index(entry)
        self.proto.upvalues.append(entry)
        return len(self.proto.upvalues) - 1
