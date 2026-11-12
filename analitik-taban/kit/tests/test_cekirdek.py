import datetime as dt
import math
import tempfile
import unittest
from pathlib import Path

from analitik import analiz, bicim, csvoku, istatistik, metin


class BicimTesti(unittest.TestCase):
    def test_sayi(self):
        self.assertEqual(bicim.sayi(12430), "12.430")
        self.assertEqual(bicim.sayi(1234567.891, 2), "1.234.567,89")
        self.assertEqual(bicim.sayi(-12430), "-12.430")
        self.assertEqual(bicim.sayi(-0.001, 1), "0,0")
        self.assertEqual(bicim.sayi(None), "–")
        self.assertEqual(bicim.sayi(float("nan")), "–")

    def test_yuzde(self):
        self.assertEqual(bicim.yuzde(0.186), "%18,6")
        self.assertEqual(bicim.yuzde(-0.032), "-%3,2")
        self.assertEqual(bicim.yuzde(0.05, isaret=True), "+%5,0")
        self.assertEqual(bicim.yuzde(-0.00001), "%0,0")
        self.assertEqual(bicim.puan(0.023), "+2,3 puan")
        self.assertEqual(bicim.puan(-0.0001), "0 puan")
        self.assertEqual(bicim.degisim(110, 100), "+%10,0")
        self.assertEqual(bicim.degisim(5, 0), "–")

    def test_sure(self):
        self.assertEqual(bicim.sure(45), "45 sn")
        self.assertEqual(bicim.sure(190), "3 dk 10 sn")
        self.assertEqual(bicim.sure(7500), "2 sa 5 dk")
        self.assertEqual(bicim.sure(129600), "1,5 gün")

    def test_kivilcim_ve_tablo(self):
        self.assertEqual(bicim.kivilcim([1, 5, 3]), "▁█▅")
        self.assertEqual(bicim.kivilcim([2, 2]), "▄▄")
        t = bicim.tablo(["ad", "sayı"], [["Android", "1.204"], ["iOS", "980"]])
        satirlar = t.splitlines()
        self.assertEqual(len(satirlar), 4)
        self.assertTrue(satirlar[1].endswith(":|") or satirlar[1].rstrip(" |").endswith(":"))
        self.assertIn("| Android |", satirlar[2])


class IstatistikTesti(unittest.TestCase):
    def test_iki_oran(self):
        s = istatistik.iki_oran_testi(100, 1000, 130, 1000)
        self.assertAlmostEqual(s["fark"], 0.03)
        self.assertAlmostEqual(s["goreli"], 0.3)
        self.assertAlmostEqual(s["z"], 2.1027, places=3)
        self.assertAlmostEqual(s["p_degeri"], 0.0355, places=3)
        self.assertLess(s["ga_alt"], 0.03)
        self.assertGreater(s["ga_ust"], 0.03)
        self.assertIsNone(istatistik.iki_oran_testi(0, 0, 1, 10)["z"])

    def test_ki_kare(self):
        # sd=1, x=3.841 -> p ~ 0.05 ; sd=4, x=9.488 -> p ~ 0.05 ; sd=2, x=2 -> exp(-1)
        self.assertAlmostEqual(istatistik.ki_kare_p(3.841, 1), 0.05, places=3)
        self.assertAlmostEqual(istatistik.ki_kare_p(9.488, 4), 0.05, places=3)
        self.assertAlmostEqual(istatistik.ki_kare_p(2.0, 2), math.exp(-1), places=6)
        self.assertAlmostEqual(istatistik.ki_kare_p(40.0, 3), 1.06e-8, delta=2e-9)

    def test_srm(self):
        self.assertGreater(istatistik.srm_testi([5000, 5030])["p_degeri"], 0.5)
        self.assertLess(istatistik.srm_testi([5000, 5400])["p_degeri"], 0.001)
        self.assertGreater(istatistik.srm_testi([2000, 8000], [0.2, 0.8])["p_degeri"], 0.9)

    def test_mde_wilson_z(self):
        self.assertAlmostEqual(istatistik.mde(10000, 0.1), 0.0119, places=3)
        alt, ust = istatistik.wilson(50, 100)
        self.assertAlmostEqual(alt, 0.4038, places=3)
        self.assertAlmostEqual(ust, 0.5962, places=3)
        self.assertAlmostEqual(istatistik.sayim_z(120, 100), 20 / math.sqrt(220))
        self.assertAlmostEqual(istatistik.sapma_z(50, 50, 200, 200), 0.0)
        self.assertLess(istatistik.sapma_z(20, 50, 170, 200), -3)


