"""Ayrıştırıcı: sözcüklerden sözdizimi ağacı (AST).

Dilbilgisi (yukarıdan aşağı, özyinelemeli iniş):
    betik     := öğe ((';' | '&') öğe)* [';' | '&']
    öğe       := boru (('&&' | '||') boru)*          → AndOr
    boru      := komut ('|' komut)*                  → Pipeline
    komut     := (ATAMA)* (SÖZCÜK | yönlendirme)+    → Command
    yönlendirme := ('>' | '>>' | '<' | '2>' | '2>>' | '&>') SÖZCÜK | '2>&1'
Örnek:  AD=x cat < a.txt | sort > b.txt && echo tamam &
        → Item(AndOr(Pipeline([cat <a.txt, sort >b.txt]), [("&&", Pipeline([echo tamam]))]), arka plan)
Genişletme: yeni bir yapı (ör. alt kabuk "( … )") için önce `lexer.OPERATORS`, sonra burada yeni bir kural.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from kabuk.lexer import Op, ParseError, Part, Token, Word, tokenize

_ASSIGNMENT_RE = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=")
REDIRECTS = (">", ">>", "<", "2>", "2>>", "&>", "2>&1")


@dataclass
class Redirect:
    op: str
    target: Word | None  # "2>&1" için None


@dataclass
class Command:
    words: list[Word] = field(default_factory=list)
    redirects: list[Redirect] = field(default_factory=list)
    assignments: list[tuple[str, Word]] = field(default_factory=list)


@dataclass
class Pipeline:
    commands: list[Command]


@dataclass
class AndOr:
    first: Pipeline
    rest: list[tuple[str, Pipeline]] = field(default_factory=list)


@dataclass
class Item:
    body: AndOr
    background: bool = False


def _assignment(word: Word) -> tuple[str, Word] | None:
    first = word.parts[0]
    match = _ASSIGNMENT_RE.match(first.text)
    if first.quoted or match is None:
        return None
    rest = (Part(first.text[match.end() :], first.quoted, first.expand), *word.parts[1:])
    return match.group(1), Word(tuple(p for p in rest if p.text) or (Part("", quoted=True),))


class _Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.index = 0

    def peek(self) -> Token | None:
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def take_op(self, *values: str) -> str | None:
        token = self.peek()
        if isinstance(token, Op) and token.value in values:
            self.index += 1
            return token.value
        return None

    def script(self) -> list[Item]:
        items: list[Item] = []
        while self.peek() is not None:
            body = self.and_or()
            separator = self.take_op(";", "&")
            items.append(Item(body, background=separator == "&"))
            if separator is None and self.peek() is not None:
                raise ParseError(f"Beklenmeyen `{_show(self.peek())}`.")
        return items

    def and_or(self) -> AndOr:
        node = AndOr(self.pipeline())
        while (op := self.take_op("&&", "||")) is not None:
            node.rest.append((op, self.pipeline()))
        return node

    def pipeline(self) -> Pipeline:
        commands = [self.command()]
        while self.take_op("|"):
            commands.append(self.command())
        return Pipeline(commands)

    def command(self) -> Command:
        command = Command()
        while (token := self.peek()) is not None:
            if isinstance(token, Word):
                self.index += 1
                assignment = None if command.words else _assignment(token)
                if assignment is not None:
                    command.assignments.append(assignment)
                else:
                    command.words.append(token)
            elif token.value in REDIRECTS:
                self.index += 1
                target = None
                if token.value != "2>&1":
                    following = self.peek()
                    if not isinstance(following, Word):
                        raise ParseError(f"`{token.value}` sonrasında dosya adı bekleniyordu.")
                    self.index += 1
                    target = following
                command.redirects.append(Redirect(token.value, target))
            else:
                break
        if not command.words and not command.assignments and not command.redirects:
            raise ParseError(f"Beklenmeyen `{_show(self.peek())}`: önce bir komut yazın.")
        return command


def _show(token: Token | None) -> str:
    if token is None:
        return "satır sonu"
    return token.value if isinstance(token, Op) else token.text


def parse(line: str) -> list[Item]:
    return _Parser(tokenize(line)).script()
