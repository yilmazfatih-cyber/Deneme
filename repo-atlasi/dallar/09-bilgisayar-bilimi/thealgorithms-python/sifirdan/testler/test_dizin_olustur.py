import tempfile
import unittest
from pathlib import Path

from betikler import dizin_olustur


def _sahte_depo(kok: Path, dosyalar: list[str]) -> None:
    for yol in dosyalar:
        hedef = kok / yol
        hedef.parent.mkdir(parents=True, exist_ok=True)
        hedef.write_text('"""x"""\n', encoding="utf-8")


class DizinOlusturTesti(unittest.TestCase):
    def test_atlanan_klasorler_ve_dosyalar(self) -> None:
        with tempfile.TemporaryDirectory() as gecici:
            kok = Path(gecici)
            _sahte_depo(
                kok,
                [
                    "arama/ikili_arama.py",
                    "arama/__init__.py",
                    "betikler/yardimci.py",
                    ".gizli/x.py",
                    "_ozel/y.py",
                    "venv/lib/z.py",
                    "notlar/okuma.txt",
                ],
            )
            self.assertEqual(dizin_olustur.algoritma_dosyalari(kok), ["arama/ikili_arama.py"])

    def test_ic_ice_klasorler_girintili_listelenir(self) -> None:
        with tempfile.TemporaryDirectory() as gecici:
            kok = Path(gecici)
            _sahte_depo(kok, ["matematik/asal_sayilar/elek.py", "matematik/ebob.py", "kok_dosyasi.py"])
            metin = dizin_olustur.dizin_metni(kok)
            self.assertIn("1. [Matematik](#matematik)", metin)
            self.assertIn("## [Matematik](matematik)", metin)
            self.assertIn("- Asal Sayilar\n  - [Elek](matematik/asal_sayilar/elek.py)", metin)
            self.assertIn("- [Ebob](matematik/ebob.py)", metin)
            # Klasör dışındaki dosya dizine girmez (kural denetleyicisi ayrıca uyarır).
            self.assertNotIn("kok_dosyasi", metin)

    def test_turkce_basliklar(self) -> None:
        self.assertEqual(dizin_olustur.baslik_yap("ikili_arama.py"), "İkili Arama")
        # ASCII dosya adında "ö" olamaz; sözlük olmadan başlık "Ornek" kalır.
        self.assertEqual(dizin_olustur.baslik_yap("ilk_ornek"), "İlk Ornek")
        self.assertNotEqual("ikili arama".title(), "İkili Arama")
        self.assertEqual(dizin_olustur.capa_yap("Genişlik Öncelikli Arama"), "genişlik-öncelikli-arama")

    def test_kontrol_modu_eski_dosyayi_yakalar(self) -> None:
        with tempfile.TemporaryDirectory() as gecici:
            kok = Path(gecici)
            _sahte_depo(kok, ["arama/ikili_arama.py"])
            self.assertEqual(dizin_olustur.main(["--kok", gecici]), 0)
            self.assertEqual(dizin_olustur.main(["--kok", gecici, "--kontrol"]), 0)
            _sahte_depo(kok, ["arama/dogrusal_arama.py"])
            self.assertEqual(dizin_olustur.main(["--kok", gecici, "--kontrol"]), 1)

    def test_depodaki_directory_md_guncel(self) -> None:
        """CI'daki directory_writer adımının karşılığı: işlenmiş dosya üretilenle aynı olmalı."""
        mevcut = (dizin_olustur.KOK / dizin_olustur.DIZIN_DOSYASI).read_text(encoding="utf-8")
        self.assertEqual(mevcut, dizin_olustur.dizin_metni())


if __name__ == "__main__":
    unittest.main()
