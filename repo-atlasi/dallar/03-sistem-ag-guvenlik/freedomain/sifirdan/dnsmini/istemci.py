"""Küçük bir "dig": tek sorgu gönderir, yanıtı doğrular, TC=1 gelirse TCP'ye geçer.

Güvenlik notu: yanıtı kabul etmeden önce kimlik (ID), soru ve kaynak adres
eşleşmeli. Rastgele kimlik + rastgele kaynak port, önbellek zehirlemeye
(Kaminsky saldırısı, 2008) karşı temel savunmadır; secrets modülü bu yüzden.

Kullanım: python3 -m dnsmini.istemci www.ornek.test A --sunucu 127.0.0.1 --port 5353
"""

import argparse
import secrets
import socket
import struct
import time

from . import tel


def _sorgu(ad, tur, rd):
    kimlik = secrets.randbelow(65536)
    m = tel.Mesaj(kimlik=kimlik, rd=rd, sorular=[tel.Soru(ad, tur)])
    return kimlik, tel.kodla(m)


def _eslesiyor(yanit, kimlik, ad, tur):
    if yanit.kimlik != kimlik or not yanit.qr:
        return False
    if not yanit.sorular:  # FORMERR yanıtları soruyu içermeyebilir
        return yanit.rcode != tel.NOERROR
    s = yanit.sorular[0]
    return tel.normalle(s.ad) == tel.normalle(ad) and s.tur == tur


def _tam_oku(soket, n):
    parcalar = b""
    while len(parcalar) < n:
        p = soket.recv(n - len(parcalar))
        if not p:
            raise ConnectionError("bağlantı erken kapandı")
        parcalar += p
    return parcalar


def tcp_sorgula(ad, tur, sunucu, port, zaman_asimi=2.0, rd=False):
    kimlik, veri = _sorgu(ad, tur, rd)
    with socket.create_connection((sunucu, port), timeout=zaman_asimi) as s:
        s.sendall(struct.pack("!H", len(veri)) + veri)
        uzunluk = struct.unpack("!H", _tam_oku(s, 2))[0]
        yanit = tel.coz(_tam_oku(s, uzunluk))
    if not _eslesiyor(yanit, kimlik, ad, tur):
        raise ValueError("TCP yanıtı sorguyla eşleşmiyor")
    return yanit


def sorgula(ad, tur="A", sunucu="127.0.0.1", port=53, zaman_asimi=2.0, tcp_yedek=True, rd=False):
    """Bir sorgu gönderir ve çözülmüş tel.Mesaj döndürür."""
    if isinstance(tur, str):
        tur = tel.TURLER[tur.upper()]
    kimlik, veri = _sorgu(ad, tur, rd)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.sendto(veri, (sunucu, port))
        bitis = time.monotonic() + zaman_asimi
        while True:
            kalan = bitis - time.monotonic()
            if kalan <= 0:
                raise TimeoutError(f"{sunucu}:{port} yanıt vermedi")
            s.settimeout(kalan)
            paket, kaynak = s.recvfrom(65535)
            if kaynak[0] != sunucu or kaynak[1] != port:
                continue  # başka yerden gelen paket: yok say
            try:
                yanit = tel.coz(paket)
            except tel.BicimHatasi:
                continue
            if _eslesiyor(yanit, kimlik, ad, tur):
                break
    if yanit.tc and tcp_yedek:
        return tcp_sorgula(ad, tur, sunucu, port, zaman_asimi, rd)
    return yanit


def metin(yanit):
    bayraklar = [b for b, v in (("qr", yanit.qr), ("aa", yanit.aa), ("tc", yanit.tc), ("rd", yanit.rd)) if v]
    satirlar = [
        f";; durum: {tel.RCODE_ADI.get(yanit.rcode, yanit.rcode)}, kimlik: {yanit.kimlik}, bayraklar: {' '.join(bayraklar)}"
    ]
    for baslik, liste in (("CEVAP", yanit.cevaplar), ("YETKİ", yanit.yetkililer), ("EK", yanit.ekler)):
        if liste:
            satirlar.append(f";; {baslik} BÖLÜMÜ:")
            satirlar += [tel.kayit_metni(k) for k in liste]
    return "\n".join(satirlar)


def main(argv=None):
    p = argparse.ArgumentParser(description="dnsmini istemcisi")
    p.add_argument("ad")
    p.add_argument("tur", nargs="?", default="A")
    p.add_argument("--sunucu", default="127.0.0.1")
    p.add_argument("--port", type=int, default=53)
    p.add_argument("--tcp", action="store_true", help="doğrudan TCP kullan")
    a = p.parse_args(argv)
    if a.tcp:
        y = tcp_sorgula(a.ad, tel.TURLER[a.tur.upper()], a.sunucu, a.port)
    else:
        y = sorgula(a.ad, a.tur, a.sunucu, a.port)
    print(metin(y))


if __name__ == "__main__":
    main()
