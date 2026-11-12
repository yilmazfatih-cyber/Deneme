"""Testlerin ortak yardımcıları."""

import os

from dnsmini import bolge, tel, yanit

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ornek_bolge():
    with open(os.path.join(KOK, "ornekler", "ornek.test.zone"), encoding="utf-8") as f:
        return bolge.oku(f.read())


def sor(bolgeler, ad, tur, **ayar):
    """Ağ olmadan: sorguyu kodla, yanıt fonksiyonuna ver, yanıtı çöz."""
    azami = ayar.pop("azami_boy", yanit.UDP_SINIRI)
    m = tel.Mesaj(kimlik=4242, rd=True, sorular=[tel.Soru(ad, tel.TURLER[tur] if isinstance(tur, str) else tur)])
    for k, v in ayar.items():
        setattr(m, k, v)
    ham = yanit.cevapla(tel.kodla(m), bolgeler, azami_boy=azami)
    return None if ham is None else tel.coz(ham)
