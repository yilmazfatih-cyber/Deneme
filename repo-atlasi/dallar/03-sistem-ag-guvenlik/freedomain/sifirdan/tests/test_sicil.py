import unittest
from datetime import datetime, timedelta, timezone

from dnsmini import bolge, istemci, sicil, sunucu, tel

DIS_NS = ["ns1.ornek-dns.test", "ns2.ornek-dns.test"]


class SahteSaat:
    def __init__(self):
        self.an = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.an

    def ilerlet(self, **kw):
        self.an += timedelta(**kw)


class SicilTestleri(unittest.TestCase):
    def setUp(self):
        self.saat = SahteSaat()
        self.s = sicil.Sicil("ucretsiz.test", {"ns1.ucretsiz.test": "192.0.2.53", "ns2.ucretsiz.test": "198.51.100.53"},
                             saat=self.saat)

    def kod(self, *args, **kw):
        return self.s.kaydet(*args, **kw).kod

    def test_basarili_kayit(self):
        sonuc = self.s.kaydet("ayse", "ayse-blog", DIS_NS, iletisim={"ad": "Ayşe Yılmaz", "eposta": "a@ornek.test"})
        self.assertEqual(sonuc.kod, 1000)
        self.assertTrue(sonuc.basarili)
        self.assertEqual(self.s.alanlar["ayse-blog.ucretsiz.test"].durum, "aktif")

    def test_etiket_kurallari(self):
        self.assertEqual(self.kod("a", "-tire", DIS_NS), 2005)
        self.assertEqual(self.kod("b", "Büyük", DIS_NS), 2005)  # küçültülür ama ü LDH değil
        self.assertEqual(self.kod("c", "ab--cd", DIS_NS), 2005)  # IDN için ayrılmış biçim
        self.assertEqual(self.kod("d", "a" * 64, DIS_NS), 2004)
        self.assertEqual(self.kod("e", "www", DIS_NS), 2306)

    def test_tekrar_ve_hesap_siniri(self):
        self.assertEqual(self.kod("ali", "ali", DIS_NS), 1000)
        self.assertEqual(self.kod("veli", "ali", DIS_NS), 2302)
        self.assertEqual(self.kod("ali", "ali2", DIS_NS), 2308)  # hesap başına 1 alan adı

    def test_saatlik_deneme_siniri(self):
        for _ in range(5):
            self.kod("bot", "-", DIS_NS)
        self.assertEqual(self.kod("bot", "gecerli-ad", DIS_NS), 2308)
        self.saat.ilerlet(hours=1, seconds=1)
        self.assertEqual(self.kod("bot", "gecerli-ad", DIS_NS), 1000)

    def test_ns_kurallari(self):
        self.assertEqual(self.kod("a", "tekns", DIS_NS[:1]), 2004)
        self.assertEqual(self.kod("b", "ipns", ["192.0.2.1", "192.0.2.2"]), 2005)
        icerde = ["ns1.icerde.ucretsiz.test", "ns2.icerde.ucretsiz.test"]
        self.assertEqual(self.kod("c", "icerde", icerde), 2003)  # glue eksik
        ozel = {icerde[0]: "10.0.0.1", icerde[1]: "10.0.0.2"}
        self.assertEqual(self.kod("c", "icerde", icerde, ozel), 2306)
        glue = {icerde[0]: "203.0.113.10", icerde[1]: "203.0.113.11"}
        self.assertEqual(self.kod("c", "icerde", icerde, glue), 1000)

    def test_ipv6_yapistirici_aaaa_olur(self):
        icerde = ["ns1.alti.ucretsiz.test", "ns2.alti.ucretsiz.test"]
        glue = {icerde[0]: "2001:db8::53", icerde[1]: "203.0.113.12"}
        self.assertEqual(self.kod("alti", "alti", icerde, glue), 1000)
        b = bolge.oku(self.s.bolge_metni())  # IPv6 yapıştırıcı "A" yazılsaydı ayrıştırma düşerdi
        self.assertEqual([k.veri for k in b.rrset(icerde[0], tel.AAAA)], ["2001:db8::53"])
        self.assertEqual([k.veri for k in b.rrset(icerde[1], tel.A)], ["203.0.113.12"])

    def test_kimlik_avi_incelemeye_duser(self):
        self.assertEqual(sicil.kimlik_avi_supheli("paypa1-destek"), "paypal")
        self.assertEqual(sicil.kimlik_avi_supheli("e-devlet-giris"), "edevlet")
        self.assertIsNone(sicil.kimlik_avi_supheli("kedi-fotograflari"))
        self.assertEqual(self.kod("x", "paypa1-destek", DIS_NS), 1001)
        self.assertNotIn("paypa1-destek", self.s.bolge_metni())  # incelemede: yayımlanmaz
        self.assertEqual(self.s.incelemeyi_onayla("paypa1-destek.ucretsiz.test").kod, 1000)
        self.assertIn("paypa1-destek.ucretsiz.test. IN NS", self.s.bolge_metni())

    def test_sahiplik_ve_guncelleme(self):
        self.kod("ali", "ali", DIS_NS)
        self.assertEqual(self.s.ns_guncelle("veli", "ali.ucretsiz.test", DIS_NS).kod, 2201)
        yeni = ["a.ns.test", "b.ns.test"]
        self.assertEqual(self.s.ns_guncelle("ali", "ali.ucretsiz.test", yeni).kod, 1000)
        self.assertEqual(self.s.alanlar["ali.ucretsiz.test"].ad_sunuculari, yeni)
        self.assertEqual(self.s.sil("ali", "yok.ucretsiz.test").kod, 2303)

    def test_sikayet_ve_askiya_alma(self):
        self.kod("ali", "ali", DIS_NS)
        bilet = self.s.sikayet_et("ali.ucretsiz.test", "kimlik avı", "https://ornek.test/kanit.png")
        self.assertEqual(self.s.askiya_al("ali.ucretsiz.test", "kimlik avı doğrulandı", bilet["no"]).kod, 1000)
        self.assertNotIn("ali.ucretsiz.test. IN NS", self.s.bolge_metni())
        self.assertEqual(self.s.ns_guncelle("ali", "ali.ucretsiz.test", DIS_NS).kod, 2304)
        self.assertEqual(self.s.sil("ali", "ali.ucretsiz.test").kod, 2304)  # kanıt korunur
        self.assertTrue(self.s.biletler[0]["durum"].startswith("kapandi"))
        self.assertEqual(self.s.rdap("ali.ucretsiz.test")["status"], ["server hold"])

    def test_sure_dongusu(self):
        self.kod("ali", "ali", DIS_NS)
        ad = "ali.ucretsiz.test"
        self.assertEqual(self.s.yenile("ali", ad).kod, 2306)  # pencere açılmadı
        self.saat.ilerlet(days=366)
        self.s.sure_islerini_yurut()
        self.assertEqual(self.s.alanlar[ad].durum, "suresi_doldu")
        self.assertNotIn(f"{ad}. IN NS", self.s.bolge_metni())
        self.assertEqual(self.s.yenile("ali", ad).kod, 1000)  # ödemesiz dönemde kurtarılır
        self.assertEqual(self.s.alanlar[ad].durum, "aktif")
        self.saat.ilerlet(days=365 + 31)
        self.assertEqual(self.s.sure_islerini_yurut(), [ad])  # yenilenmedi: serbest
        self.assertEqual(self.kod("baskasi", "ali", DIS_NS), 1000)

    def test_rdap_gizlilik(self):
        self.kod("ayse", "ayse", DIS_NS, iletisim={"ad": "Ayşe Yılmaz", "telefon": "+90 555 000 00 00"})
        r = self.s.rdap("ayse.ucretsiz.test")
        self.assertEqual(r["status"], ["active"])
        self.assertEqual([n["ldhName"] for n in r["nameservers"]], DIS_NS)
        self.assertNotIn("Ayşe", str(r))
        self.assertNotIn("555", str(r))
        self.assertEqual(self.s.rdap("yok.ucretsiz.test")["errorCode"], 404)

    def test_denetim_izi_ve_seri(self):
        self.kod("ali", "ali", DIS_NS)
        self.kod("ali", "www", DIS_NS)
        self.assertEqual([(g[1], g[2], g[4]) for g in self.s.gunluk], [("ali", "create", 1000), ("ali", "create", 2306)])
        self.assertEqual(self.s.seri_numarasi(), 2026110900)
        self.assertEqual(self.s.seri_numarasi(), 2026110901)


