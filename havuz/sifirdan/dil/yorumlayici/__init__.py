"""Tohum: Türkçe anahtar sözcüklü küçük bir programlama dili (ağaç yürüyen yorumlayıcı).

Hızlı kullanım:
    >>> from yorumlayici import run
    >>> run('yazdır("merhaba", 1 + 2)')
    'merhaba 3\\n'

Boru hattı: lexer.py → parser.py (+ pratt.py) → resolver.py → interp.py; değer anlamı values.py,
işleçler ops.py, yerleşik işlevler natives.py. Dil tanımı: DIL.md. Sanal makine (sanal_makine/)
aynı ön ucu ve aynı ops/natives modüllerini kullanır.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .errors import Pos, TohumError
from .interp import Interpreter, Limits, run
from .nodes import dump
from .parser import parse
from .values import display

__all__ = ["Interpreter", "Limits", "Pos", "TohumError", "display", "dump", "parse", "run"]
