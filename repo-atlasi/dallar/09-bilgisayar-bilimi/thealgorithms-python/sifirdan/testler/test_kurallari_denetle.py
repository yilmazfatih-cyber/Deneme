import tempfile
import unittest
from pathlib import Path

from betikler import kurallari_denetle

IYI_MODUL = '''"""
Örnek. Kaynak: https://example.org/algoritma
"""


def ikiye_katla(sayi: int) -> int:
    """
    >>> ikiye_katla(2)
    4
    >>> ikiye_katla("a")
    Traceback (most recent call last):
        ...
    TypeError: tam sayı bekleniyordu
    """
    if not isinstance(sayi, int):
        raise TypeError("tam sayı bekleniyordu")
    return sayi * 2
'''

KOTU_MODUL = """def topla(a, b):
    print(a + b)
"""


class KuralDenetleyiciTesti(unittest.TestCase):
    def _depo(self, dosyalar: dict[str, str]) -> Path:
        gecici = tempfile.TemporaryDirectory()
        self.addCleanup(gecici.cleanup)
        kok = Path(gecici.name)
        for yol, icerik in dosyalar.items():
            (kok / yol).parent.mkdir(parents=True, exist_ok=True)
            (kok / yol).write_text(icerik, encoding="utf-8")
        return kok

    def test_temiz_depo_bulgu_vermez(self) -> None:
        kok = self._depo({"matematik/ikiye_katla.py": IYI_MODUL})
        self.assertEqual(kurallari_denetle.depoyu_denetle(kok), [])
        self.assertEqual(kurallari_denetle.main([str(kok)]), 0)

    def test_kotu_adlar_ve_kotu_icerik(self) -> None:
        kok = self._depo(
            {
                "Matematik/Topla.py": IYI_MODUL,
                "matematik/iki-kat.py": IYI_MODUL,
                "matematik/topla.py": KOTU_MODUL,
            }
        )
        kurallar = {(b.yol, b.kural) for b in kurallari_denetle.depoyu_denetle(kok)}
        self.assertIn(("Matematik/Topla.py", "AD-BUYUK"), kurallar)
        self.assertIn(("matematik/iki-kat.py", "AD-TIRE"), kurallar)
        for kural in ("IC-KAYNAK", "IC-DOCTEST", "IC-TIP", "IC-YANETKI", "IC-HATA"):
            self.assertIn(("matematik/topla.py", kural), kurallar)
        self.assertEqual(kurallari_denetle.main([str(kok)]), 1)

    def test_test_klasoru_icerik_kurallarindan_muaf(self) -> None:
        kok = self._depo({"testler/test_bir_sey.py": KOTU_MODUL})
        self.assertEqual(kurallari_denetle.depoyu_denetle(kok), [])

    def test_gercek_depo_temiz(self) -> None:
        self.assertEqual(kurallari_denetle.depoyu_denetle(), [])


if __name__ == "__main__":
    unittest.main()
