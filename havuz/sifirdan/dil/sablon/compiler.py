"""Şablon derleyicisi: lexer parçalarını Python kapanımlarına (Renderer) çevirir.

Her düğüm `render(ctx, out)` biçiminde bir işleve derlenir; şablon işlenirken AST gezilmez,
yalnız bu işlevler çağrılır. Etiketler: `if/elif/else/endif`, `for … in …/else/endfor`
(`loop.index`, `loop.first`, `loop.last`, `loop.length`; `for k, v in d | items` açma),
`include "ad"`, `set x = …`.
Çıktı `{{ … }}` varsayılan olarak HTML kaçışlıdır. Hatalar şablon adı + satır + sütunla verilir;
kapanmamış ya da karışmış bloklarda açılış etiketinin yeri ipucu olarak söylenir.
Genişletme: yeni etiket için `TAGS` sözlüğüne ad → yöntem ekleyin (ör. "macro": self.macro).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from .expr import Expr, compile_expression
from .filters import text_of
from .lexer import BLOCK, TEXT, Piece
from .markup import RenderProblem, TemplateError, Undefined, escape

if TYPE_CHECKING:
    from .environment import Context

Renderer = Callable[["Context", list[str]], None]
END_WORDS = {"if": "endif", "for": "endfor"}


def sequence(parts: list[Renderer]) -> Renderer:
    def render(ctx: Context, out: list[str]) -> None:
        for part in parts:
            part(ctx, out)

    return render


def text_node(text: str) -> Renderer:
    return lambda ctx, out: out.append(text)


class TemplateCompiler:
    def __init__(self, pieces: list[Piece], name: str) -> None:
        self.pieces = pieces
        self.i = 0
        self.name = name
        self.open: list[tuple[str, Piece]] = []  # açık bloklar (hata iletileri için)
        self.tags: dict[str, Callable[[Piece, str], Renderer]] = {
            "if": self.if_tag,
            "for": self.for_tag,
            "include": self.include_tag,
            "set": self.set_tag,
            # YENİ ETİKET BURAYA
        }

    def error(self, piece: Piece, message: str, hint: str | None = None) -> TemplateError:
        return TemplateError(message, self.name, piece.line, piece.col, hint)

    def expr(self, piece: Piece, source: str, offset: int) -> Expr:
        """Etiket içeriğinin `offset`'ten başlayan kısmını ifade olarak derler."""
        before = piece.content[:offset]
        line = piece.line + before.count("\n")
        col = (len(before) - before.rfind("\n")) if "\n" in before else piece.col + offset
        return compile_expression(source, self.name, line, col)

    def compile(self) -> Renderer:
        body, end, _ = self.block(())
        assert end is None
        return body

    def block(self, ends: tuple[str, ...]) -> tuple[Renderer, Piece | None, str]:
        """`ends` sözcüklerinden biri gelene kadar okur: (gövde, bitiren parça, sözcük)."""
        parts: list[Renderer] = []
        while self.i < len(self.pieces):
            piece = self.pieces[self.i]
            self.i += 1
            if piece.kind == TEXT:
                parts.append(text_node(piece.content))
                continue
            if piece.kind != BLOCK:
                parts.append(self.output(piece))
                continue
            word, _, rest = piece.content.strip().partition(" ")
            if word in ends:
                return sequence(parts), piece, word
            if word in self.tags:
                parts.append(self.tags[word](piece, rest))
            else:
                raise self.unexpected(piece, word)
        if ends:
            word, opener = self.open[-1]
            raise self.error(
                opener,
                f"'{{% {word} %}}' bloğu kapanmadı",
                f"Şablonun uygun yerine '{{% {END_WORDS[word]} %}}' ekleyin.",
            )
        return sequence(parts), None, ""

    def unexpected(self, piece: Piece, word: str) -> TemplateError:
        if word.startswith("end") or word in ("else", "elif"):
            if self.open:
                open_word, opener = self.open[-1]
                hint = (
                    f"Açık blok '{{% {open_word} %}}' (satır {opener.line}) önce "
                    f"'{{% {END_WORDS[open_word]} %}}' ile kapatılmalı."
                )
            else:
                hint = "Bu etiketin açılış karşılığı yok."
            return self.error(piece, f"'{{% {word} %}}' burada beklenmiyordu", hint)
        known = ", ".join(sorted(self.tags))
        return self.error(piece, f"bilinmeyen etiket '{word}'", f"Bilinen etiketler: {known}.")

    def output(self, piece: Piece) -> Renderer:
        expr = compile_expression(piece.content, self.name, piece.line, piece.col)
        name = self.name
        lead = piece.content[: len(piece.content) - len(piece.content.lstrip())]
        line = piece.line + lead.count("\n")  # hata konumu: ifadenin ilk karakteri
        col = len(lead) - lead.rfind("\n") if "\n" in lead else piece.col + len(lead)

        def render(ctx: Context, out: list[str]) -> None:
            value = expr(ctx)
            try:
                if isinstance(value, Undefined) and not ctx.env.strict:
                    return
                out.append(escape(value) if ctx.env.autoescape else text_of(value))
            except RenderProblem as problem:
                raise TemplateError(problem.message, name, line, col, problem.hint) from None

        return render

    # --- etiketler ---------------------------------------------------------
    def if_tag(self, piece: Piece, rest: str) -> Renderer:
        branches: list[tuple[Expr, Renderer]] = []
        otherwise: Renderer | None = None
        condition = self.expr(piece, rest, piece.content.index(rest) if rest else 0)
        self.open.append(("if", piece))
        while True:
            body, end, word = self.block(("elif", "else", "endif"))
            branches.append((condition, body))
            assert end is not None
            if word == "elif":
                tail = end.content.strip().partition(" ")[2]
                condition = self.expr(end, tail, end.content.index(tail) if tail else 0)
            elif word == "else":
                otherwise, end, _ = self.block(("endif",))
                break
            else:
                break
        self.open.pop()

        def render(ctx: Context, out: list[str]) -> None:
            for cond, body in branches:
                if cond(ctx):
                    body(ctx, out)
                    return
            if otherwise is not None:
                otherwise(ctx, out)

        return render

    def for_tag(self, piece: Piece, rest: str) -> Renderer:
        target_text, sep, source = rest.partition(" in ")
        targets = [t.strip() for t in target_text.split(",")]
        if not sep or not all(t.isidentifier() and not t.startswith("_") for t in targets):
            raise self.error(piece, "for biçimi hatalı", "Örnek: {% for urun in urunler %}")
        iterable = self.expr(piece, source, piece.content.index(source))
        self.open.append(("for", piece))
        body, _, word = self.block(("else", "endfor"))
        empty: Renderer | None = None
        if word == "else":
            empty, _, _ = self.block(("endfor",))
        self.open.pop()
        name = self.name

        def render(ctx: Context, out: list[str]) -> None:
            try:
                items = list(iterable(ctx))  # type: ignore[call-overload]
            except (RenderProblem, TypeError) as exc:
                message = (
                    exc.message if isinstance(exc, RenderProblem) else "döngü için liste gerekir"
                )
                raise TemplateError(message, name, piece.line, piece.col) from None
            if not items and empty is not None:
                empty(ctx, out)
            for index, item in enumerate(items):
                scope: dict[str, object] = {
                    "loop": {
                        "index": index + 1,
                        "index0": index,
                        "first": index == 0,
                        "last": index == len(items) - 1,
                        "length": len(items),
                    }
                }
                if len(targets) == 1:
                    scope[targets[0]] = item
                else:
                    values = list(item) if isinstance(item, (list, tuple)) else []
                    if len(values) != len(targets):
                        raise TemplateError(
                            f"öğe {len(targets)} parçaya açılamıyor", name, piece.line, piece.col
                        )
                    scope.update(zip(targets, values, strict=True))
                ctx.push(scope)
                try:
                    body(ctx, out)
                finally:
                    ctx.pop()

        return render

    def include_tag(self, piece: Piece, rest: str) -> Renderer:
        target = rest.strip()
        if len(target) < 2 or target[0] not in "'\"" or target[-1] != target[0]:
            raise self.error(piece, "include bir dizgi bekliyor", 'Örnek: {% include "ust.html" %}')
        included, name = target[1:-1], self.name

        def render(ctx: Context, out: list[str]) -> None:
            ctx.include(included, name, piece.line, piece.col, out)

        return render

    def set_tag(self, piece: Piece, rest: str) -> Renderer:
        target, sep, source = rest.partition("=")
        var = target.strip()
        if not sep or not var.isidentifier() or var.startswith("_"):
            raise self.error(piece, "set biçimi hatalı", "Örnek: {% set toplam = fiyat * adet %}")
        value = self.expr(piece, source, piece.content.index("=") + 1)
        return lambda ctx, out: ctx.set(var, value(ctx))
