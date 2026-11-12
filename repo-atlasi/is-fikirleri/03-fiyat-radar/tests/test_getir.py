import socket
import unittest

from fiyat_radar.getir import (
    FIRECRAWL_AJANLARI,
    DogrudanGetirici,
    FirecrawlGetirici,
    GeciciHata,
    GetirmeHatasi,
    Getirici,
    GuvenlikEngeli,
    HizSinirlayici,
    RobotsDenetcisi,
    RobotsEngeli,
    adres_denetle,
    url_denetle,
    url_metni,
)

from tests.yerel_sunucu import YerelSunucu, urun_sayfasi

AJAN = "FiyatRadar/0.1"


def robots(**k) -> RobotsDenetcisi:
    return RobotsDenetcisi(AJAN, ozel_aglara_izin=True, **k)  # testler 127.0.0.1'deki sahte siteye gider


def dogrudan(**k) -> DogrudanGetirici:
    return DogrudanGetirici(AJAN, ozel_aglara_izin=True, **k)


def cozumleyici(ip: str):
    """Ad çözümlemesini taklit eder: her ad verilen IP'ye çözülür."""
    aile = socket.AF_INET6 if ":" in ip else socket.AF_INET
    return lambda ad, port, **_: [(aile, socket.SOCK_STREAM, 6, "", (ip, port))]


class SahteSaat:
    def __init__(self):
        self.an, self.uyumalar = 100.0, []

    def __call__(self):
        return self.an

    def uyu(self, sure):
        self.uyumalar.append(round(sure, 2))
        self.an += sure


