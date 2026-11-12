"""
Ortak test bataryası: TheAlgorithms/Python'daki `tests/test_sorts.py` fikri.
Her sıralama aynı sözleşmeye uyar ("girdinin sıralı bir kopyasını döndür,
girdiyi değiştirme"), bu yüzden tek bir girdi listesini hepsine uygularız.
"""

import random
import unittest

from siralama.birlestirme_siralamasi import birlestirme_siralamasi
from siralama.ekleme_siralamasi import ekleme_siralamasi

SIRALAMALAR = {
    "birlestirme": birlestirme_siralamasi,
    "ekleme": ekleme_siralamasi,
}

_uretec = random.Random(2026)
GIRDILER = [
    [],
    [1],
    [2, 1],
    [3, 3, 3],
    list(range(20)),
    list(range(20, 0, -1)),
    [0.5, -1, 2, -1.5, 0],
    ["ı", "i", "I", "İ", "ş", "s"],
    [_uretec.randint(-100, 100) for _ in range(200)],
]


class SiralamaBataryasi(unittest.TestCase):
    def test_sorted_ile_ayni_sonuc(self) -> None:
        for ad, sirala in SIRALAMALAR.items():
            for girdi in GIRDILER:
                with self.subTest(siralama=ad, girdi=girdi[:5]):
                    self.assertEqual(sirala(girdi), sorted(girdi))

    def test_girdiyi_degistirmez(self) -> None:
        for ad, sirala in SIRALAMALAR.items():
            girdi = [5, 1, 4]
            with self.subTest(siralama=ad):
                sirala(girdi)
                self.assertEqual(girdi, [5, 1, 4])

    def test_kararlilik(self) -> None:
        # Kayıtları yalnızca puana göre karşılaştıran bir sarmalayıcıyla eşit anahtarların sırasını izleriz.
        class Kayit:
            def __init__(self, puan: int, ad: str) -> None:
                self.puan, self.ad = puan, ad

            def __lt__(self, diger: "Kayit") -> bool:
                return self.puan < diger.puan

            def __le__(self, diger: "Kayit") -> bool:
                return self.puan <= diger.puan

            def __gt__(self, diger: "Kayit") -> bool:
                return self.puan > diger.puan

        kayitlar = [Kayit(2, "Ayşe"), Kayit(1, "Can"), Kayit(2, "Deniz"), Kayit(1, "Ece")]
        for ad, sirala in SIRALAMALAR.items():
            with self.subTest(siralama=ad):
                self.assertEqual([k.ad for k in sirala(kayitlar)], ["Can", "Ece", "Ayşe", "Deniz"])


if __name__ == "__main__":
    unittest.main()
