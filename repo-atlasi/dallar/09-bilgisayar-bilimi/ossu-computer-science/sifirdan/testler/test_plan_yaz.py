import contextlib
import io
import tempfile
import unittest
from pathlib import Path

import plan_yaz

KOK = Path(__file__).resolve().parent.parent


class PlanYazTesti(unittest.TestCase):
    def test_ornek_plan_guncel(self) -> None:
        """Depodaki örnek plan, belgelenen komutla birebir yeniden üretilebilmeli (DIRECTORY.md gibi)."""
        with tempfile.TemporaryDirectory() as gecici:
            cikti = Path(gecici) / "plan.md"
            with contextlib.redirect_stdout(io.StringIO()):
                plan_yaz.main([str(KOK / "veri/turkce-12-ay.json"), "--saat", "15", "--cikti", str(cikti)])
            beklenen = (KOK / "ornek-plan-12-ay.md").read_text(encoding="utf-8")
            self.assertEqual(cikti.read_text(encoding="utf-8"), beklenen)

    def test_kutular_ve_karsilastirma(self) -> None:
        tampon = io.StringIO()
        with contextlib.redirect_stdout(tampon):
            plan_yaz.main([str(KOK / "veri/turkce-12-ay.json"), "--saat", "20"])
        metin = tampon.getvalue()
        self.assertIn("## Haftalık kontrol listesi", metin)
        self.assertGreater(metin.count("- [ ] "), 40)
        self.assertNotIn("- [x]", metin)

        tampon = io.StringIO()
        with contextlib.redirect_stdout(tampon):
            plan_yaz.main([str(KOK / "veri/ossu.json"), "--karsilastir", "10,20"])
        satirlar = tampon.getvalue().splitlines()
        self.assertEqual(len(satirlar), 4)
        self.assertTrue(satirlar[2].startswith("| 10 "))


if __name__ == "__main__":
    unittest.main()