class GetirTesti(unittest.TestCase):
    def test_robots_txt_kurallari(self):
        with YerelSunucu({"/urun": "x"}) as s:
            denetci = robots()
            self.assertTrue(denetci.izin_var_mi(s.adres + "/urun"))
            self.assertFalse(denetci.izin_var_mi(s.adres + "/gizli/fiyat"))
        with YerelSunucu({}, robots=None) as s:  # robots.txt yok (404) → serbest
            self.assertTrue(robots().izin_var_mi(s.adres + "/her-sey"))

    def test_robots_sunucusuna_ulasilamazsa_temkinli(self):
        self.assertFalse(robots(zaman_asimi=1).izin_var_mi("http://127.0.0.1:9/urun"))

    def test_firecrawl_ajanina_yasak_robots_ile_denetlenir(self):
        # Firecrawl sayfayı kendi adıyla ister; radar yalnız kendi adına bakarsa bu yasağı kaçırırdı.
        with YerelSunucu({}, robots="User-agent: FirecrawlAgent\nDisallow: /\n") as s:
            self.assertTrue(robots().izin_var_mi(s.adres + "/urun"))
            self.assertFalse(robots(ek_ajanlar=FIRECRAWL_AJANLARI).izin_var_mi(s.adres + "/urun"))

    def test_hiz_siniri_ayni_alan_adini_bekletir(self):
        saat = SahteSaat()
        hiz = HizSinirlayici(5, saat=saat, uyu=saat.uyu)
        hiz.bekle("https://a.example/1")
        saat.an += 2
        hiz.bekle("https://a.example/2")  # 3 sn daha beklemeli
        hiz.bekle("https://b.example/1")  # başka alan adı: beklemez
        hiz.bekle("https://b.example/2", en_az_sn=7)  # robots.txt Crawl-delay daha uzunsa o uygulanır
        self.assertEqual(saat.uyumalar, [3.0, 7.0])

    def test_crawl_delay_uyulur_cok_uzunsa_atlanir(self):
        saat = SahteSaat()
        with YerelSunucu({"/urun": urun_sayfasi("999 TL")}, robots="User-agent: *\nCrawl-delay: 7\n") as s:
            getirici = Getirici(robots(), HizSinirlayici(1, saat=saat, uyu=saat.uyu), dogrudan())
            getirici.getir(s.adres + "/urun")
            getirici.getir(s.adres + "/urun")
        self.assertEqual(saat.uyumalar, [7.0])
        with YerelSunucu({"/urun": "x"}, robots="User-agent: *\nCrawl-delay: 3600\n") as s:
            with self.assertRaises(RobotsEngeli):
                Getirici(robots(), HizSinirlayici(0), dogrudan()).getir(s.adres + "/urun")
            self.assertNotIn("/urun", s.getler)

    def test_dogrudan_getirici_ve_404(self):
        with YerelSunucu({"/urun": urun_sayfasi("1.299,90 TL")}) as s:
            self.assertIn("1.299,90 TL", dogrudan().getir(s.adres + "/urun").html)
            with self.assertRaises(GetirmeHatasi):
                dogrudan().getir(s.adres + "/yok")

    def test_sema_ve_ozel_ag_engeli(self):
        for url in ["file:///etc/hostname", "ftp://rakip.example/x", "http://kullanici:parola@rakip.example/x", "http:///yol"]:
            with self.assertRaises(GuvenlikEngeli, msg=url):
                url_denetle(url)
        with self.assertRaises(GuvenlikEngeli):
            DogrudanGetirici(AJAN).getir("file:///etc/hostname")
        with YerelSunucu({"/urun": "x"}) as s:
            with self.assertRaises(GuvenlikEngeli):  # varsayılan: yerel ağa istek yok
                DogrudanGetirici(AJAN).getir(s.adres + "/urun")
            with self.assertRaises(GuvenlikEngeli):
                RobotsDenetcisi(AJAN).izin_var_mi(s.adres + "/urun")
            # Ad, bağlantı anında yerel adrese çözülürse (DNS yeniden bağlama) yine reddedilir
            port = s.adres.rsplit(":", 1)[1]
            with self.assertRaises(GuvenlikEngeli):
                DogrudanGetirici(AJAN, cozumle=cozumleyici("127.0.0.1")).getir(f"http://rakip.example:{port}/urun")
            self.assertEqual(s.getler, [])
        for ip in ["10.0.0.5", "192.168.1.10", "169.254.169.254", "::1", "::ffff:127.0.0.1", "100.64.0.1"]:
            with self.assertRaises(GuvenlikEngeli, msg=ip):
                adres_denetle("http://rakip.example/urun", cozumle=cozumleyici(ip))
        adres_denetle("https://rakip.example/urun", cozumle=cozumleyici("93.184.216.34"))  # genel adres: geçer
        # Hata iletisi yazılırken bozuk adres yeni bir istisna doğurmaz; parola gizlenir
        self.assertEqual(url_metni("http://[::1"), "http://[::1")
        self.assertEqual(url_metni("https://ad:parola@api.example/v2"), "https://***@api.example/v2")
        with self.assertRaises(GuvenlikEngeli):
            url_denetle("http://[::1")

    def test_ozel_adres_firecrawla_hic_gonderilmez(self):
        with YerelSunucu({}) as s:
            denetci = lambda url: adres_denetle(url, cozumle=cozumleyici("10.0.0.5"))  # noqa: E731
            getirici = Getirici(robots(), HizSinirlayici(0), FirecrawlGetirici(s.adres), dogrudan(), adres_denetci=denetci)
            with self.assertRaises(GuvenlikEngeli):
                getirici.getir("http://ic-servis.example/yonetim")
            self.assertEqual(s.istekler, [])

    def test_yonlendirme_robots_ve_sema_denetimi(self):
        sayfalar = {
            "/yonlendir": (302, {"Location": "/gizli/fiyat"}, ""),
            "/dosyaya": (302, {"Location": "file:///etc/passwd"}, ""),
            "/ftpye": (302, {"Location": "ftp://rakip.example/x"}, ""),
            "/dongu": (302, {"Location": "/dongu"}, ""),
        }
        with YerelSunucu(sayfalar) as s:
            getirici = dogrudan(robots=robots())
            with self.assertRaises(RobotsEngeli):
                getirici.getir(s.adres + "/yonlendir")
            for yol in ["/dosyaya", "/ftpye", "/dongu"]:
                with self.assertRaises(GetirmeHatasi, msg=yol):
                    getirici.getir(s.adres + yol)
            self.assertNotIn("/gizli/fiyat", s.getler)

    def test_karakter_kodlamasi(self):
        # Hata: başlıktaki bilinmeyen kodlama LookupError ile turun tamamını durduruyordu.
        cp1254 = '<html><head><meta charset="windows-1254"></head><body>Tükendi 1.299,90 TL</body></html>'.encode("cp1254")
        sayfalar = {
            "/bozuk": (200, {"Content-Type": "text/html; charset=yok-boyle-kodlama"}, "Sepete ekle 100 TL"),
            "/cp1254": (200, {"Content-Type": "text/html"}, cp1254),
            "/rot13": (200, {"Content-Type": "text/html; charset=rot13"}, "100 TL"),
        }
        with YerelSunucu(sayfalar) as s:
            self.assertIn("100 TL", dogrudan().getir(s.adres + "/bozuk").html)
            self.assertIn("Tükendi", dogrudan().getir(s.adres + "/cp1254").html)
            self.assertIn("100 TL", dogrudan().getir(s.adres + "/rot13").html)

    def test_buyuk_yanit_reddedilir(self):
        with YerelSunucu({"/buyuk": "x" * 5000}) as s:
            with self.assertRaises(GetirmeHatasi):
                dogrudan(azami_bayt=1000).getir(s.adres + "/buyuk")

    def test_gecici_hata_bir_kez_yeniden_denenir(self):
        sayfalar = {"/urun": [(503, {}, "meşgul"), urun_sayfasi("999 TL")], "/hep": [(503, {}, "meşgul")]}
        with YerelSunucu(sayfalar) as s:
            getirici = Getirici(robots(), HizSinirlayici(0), dogrudan())
            sayfa, _ = getirici.getir(s.adres + "/urun")
            self.assertIn("999 TL", sayfa.html)
            with self.assertRaises(GeciciHata):
                getirici.getir(s.adres + "/hep")
            self.assertEqual((s.getler.count("/urun"), s.getler.count("/hep")), (2, 2))

    def test_firecrawl_istegi_ve_yaniti(self):
        with YerelSunucu({}) as s:
            s.firecrawl_yaniti = {
                "success": True,
                "data": {"markdown": "2.299,90 TL", "rawHtml": "<p>2.299,90 TL</p>", "metadata": {"statusCode": 200}},
            }
            sayfa = FirecrawlGetirici(s.adres, "fc-deneme", urun_bicimi=True).getir("https://rakip.example/x")
            FirecrawlGetirici(s.adres, konum="TR").getir("https://rakip.example/x")
            istek, konumlu = s.istekler
        self.assertEqual((istek["yol"], istek["yetki"]), ("/v2/scrape", "Bearer fc-deneme"))
        self.assertEqual(istek["govde"]["formats"], ["markdown", "rawHtml", {"type": "product"}])
        self.assertEqual((istek["govde"]["maxAge"], istek["govde"]["storeInCache"]), (0, False))
        self.assertNotIn("location", istek["govde"])  # kendi kurulumda konum destekleyen motor olmayabilir
        self.assertEqual((konumlu["yetki"], konumlu["govde"]["location"]), (None, {"country": "TR", "languages": ["tr-TR"]}))
        self.assertEqual((sayfa.kaynak, sayfa.markdown), ("firecrawl", "2.299,90 TL"))

    def test_firecrawl_bozuk_yanitlar_ve_uyari(self):
        with YerelSunucu({}) as s:
            for bozuk in [{"success": True, "data": ["beklenmeyen"]}, [1, 2], b"<html>JSON degil</html>", {"success": False}]:
                s.firecrawl_yaniti = bozuk
                with self.assertRaises(GetirmeHatasi, msg=repr(bozuk)):
                    FirecrawlGetirici(s.adres).getir("https://rakip.example/x")
            s.firecrawl_yaniti = {
                "success": True,
                "data": {"rawHtml": "<p>1 TL</p>", "metadata": {"statusCode": "bilinmiyor"}, "warning": "Product format is not available"},
            }
            sayfa = FirecrawlGetirici(s.adres).getir("https://rakip.example/x")
        self.assertEqual(sayfa.uyarilar, ["Firecrawl uyarısı: Product format is not available"])

    def test_firecrawl_hatasinda_yedek_getirici_ve_hiz_siniri(self):
        saat = SahteSaat()
        with YerelSunucu({"/urun": urun_sayfasi("999 TL")}) as s:
            hiz = HizSinirlayici(5, saat=saat, uyu=saat.uyu)
            getirici = Getirici(robots(), hiz, FirecrawlGetirici(s.adres), dogrudan())
            sayfa, notlar = getirici.getir(s.adres + "/urun")
            self.assertEqual(sayfa.kaynak, "dogrudan")
            self.assertIn("firecrawl başarısız", notlar[0])
            # Hata: yedek getirici Firecrawl denemesinin hemen ardından aynı siteye gidiyordu
            self.assertEqual(saat.uyumalar, [5.0])
            with self.assertRaises(RobotsEngeli):
                getirici.getir(s.adres + "/gizli/urun")
            self.assertEqual(len(s.istekler), 1)  # robots engeli Firecrawl'a hiç sorulmadı


if __name__ == "__main__":
    unittest.main()
