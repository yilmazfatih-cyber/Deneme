import unittest
from pathlib import Path

from mufredat import Ders, topolojik_sira, yukle
from takvim import haftalik_plan, zorunlu_bitis_haftasi

VERI = Path(__file__).resolve().parent.parent / "veri"


class TakvimTesti(unittest.TestCase):
    def test_iki_bagimsiz_ders_paralel_yurur(self) -> None:
        plan = haftalik_plan([Ders("a", "A", 10), Ders("b", "B", 10)], haftalik_saat=10, paralel=2)
        self.assertEqual(plan.hafta_sayisi, 2)
        self.assertEqual(plan.haftalar[0].dagilim, {"a": 5, "b": 5})

    def test_onkosul_bir_sonraki_haftayi_bekler(self) -> None:
        plan = haftalik_plan([Ders("a", "A", 5), Ders("b", "B", 5, ("a",))], haftalik_saat=10, paralel=2)
        self.assertEqual(plan.haftalar[0].dagilim, {"a": 5})
        self.assertEqual(plan.ilk_hafta["b"], 2)

    def test_su_doldurma_artan_yuruyen_derse_gecer(self) -> None:
        dersler = [Ders("kisa", "K", 2), Ders("uzun", "U", 20), Ders("ucuncu", "Ü", 20)]
        plan = haftalik_plan(dersler, haftalik_saat=10, paralel=2)
        self.assertEqual(plan.haftalar[0].dagilim, {"kisa": 2, "uzun": 8})
        self.assertEqual(plan.ilk_hafta["ucuncu"], 2)

    def test_yuruyenlerin_hepsi_bitince_yer_ayni_hafta_dolar(self) -> None:
        dersler = [Ders("a", "A", 2), Ders("b", "B", 3), Ders("c", "C", 20)]
        plan = haftalik_plan(dersler, haftalik_saat=10, paralel=2)
        self.assertEqual(plan.haftalar[0].dagilim, {"a": 2, "b": 3, "c": 5})
        self.assertEqual(plan.ilk_hafta["c"], 1)

    def test_kulvarlar_kendi_derslerini_tasir(self) -> None:
        dersler = [
            Ders("a1", "A1", 10, kulvar="algoritma"),
            Ders("a2", "A2", 10, kulvar="algoritma"),
            Ders("m1", "M1", 10, kulvar="matematik"),
        ]
        plan = haftalik_plan(dersler, haftalik_saat=10, paralel=5)
        self.assertEqual(plan.paralel, 2, "kulvar sayısı paralel sınırını belirler")
        self.assertEqual(plan.haftalar[0].dagilim, {"a1": 5, "m1": 5})
        self.assertEqual(plan.ilk_hafta["a2"], 3)

    def test_secmeli_zorunlulardan_sonra(self) -> None:
        dersler = [Ders("z", "Z", 20), Ders("s", "S", 5, secmeli=True)]
        self.assertEqual(haftalik_plan(dersler, 10, 2).ilk_hafta["s"], 3)
        self.assertEqual(haftalik_plan(dersler, 10, 2, secmeliler_sona=False).ilk_hafta["s"], 1)

    def test_gecersiz_butce(self) -> None:
        with self.assertRaises(ValueError):
            haftalik_plan([Ders("a", "A", 1)], haftalik_saat=0)

    def test_turkce_12_aylik_plan_degismezleri(self) -> None:
        _, dersler = yukle(VERI / "turkce-12-ay.json")
        sira = topolojik_sira(dersler)
        plan = haftalik_plan(sira, haftalik_saat=15)
        self.assertLessEqual(zorunlu_bitis_haftasi(plan, sira), 52)
        for hafta in plan.haftalar:
            self.assertLessEqual(hafta.toplam, 15 + 1e-6)
        for ders in sira:
            verilen = sum(h.dagilim.get(ders.kimlik, 0) for h in plan.haftalar)
            self.assertAlmostEqual(verilen, ders.saat)
            for once in ders.onkosullar:
                self.assertGreater(plan.ilk_hafta[ders.kimlik], plan.son_hafta[once], f"{ders.kimlik} <- {once}")


if __name__ == "__main__":
    unittest.main()
