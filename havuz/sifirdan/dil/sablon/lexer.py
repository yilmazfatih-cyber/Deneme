"""Şablon sözcük çözümleyicisi: metni düz metin, `{{ ifade }}`, `{% etiket %}` parçalarına böler.

`{# yorum #}` atılır. Boşluk denetimi: `{%-`/`{{-` önceki metnin sondaki boşluklarını, `-%}`/`-}}`
sonraki metnin baştaki boşluklarını siler. Etiket sonu aranırken tırnak içindeki `}}` sayılmaz.
Her parça satır/sütun taşır (hata iletileri için).
Genişletme: `{% raw %}` gibi özel bir blok için `tokenize` içinde etiket adına göre dal ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass

from .markup import TemplateError

TEXT, VAR, BLOCK = "metin", "ifade", "etiket"
CLOSERS = {"{{": "}}", "{%": "%}", "{#": "#}"}


@dataclass
class Piece:
    kind: str  # TEXT, VAR ya da BLOCK
    content: str  # VAR/BLOCK için ayraçlar arasındaki kaynak
    line: int
    col: int  # içeriğin ilk karakterinin konumu (ifade hataları buradan sayar)


class Cursor:
    """Artan konumlar için satır/sütun hesaplar (toplam iş metin boyuyla doğrusal)."""

    def __init__(self, source: str) -> None:
        self.source = source
        self.index, self.line, self.col = 0, 1, 1

    def at(self, index: int) -> tuple[int, int]:
        chunk = self.source[self.index : index]
        newlines = chunk.count("\n")
        if newlines:
            self.line += newlines
            self.col = len(chunk) - chunk.rfind("\n")
        else:
            self.col += len(chunk)
        self.index = index
        return self.line, self.col


def find_close(source: str, start: int, closer: str) -> int:
    """Tırnakları atlayarak `closer`'ın başladığı konumu bulur; yoksa -1."""
    i = start
    quote = ""
    while i < len(source):
        c = source[i]
        if quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = ""
        elif c in "'\"" and closer != "#}":
            quote = c
        elif source.startswith(closer, i):
            return i
        i += 1
    return -1


def tokenize(source: str, name: str) -> list[Piece]:
    pieces: list[Piece] = []
    cursor = Cursor(source)
    i = 0
    strip_next = False
    while i < len(source):
        starts = [p for p in (source.find(o, i) for o in CLOSERS) if p != -1]
        open_at = min(starts) if starts else len(source)
        text = source[i:open_at]
        if strip_next:
            text = text.lstrip()
        opener = source[open_at : open_at + 2]
        trim_left = source[open_at + 2 : open_at + 3] == "-"
        if trim_left:
            text = text.rstrip()
        if text:
            line, col = cursor.at(i)
            pieces.append(Piece(TEXT, text, line, col))
        if open_at >= len(source):
            break
        body_start = open_at + 2 + (1 if trim_left else 0)
        close_at = find_close(source, body_start, CLOSERS[opener])
        if close_at == -1:
            line, col = cursor.at(open_at)
            raise TemplateError(
                f"'{opener}' kapanmadı",
                name,
                line,
                col,
                f"Etiketi '{CLOSERS[opener]}' ile kapatın.",
            )
        strip_next = source[close_at - 1 : close_at] == "-" and close_at > body_start
        body_end = close_at - 1 if strip_next else close_at
        if opener != "{#":
            line, col = cursor.at(body_start)
            kind = VAR if opener == "{{" else BLOCK
            pieces.append(Piece(kind, source[body_start:body_end], line, col))
        i = close_at + 2
    return pieces
