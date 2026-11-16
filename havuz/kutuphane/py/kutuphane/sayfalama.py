"""sayfalama — imleçli (keyset) ve sayfa numaralı (offset) sayfalama yardımcıları: imleci opak bir metne kodlama/
çözme, bellekteki sıralı listeyi imleçle sayfalama, SQL için güvenli "sonrakiler" koşulu üretme.

Kullanım:
    imlec = encode_cursor({"createdAt": "2026-11-16T10:00:00Z", "id": 42})      # URL güvenli opak metin
    decode_cursor(imlec, keys=["createdAt", "id"])                               # {"createdAt": …, "id": 42}
    clause, params = keyset_where(["created_at", "id"], ["2026-11-16T10:00:00Z", 42])
    # clause: "(created_at > ?) OR (created_at = ? AND id > ?)"   → WHERE … ORDER BY created_at, id LIMIT 21
    paginate(kayitlar, limit=20, cursor=imlec, sort_keys=["tarih", "id"])        # Page(items, next_cursor, has_more)
    offset_pagination(total=95, page=3, page_size=20)                            # offset=40, total_pages=5 …

Neden imleç: OFFSET büyük sayfalarda yavaşlar ve araya kayıt eklenince satır atlar/yineler; imleç (son görülen kaydın
sıralama anahtarı) ikisini de önler. Sıralama anahtarı TEKİL olmalıdır: son sütun olarak `id` ekleyin.

Sınırlar: İmleç İMZASIZDIR (base64url JSON); kullanıcı çözebilir ve değiştirebilir. Kurcalamaya karşı gerekiyorsa
kripto.sign_token ile imzalayın. İmleç değerleri metin, tam sayı, mantıksal ya da None olmalıdır (float JS ve
Python'da farklı yazılır). `keyset_where` yalnız artan ya da yalnız azalan sıralamayı destekler. TypeScript eşiyle
aynı imleç metnini üretir.

Genişletme: Yeni bir sayfalama biçimi saf işlev olarak eklenir; TypeScript eşine aynı çıktıyı verecek biçimde
eklenir ve `vektorler/sayfalama.json`'a örnek yazılır.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, NamedTuple, TypeVar

__all__ = [
    "CursorError",
    "KeysetCondition",
    "OffsetPage",
    "Page",
    "decode_cursor",
    "encode_cursor",
    "keyset_where",
    "offset_pagination",
    "paginate",
]

CursorValue = str | int | bool | None
T = TypeVar("T", bound=Mapping[str, Any])


class CursorError(ValueError):
    """İmleç bozuk ya da sayfalama girdisi geçersiz."""


@dataclass(frozen=True)
class Page:
    items: list[Any]
    next_cursor: str | None
    has_more: bool


class KeysetCondition(NamedTuple):
    """`clause, params = keyset_where(...)` biçiminde açılabilir."""

    clause: str
    params: list[CursorValue]


@dataclass(frozen=True)
class OffsetPage:
    page: int
    page_size: int
    total_pages: int
    offset: int
    has_previous: bool
    has_next: bool


def encode_cursor(values: Mapping[str, CursorValue]) -> str:
    """İmleç sözlüğünü URL güvenli opak metne çevirir."""
    for key, value in values.items():
        safe_int = isinstance(value, int) and abs(value) <= 2**53 - 1
        if not (value is None or isinstance(value, str | bool) or safe_int):
            raise CursorError(f'İmleç değeri "{key}" metin, tam sayı, mantıksal ya da None olmalı.')
    raw = json.dumps(dict(values), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str, *, keys: Sequence[str] = ()) -> dict[str, CursorValue]:
    """Opak imleci çözer; bozuksa ya da beklenen anahtarlar yoksa CursorError."""
    if not re.fullmatch("[A-Za-z0-9_-]+", cursor) or len(cursor) % 4 == 1 or len(cursor) > 4096:
        raise CursorError("İmleç bozuk: yalnız base64url karakterleri içermeli.")
    try:
        parsed = json.loads(
            base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode("utf-8")
        )
    except (binascii.Error, UnicodeDecodeError, ValueError) as error:
        raise CursorError("İmleç çözülemedi.") from error
    if not isinstance(parsed, dict):
        raise CursorError("İmleç bir nesne olmalı.")
    for key in keys:
        if key not in parsed:
            raise CursorError(f'İmleçte "{key}" alanı yok.')
    return parsed


def _compare(a: Any, b: Any) -> int:
    if a == b and type(a) is type(b):
        return 0
    if a is None:
        return -1  # None en başta (SQL'de NULLS FIRST gibi)
    if b is None:
        return 1
    return -1 if a < b else 1


def paginate(
    items: Sequence[T], *, limit: int, sort_keys: Sequence[str], cursor: str | None = None
) -> Page:
    """`sort_keys`'e göre ARTAN sıralı listeyi imleçle sayfalar; son sayfada next_cursor None."""
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        raise CursorError("limit 1 veya daha büyük tam sayı olmalı.")
    start = 0
    if cursor:
        after = decode_cursor(cursor, keys=sort_keys)
        start = len(items)
        for index, item in enumerate(items):
            order = next((c for c in (_compare(item[k], after[k]) for k in sort_keys) if c != 0), 0)
            if order > 0:
                start = index
                break
    page = list(items[start : start + limit])
    has_more = start + limit < len(items)
    next_cursor = (
        encode_cursor({key: page[-1][key] for key in sort_keys}) if has_more and page else None
    )
    return Page(items=page, next_cursor=next_cursor, has_more=has_more)