class MetinTesti(unittest.TestCase):
    def test_turkce_harf(self):
        self.assertEqual(metin.kucuk("IĞDIR İSTANBUL"), "ığdır istanbul")
        self.assertEqual(metin.buyuk("istanbul ılık"), "İSTANBUL ILIK")

    def test_kelimeler_ve_sik(self):
        self.assertEqual(
            metin.kelimeler("Ödeme sayfası ÇOK yavaş, ve bu sorun!"), ["ödeme", "sayfası", "yavaş", "sorun"]
        )
        tekil, ikili = metin.sik_kelimeler(["Ödeme sayfası yavaş", "ödeme sayfası açılmıyor", "kargo geç"])
        self.assertIn(("ödeme", 2), tekil[:2])
        self.assertEqual(tekil[2], ("açılmıyor", 1))
        self.assertIn(("ödeme sayfası", 2), ikili)

    def test_ornekle(self):
        kokler = ["ödeme", "kargo", "arama", "giriş", "sepet", "bildirim", "profil", "kampanya", "iade", "destek"]
        yanitlar = ["Çok iyi"] * 30 + [
            f"{a} ekranında {b} sorunu yaşadım, tekrar denedim" for a in kokler for b in kokler
        ]
        ornek = metin.ornekle(yanitlar, n=20)
        self.assertEqual(len(ornek), 20)
        self.assertEqual(sum(1 for o in ornek if o == "Çok iyi"), 1)
        self.assertEqual(ornek, metin.ornekle(yanitlar, n=20))
        uzun = metin.ornekle(["kelime " * 100], n=5, azami_uzunluk=50)
        self.assertLessEqual(len(uzun[0]), 50)

    def test_tema(self):
        temalar = [
            {"ad": "Ödeme", "kelimeler": ["ödem*", "kart bilgisi"]},
            {"ad": "Kargo", "kelimeler": ["kargo*", "teslimat"], "haric": ["kargo ücretsiz"]},
        ]
        self.assertEqual(metin.tema_eslestir("Ödemede hata aldım", temalar), ["Ödeme"])
        self.assertEqual(metin.tema_eslestir("Kart bilgisi kaydedilmiyor", temalar), ["Ödeme"])
        self.assertEqual(metin.tema_eslestir("Kargo ücretsiz olmalı", temalar), [])
        satirlar, eslesmeyen, toplam = metin.tema_say(["ödeme olmadı", "kargom gelmedi", "güzel", ""], temalar)
        self.assertEqual(toplam, 3)
        self.assertEqual({s["ad"]: s["sayi"] for s in satirlar}, {"Ödeme": 1, "Kargo": 1})
        self.assertEqual(eslesmeyen, ["güzel"])

    def test_nps(self):
        s = metin.nps([10, 9, 8, 7, 6, 0])
        self.assertAlmostEqual(s["nps"], 0.0)
        self.assertEqual(s["n"], 6)
        self.assertIsNone(metin.nps([]))


