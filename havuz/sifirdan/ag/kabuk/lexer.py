"""Sözcük ayrıştırıcı: komut satırını sözcüklere ve işleçlere böler; tırnak/kaçış bilgisini KORUR.

    echo "Merhaba $AD" 'aynen $AD' a\\ b *.txt 2>&1 | sort
    → Word[Part('echo')]  Word[Part('Merhaba ', tırnaklı), Part('$AD', tırnaklı, açılır)]
      Word[Part('aynen $AD', tırnaklı, AÇILMAZ)] Word[Part('a'), Part(' ', kaçışlı), Part('b')]
      Word[Part('*.txt')]  Op('2>&1')  Op('|')  Word[Part('sort')]
Neden parçalar: açılım aşamasında hangi metnin tırnaklı olduğu bilinmelidir — tırnaklı metin alanlara
bölünmez ve glob olarak yorumlanmaz ("*.txt" ile *.txt aynı şey değildir).
Genişletme: yeni bir işleç için `OPERATORS`'a ekleyin (uzun olan önce) ve ayrıştırıcıda karşılayın.
"""

from __future__ import annotations

from dataclasses import dataclass

OPERATORS = ("2>&1", "2>>", "&>", ">>", "2>", "||", "&&", "|", ";", "&", ">", "<")
_FD_OPERATORS = ("2>&1", "2>>", "2>")  # yalnız sözcük başında işleçtir ("a2>b" → "a2" > "b")
_DQ_ESCAPABLE = '$`"\\'


class ParseError(ValueError):
    """Komut satırı ayrıştırılamadı; ileti Türkçe ve yol göstericidir."""


@dataclass(frozen=True)
class Part:
    text: str
    quoted: bool = False  # tırnak içi ya da kaçışlı: bölünmez, glob değildir
    expand: bool = True  # $ açılımı yapılır mı (tek tırnak ve kaçışlı $ için False)


@dataclass(frozen=True)
class Word:
    parts: tuple[Part, ...]

    @property
    def text(self) -> str:
        return "".join(part.text for part in self.parts)


@dataclass(frozen=True)
class Op:
    value: str


Token = Word | Op


def _double_quoted(line: str, start: int) -> tuple[list[Part], int]:
    """Çift tırnak içi: $ açılır; \\ yalnız $ ` " \\ önünde kaçıştır. Kapanış tırnağının ardını döndürür."""
    parts: list[Part] = []
    buffer = ""
    index = start
    while index < len(line):
        char = line[index]
        if char == '"':
            parts.append(Part(buffer, quoted=True))
            return parts, index + 1
        if char == "\\" and index + 1 < len(line) and line[index + 1] in _DQ_ESCAPABLE:
            parts += [Part(buffer, quoted=True), Part(line[index + 1], quoted=True, expand=False)]
            buffer = ""
            index += 2
            continue
        buffer += char
        index += 1
    raise ParseError('Kapanmamış çift tırnak (") var.')


def tokenize(line: str) -> list[Token]:
    tokens: list[Token] = []
    parts: list[Part] = []
    plain = ""

    def flush_plain() -> None:
        nonlocal plain
        if plain:
            parts.append(Part(plain))
            plain = ""

    def flush_word() -> None:
        flush_plain()
        if parts:
            tokens.append(Word(tuple(parts)))
            parts.clear()

    index = 0
    while index < len(line):
        char = line[index]
        at_word_start = not parts and not plain
        if char in " \t\n":
            flush_word()
            index += 1
        elif char == "#" and at_word_start:
            break  # yorum
        elif op := next((o for o in OPERATORS if line.startswith(o, index)), None):
            if op in _FD_OPERATORS and not at_word_start:
                plain += char
                index += 1
                continue
            flush_word()
            tokens.append(Op(op))
            index += len(op)
        elif char == "'":
            end = line.find("'", index + 1)
            if end < 0:
                raise ParseError("Kapanmamış tek tırnak (') var.")
            flush_plain()
            parts.append(Part(line[index + 1 : end], quoted=True, expand=False))
            index = end + 1
        elif char == '"':
            flush_plain()
            quoted, index = _double_quoted(line, index + 1)
            parts.extend(quoted)
        elif char == "\\":
            flush_plain()
            if index + 1 < len(line) and line[index + 1] != "\n":
                parts.append(Part(line[index + 1], quoted=True, expand=False))
            index += 2
        else:
            plain += char
            index += 1
    flush_word()
    return tokens
