"""Kaçışlı şablon yardımcısı: `render("<p>{ad}</p>", ad=kullanici_girdisi)` her değeri
HTML-kaçışlar.

    escape('<script>')        → '&lt;script&gt;'
    Markup('<b>güvenli</b>')  → kaçışlanmaz (yalnız KENDİ ürettiğiniz HTML için)
    render_each('<li>{ad}</li>', [{"ad": "a"}, …]) → birleşik, kaçışlı liste
Güvenlik: şablonda yalnız düz adlar kullanılabilir ("{ad}"); "{nesne.ozellik}" ya da "{x[0]}"
reddedilir (biçim dizgisiyle nesne içine uzanılamasın). Şablon metni ASLA kullanıcıdan gelmez.
Öznitelikte bağlantı: `href="{url}"` için `safe_url` kullanın ("javascript:" bağlantılarını keser).
Genişletme: koşul/döngü gerekiyorsa Python'da hazırlayıp `Markup` olarak verin; şablon dili
büyütmeyin.
"""

from __future__ import annotations

import html
import re
import string
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

_NAME_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class Markup(str):
    """Güvenilir HTML parçası; yeniden kaçışlanmaz."""


def escape(value: object) -> Markup:
    if isinstance(value, Markup):
        return value
    return Markup(html.escape(str(value), quote=True))


class _EscapingFormatter(string.Formatter):
    def get_field(self, field_name: str, args: Sequence[Any], kwargs: Mapping[str, Any]) -> Any:
        if not _NAME_RE.fullmatch(field_name):
            raise ValueError(f"Şablonda yalnız düz ad kullanılabilir: {{{field_name}}}")
        return super().get_field(field_name, args, kwargs)

    def format_field(self, value: Any, format_spec: str) -> str:
        formatted = super().format_field(value, format_spec)
        return formatted if isinstance(value, Markup) else html.escape(formatted, quote=True)


_FORMATTER = _EscapingFormatter()


def render(template: str, **context: object) -> Markup:
    return Markup(_FORMATTER.format(template, **context))


def render_each(template: str, items: Iterable[Mapping[str, object]]) -> Markup:
    return Markup("".join(render(template, **item) for item in items))


def safe_url(value: str) -> str:
    """Bağlantı özniteliği için: yalnız http, https, mailto ve şemasız (göreli) adresler; diğerleri
    "#".

    Tarayıcılar adresteki boşluk/denetim karakterlerini siler ("java\tscript:"); karşılaştırma ondan
    sonra yapılır.
    """
    cleaned = "".join(ch for ch in value if ord(ch) > 0x20).lower()
    scheme, colon, _ = cleaned.partition(":")
    if colon and not any(ch in scheme for ch in "/?#"):
        return value if scheme in ("http", "https", "mailto") else "#"
    return value
