"""Şablon motoru: `{{ değişken | süzgeç }}`, `{% if %}`, `{% for %}`, `{% include %}`, `{% set %}`.

Hızlı kullanım:
    >>> from sablon import render
    >>> render("Merhaba {{ ad | upper }}!", ad="<işçi>")
    'Merhaba &lt;İŞÇİ&gt;!'

Çıktı varsayılan olarak HTML kaçışlıdır; güvenilir HTML için `Markup` ya da `| safe`.
Şablon önce Python kapanımlarına derlenir (compiler.py), sonra işlenir.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from .environment import DictLoader, Environment, FileLoader, Template, TemplateNotFoundError
from .filters import FILTERS
from .markup import Markup, TemplateError, escape


def render(source: str, data: dict[str, object] | None = None, **values: object) -> str:
    """Tek seferlik: dizgi şablonunu varsayılan ortamla işler."""
    return Environment().from_string(source).render(data, **values)


__all__ = [
    "FILTERS",
    "DictLoader",
    "Environment",
    "FileLoader",
    "Markup",
    "Template",
    "TemplateError",
    "TemplateNotFoundError",
    "escape",
    "render",
]
