"""Ortam (Environment), derlenmiş şablon (Template), işleme bağlamı (Context) ve yükleyiciler.

`Environment(loader, autoescape=True, strict=True)`: şablonları yükler, derler ve önbellekler.
`DictLoader` bellekteki şablonlar için; `FileLoader(kök)` diskten okur ve kök klasörün DIŞINA
çıkmaya (`../`, mutlak yol, dışarı gösteren sembolik bağ) izin vermez. `include` derinliği
sınırlıdır (a.html → a.html döngüsü sonsuza gitmez).
Genişletme: veritabanından şablon okumak için `load(ad) -> str` yöntemi olan bir sınıf yazın.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .compiler import Renderer, TemplateCompiler
from .lexer import tokenize
from .markup import TemplateError, Undefined


class TemplateNotFoundError(LookupError):
    """Yükleyici şablonu bulamadı ya da güvenlik nedeniyle reddetti."""


class Loader(Protocol):
    def load(self, name: str) -> str: ...


class DictLoader:
    def __init__(self, templates: dict[str, str]) -> None:
        self.templates = templates

    def load(self, name: str) -> str:
        if name not in self.templates:
            known = ", ".join(sorted(self.templates)) or "(hiç yok)"
            raise TemplateNotFoundError(f"'{name}' şablonu bulunamadı; mevcut: {known}")
        return self.templates[name]


class FileLoader:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def load(self, name: str) -> str:
        path = (self.root / name).resolve()
        if not path.is_relative_to(self.root):
            raise TemplateNotFoundError(f"'{name}' şablon klasörünün dışında (güvenlik)")
        if not path.is_file():
            raise TemplateNotFoundError(f"'{name}' şablonu bulunamadı ({self.root} içinde)")
        return path.read_text(encoding="utf-8")


class Template:
    def __init__(self, env: Environment, source: str, name: str) -> None:
        self.env = env
        self.source = source
        self.name = name
        self.root: Renderer = TemplateCompiler(tokenize(source, name), name).compile()

    def render(self, data: dict[str, object] | None = None, **values: object) -> str:
        context = Context(self.env, {**(data or {}), **values})
        out: list[str] = []
        self.root(context, out)
        return "".join(out)


class Context:
    def __init__(self, env: Environment, data: dict[str, object]) -> None:
        self.env = env
        self.scopes: list[dict[str, object]] = [data]
        self.include_stack: list[str] = []

    def lookup(self, name: str) -> object:
        for scope in reversed(self.scopes):
            if name in scope:
                return scope[name]
        return Undefined(name)

    def set(self, name: str, value: object) -> None:
        self.scopes[-1][name] = value

    def push(self, scope: dict[str, object]) -> None:
        self.scopes.append(scope)

    def pop(self) -> None:
        self.scopes.pop()

    def include(self, target: str, where: str, line: int, col: int, out: list[str]) -> None:
        if len(self.include_stack) >= self.env.max_include_depth:
            chain = " → ".join([*self.include_stack, target])
            raise TemplateError(
                f"include çok derin (en fazla {self.env.max_include_depth})",
                where,
                line,
                col,
                f"Şablonlar birbirini döngüsel çağırıyor olabilir: {chain}",
            )
        try:
            template = self.env.get_template(target)
        except TemplateNotFoundError as exc:
            raise TemplateError(str(exc), where, line, col) from None
        self.include_stack.append(target)
        try:
            template.root(self, out)
        finally:
            self.include_stack.pop()


class Environment:
    def __init__(
        self,
        loader: Loader | None = None,
        *,
        autoescape: bool = True,
        strict: bool = True,
        max_include_depth: int = 10,
    ) -> None:
        self.loader = loader
        self.autoescape = autoescape
        self.strict = strict  # True: tanımsız ad yazdırılırsa hata; False: boş metin
        self.max_include_depth = max_include_depth
        self.cache: dict[str, Template] = {}

    def from_string(self, source: str, name: str = "<dizgi>") -> Template:
        return Template(self, source, name)

    def get_template(self, name: str) -> Template:
        if name not in self.cache:
            if self.loader is None:
                raise TemplateNotFoundError(f"'{name}' yüklenemedi: ortama yükleyici verilmedi")
            self.cache[name] = Template(self, self.loader.load(name), name)
        return self.cache[name]
