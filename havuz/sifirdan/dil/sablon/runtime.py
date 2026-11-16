"""Şablon ifadelerinin çalışma zamanı: öznitelik/dizin erişimi (kum havuzu) ve kapanım üreticileri.

`get_attr` `_` ile başlayan adlara ve yöntemlere erişimi engeller (şablondan Python iç yapısına
ulaşılamasın: `{{ x.__class__ }}` hata verir). Kapanım üreticileri (`apply`, `either`…) ifade
parçalarını `Context -> değer` işlevlerine çevirir; Python'un İngilizce TypeError'ı Türkçe ve
türleri söyleyen iletiye dönüşür.
Kullanan: expr.py. Genişletme: yeni bir erişim kuralı için `get_attr`/`get_item`'a dal ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from .markup import Markup, RenderProblem, Undefined, escape

if TYPE_CHECKING:
    from .environment import Context

Expr = Callable[["Context"], object]


def get_attr(obj: object, name: str) -> object:
    """`a.b`: sözlükte anahtar, nesnede (yöntem olmayan) öznitelik; yoksa Undefined."""
    if name.startswith("_"):
        raise RenderProblem(f"'_' ile başlayan '{name}' adına erişilemez", "Güvenlik kuralıdır.")
    if isinstance(obj, Undefined):
        return Undefined(f"{obj.path}.{name}")
    if isinstance(obj, dict):
        return obj[name] if name in obj else Undefined(name)
    value = getattr(obj, name, Undefined(name))
    if callable(value) and not isinstance(value, Undefined):
        raise RenderProblem(f"'{name}' bir yöntem; şablondan yöntem çağrılamaz")
    return value


def attribute(obj: object, name: object) -> object:
    return get_attr(obj, str(name))


def get_item(obj: object, key: object) -> object:
    if isinstance(obj, Undefined):
        return Undefined(f"{obj.path}[{key!r}]")
    if isinstance(obj, dict):
        return obj[key] if key in obj else Undefined(repr(key))
    if isinstance(obj, (list, tuple, str)) and isinstance(key, int) and not isinstance(key, bool):
        return obj[key] if -len(obj) <= key < len(obj) else Undefined(f"[{key}]")
    if isinstance(key, str):
        return get_attr(obj, key)
    return Undefined(f"[{key!r}]")


# --- kapanım üreticileri (her biri bir ifade parçasını Python işlevine çevirir) ---------------


def constant(value: object) -> Expr:
    return lambda ctx: value


def label(value: object) -> str:
    """Hata iletisi için Türkçe tür adı."""
    if isinstance(value, Undefined):
        return f"tanımsız '{value.path}'"
    names = {
        bool: "mantıksal",
        int: "sayı",
        float: "sayı",
        str: "metin",
        list: "liste",
        dict: "sözlük",
    }
    return "boş (None)" if value is None else names.get(type(value), type(value).__name__)


def apply(
    fn: Callable[[object, object], object], left: Expr, right: Expr, symbol: str = ""
) -> Expr:
    """İkili işlem; Python'un İngilizce TypeError'ını Türkçe ve türleri söyleyen iletiye çevirir."""

    def run(ctx: Context) -> object:
        a, b = left(ctx), right(ctx)
        try:
            return fn(a, b)
        except ZeroDivisionError:
            raise RenderProblem("sıfıra bölme") from None
        except TypeError:
            raise RenderProblem(
                f"'{symbol}' işlemi {label(a)} ile {label(b)} arasında yapılamaz"
            ) from None

    return run


def either(left: Expr, right: Expr) -> Expr:
    return lambda ctx: left(ctx) or right(ctx)


def both(left: Expr, right: Expr) -> Expr:
    return lambda ctx: left(ctx) and right(ctx)


def concat(a: object, b: object) -> object:
    """`~`: iki değeri metin olarak birleştirir (güvenli işaretleme korunur)."""
    if isinstance(a, Markup) or isinstance(b, Markup):
        return escape(a) + escape(b)
    return f"{'' if a is None else a}{'' if b is None else b}"
