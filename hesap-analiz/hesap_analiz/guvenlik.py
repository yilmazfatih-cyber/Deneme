"""Ağ kilidi: çalışma süresince hiçbir soket açılamaz.

Bu bir "güveniyoruz" vaadi değil, teknik bir kilittir. Kilit takılıyken
herhangi bir kütüphane (bilerek ya da yanlışlıkla) ağa çıkmaya kalkarsa
AgKilidiHatasi fırlatılır ve işlem durur.
"""

from __future__ import annotations

import socket


class AgKilidiHatasi(RuntimeError):
    """Ağ kilidi takılıyken bir ağ bağlantısı denendi."""


_ORIJINAL_SOCKET = socket.socket
_ORIJINAL_CREATE_CONNECTION = socket.create_connection
_ORIJINAL_GETADDRINFO = socket.getaddrinfo
_TAKILI = False


class _KilitliSocket(socket.socket):
    def __init__(self, *args, **kwargs):  # noqa: D401
        raise AgKilidiHatasi(
            "Ağ kilidi takılı: bu araç çalışırken ağa çıkılamaz. "
            "Bir kütüphane ağ bağlantısı denedi; işlem durduruldu."
        )


def _kilitli_create_connection(*_args, **_kwargs):
    raise AgKilidiHatasi("Ağ kilidi takılı: bağlantı açılamaz.")


def _kilitli_getaddrinfo(*_args, **_kwargs):
    raise AgKilidiHatasi("Ağ kilidi takılı: alan adı çözümlenemez.")


def ag_kilidini_tak() -> None:
    """Süreç genelinde soket oluşturmayı ve DNS çözümlemeyi engeller."""
    global _TAKILI
    if _TAKILI:
        return
    socket.socket = _KilitliSocket  # type: ignore[misc]
    socket.create_connection = _kilitli_create_connection  # type: ignore[assignment]
    socket.getaddrinfo = _kilitli_getaddrinfo  # type: ignore[assignment]
    _TAKILI = True


def ag_kilidini_cikar() -> None:
    """Yalnızca testler için: kilidi kaldırır."""
    global _TAKILI
    socket.socket = _ORIJINAL_SOCKET  # type: ignore[misc]
    socket.create_connection = _ORIJINAL_CREATE_CONNECTION  # type: ignore[assignment]
    socket.getaddrinfo = _ORIJINAL_GETADDRINFO  # type: ignore[assignment]
    _TAKILI = False


def kilit_takili_mi() -> bool:
    return _TAKILI
