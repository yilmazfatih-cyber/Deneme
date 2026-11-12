import struct
import unittest

from dnsmini import tel


def ornek_mesaj():
    return tel.Mesaj(
        kimlik=0xBEEF, qr=True, aa=True, rd=True, rcode=tel.NOERROR,
        sorular=[tel.Soru("www.ornek.test", tel.A)],
        cevaplar=[
            tel.Kayit("www.ornek.test", tel.A, 300, "192.0.2.80"),
            tel.Kayit("www.ornek.test", tel.AAAA, 300, "2001:db8::80"),
            tel.Kayit("ornek.test", tel.MX, 3600, (10, "posta.ornek.test")),
            tel.Kayit("ornek.test", tel.TXT, 3600, ("v=spf1 mx -all", "ikinci parça")),
            tel.Kayit("blog.ornek.test", tel.CNAME, 3600, "www.ornek.test"),
        ],
        yetkililer=[
            tel.Kayit("ornek.test", tel.NS, 3600, "ns1.ornek.test"),
            tel.Kayit("ornek.test", tel.SOA, 3600,
                      tel.Soa("ns1.ornek.test", "hostmaster.ornek.test", 2026110901, 7200, 900, 1209600, 300)),
        ],
        ekler=[tel.Kayit("ns1.ornek.test", tel.A, 3600, "192.0.2.53")],
    )


class TelBicimiTestleri(unittest.TestCase):
    def test_gidis_donus(self):
        m = ornek_mesaj()
        self.assertEqual(tel.coz(tel.kodla(m)), m)

    def test_baslik_bayraklari(self):
        ham = tel.kodla(tel.Mesaj(kimlik=1, qr=True, opcode=4, aa=True, tc=True, rd=True, ra=True, rcode=3))
        self.assertEqual(struct.unpack("!H", ham[2:4])[0], 0b1_0100_1_1_1_1_000_0011)

    def test_sikistirma_isaretcisi(self):
        ham = tel.kodla(ornek_mesaj())
        # Soru adı ofset 12'de; cevaptaki aynı ad 2 baytlık 0xC00C işaretçisine dönüşür.
        self.assertEqual(ham[12 + len(b"\x03www\x05ornek\x04test\x00") + 4 : ][:2], b"\xc0\x0c")
        sikistirmasiz = sum(len(k.ad) + 2 for k in ornek_mesaj().cevaplar)
        self.assertLess(len(ham), 12 + 20 + sikistirmasiz + 200)

    def test_sikistirma_harf_duyarsiz(self):
        m = tel.Mesaj(sorular=[tel.Soru("WWW.Ornek.Test", tel.A)],
                      cevaplar=[tel.Kayit("www.ornek.test", tel.A, 1, "192.0.2.1")])
        ham = tel.kodla(m)
        self.assertIn(b"\xc0\x0c", ham)
        self.assertEqual(tel.coz(ham).sorular[0].ad, "WWW.Ornek.Test")  # harfler korunur

    def test_dongu_kuran_isaretci_reddedilir(self):
        # Ofset 12: "a" etiketi, ofset 14: ofset 12'ye işaretçi → a.a.a.a... sonsuza dek.
        ham = struct.pack("!6H", 1, 0, 1, 0, 0, 0) + b"\x01a\xc0\x0c" + b"\x00\x01\x00\x01"
        with self.assertRaises(tel.BicimHatasi):
            tel.coz(ham)

    def test_ileri_ve_kendine_isaretci_reddedilir(self):
        for isaretci in (b"\xc0\x0c", b"\xc0\x20"):
            ham = struct.pack("!6H", 1, 0, 1, 0, 0, 0) + isaretci + b"\x00\x01\x00\x01"
            with self.subTest(isaretci=isaretci), self.assertRaises(tel.BicimHatasi):
                tel.coz(ham)

    def test_kesik_mesajlar(self):
        ham = tel.kodla(ornek_mesaj())
        for n in (0, 5, 11, 20, len(ham) - 1):
            with self.subTest(n=n), self.assertRaises(tel.BicimHatasi):
                tel.coz(ham[:n])

    def test_sinirlar(self):
        with self.assertRaises(tel.BicimHatasi):
            tel.kodla(tel.Mesaj(sorular=[tel.Soru("a" * 64 + ".test", tel.A)]))
        with self.assertRaises(tel.BicimHatasi):
            tel.kodla(tel.Mesaj(sorular=[tel.Soru(".".join(["a" * 60] * 5), tel.A)]))
        with self.assertRaises(tel.BicimHatasi):
            tel.kodla(tel.Mesaj(cevaplar=[tel.Kayit("t.test", tel.TXT, 1, ("x" * 256,))]))
        with self.assertRaises(tel.BicimHatasi):
            tel.kodla(tel.Mesaj(sorular=[tel.Soru("çiçek.test", tel.A)]))

    def test_kayit_metni(self):
        k = tel.Kayit("ornek.test", tel.MX, 60, (10, "posta.ornek.test"))
        self.assertEqual(tel.kayit_metni(k), "ornek.test.\t60\tIN\tMX\t10 posta.ornek.test.")


if __name__ == "__main__":
    unittest.main()
