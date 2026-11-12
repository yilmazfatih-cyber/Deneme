import unittest
from pathlib import Path

from mufredat import Ders, DonguHatasi, MufredatHatasi, dersten, dogrula, topolojik_sira, toplam_saat, yukle

VERI = Path(__file__).resolve().parent.parent / "veri"


class DogrulamaTesti(unittest.TestCase):
    def test_yinelenen_kimlik(self) -> None:
        with self.assertRaisesRegex(MufredatHatasi, "yinelenen"):
            dogrula([Ders("a", "A", 1), Ders("a", "A2", 1)])

    def test_bilinmeyen_onkosul(self) -> None:
        with self.assertRaisesRegex(MufredatHatasi, "bilinmeyen önkoşul: z"):
            dogrula([Ders("a", "A", 1, ("z",))])

    def test_dongu_yolu_raporlanir(self) -> None:
        dersler = [Ders("a", "A", 1, ("c",)), Ders("b", "B", 1, ("a",)), Ders("c", "C", 1, ("b",))]
        with self.assertRaises(DonguHatasi) as baglam:
            dogrula(dersler)
        dongu = baglam.exception.dongu
        self.assertEqual(dongu[0], dongu[-1])
        self.assertEqual(set(dongu), {"a", "b", "c"})

    def test_sure_hesabi_ve_gecersiz_sure(self) -> None:
        self.assertEqual(dersten({"kimlik": "x", "ad": "X", "hafta": 13, "saat_min": 5, "saat_max": 10}).saat, 97.5)
        with self.assertRaises(MufredatHatasi):
            dersten({"kimlik": "x", "ad": "X", "saat": 0})


class TopolojikSiraTesti(unittest.TestCase):
    def test_onkosullar_once_gelir_zorunlu_secmeliden_once(self) -> None:
        dersler = [
            Ders("secmeli-giris", "S", 5, secmeli=True),
            Ders("ileri", "İ", 5, ("temel", "mat")),
            Ders("temel", "T", 5),
            Ders("mat", "M", 5),
        ]
        sira = [d.kimlik for d in topolojik_sira(dersler)]
        self.assertEqual(sira, ["temel", "mat", "ileri", "secmeli-giris"])

    def test_ossu_verisi(self) -> None:
        baslik, dersler = yukle(VERI / "ossu.json")
        self.assertIn("OSSU", baslik)
        self.assertEqual(len(dersler), 30)
        self.assertAlmostEqual(toplam_saat(dersler), 1697.5)
        sira = [d.kimlik for d in topolojik_sira(dersler)]
        for once, sonra in [("calc-1c", "math-for-cs"), ("math-for-cs", "algo-1"), ("nand2tetris-2", "ostep")]:
            self.assertLess(sira.index(once), sira.index(sonra))

    def test_turkce_plan_verisi(self) -> None:
        _, dersler = yukle(VERI / "turkce-12-ay.json")
        self.assertEqual(toplam_saat(dersler, secmeliler_dahil=False), 755)
        self.assertTrue(all(d.kulvar in {"algoritma", "matematik-sistem"} for d in dersler))
        self.assertTrue(all(d.dugumler for d in dersler), "her ders bir gövde düğümüne bağlanmalı")


if __name__ == "__main__":
    unittest.main()
