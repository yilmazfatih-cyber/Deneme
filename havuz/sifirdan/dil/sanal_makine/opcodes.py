"""Bayt kodu komutları, işlenen sayıları ve derlenmiş işlev (FunctionProto) yapısı.

Kod düz bir tamsayı listesidir: her komut, işlem kodu + sabit sayıda işlenenden oluşur
(`OPERANDS` tablosu). Atlama hedefleri mutlak konumdur. Her komutun kaynak konumu `positions`
listesinde aynı dizinde durur (hata iletileri yorumlayıcıdakiyle aynı konumu gösterir).
Genişletme: yeni komut için `Op`'a bir üye, `OPERANDS`'a işlenen sayısı ekleyin; derleyicide
(compiler.py) üretin, vm.py'de çalıştırın; disasm.py kendiliğinden gösterir.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum

from yorumlayici.errors import Pos


class Op(IntEnum):
    CONST = 0  # k            sabit havuzundan değer it
    POP = 1  #                yığının tepesini at
    DUP2 = 2  #               tepedeki iki değeri çoğalt (l[i] += x için)
    GET_LOCAL = 3  # yuva     yerel değişkeni it
    SET_LOCAL = 4  # yuva     tepeyi yerel değişkene yaz (ve at)
    GET_UPVALUE = 5  # i      kapanımın i. üst değerini it
    SET_UPVALUE = 6  # i      tepeyi üst değere yaz (ve at)
    GET_GLOBAL = 7  # k       genel değişkeni it (ad sabit havuzunda)
    SET_GLOBAL = 8  # k       var olan genel değişkene yaz (ve at)
    DEFINE_GLOBAL = 9  # k    genel değişken tanımla (ve at)
    INDEX_GET = 10  #         hedef, dizin -> değer
    INDEX_SET = 11  #         hedef, dizin, değer -> (hiç)
    CHECK_KEY = 12  #         tepedeki değer geçerli sözlük anahtarı mı (atmaz)
    ADD = 13
    SUB = 14
    MUL = 15
    DIV = 16
    MOD = 17
    POW = 18
    EQ = 19
    NE = 20
    LT = 21
    LE = 22
    GT = 23
    GE = 24
    NEGATE = 25
    NOT = 26
    JUMP = 27  # hedef
    JUMP_IF_FALSE = 28  # hedef   tepe yanlışsa atla (tepeyi bırakır: `ve` için)
    JUMP_IF_TRUE = 29  # hedef    tepe doğruysa atla (tepeyi bırakır: `veya` için)
    POP_JUMP_IF_FALSE = 30  # hedef   tepeyi at; yanlışsa atla (eğer/iken için)
    CALL = 31  # n            işlev ve n bağımsız değişkenle çağır
    CLOSURE = 32  # k         sabit havuzundaki FunctionProto'dan kapanım kur
    RETURN = 33  #            tepedeki değerle çerçeveden dön
    BUILD_LIST = 34  # n
    BUILD_DICT = 35  # n      n anahtar/değer çifti
    GET_ITER = 36  #          tepedeki değeri dolaşılacak listeye çevir
    FOR_NEXT = (
        37  # l s h    yuva l'deki listenin, yuva s'deki sıradaki öğesini it; bittiyse h'ye atla
    )
    END_SCOPE = 38  # n       tepedeki n yereli kapat (üst değerleri kapat) ve at


# Her komutun işlenen sayısı. YENİ KOMUT BURAYA.
OPERANDS: dict[Op, int] = dict.fromkeys(Op, 0)
OPERANDS.update(
    {
        Op.CONST: 1,
        Op.GET_LOCAL: 1,
        Op.SET_LOCAL: 1,
        Op.GET_UPVALUE: 1,
        Op.SET_UPVALUE: 1,
        Op.GET_GLOBAL: 1,
        Op.SET_GLOBAL: 1,
        Op.DEFINE_GLOBAL: 1,
        Op.JUMP: 1,
        Op.JUMP_IF_FALSE: 1,
        Op.JUMP_IF_TRUE: 1,
        Op.POP_JUMP_IF_FALSE: 1,
        Op.CALL: 1,
        Op.CLOSURE: 1,
        Op.BUILD_LIST: 1,
        Op.BUILD_DICT: 1,
        Op.FOR_NEXT: 3,
        Op.END_SCOPE: 1,
    }
)

# İkili işlem kodu -> ops.binary'nin işleç adı (iki arka uç aynı anlamı paylaşır).
BINARY_OPS: dict[Op, str] = {
    Op.ADD: "+",
    Op.SUB: "-",
    Op.MUL: "*",
    Op.DIV: "/",
    Op.MOD: "%",
    Op.POW: "**",
    Op.EQ: "==",
    Op.NE: "!=",
    Op.LT: "<",
    Op.LE: "<=",
    Op.GT: ">",
    Op.GE: ">=",
}
OP_FOR_BINARY = {name: op for op, name in BINARY_OPS.items()}


@dataclass(eq=False)
class FunctionProto:
    """Derlenmiş işlev: kod + sabitler + üst değer tarifi. Çalışırken `Closure` içinde yaşar."""

    name: str
    arity: int
    code: list[int] = field(default_factory=list)
    positions: list[Pos | None] = field(default_factory=list)
    constants: list[object] = field(default_factory=list)
    # Her üst değer için (yerel mi, dizin): yerelse çevreleyen işlevin yuvası,
    # değilse çevreleyen işlevin üst değeri.
    upvalues: list[tuple[bool, int]] = field(default_factory=list)
    notes: dict[int, str] = field(default_factory=dict)  # komut konumu -> ad (yalnız döküm)
