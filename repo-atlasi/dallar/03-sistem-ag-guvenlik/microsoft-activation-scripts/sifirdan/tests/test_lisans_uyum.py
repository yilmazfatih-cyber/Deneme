import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date

import lisans_uyum as lu

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORNEK = os.path.join(KOK, "ornekler")
BUGUN = date(2026, 11, 9)


def ornek_rapor():
    with open(os.path.join(ORNEK, "eslesme.json"), encoding="utf-8") as f:
        eslesme = json.load(f)
    satirlar = lu.uzlastir(lu.csv_oku(os.path.join(ORNEK, "envanter.csv")),
                           lu.csv_oku(os.path.join(ORNEK, "haklar.csv")), eslesme, BUGUN)
    return {s.yazilim: s for s in satirlar}


class NormallemeTestleri(unittest.TestCase):
    def test_surum_ve_bosluk(self):
        self.assertEqual(lu.normalle("  VLC   media player 3.0.20 ", {}), "vlc media player")
        self.assertEqual(lu.normalle("Muhasebe Plus v7.4", {}), "muhasebe plus")
        self.assertEqual(lu.normalle("CAD Studio 2025", {}), "cad studio 2025")  # yıl ürün adının parçası

    def test_esanlamli(self):
        es = {"office pro 2024": "ofis paketi"}
        self.assertEqual(lu.normalle("Office Pro 2024", es), "ofis paketi")


class UzlastirmaTestleri(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = ornek_rapor()

    def test_cihaz_basina_eksik(self):
        w = self.r["Windows 11 Pro"]
        self.assertEqual((w.olcut, w.kullanim, w.hak, w.durum, w.fark), ("cihaz", 4, 3, "eksik", 1))
        self.assertIn("LAPTOP-07", w.cihazlar)

    def test_kullanici_basina_ayni_kisi_bir_kez(self):
        m = self.r["Microsoft 365 E3"]  # envanterdeki ad eş anlamlıyla eşlendi
        self.assertEqual((m.kullanim, m.hak, m.durum, m.fark), (3, 5, "atil", 2))  # ayse iki cihazda: 1 sayılır
        self.assertTrue(any("52 gün sonra" in n for n in m.notlar))

    def test_suresi_dolan_hak_sayilmaz(self):
        cad = self.r["CAD Studio 2025"]
        self.assertEqual((cad.hak, cad.durum, cad.fark), (1, "eksik", 1))
        self.assertTrue(any("CAD-512" in n and "doldu" in n for n in cad.notlar))
        self.assertEqual(self.r["Grafik Pro 2023"].durum, "suresi_dolmus")

    def test_kayitsiz_site_ve_atil(self):
        self.assertEqual(self.r["PDF Düzenleyici X"].durum, "kayitsiz")
        self.assertEqual(self.r["Muhasebe Plus"].durum, "uyumlu")  # site lisansı: sayı sınırı yok
        self.assertEqual((self.r["Sunucu Yedekleme"].durum, self.r["Sunucu Yedekleme"].fark), ("atil", 10))

    def test_ucretsiz_yazilim_yok_sayilir(self):
        self.assertFalse(any("vlc" in ad.lower() or "7-zip" in ad.lower() for ad in self.r))

    def test_karisik_olcut_uyarisi(self):
        env = [{"cihaz": "A", "kullanici": "u", "yazilim": "X"}]
        haklar = [{"yazilim": "X", "olcut": "cihaz", "adet": "1", "bitis": "", "sozlesme_no": "1"},
                  {"yazilim": "X", "olcut": "kullanici", "adet": "1", "bitis": "", "sozlesme_no": "2"}]
        s = lu.uzlastir(env, haklar, {}, BUGUN)[0]
        self.assertTrue(any("karışık ölçüt" in n for n in s.notlar))


class GirdiCiktiTestleri(unittest.TestCase):
    def test_bom_li_csv(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", encoding="utf-8-sig", delete=False) as f:
            f.write("cihaz,kullanici,yazilim\nPC-9,şule,Çizim Aracı\n")
        try:
            self.assertEqual(lu.csv_oku(f.name), [{"cihaz": "PC-9", "kullanici": "şule", "yazilim": "Çizim Aracı"}])
        finally:
            os.unlink(f.name)

    def test_komut_satiri(self):
        komut = [sys.executable, "-B", os.path.join(KOK, "lisans_uyum.py"), os.path.join(ORNEK, "envanter.csv"),
                 os.path.join(ORNEK, "haklar.csv"), "--eslesme", os.path.join(ORNEK, "eslesme.json"),
                 "--bugun", "2026-11-09"]
        s = subprocess.run(komut, capture_output=True, text=True, timeout=30)
        self.assertEqual(s.returncode, 1)  # eksik lisans var
        self.assertIn("| Windows 11 Pro | cihaz | 4 | 3 | EKSİK LİSANS | 1 |", s.stdout)
        j = subprocess.run(komut + ["--json"], capture_output=True, text=True, timeout=30)
        self.assertEqual({x["durum"] for x in json.loads(j.stdout)},
                         {"eksik", "atil", "uyumlu", "kayitsiz", "suresi_dolmus"})

    def test_uyumlu_ortam_sifir_doner(self):
        env = [{"cihaz": "A", "kullanici": "u", "yazilim": "X 1.0"}]
        haklar = [{"yazilim": "X", "olcut": "cihaz", "adet": "1", "bitis": "", "sozlesme_no": "1"}]
        self.assertFalse(lu.riskli(lu.uzlastir(env, haklar, {}, BUGUN)))


if __name__ == "__main__":
    unittest.main()
