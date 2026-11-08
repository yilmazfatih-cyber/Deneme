import socket

import pytest

from hesap_analiz import guvenlik


def test_ag_kilidi_soket_acmayi_engeller():
    guvenlik.ag_kilidini_tak()
    try:
        with pytest.raises(guvenlik.AgKilidiHatasi):
            socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        with pytest.raises(guvenlik.AgKilidiHatasi):
            socket.getaddrinfo("example.com", 443)
    finally:
        guvenlik.ag_kilidini_cikar()
    assert not guvenlik.kilit_takili_mi()
