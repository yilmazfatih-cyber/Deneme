import unittest

from denetim import kaba_kuvvet

from .yardimci import ornek


class KabaKuvvetTestleri(unittest.TestCase):
    def setUp(self):
        self.bulgular, self.sayac = kaba_kuvvet.analiz(ornek("auth_log.txt"), yil=2026)

    def bul(self, kural):
        return [b for b in self.bulgular if b.kural == kural]

    def test_kaba_kuvvet_tespiti(self):
        kk = self.bul("LOG-001")
        self.assertEqual([b.konum for b in kk], ["203.0.113.5"])
        self.assertIn("10:01:50", kk[0].ayrinti)  # 5. başarısız deneme anı

    def test_yavas_deneme_esigin_altinda(self):
        # 192.0.2.77: 5'er dakika arayla 4 deneme → 10 dk pencerede eşiğe ulaşmaz.
        self.assertNotIn("192.0.2.77", [b.konum for b in self.bul("LOG-001")])
        self.assertEqual(self.sayac["192.0.2.77"], 4)

    def test_ele_gecirme_supheli(self):
        kritik = self.bul("LOG-003")
        self.assertEqual(len(kritik), 1)
        self.assertIn("root@203.0.113.5", kritik[0].baslik)
        self.assertEqual(kritik[0].onem, "kritik")

    def test_mesru_kullanici_uyarisi_yok(self):
        # ayse bir kez yanlış yazıp anahtarla girdi: kritik bulgu üretmemeli.
        self.assertFalse(any("198.51.100.20" in b.konum for b in self.bulgular))

    def test_kullanici_adi_taramasi(self):
        tarama = self.bul("LOG-002")
        self.assertEqual([b.konum for b in tarama], ["203.0.113.5"])
        self.assertIn("5 farklı", tarama[0].ayrinti)

    def test_dagitik_deneme_ve_iso_zaman(self):
        # root: 203.0.113.5 + .10 + .11 + .12 + .13 (ISO zaman damgalı satır) = 5 IP
        dag = self.bul("LOG-004")
        self.assertEqual([b.konum for b in dag], ["root"])
        self.assertIn("5 farklı IP", dag[0].ayrinti)

    def test_pencere_kayar(self):
        satirlar = "\n".join(
            f"Nov  9 11:{dk:02d}:00 h sshd[1]: Failed password for x from 192.0.2.9 port 1 ssh2" for dk in range(0, 50, 3)
        )
        b, _ = kaba_kuvvet.analiz(satirlar, yil=2026, esik=5, pencere=600)
        self.assertEqual([x.kural for x in b], [])  # 3 dk arayla: 10 dk'da en fazla 4 deneme
        b, _ = kaba_kuvvet.analiz(satirlar, yil=2026, esik=4, pencere=600)
        self.assertEqual([x.kural for x in b], ["LOG-001"])

    def test_zaman_bicimleri(self):
        self.assertEqual(str(kaba_kuvvet.zaman_oku("Jan  2 03:04:05 h sshd[1]: x", 2026)), "2026-01-02 03:04:05")
        self.assertEqual(str(kaba_kuvvet.zaman_oku("2026-11-09T10:00:00Z h sshd: x", 1999)), "2026-11-09 10:00:00")
        self.assertIsNone(kaba_kuvvet.zaman_oku("bozuk satır", 2026))


if __name__ == "__main__":
    unittest.main()
