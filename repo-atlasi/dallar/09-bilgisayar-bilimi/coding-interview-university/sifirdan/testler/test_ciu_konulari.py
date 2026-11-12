"""veri/ciu-konulari.json'ın, OSSU plan motorunun beklediği biçimde ve döngüsüz olduğunu denetler."""

import json
import unittest
from pathlib import Path

VERI = Path(__file__).resolve().parent.parent / "veri" / "ciu-konulari.json"


class CiuKonulariTesti(unittest.TestCase):
    def setUp(self) -> None:
        self.dersler = json.loads(VERI.read_text(encoding="utf-8"))["dersler"]
        self.kimlikler = [d["kimlik"] for d in self.dersler]

    def test_alanlar_ve_benzersiz_kimlik(self) -> None:
        self.assertEqual(len(self.kimlikler), len(set(self.kimlikler)))
        for ders in self.dersler:
            with self.subTest(ders=ders["kimlik"]):
                self.assertGreater(ders["saat"], 0)
                self.assertTrue(ders["ad"])

    def test_onkosullar_var_ve_dongu_yok(self) -> None:
        onkosul = {d["kimlik"]: d["onkosullar"] for d in self.dersler}
        for kimlik, liste in onkosul.items():
            for once in liste:
                self.assertIn(once, onkosul, f"{kimlik}: bilinmeyen önkoşul {once}")
        # Kahn algoritmasının en kısa hâli: her turda önkoşulu kalmayanları çıkar.
        kalan = dict(onkosul)
        while kalan:
            hazir = [k for k, liste in kalan.items() if not set(liste) & kalan.keys()]
            self.assertTrue(hazir, f"döngü var: {sorted(kalan)}")
            for kimlik in hazir:
                del kalan[kimlik]

    def test_ciu_sirasi_korunur(self) -> None:
        # CIU'nun "baştan sona sırayla" önerisi: her önkoşul listede kendisinden önce gelir.
        for indeks, ders in enumerate(self.dersler):
            for once in ders["onkosullar"]:
                self.assertLess(self.kimlikler.index(once), indeks, f"{once} -> {ders['kimlik']}")


if __name__ == "__main__":
    unittest.main()
