"""http_istemci — soketten HTTP/1.1 istemcisi (eşzamanlı).

    from http_istemci import Client
    with Client() as istemci:
        print(istemci.get("http://127.0.0.1:8450/").text())
Genişletme: yeni bir dışa açık ad eklerseniz `__all__` listesine de yazın.
"""

from http_istemci.client import Client, Retry
from http_istemci.connection import tls_context
from http_istemci.cookies import Cookie, CookieJar
from http_istemci.errors import (
    ConnectError,
    HttpClientError,
    InsecureRedirectError,
    InvalidUrlError,
    ProtocolViolationError,
    RemoteDisconnectedError,
    RequestTimeoutError,
    ResponseTooLargeError,
    TooManyRedirectsError,
)
from http_istemci.response import Response
from http_istemci.url import Url, parse_url, resolve_reference

__all__ = [
    "Client",
    "ConnectError",
    "Cookie",
    "CookieJar",
    "HttpClientError",
    "InsecureRedirectError",
    "InvalidUrlError",
    "ProtocolViolationError",
    "RemoteDisconnectedError",
    "RequestTimeoutError",
    "Response",
    "ResponseTooLargeError",
    "Retry",
    "TooManyRedirectsError",
    "Url",
    "parse_url",
    "resolve_reference",
    "tls_context",
]