class SicilDnsEntegrasyonTesti(unittest.TestCase):
    """Sicil üst bölgeyi üretir → dnsmini yayımlar → istemci delegasyonu görür."""

    def test_uretilen_bolge_yonlendirir(self):
        s = sicil.Sicil("ucretsiz.test", {"ns1.ucretsiz.test": "192.0.2.53", "ns2.ucretsiz.test": "198.51.100.53"},
                        saat=SahteSaat())
        s.kaydet("ali", "ali", DIS_NS)
        icerde = ["ns1.veli.ucretsiz.test", "ns2.veli.ucretsiz.test"]
        s.kaydet("veli", "veli", icerde, {icerde[0]: "203.0.113.10", icerde[1]: "203.0.113.11"})
        s.kaydet("kotu", "kotu", DIS_NS)
        s.askiya_al("kotu.ucretsiz.test", "zararlı yazılım")
        b = bolge.oku(s.bolge_metni())
        with sunucu.DnsSunucusu([b]) as dns:
            ali = istemci.sorgula("www.ali.ucretsiz.test", port=dns.port)
            veli = istemci.sorgula("veli.ucretsiz.test", "NS", port=dns.port)
            kotu = istemci.sorgula("www.kotu.ucretsiz.test", port=dns.port)
        self.assertFalse(ali.aa)
        self.assertEqual(sorted(k.veri for k in ali.yetkililer), DIS_NS)
        self.assertEqual(ali.ekler, [])  # bölge dışı NS: glue yok, çözücü ayrıca sorar
        self.assertEqual(sorted((k.ad, k.veri) for k in veli.ekler),
                         [("ns1.veli.ucretsiz.test", "203.0.113.10"), ("ns2.veli.ucretsiz.test", "203.0.113.11")])
        self.assertEqual(kotu.rcode, tel.NXDOMAIN)


if __name__ == "__main__":
    unittest.main()
