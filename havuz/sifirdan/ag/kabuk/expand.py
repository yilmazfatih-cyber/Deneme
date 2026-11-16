"""Sözcük açılımı: ~ → ev dizini, $DEĞİŞKEN / ${D} / ${D:-varsayılan} / $? / $$, alan bölme, glob.

Kurallar (POSIX'e yakın, sadeleştirilmiş):
    - Tırnaksız açılım sonucu boşluklarda ALANLARA bölünür: X="a b"; ls $X → iki bağımsız değişken.
    - Tırnaklı açılım bölünmez: ls "$X" → tek bağımsız değişken "a b".
    - Tırnaksız ve boş açılım hiç alan üretmez ($YOK → 0 değişken); "" ise bir boş değişken üretir.
    - Glob (* ? [ ]) yalnız tırnaksız harf metninde ve tırnaksız açılımda geçerlidir; eşleşme yoksa
      desen olduğu gibi kalır; nokta ile başlayan dosyalar `*` ile eşleşmez.
Genişletme: komut yerine koyma `$( … )` burada değil; önce lexer'da yeni bir Part türü gerekir.
"""

from __future__ import annotations

import glob
import os
import re
from collections.abc import Callable
from pathlib import Path

from kabuk.lexer import Word

_VAR_RE = re.compile(r"\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*)|([?$]))")
_GLOB_CHARS = set("*?[")

Lookup = Callable[[str], str | None]


def expand_text(text: str, lookup: Lookup) -> list[tuple[str, bool]]:
    """Metni (parça, açılımdan-mı) dizisine çevirir; `lookup("AD")` değişken değerini verir."""
    pieces: list[tuple[str, bool]] = []
    position = 0
    for match in _VAR_RE.finditer(text):
        if match.start() > position:
            pieces.append((text[position : match.start()], False))
        name = match.group(1) or match.group(4) or match.group(5)
        value = lookup(name)
        if match.group(2) is not None and not value:
            value = match.group(3)  # ${AD:-varsayılan}
        pieces.append((value or "", True))
        position = match.end()
    if position < len(text):
        pieces.append((text[position:], False))
    return pieces


def expand_word(word: Word, lookup: Lookup, cwd: Path) -> list[str]:
    fields: list[list[tuple[str, bool]]] = []  # her alan: (metin, glob-olabilir) parçaları
    current: list[tuple[str, bool]] = []
    has_content = False  # alan tırnak ya da harf metin içeriyor mu (boş da olsa sayılır)
    for index, part in enumerate(word.parts):
        text = part.text
        if index == 0 and not part.quoted and (text == "~" or text.startswith("~/")):
            text = (os.environ.get("HOME") or str(Path.home())) + text[1:]
        pieces = expand_text(text, lookup) if part.expand else [(text, False)]
        has_content = has_content or part.quoted  # "" bile bir (boş) değişkendir
        for value, from_expansion in pieces:
            if part.quoted:
                current.append((value, False))
                has_content = True
            elif not from_expansion:
                current.append((value, True))
                has_content = has_content or bool(value)
            else:
                chunks = value.split()
                if value[:1].isspace() and (current or has_content):
                    fields.append(current)
                    current, has_content = [], False
                for number, chunk in enumerate(chunks):
                    if number:
                        fields.append(current)
                        current = []
                    current.append((chunk, True))
                    has_content = True
                if value[-1:].isspace() and chunks:
                    fields.append(current)
                    current, has_content = [], False
    if current or has_content:
        fields.append(current)
    result: list[str] = []
    for segments in fields:
        result.extend(_glob(segments, cwd))
    return result


def _glob(segments: list[tuple[str, bool]], cwd: Path) -> list[str]:
    literal = "".join(text for text, _ in segments)
    if not any(globbable and _GLOB_CHARS & set(text) for text, globbable in segments):
        return [literal]
    pattern = "".join(text if globbable else glob.escape(text) for text, globbable in segments)
    matches = sorted(glob.glob(pattern, root_dir=cwd))
    return matches or [literal]
