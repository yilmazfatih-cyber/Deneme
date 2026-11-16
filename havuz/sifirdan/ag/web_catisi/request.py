"""Çatının istek nesnesi: sorgu, form (urlencoded / multipart), dosyalar, JSON, çerezler — tembel
ayrıştırma.

İşleyici imzası:  def not_goster(istek: Request, id: int) -> Response | str Hatalı girdi (bozuk
UTF-8, fazla alan, bozuk multipart/JSON) `HttpStatusError(400)` olur; işleyiciye çökme olarak
ulaşmaz. Gövde boyutu bağdaştırıcıda (`adapters.py`) `App.max_body` ile zaten sınırlanmıştır.
Genişletme: yeni bir ayrıştırılmış görünüm (ör. `accept_language`) için `cached_property` ekleyin.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import cached_property
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qsl

from http_sunucu.headers import Headers
from web_catisi.datastructures import MultiDict
from web_catisi.errors import HttpStatusError
from web_catisi.multipart import MultipartError, UploadedFile, parse_multipart

if TYPE_CHECKING:
    from web_catisi.sessions import Session

MAX_FIELDS = 1000


def parse_query(text: str) -> MultiDict:
    try:
        pairs = parse_qsl(text, keep_blank_values=True, max_num_fields=MAX_FIELDS, errors="strict")
    except ValueError as exc:  # UnicodeDecodeError da bir ValueError'dır
        raise HttpStatusError(400, "Sorgu ya da form verisi çözülemedi.") from exc
    return MultiDict(pairs)


@dataclass
class Request:
    method: str
    path: str  # yüzde-çözülmüş yol: "/notlar/7"
    query_string: str = ""
    headers: Headers = field(default_factory=Headers)
    body: bytes = b""
    remote_addr: str = ""
    scheme: str = "http"
    path_params: dict[str, Any] = field(default_factory=dict)
    state: dict[str, Any] = field(
        default_factory=dict
    )  # ara katmanların paylaştığı istek başı alan
    session: Session | None = None

    @property
    def content_type(self) -> str:
        return (self.headers.get("content-type") or "").partition(";")[0].strip().lower()

    @property
    def host(self) -> str:
        return self.headers.get("host") or ""

    @property
    def origin(self) -> str:
        """Bu sitenin kökeni ("http://ornek:8452"); CSRF Origin denetiminde kullanılır."""
        return f"{self.scheme}://{self.host}"

    @property
    def is_secure(self) -> bool:
        return self.scheme == "https"

    @cached_property
    def query(self) -> MultiDict:
        return parse_query(self.query_string)

    @cached_property
    def _form_and_files(self) -> tuple[MultiDict, dict[str, list[UploadedFile]]]:
        if self.content_type == "application/x-www-form-urlencoded":
            try:
                text = self.body.decode("ascii")
            except UnicodeDecodeError as exc:
                raise HttpStatusError(400, "Form verisi yüzde-kodlu olmalı.") from exc
            return parse_query(text), {}
        if self.content_type == "multipart/form-data":
            try:
                return parse_multipart(self.body, self.headers.get("content-type") or "")
            except MultipartError as exc:
                raise HttpStatusError(400, str(exc)) from exc
        return MultiDict(), {}

    @property
    def form(self) -> MultiDict:
        return self._form_and_files[0]

    @property
    def files(self) -> dict[str, list[UploadedFile]]:
        return self._form_and_files[1]

    def json(self) -> Any:
        if self.content_type != "application/json":
            raise HttpStatusError(415, "Gövde application/json olmalı.")
        try:
            return json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
            raise HttpStatusError(400, "Gövde geçerli bir JSON değil.") from exc

    @cached_property
    def cookies(self) -> dict[str, str]:
        """Cookie başlığı. Aynı ad iki kez gelirse İLKİ alınır (tarayıcı en özgül yolu önce
        yollar).
        """
        result: dict[str, str] = {}
        for header in self.headers.get_all("cookie"):
            for pair in header.split(";"):
                name, equals, value = pair.strip().partition("=")
                if equals and name and name not in result:
                    result[name] = value.strip().strip('"')
        return result
