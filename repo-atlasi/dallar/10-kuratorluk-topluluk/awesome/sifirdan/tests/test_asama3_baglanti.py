import socket
import time
import unittest

from asama3_baglanti import Sonuc, durum_guncelle, hepsini_kontrol_et, kaldirma_adaylari, tek_kontrol
from tests.yerel_sunucu import YerelSunucu


def bos_port() -> int:
    """Kapalı (dinlenmeyen) bir port: bağlantı reddedilir."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class TekKontrolTesti(unittest.TestCase):
    def setUp(self):
        self.sunucu = YerelSunucu().__enter__()

    def tearDown(self):
        self.sunucu.__exit__(None, None, None)

    def kontrol(self, yol: str, **ayar) -> Sonuc:
        ayar.setdefault("zaman_asimi", 0.3)
        return tek_kontrol(self.sunucu.adres(yol), **ayar)

    def test_tamam(self):
        s = self.kontrol("/tamam")
        self.assertEqual((s.sinif, s.durum, s.deneme), ("TAMAM", 200, 1))
        self.assertEqual(self.sunucu.istekler[0][0], "HEAD")  # önce ucuz HEAD

    def test_kalici_ve_gecici_yonlendirme(self):
        tasindi = self.kontrol("/tasindi")
        self.assertEqual(tasindi.sinif, "TASINDI")
        self.assertTrue(tasindi.son_url.endswith("/tamam"))
        self.assertEqual(self.kontrol("/gecici").sinif, "YONLENDI")

    def test_zincirleme_yonlendirmede_ilk_atlama_belirler(self):
        s = self.kontrol("/zincir")  # 308 -> 301 -> 200
        self.assertEqual((s.sinif, s.deneme), ("TASINDI", 3))

    def test_yonlendirme_dongusu(self):
        s = self.kontrol("/dongu", en_fazla_yonlendirme=3)
        self.assertEqual(s.sinif, "BAGLANTI_HATASI")
        self.assertIn("yönlendirme", s.aciklama)

    def test_olu_ve_engelli_ve_sunucu_hatasi(self):
        self.assertEqual(self.kontrol("/yok").sinif, "OLU")
        self.assertEqual(self.kontrol("/gitti").sinif, "OLU")
        self.assertEqual(self.kontrol("/hata").sinif, "SUNUCU_HATASI")
        yasak = self.kontrol("/yasak")  # HEAD 403 -> GET denenir -> yine 403
        self.assertEqual((yasak.sinif, yasak.deneme), ("ENGELLI", 2))

    def test_head_desteklenmezse_get(self):
        s = self.kontrol("/head-yasak")
        self.assertEqual((s.sinif, s.deneme), ("TAMAM", 2))
        self.assertEqual([y for y, _ in self.sunucu.istekler], ["HEAD", "GET"])

    def test_429_sonrasi_yeniden_dener(self):
        self.assertEqual(self.kontrol("/kalabalik").sinif, "TAMAM")

    def test_429_yeniden_deneme_kapaliysa_engelli(self):
        self.assertEqual(self.kontrol("/kalabalik", yeniden_deneme=0).sinif, "ENGELLI")

    def test_zaman_asimi(self):
        basla = time.monotonic()
        s = self.kontrol("/yavas", zaman_asimi=0.2, yeniden_deneme=1)
        self.assertEqual((s.sinif, s.deneme), ("ZAMAN_ASIMI", 2))
        self.assertLess(time.monotonic() - basla, 0.9)

    def test_baglanti_reddi_ve_gecersiz_sema(self):
        self.assertEqual(tek_kontrol(f"http://127.0.0.1:{bos_port()}/x", zaman_asimi=0.5).sinif, "BAGLANTI_HATASI")
        self.assertEqual(tek_kontrol("ftp://ornek.example/dosya").sinif, "GECERSIZ")


class EszamanlilikTesti(unittest.TestCase):
    def test_paralel_daha_hizli_ve_sira_korunur(self):
        with YerelSunucu() as sunucu:
            urller = [sunucu.adres(f"/bekle?i={i}") for i in range(8)]
            basla = time.monotonic()
            sonuclar = hepsini_kontrol_et(urller, eszamanli=8, alan_basina=8, zaman_asimi=2)
            gecen = time.monotonic() - basla
        self.assertEqual([s.url for s in sonuclar], urller)
        self.assertTrue(all(s.sinif == "TAMAM" for s in sonuclar))
        self.assertLess(gecen, 1.5)  # sıralı olsaydı 8 x 0.3 = 2.4 sn

    def test_alan_basina_sinir(self):
        with YerelSunucu() as sunucu:
            urller = [sunucu.adres(f"/bekle?i={i}") for i in range(4)]
            hepsini_kontrol_et(urller, eszamanli=8, alan_basina=1, zaman_asimi=2)
            self.assertEqual(sunucu.en_cok_aktif, 1)

    def test_ayni_adres_bir_kez_denetlenir(self):
        with YerelSunucu() as sunucu:
            url = sunucu.adres("/tamam")
            sonuclar = hepsini_kontrol_et([url, url, url], zaman_asimi=1)
            self.assertEqual(len(sonuclar), 3)
            self.assertEqual(len(sunucu.istekler), 1)


class DurumTesti(unittest.TestCase):
    def test_ardisik_hata_sayaci_ve_aday(self):
        olu = Sonuc("https://a.example", "OLU", 404, "https://a.example", 1)
        engelli = Sonuc("https://b.example", "ENGELLI", 403, "https://b.example", 1)
        tamam = Sonuc("https://a.example", "TAMAM", 200, "https://a.example", 1)
        d1 = durum_guncelle({}, [olu, engelli], "2026-11-02")
        self.assertEqual(kaldirma_adaylari(d1), [])
        d2 = durum_guncelle(d1, [olu, engelli], "2026-11-09")
        self.assertEqual(d2["https://a.example"]["ardisik_hata"], 2)
        self.assertEqual(d2["https://a.example"]["ilk_hata"], "2026-11-02")
        self.assertEqual(d2["https://b.example"]["ardisik_hata"], 0)  # engellenmek ölü olmak değildir
        self.assertEqual(kaldirma_adaylari(d2), ["https://a.example"])
        d3 = durum_guncelle(d2, [tamam], "2026-11-16")
        self.assertEqual(d3["https://a.example"]["ardisik_hata"], 0)

    def test_tasindi_yeni_adresi_kaydeder(self):
        s = Sonuc("http://eski.example", "TASINDI", 200, "https://yeni.example", 2)
        self.assertEqual(durum_guncelle({}, [s], "2026-11-09")["http://eski.example"]["yeni_adres"], s.son_url)


if __name__ == "__main__":
    unittest.main()
