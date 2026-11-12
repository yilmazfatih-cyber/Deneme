import unittest

from dnsmini import bolge, tel

from .yardimci import ornek_bolge


class BolgeAyristirmaTestleri(unittest.TestCase):
    def test_ornek_bolge(self):
        b = ornek_bolge()
        self.assertEqual(b.koken, "ornek.test")
        soa = b.soa.veri
        self.assertEqual((soa.birincil, soa.sorumlu), ("ns1.ornek.test", "hostmaster.ornek.test"))
        self.assertEqual((soa.seri, soa.yenile, soa.tekrar, soa.sona_erme, soa.asgari),
                         (2026110901, 7200, 900, 1209600, 300))
        self.assertEqual([k.veri for k in b.rrset("ornek.test", tel.NS)],
                         ["ns1.ornek.test", "ns2.baska-saglayici.test"])
        self.assertEqual(b.rrset("ornek.test", tel.MX)[0].veri, (10, "posta.ornek.test"))

    def test_ttl_ve_bos_sahip(self):
        b = ornek_bolge()
        self.assertEqual(b.rrset("www.ornek.test", tel.A)[0].ttl, 300)
        aaaa = b.rrset("www.ornek.test", tel.AAAA)[0]  # sahibi boş satır: önceki sahip
        self.assertEqual((aaaa.ttl, aaaa.veri), (3600, "2001:db8::80"))

    def test_cok_parcali_txt(self):
        uzun = ornek_bolge().rrset("uzun.ornek.test", tel.TXT)[0].veri
        self.assertEqual(len(uzun), 4)
        self.assertTrue(uzun[0].startswith("parca-1"))

    def test_sure_birimleri(self):
        self.assertEqual(bolge.sure_coz("1h30m"), 5400)
        self.assertEqual(bolge.sure_coz("2W"), 1209600)
        self.assertIsNone(bolge.sure_coz("ns1"))

    def test_kesim_ve_bos_ara_dugum(self):
        b = ornek_bolge()
        self.assertEqual(b.kesim_bul("x.y.lab.ornek.test"), "lab.ornek.test")
        self.assertIsNone(b.kesim_bul("www.ornek.test"))
        self.assertTrue(b.bos_ara_dugum_mu("b.ornek.test"))
        self.assertFalse(b.bos_ara_dugum_mu("yok.ornek.test"))


class BolgeHataTestleri(unittest.TestCase):
    TEMEL = "$ORIGIN t.test.\n$TTL 60\n@ IN SOA ns1 h 1 2 3 4 5\n@ IN NS ns1\nns1 IN A 192.0.2.1\n"

    def hata_bekle(self, ek, parca, metin=None):
        with self.assertRaises(bolge.BolgeHatasi) as yakalanan:
            bolge.oku(metin if metin is not None else self.TEMEL + ek)
        self.assertIn(parca, str(yakalanan.exception))
        return yakalanan.exception

    def test_gecerli_temel(self):
        self.assertEqual(bolge.oku(self.TEMEL).koken, "t.test")

    def test_cname_baska_veriyle(self):
        self.hata_bekle("w IN CNAME ns1\nw IN A 192.0.2.2\n", "CNAME başka veriyle")

    def test_bolge_disi_veri(self):
        self.hata_bekle("baska.test. IN A 192.0.2.2\n", "bölge dışı")

    def test_gecersiz_adres_satir_numarasi(self):
        e = self.hata_bekle("w IN A 300.1.1.1\n", "A verisi geçersiz")
        self.assertEqual(e.satir, 6)

    def test_eksik_soa_ttl_ve_parantez(self):
        self.hata_bekle("", "SOA", metin="$ORIGIN t.test.\n$TTL 60\n@ IN NS ns1\n")
        self.hata_bekle("", "TTL yok", metin="$ORIGIN t.test.\n@ IN SOA ns1 h 1 2 3 4 5\n")
        self.hata_bekle("", "kapanmamış '('", metin="$ORIGIN t.test.\n$TTL 60\n@ IN SOA ns1 h ( 1 2 3\n")
        self.hata_bekle("", "köken bilinmiyor", metin="@ IN NS ns1\n")
        self.hata_bekle("$INCLUDE baska.zone\n", "desteklenmeyen yönerge")


if __name__ == "__main__":
    unittest.main()
