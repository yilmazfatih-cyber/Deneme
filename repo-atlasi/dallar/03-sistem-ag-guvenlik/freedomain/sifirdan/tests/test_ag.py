"""Uçtan uca testler: gerçek UDP/TCP soketleri, yalnız 127.0.0.1 üzerinde."""

import socket
import struct
import unittest

from dnsmini import istemci, sunucu, tel

from .yardimci import ornek_bolge


class AgTestleri(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = sunucu.DnsSunucusu([ornek_bolge()]).baslat()
        cls.port = cls.s.port

    @classmethod
    def tearDownClass(cls):
        cls.s.durdur()

    def test_udp_sorgu(self):
        y = istemci.sorgula("www.ornek.test", "A", port=self.port)
        self.assertEqual([k.veri for k in y.cevaplar], ["192.0.2.80"])
        self.assertIn("192.0.2.80", istemci.metin(y))

    def test_tc_sonrasi_tcp_yedegi(self):
        y = istemci.sorgula("uzun.ornek.test", "TXT", port=self.port, tcp_yedek=False)
        self.assertTrue(y.tc)
        y = istemci.sorgula("uzun.ornek.test", "TXT", port=self.port)
        self.assertFalse(y.tc)
        self.assertEqual(len(y.cevaplar[0].veri), 4)

    def test_tek_tcp_baglantisinda_iki_sorgu(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=2) as s:
            for kimlik, ad in ((1, "www.ornek.test"), (2, "posta.ornek.test")):
                ham = tel.kodla(tel.Mesaj(kimlik=kimlik, sorular=[tel.Soru(ad, tel.A)]))
                s.sendall(struct.pack("!H", len(ham)) + ham)
                n = struct.unpack("!H", s.recv(2))[0]
                veri = b""
                while len(veri) < n:
                    veri += s.recv(n - len(veri))
                y = tel.coz(veri)
                self.assertEqual((y.kimlik, y.rcode, len(y.cevaplar)), (kimlik, tel.NOERROR, 1))

    def test_bozuk_udp_paketi_formerr(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(2)
            s.sendto(b"\xab\xcd" + b"\x00\x00\x00\x05" + b"\x00" * 6 + b"\x3f", ("127.0.0.1", self.port))
            y = tel.coz(s.recvfrom(512)[0])
        self.assertEqual((y.kimlik, y.rcode), (0xABCD, tel.FORMERR))

    def test_nxdomain_uctan_uca(self):
        self.assertEqual(istemci.sorgula("yok.ornek.test", port=self.port).rcode, tel.NXDOMAIN)


class HizSinirlamaTestleri(unittest.TestCase):
    def test_jeton_kovasi(self):
        zaman = [0.0]
        h = sunucu.HizSinirlayici(saniyede=1, kova=2, kayma=2, saat=lambda: zaman[0])
        self.assertEqual([h.karar("203.0.113.9") for _ in range(5)], ["gonder", "gonder", "dusur", "kisalt", "dusur"])
        self.assertEqual(h.karar("198.51.100.1"), "gonder")  # başka kaynak etkilenmez
        zaman[0] = 1.0  # bir saniyede bir jeton dolar
        self.assertEqual(h.karar("203.0.113.9"), "gonder")

    def test_kayma_yaniti_tcp_ye_yonlendirir(self):
        sinir = sunucu.HizSinirlayici(saniyede=0.0001, kova=1, kayma=1)
        with sunucu.DnsSunucusu([ornek_bolge()], sinirlayici=sinir) as s:
            ilk = istemci.sorgula("www.ornek.test", port=s.port, tcp_yedek=False)
            ikinci = istemci.sorgula("www.ornek.test", port=s.port, tcp_yedek=False)
            ucuncu = istemci.sorgula("www.ornek.test", port=s.port)  # TC → TCP (sınırsız)
        self.assertEqual((ilk.tc, len(ilk.cevaplar)), (False, 1))
        self.assertEqual((ikinci.tc, ikinci.cevaplar), (True, []))
        self.assertEqual((ucuncu.tc, len(ucuncu.cevaplar)), (False, 1))


if __name__ == "__main__":
    unittest.main()
