"""Tohum için bayt kodu derleyici + yığın tabanlı sanal makine.

Hızlı kullanım:
    >>> from sanal_makine import run
    >>> run('yazdır(1 + 2)')
    '3\\n'

Ön uç (sözcük çözümleyici, ayrıştırıcı, çözümleyici) ve değer anlamı (ops, yerleşikler)
yorumlayici paketindendir; bu paket derleyiciyi (compiler.py), makineyi (vm.py), bayt kodu
dökümünü (disasm.py) ve farksal test için rastgele program üretecini (random_programs.py) ekler.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .compiler import compile_program
from .disasm import disassemble
from .opcodes import FunctionProto, Op
from .vm import VM, run

__all__ = ["VM", "FunctionProto", "Op", "compile_program", "disassemble", "run"]