class AnalizTesti(unittest.TestCase):
    def test_donem(self):
        bugun = dt.date(2026, 11, 9)
        a, b, _ = analiz.donem_coz("gun", bugun)
        self.assertEqual(a, (dt.date(2026, 11, 8), dt.date(2026, 11, 8)))
        self.assertEqual(b, (dt.date(2026, 11, 1), dt.date(2026, 11, 1)))
        a, b, _ = analiz.donem_coz("hafta", bugun)
        self.assertEqual(a, (dt.date(2026, 11, 2), dt.date(2026, 11, 8)))
        self.assertEqual(b, (dt.date(2026, 10, 26), dt.date(2026, 11, 1)))
        a, b, _ = analiz.donem_coz("28g", bugun)
        self.assertEqual((a[1] - a[0]).days, 27)
        self.assertEqual(b[1], a[0] - dt.timedelta(days=1))
        self.assertEqual(analiz.aralik_coz("2026-11-01:2026-11-03"), (dt.date(2026, 11, 1), dt.date(2026, 11, 3)))
        with self.assertRaises(ValueError):
            analiz.donem_coz("ay", bugun)

    def test_katki(self):
        a = {"Android": 400, "iOS": 600}
        b = {"Android": 800, "iOS": 620}
        k = analiz.katki(a, b, a_toplam=1100, b_toplam=1500)
        self.assertEqual(k["fark"], -400)
        ilk = k["satirlar"][0]
        self.assertEqual(ilk["segment"], "Android")
        self.assertAlmostEqual(ilk["katki"], 1.0)
        self.assertLess(ilk["sapma_z"], -3)
        diger = [s for s in k["satirlar"] if s["segment"] == analiz.DIGER][0]
        self.assertEqual((diger["a"], diger["b"]), (100, 80))

    def test_oran_ayristir_kimlik(self):
        sonuc = analiz.oran_ayristir(
            pay_a={"x": 30, "y": 10, "yeni": 5},
            payda_a={"x": 100, "y": 100, "yeni": 50},
            pay_b={"x": 40, "y": 10, "eski": 3},
            payda_b={"x": 100, "y": 50, "eski": 30},
        )
        self.assertAlmostEqual(sonuc["karma_toplam"] + sonuc["oran_toplam"], sonuc["fark"])
        self.assertEqual(sonuc["satirlar"][0]["segment"], "x")

    def test_huni(self):
        gun = 86400
        olaylar = [
            # u1: A -> B -> C, tamamlıyor
            ("u1", "A", 10, "Android"),
            ("u1", "B", 20, None),
            ("u1", "C", 30, None),
            # u2: A -> B, C pencere dışında
            ("u2", "A", 10, "iOS"),
            ("u2", "B", 20, None),
            ("u2", "C", 10 + 2 * gun, None),
            # u3: ilk A eski; ikinci A sonrası tamamlıyor (en geç başlangıç)
            ("u3", "A", 5, "iOS"),
            ("u3", "A", 3 * gun, "iOS"),
            ("u3", "B", 3 * gun + 5, None),
            ("u3", "C", 3 * gun + 9, None),
            # u4: B ve C var ama A yok -> sayılmaz
            ("u4", "B", 1, None),
            ("u4", "C", 2, None),
            # u5: A giriş aralığı dışında -> sayılmaz
            ("u5", "A", 10 * gun, "Android"),
            ("u5", "B", 10 * gun + 1, None),
        ]
        sonuc = analiz.huni_hesapla(olaylar, ["A", "B", "C"], pencere_sn=gun, giris_bas=0, giris_bit=5 * gun)
        self.assertEqual(sonuc["toplam"], [3, 3, 2])
        self.assertEqual(sonuc["segmentler"]["iOS"], [2, 2, 1])
        self.assertEqual(sonuc["segmentler"]["Android"], [1, 1, 1])
        self.assertEqual(sonuc["medyan_sure"][2], 14.5)

    def test_huni_tekrarlayan_adim(self):
        olaylar = [("u", "Görüntüle", 1, None), ("u", "Görüntüle", 2, None), ("v", "Görüntüle", 1, None)]
        sonuc = analiz.huni_hesapla(olaylar, ["Görüntüle", "Görüntüle"], 100, 0, 10)
        self.assertEqual(sonuc["toplam"], [2, 1])

    def test_tutunma(self):
        ozet = analiz.tutunma_ozet(
            {
                "2026-10-01": {"first": 100, "counts": [100, 40, 30]},
                "2026-10-08": {"first": 300, "counts": [300, 60]},
            }
        )
        self.assertAlmostEqual(ozet["ortalama"][1], 0.25)
        self.assertAlmostEqual(ozet["ortalama"][2], 0.30)
        self.assertEqual(ozet["kohort_sayisi"], [2, 2, 1])


class CsvTesti(unittest.TestCase):
    def test_oku_noktali_virgul_ve_turler(self):
        icerik = (
            "Tarih;Ülke;Puan;Yorum;Sayfa\n"
            "05.11.2026;TR;9;Ödeme sayfası çok yavaş açılıyor bence;https://x.com/odeme?a=1\n"
            "06.11.2026;DE;3;Kargo takibi hiç çalışmıyor maalesef;https://x.com/kargo\n"
            "07.11.2026;TR;10;Uygulama gerçekten çok kullanışlı oldu;https://x.com/\n"
            "08.11.2026;TR;7;Arama sonuçları alakasız geliyor bazen;https://x.com/ara\n"
        )
        with tempfile.TemporaryDirectory() as d:
            yol = Path(d) / "a.csv"
            yol.write_text(icerik, encoding="cp1254")
            basliklar, satirlar = csvoku.oku(yol)
        self.assertEqual(basliklar[1], "Ülke")
        self.assertEqual(len(satirlar), 4)
        turler = {b: csvoku.sutun_turu(csvoku.sutun(basliklar, satirlar, b))["tur"] for b in basliklar}
        self.assertEqual(
            turler, {"Tarih": "tarih", "Ülke": "kategori", "Puan": "sayi", "Yorum": "metin", "Sayfa": "url"}
        )
        self.assertEqual(csvoku.sutun_turu(csvoku.sutun(basliklar, satirlar, "Puan"))["olcek"], "0-10")
        self.assertEqual(csvoku.url_yolu("https://x.com/odeme?a=1"), "/odeme")

    def test_sayiya(self):
        self.assertEqual(csvoku.sayiya("12.430,5"), 12430.5)
        self.assertEqual(csvoku.sayiya("12,430.5"), 12430.5)
        self.assertEqual(csvoku.sayiya("3,5"), 3.5)
        self.assertEqual(csvoku.sayiya("%45"), 45.0)
        self.assertIsNone(csvoku.sayiya("abc"))

    def test_tarih_bicimi_gun_ay(self):
        self.assertEqual(csvoku.tarih_bicimi(["13/02/2026", "01/03/2026"]), "%d/%m/%Y")
        self.assertEqual(csvoku.tarih_bicimi(["02/13/2026", "03/01/2026"]), "%m/%d/%Y")
        self.assertEqual(csvoku.tarih_bicimi(["2026-11-05T10:00:00Z"]), "iso")


if __name__ == "__main__":
    unittest.main()
