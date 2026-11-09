"""Ağ kilidi: çalışma süresince hiçbir soket açılamaz.

Bu bir "güveniyoruz" vaadi değil, teknik bir kilittir. Kilit takılıyken
herhangi bir kütüphane (bilerek ya da yanlışlıkla) ağa çıkmaya kalkarsa
AgKilidiHatasi fırlatılır ve işlem durur.
"""

from __future__ import annotations

import ipaddress
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


_YEREL_ADLAR = {None, "", "localhost", "localhost.localdomain"}


def _yerel_host_mu(host) -> bool:
    if isinstance(host, bytes):
        host = host.decode("ascii", "ignore")
    if host in _YEREL_ADLAR:
        return True
    try:
        return ipaddress.ip_address(str(host).split("%")[0]).is_loopback
    except ValueError:
        return False


def _adres_denetle(adres) -> None:
    if isinstance(adres, (str, bytes)):  # AF_UNIX: dosya sistemi soketi, ağ değil
        return
    if not _yerel_host_mu(adres[0]):
        raise AgKilidiHatasi(f"Ağ kilidi: yalnızca bu bilgisayara bağlanılabilir ({adres[0]} engellendi).")


class _YerelSocket(_ORIJINAL_SOCKET):
    """Yalnızca loopback (127.0.0.1, ::1) adreslerine bağlanabilen soket."""

    def connect(self, address):
        _adres_denetle(address)
        return super().connect(address)

    def connect_ex(self, address):
        _adres_denetle(address)
        return super().connect_ex(address)

    def sendto(self, data, *args):
        _adres_denetle(args[-1])
        return super().sendto(data, *args)


def _yerel_getaddrinfo(host, *args, **kwargs):
    if not _yerel_host_mu(host):
        raise AgKilidiHatasi(f"Ağ kilidi: {host} çözümlenemez; yalnızca bu bilgisayar.")
    return _ORIJINAL_GETADDRINFO(host, *args, **kwargs)


def ag_kilidini_tak(yalniz_yerel: bool = False) -> None:
    """Süreç genelinde ağ erişimini kilitler.

    yalniz_yerel=False: hiçbir soket açılamaz (komut satırı modu).
    yalniz_yerel=True : yalnızca bu bilgisayarın kendi adresine (127.0.0.1) bağlanılır;
                        tarayıcı arayüzü bu modda çalışır. İnternete çıkış yine engelli.
    Kilit bir kez takıldıysa ikinci çağrı hiçbir şeyi gevşetmez.
    """
    global _TAKILI
    if _TAKILI:
        return
    if yalniz_yerel:
        socket.socket = _YerelSocket  # type: ignore[misc]
        socket.getaddrinfo = _yerel_getaddrinfo  # type: ignore[assignment]
    else:
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
