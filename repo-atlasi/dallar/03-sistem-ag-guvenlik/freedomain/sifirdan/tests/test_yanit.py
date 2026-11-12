import unittest

from dnsmini import tel, yanit

from .yardimci import ornek_bolge, sor


class YanitTestleri(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bolgeler = [ornek_bolge()]

    def test_dogrudan_cevap(self):
        y = sor(self.bolgeler, "www.ornek.test", "A")
        self.assertEqual((y.rcode, y.aa, y.qr, y.kimlik, y.rd), (tel.NOERROR, True, True, 4242, True))
        self.assertEqual([k.veri for k in y.cevaplar], ["192.0.2.80"])

    def test_buyuk_kucuk_harf(self):
        y = sor(self.bolgeler, "WwW.OrNeK.TeSt", "AAAA")
        self.assertEqual(y.sorular[0].ad, "WwW.OrNeK.TeSt")  # soru olduğu gibi yansıtılır
        self.assertEqual([k.veri for k in y.cevaplar], ["2001:db8::80"])

    def test_mx_ek_bolum(self):
        y = sor(self.bolgeler, "ornek.test", "MX")
        self.assertEqual(y.cevaplar[0].veri, (10, "posta.ornek.test"))
        self.assertEqual([(k.ad, k.veri) for k in y.ekler], [("posta.ornek.test", "192.0.2.25")])

    def test_cname_zinciri(self):
        y = sor(self.bolgeler, "eski.ornek.test", "A")
        self.assertEqual([(tel.TUR_ADI[k.tur], k.veri) for k in y.cevaplar],
                         [("CNAME", "blog.ornek.test"), ("CNAME", "www.ornek.test"), ("A", "192.0.2.80")])

    def test_cname_bolge_disina(self):
        y = sor(self.bolgeler, "disari.ornek.test", "A")
        self.assertEqual([k.veri for k in y.cevaplar], ["www.baska-saglayici.test"])
        self.assertEqual(y.rcode, tel.NOERROR)

    def test_cname_sorgusu_zinciri_izlemez(self):
        y = sor(self.bolgeler, "blog.ornek.test", "CNAME")
        self.assertEqual(len(y.cevaplar), 1)

    def test_nxdomain_ve_olumsuz_ttl(self):
        y = sor(self.bolgeler, "yok.ornek.test", "A")
        self.assertEqual((y.rcode, y.aa, y.cevaplar), (tel.NXDOMAIN, True, []))
        self.assertEqual(y.yetkililer[0].tur, tel.SOA)
        self.assertEqual(y.yetkililer[0].ttl, 300)  # min(SOA TTL 3600, asgari 300)

    def test_nodata(self):
        y = sor(self.bolgeler, "www.ornek.test", "MX")
        self.assertEqual((y.rcode, y.cevaplar, y.yetkililer[0].tur), (tel.NOERROR, [], tel.SOA))

    def test_bos_ara_dugum_nxdomain_degildir(self):
        y = sor(self.bolgeler, "b.ornek.test", "A")
        self.assertEqual((y.rcode, y.cevaplar), (tel.NOERROR, []))

    def test_delegasyon_yonlendirmesi(self):
        y = sor(self.bolgeler, "www.lab.ornek.test", "A")
        self.assertFalse(y.aa)
        self.assertEqual(y.cevaplar, [])
        self.assertEqual(sorted(k.veri for k in y.yetkililer), ["ns.baska-saglayici.test", "ns.lab.ornek.test"])
        self.assertEqual([(k.ad, k.veri) for k in y.ekler], [("ns.lab.ornek.test", "198.51.100.7")])  # glue

    def test_yapistirici_ad_da_yonlendirilir(self):
        y = sor(self.bolgeler, "ns.lab.ornek.test", "A")
        self.assertFalse(y.aa)  # kesimin altındaki veri yetkili cevap olarak verilmez
        self.assertEqual(y.cevaplar, [])

    def test_baska_bolge_reddedilir(self):
        self.assertEqual(sor(self.bolgeler, "example.com", "A").rcode, tel.REFUSED)
        self.assertEqual(sor(self.bolgeler, "ornek.test", "A", opcode=2).rcode, tel.NOTIMP)

    def test_any(self):
        turler = {k.tur for k in sor(self.bolgeler, "ornek.test", "ANY").cevaplar}
        self.assertEqual(turler, {tel.SOA, tel.NS, tel.MX, tel.TXT})

    def test_kesme_tc(self):
        y = sor(self.bolgeler, "uzun.ornek.test", "TXT")
        self.assertTrue(y.tc)
        self.assertEqual((y.cevaplar, len(y.sorular)), ([], 1))
        y = sor(self.bolgeler, "uzun.ornek.test", "TXT", azami_boy=65535)
        self.assertFalse(y.tc)
        self.assertEqual(len(y.cevaplar[0].veri), 4)

    def test_bozuk_ve_yanit_paketleri(self):
        self.assertIsNone(yanit.cevapla(b"\x00\x01", self.bolgeler))
        bozuk = tel.coz(yanit.cevapla(b"\x12\x34" + b"\x00" * 3 + b"\x01" + b"\xff" * 10, self.bolgeler))
        self.assertEqual((bozuk.kimlik, bozuk.rcode), (0x1234, tel.FORMERR))
        self.assertIsNone(sor(self.bolgeler, "www.ornek.test", "A", qr=True))


if __name__ == "__main__":
    unittest.main()
