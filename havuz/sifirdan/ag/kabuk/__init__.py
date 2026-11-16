"""kabuk — mini Unix kabuğu: sözcük ayrıştırma, açılım, boru hattı, yönlendirme, işler, yerleşikler.

    from kabuk import Shell
    Shell(cwd="/tmp").run("ls *.txt | wc -l > sayi.txt && echo tamam")
Genişletme: yeni bir dışa açık ad eklerseniz `__all__` listesine de yazın.
"""

from kabuk.executor import BUILTINS, Shell, run_lines
from kabuk.expand import expand_word
from kabuk.lexer import Op, ParseError, Part, Word, tokenize
from kabuk.parser import AndOr, Command, Item, Pipeline, Redirect, parse

__all__ = [
    "BUILTINS",
    "AndOr",
    "Command",
    "Item",
    "Op",
    "ParseError",
    "Part",
    "Pipeline",
    "Redirect",
    "Shell",
    "Word",
    "expand_word",
    "parse",
    "run_lines",
    "tokenize",
]
