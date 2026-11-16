"""Metin farkı: Myers algoritması, birleşik fark, yama uygulama, sözcük farkı, üç yollu birleştirme.

Hızlı kullanım:
    >>> from fark import diff_text, apply_patch
    >>> yama = diff_text("bir\\niki\\n", "bir\\nüç\\n")
    >>> apply_patch("bir\\niki\\n", yama)
    'bir\\nüç\\n'

Dosyalar: myers.py (algoritma), unified.py (çıktı), patch.py (yama), words.py (sözcük farkı),
merge3.py (birleştirme). Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .merge3 import MergeResult, merge
from .myers import edit_distance, matches, opcodes
from .patch import PatchError, apply_patch, parse_patch
from .unified import diff_text, unified_diff
from .words import word_diff, word_diff_html

__all__ = [
    "MergeResult",
    "PatchError",
    "apply_patch",
    "diff_text",
    "edit_distance",
    "matches",
    "merge",
    "opcodes",
    "parse_patch",
    "unified_diff",
    "word_diff",
    "word_diff_html",
]
