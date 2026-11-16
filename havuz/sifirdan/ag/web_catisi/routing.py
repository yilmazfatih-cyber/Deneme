"""Desenli yönlendirme: "/kullanici/<int:id>" → düzenli ifade → (işleyici, {"id": 7}).

Dönüştürücüler:  <ad> ya da <str:ad>  '/' içermeyen parça      <int:ad>   en çok 18 basamak → int
                 <slug:ad>  [a-z0-9-]+                          <path:ad>  '/' dahil kalan her şey
Eşleşme sırası kayıt sırasıdır. Yol bulundu ama yöntem uymadıysa 405 (Allow başlığıyla), hiç yoksa
404. `url_for(ad, **parametreler)` deseni tersine çevirir; parametreler yüzde-kodlanır (enjeksiyon
     olmaz).
Genişletme: yeni bir dönüştürücü için `CONVERTERS`'a (düzenli ifade, dönüştürme işlevi) ekleyin.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

CONVERTERS: dict[str, tuple[str, Callable[[str], Any]]] = {
    "str": (r"[^/]+", str),
    "int": (r"[0-9]{1,18}", int),
    "slug": (r"[a-z0-9]+(?:-[a-z0-9]+)*", str),
    "path": (r".+", str),
}
_PARAM_RE = re.compile(r"<(?:([a-z]+):)?([A-Za-z_][A-Za-z0-9_]*)>")


class NotFoundError(Exception):
    """Bu yola kayıtlı işleyici yok (404)."""


class MethodNotAllowedError(Exception):
    """Yol var ama yöntem desteklenmiyor (405)."""

    def __init__(self, allowed: set[str]) -> None:
        super().__init__(", ".join(sorted(allowed)))
        self.allowed = allowed


@dataclass
class Route:
    pattern: str
    endpoint: Callable[..., Any]
    methods: frozenset[str]
    name: str
    regex: re.Pattern[str] = field(init=False)
    converters: dict[str, Callable[[str], Any]] = field(init=False, default_factory=dict)

    def __post_init__(self) -> None:
        parts: list[str] = []
        position = 0
        for match in _PARAM_RE.finditer(self.pattern):
            kind = match.group(1) or "str"
            if kind not in CONVERTERS:
                raise ValueError(f"Bilinmeyen dönüştürücü '{kind}' (desen: {self.pattern})")
            regex, convert = CONVERTERS[kind]
            parts.append(re.escape(self.pattern[position : match.start()]))
            parts.append(f"(?P<{match.group(2)}>{regex})")
            self.converters[match.group(2)] = convert
            position = match.end()
        parts.append(re.escape(self.pattern[position:]))
        self.regex = re.compile("".join(parts))

    def build(self, params: dict[str, Any]) -> str:
        missing = set(self.converters) - set(params)
        if missing:
            raise ValueError(f"'{self.name}' için eksik parametre: {', '.join(sorted(missing))}")

        def substitute(match: re.Match[str]) -> str:
            safe = "/" if (match.group(1) or "str") == "path" else ""
            return quote(str(params[match.group(2)]), safe=safe)

        return _PARAM_RE.sub(substitute, self.pattern)


class Router:
    def __init__(self) -> None:
        self.routes: list[Route] = []
        self._by_name: dict[str, Route] = {}

    def add(
        self,
        pattern: str,
        endpoint: Callable[..., Any],
        methods: tuple[str, ...] = ("GET",),
        name: str | None = None,
    ) -> Route:
        if not pattern.startswith("/"):
            raise ValueError(f"Desen '/' ile başlamalı: {pattern}")
        allowed = {m.upper() for m in methods}
        if "GET" in allowed:
            allowed.add("HEAD")  # GET'i destekleyen her yol HEAD'i de destekler
        route = Route(pattern, endpoint, frozenset(allowed), name or endpoint.__name__)
        if route.name in self._by_name:
            raise ValueError(f"Aynı adla iki yol olamaz: {route.name}")
        self.routes.append(route)
        self._by_name[route.name] = route
        return route

    def match(self, method: str, path: str) -> tuple[Route, dict[str, Any]]:
        allowed: set[str] = set()
        for route in self.routes:
            found = route.regex.fullmatch(path)
            if found is None:
                continue
            if method not in route.methods:
                allowed |= route.methods
                continue
            params = {key: route.converters[key](value) for key, value in found.groupdict().items()}
            return route, params
        if allowed:
            raise MethodNotAllowedError(allowed)
        raise NotFoundError(path)

    def url_for(self, name: str, **params: Any) -> str:
        route = self._by_name.get(name)
        if route is None:
            raise KeyError(f"'{name}' adlı yol yok; @app.route(..., name=...) ile kaydedin.")
        return route.build(params)
