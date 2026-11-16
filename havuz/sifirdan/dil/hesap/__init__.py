"""Güvenli hesap makinesi: aritmetik, işlevler, değişkenler, birim dönüşümü, Türkçe sayı biçimi.

Hızlı kullanım:
    >>> from hesap import Calculator
    >>> h = Calculator(turkish=True)
    >>> h.format(h.calculate("1.234,5 * 2"))
    '2.469'
    >>> h.format(h.calculate("100 °F kaç °C"))
    '37,7777777778 °C'

Boru hattı: lexer.py (belirteçler) → shunting.py (RPN) → evaluate.py (değer). `eval` kullanılmaz;
kullanıcı girdisi hiçbir zaman Python kodu olarak çalışmaz.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .errors import CalcError
from .evaluate import Calculator, calculate
from .numfmt import format_number
from .units import UNITS, Quantity, Unit

__all__ = ["UNITS", "CalcError", "Calculator", "Quantity", "Unit", "calculate", "format_number"]
