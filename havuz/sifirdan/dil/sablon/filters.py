"""Süzgeç (filter) kaydı: `{{ ad | upper }}`, `{{ fiyat | sayi(2) }}`, `{{ veri | tojson }}`.

Her süzgeç `(env, değer, *bağımsız_değişkenler) -> değer` imzalıdır. `upper/lower/title/capitalize`
Türkçe kurallıdır (i ↔ İ, ı ↔ I). `safe` değeri güvenilir işaretler (DİKKAT: kullanıcı girdisine
uygulamayın). `tojson` `<script>` içinde güvenlidir (`<`, `>`, `&`, `'` kaçışlanır). `safe_url`
`javascript:` gibi tehlikeli şemaları "#" yapar.
Genişletme: bir işlev yazın ve `FILTERS` sözlüğüne bir satır ekleyin (YENİ SÜZGEÇ BURAYA);
tests/sablon/test_sablon_suzgecler.py'ye bir örnek ekleyin.
"""

from __future__ import annotations

import json
import unicodedata
from collections.abc import Callable
from typing import TYPE_CHECKING
from urllib.parse import quote

from .markup import Markup, RenderProblem, Undefined, escape

if TYPE_CHECKING:
    from .environment import Environment

Filter = Callable[..., object]
SAFE_SCHEMES = ("http", "https", "mailto", "tel")
_UPPER = str.maketrans({"i": "İ", "ı": "I"})
_LOWER = str.maketrans({"I": "ı", "İ": "i"})


def upper_tr(text: str) -> str:
    return text.translate(_UPPER).upper()  # tr-güvenli: i/ı önceden çevrildi


def lower_tr(text: str) -> str:
    return text.translate(_LOWER).lower()  # tr-güvenli: I/İ önceden çevrildi


def text_of(value: object) -> str:
    if isinstance(value, Undefined):
        str(value)  # katı kipte açıklayıcı hata fırlatır
    return "" if value is None else str(value)


def keep_markup(original: object, result: str) -> str:
    """Girdi güvenli işaretlemeyse sonuç da öyle kalır (büyük harfe çevirmek güvenliği bozmaz)."""
    return Markup(result) if isinstance(original, Markup) else result


def f_default(
    env: Environment, value: object, fallback: object = "", boolean: bool = False
) -> object:
    if isinstance(value, Undefined) or (boolean and not value):
        return fallback
    return value


def f_join(env: Environment, value: object, sep: str = "") -> object:
    items = list(value) if isinstance(value, (list, tuple)) else [value]
    if env.autoescape:
        return Markup(escape(sep).join(escape(x) for x in items))
    return sep.join(text_of(x) for x in items)


def f_title(env: Environment, value: object) -> object:
    words = text_of(value).split(" ")
    return keep_markup(value, " ".join(upper_tr(w[:1]) + lower_tr(w[1:]) for w in words))


def f_tojson(env: Environment, value: object, indent: int | None = None) -> object:
    text = json.dumps(value, ensure_ascii=False, indent=indent)
    for ch, code in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"), ("'", "\\u0027")):
        text = text.replace(ch, code)
    return Markup(text)


def f_safe_url(env: Environment, value: object) -> object:
    """Yalnız göreli adresleri ve http/https/mailto/tel şemalarını geçirir; gerisi '#'."""
    url = text_of(value).strip()
    plain = "".join(ch for ch in url if unicodedata.category(ch)[0] != "C" and not ch.isspace())
    scheme, colon, _ = plain.partition(":")
    if colon and "/" not in scheme and lower_tr(scheme) not in SAFE_SCHEMES:
        return "#"
    return url


def f_sayi(env: Environment, value: object, digits: int = 0) -> object:
    """Türkçe sayı biçimi: 1234567.891 → '1.234.567,89' (digits=2)."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RenderProblem(f"'sayi' süzgeci sayı bekliyor, {type(value).__name__} verildi")
    text = f"{value:,.{digits}f}"
    return text.replace(",", "\0").replace(".", ",").replace("\0", ".")


def f_truncate(env: Environment, value: object, length: int = 80, end: str = "…") -> object:
    text = text_of(value)
    return text if len(text) <= length else text[: max(0, length - len(end))].rstrip() + end


def f_items(env: Environment, value: object) -> object:
    if not isinstance(value, dict):
        raise RenderProblem("'items' süzgeci sözlük bekliyor")
    return list(value.items())


def sized(value: object) -> list[object] | str:
    if isinstance(value, (str, list, tuple, dict)):
        return list(value) if not isinstance(value, str) else value
    raise RenderProblem(f"{type(value).__name__} değerinin uzunluğu/öğeleri yok")


# Ad -> süzgeç. YENİ SÜZGEÇ BURAYA.
FILTERS: dict[str, Filter] = {
    "escape": lambda env, v: escape(v),
    "e": lambda env, v: escape(v),
    "safe": lambda env, v: Markup(text_of(v)),
    "upper": lambda env, v: keep_markup(v, upper_tr(text_of(v))),
    "lower": lambda env, v: keep_markup(v, lower_tr(text_of(v))),
    "capitalize": lambda env, v: keep_markup(
        v, upper_tr(text_of(v)[:1]) + lower_tr(text_of(v)[1:])
    ),
    "title": f_title,
    "trim": lambda env, v: keep_markup(v, text_of(v).strip()),
    "length": lambda env, v: len(sized(v)),
    "default": f_default,
    "join": f_join,
    "first": lambda env, v: sized(v)[0] if sized(v) else Undefined("first"),
    "last": lambda env, v: sized(v)[-1] if sized(v) else Undefined("last"),
    "replace": lambda env, v, old, new: text_of(v).replace(str(old), str(new)),
    "sort": lambda env, v: sorted(sized(v)),  # type: ignore[type-var]
    "reverse": lambda env, v: list(reversed(sized(v))),
    "items": f_items,
    "tojson": f_tojson,
    "safe_url": f_safe_url,
    "urlencode": lambda env, v: quote(text_of(v), safe=""),
    "sayi": f_sayi,
    "truncate": f_truncate,
}
