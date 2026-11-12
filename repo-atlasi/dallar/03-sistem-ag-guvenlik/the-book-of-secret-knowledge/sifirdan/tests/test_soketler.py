import os
import unittest

from denetim import soketler

from .yardimci import ornek


class SoketTestleri(unittest.TestCase):
    def test_adres_cozme(self):
        self.assertEqual(soketler.adres_coz("0100007F"), "127.0.0.1")
        self.assertEqual(soketler.adres_coz("0A0200C0"), "192.0.2.10")
        self.assertEqual(soketler.adres_coz("00000000000000000000000001000000"), "::1")
        self.assertEqual(soketler.adres_coz("B80D0120000000000000000005000000"), "2001:db8::5")
        self.assertEqual(soketler.adres_coz("7F000001", bayt_sirasi="big"), "127.0.0.1")

    def test_ayristirma(self):
        s = soketler.ayristir(ornek("proc_net_tcp"))
        self.assertEqual(len(s), 7)
        self.assertEqual(s[1], {"yerel": "127.0.0.1", "yerel_port": 5432, "uzak": "0.0.0.0", "uzak_port": 0,
                                "durum": "LISTEN", "uid": 113, "inode": 21002})
        self.assertEqual((s[5]["durum"], s[5]["uzak"], s[5]["uzak_port"]), ("ESTABLISHED", "198.51.100.20", 50022))
        self.assertEqual(len(soketler.dinleyenler(s)), 5)

    def test_ipv4_bulgulari(self):
        b = soketler.denetle(soketler.ayristir(ornek("proc_net_tcp")))
        ozet = sorted((x.kural, x.onem, x.konum.split()[0]) for x in b)
        self.assertEqual(ozet, [
            ("NET-000", "bilgi", "0.0.0.0:22"),
            ("NET-000", "bilgi", "127.0.0.1:5432"),
            ("NET-000", "bilgi", "192.0.2.10:8080"),
            ("NET-001", "yuksek", "0.0.0.0:6379"),
            ("NET-002", "orta", "0.0.0.0:23"),
        ])

    def test_ipv6_bulgulari(self):
        b = soketler.denetle(soketler.ayristir(ornek("proc_net_tcp6")))
        yuksek = [x for x in b if x.onem == "yuksek"]
        self.assertEqual([x.baslik for x in yuksek], ["MongoDB tüm arayüzlerde dinliyor"])
        redis = next(x for x in b if x.konum.startswith("::1:6379"))
        self.assertIn("yalnız yerel", redis.baslik)  # loopback'teki Redis sorun değil

    @unittest.skipUnless(os.path.exists("/proc/net/tcp"), "Linux /proc yok")
    def test_canli_proc_okunabilir(self):
        with open("/proc/net/tcp") as f:
            for s in soketler.ayristir(f.read()):
                self.assertIn(s["durum"], soketler.DURUMLAR.values())


if __name__ == "__main__":
    unittest.main()
