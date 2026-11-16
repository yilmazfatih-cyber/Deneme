"""Bayt kodu dökümü (disassembler): derlenmiş işlevi okunur tabloya çevirir.

Her satır: konum, kaynak satır:sütun, komut adı, işlenenler ve açıklama (sabitin değeri, değişken
adı, atlama hedefi). İç işlevler (CLOSURE) ana dökümden sonra sırayla gösterilir.
Kullanan: `python -m sanal_makine dok dosya.tohum`, testler.
Genişletme: yeni komutun açıklaması için `describe` içine bir dal ekleyin.
"""

from __future__ import annotations

from yorumlayici.values import display

from .opcodes import OPERANDS, FunctionProto, Op

JUMPS = {Op.JUMP, Op.JUMP_IF_FALSE, Op.JUMP_IF_TRUE, Op.POP_JUMP_IF_FALSE}


def describe(proto: FunctionProto, at: int, op: Op, args: list[int]) -> str:
    """Komutun sağına yazılacak açıklama (boş olabilir)."""
    if op is Op.CONST:
        value = proto.constants[args[0]]
        return display(value, nested=True) if not isinstance(value, FunctionProto) else value.name
    if op in (Op.GET_GLOBAL, Op.SET_GLOBAL, Op.DEFINE_GLOBAL):
        return str(proto.constants[args[0]])
    if op in JUMPS:
        return f"-> {args[0]}"
    if op is Op.FOR_NEXT:
        return f"bitince -> {args[2]}"
    if op is Op.CLOSURE:
        inner = proto.constants[args[0]]
        assert isinstance(inner, FunctionProto)
        return f"<işlev {inner.name}> üst değerler: {inner.upvalues}"
    return proto.notes.get(at, "")


def disassemble(proto: FunctionProto) -> str:
    """İşlevi ve içindeki tüm işlevleri dökümler."""
    lines = [f"== {proto.name} ({proto.arity} parametre, {len(proto.upvalues)} üst değer) =="]
    nested: list[FunctionProto] = []
    at = 0
    while at < len(proto.code):
        op = Op(proto.code[at])
        count = OPERANDS[op]
        args = proto.code[at + 1 : at + 1 + count]
        pos = proto.positions[at]
        where = str(pos) if pos else ""
        operands = " ".join(str(a) for a in args)
        note = describe(proto, at, op, args)
        lines.append(f"{at:5d}  {where:>7}  {op.name:<18}{operands:<10}{note}".rstrip())
        if op is Op.CLOSURE:
            inner = proto.constants[args[0]]
            assert isinstance(inner, FunctionProto)
            nested.append(inner)
        at += 1 + count
    for inner in nested:
        lines.append("")
        lines.append(disassemble(inner))
    return "\n".join(lines)