def keyset_where(
    columns: Sequence[str],
    values: Sequence[CursorValue],
    *,
    direction: str = "asc",
    placeholder: Callable[[int], str] | None = None,
) -> KeysetCondition:
    """SQL için "imleçten sonraki kayıtlar" koşulu (parametreli; değerler asla metne gömülmez).

    ["a", "b"] + [1, 2] → ("(a > ?) OR (a = ? AND b > ?)", [1, 1, 2]). Azalan sıralama için direction="desc".
    psycopg için placeholder=lambda i: "%s", asyncpg için lambda i: f"${i}".
    """
    if not columns or len(columns) != len(values):
        raise CursorError("Sütun ve değer sayısı eşit ve sıfırdan büyük olmalı.")
    for column in columns:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?", column):
            raise CursorError(
                f'Geçersiz sütun adı: "{column}" (yalnız harf, rakam, alt çizgi; SQL enjeksiyonu önlemi).'
            )
    op = "<" if direction == "desc" else ">"
    mark = placeholder or (lambda _index: "?")
    params: list[CursorValue] = []
    branches: list[str] = []
    for i, column in enumerate(columns):
        parts: list[str] = []
        for j in range(i):
            params.append(values[j])
            parts.append(f"{columns[j]} = {mark(len(params))}")
        params.append(values[i])
        parts.append(f"{column} {op} {mark(len(params))}")
        branches.append("(" + " AND ".join(parts) + ")")
    return KeysetCondition(" OR ".join(branches), params)


def offset_pagination(*, total: int, page: float, page_size: int) -> OffsetPage:
    """Sayfa numaralı sayfalama hesabı; sayfa 1'den başlar ve geçerli aralığa sıkıştırılır."""
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise CursorError("total 0 veya daha büyük tam sayı olmalı.")
    if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= 1000:
        raise CursorError("page_size 1 ile 1000 arasında tam sayı olmalı.")
    total_pages = max(1, math.ceil(total / page_size))
    wanted = math.floor(page) if math.isfinite(page) else 1
    current = min(max(1, wanted), total_pages)
    return OffsetPage(
        page=current,
        page_size=page_size,
        total_pages=total_pages,
        offset=(current - 1) * page_size,
        has_previous=current > 1,
        has_next=current < total_pages,
    )
