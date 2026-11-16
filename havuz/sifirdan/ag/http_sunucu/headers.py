"""HTTP başlık listesi: büyük/küçük harfe duyarsız, sıralı, aynı addan birden çok değer tutabilen.

Kim kullanır: istek ayrıştırıcı (`parser.py`), yanıt yazıcı (`server.py`), bu temeldeki diğer
sistemler.
Güvenlik: `add`/`set` her değeri denetler; CR, LF ya da NUL içeren değer `ValueError` verir. Böylece
kullanıcı girdisi bir başlığa konsa bile "yanıt bölme" (response splitting) yapılamaz.
Genişletme: sık kullanılan bir başlık için kısayol gerekiyorsa buraya küçük bir yöntem ekleyin
(`has_token` örneğine bakın) ve `tests/http_sunucu/test_ayristirici.py` içine test yazın.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator

TOKEN_RE = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")  # RFC 9110 §5.6.2 tchar
_BAD_VALUE_RE = re.compile(r"[\x00-\x08\x0a-\x1f\x7f]")  # HTAB dışındaki denetim karakterleri


class Headers:
    """Sıralı (ad, değer) çiftleri; adlar karşılaştırmada küçük harfe indirgenir."""

    def __init__(self, items: Iterable[tuple[str, str]] = ()) -> None:
        self._items: list[tuple[str, str]] = []
        for name, value in items:
            self.add(name, value)

    @staticmethod
    def _check(name: str, value: str) -> None:
        if not TOKEN_RE.fullmatch(name):
            raise ValueError(f"Geçersiz başlık adı: {name!r}")
        if _BAD_VALUE_RE.search(value):
            raise ValueError(
                f"Başlık değerinde denetim karakteri var ({name}); yanıt bölme engellendi."
            )
        if any(ord(ch) > 0xFF for ch in value):
            raise ValueError(
                f"Başlık değeri ({name}) Latin-1 dışı karakter içeriyor; RFC 8187 ile kodlayın."
            )

    def add(self, name: str, value: str) -> None:
        """Aynı addan bir değer daha ekler (ör. birden çok `Set-Cookie`)."""
        self._check(name, value)
        self._items.append((name, value))

    def set(self, name: str, value: str) -> None:
        """Bu addaki tüm değerleri tek bir değerle değiştirir."""
        self.remove(name)
        self.add(name, value)

    def setdefault(self, name: str, value: str) -> None:
        if name not in self:
            self.add(name, value)

    def remove(self, name: str) -> None:
        lowered = name.lower()
        self._items = [(n, v) for n, v in self._items if n.lower() != lowered]

    def get(self, name: str, default: str | None = None) -> str | None:
        lowered = name.lower()
        for n, v in self._items:
            if n.lower() == lowered:
                return v
        return default

    def get_all(self, name: str) -> list[str]:
        lowered = name.lower()
        return [v for n, v in self._items if n.lower() == lowered]

    def has_token(self, name: str, token: str) -> bool:
        """Virgülle ayrılmış başlıkta bir belirteç var mı? (`Connection: keep-alive, Upgrade`)"""
        wanted = token.lower()
        return any(
            part.strip().lower() == wanted
            for value in self.get_all(name)
            for part in value.split(",")
        )

    def copy(self) -> Headers:
        clone = Headers()
        clone._items = list(self._items)
        return clone

    def items(self) -> list[tuple[str, str]]:
        return list(self._items)

    def __contains__(self, name: object) -> bool:
        return isinstance(name, str) and self.get(name) is not None

    def __iter__(self) -> Iterator[tuple[str, str]]:
        return iter(list(self._items))

    def __len__(self) -> int:
        return len(self._items)

    def __repr__(self) -> str:
        return f"Headers({self._items!r})"
