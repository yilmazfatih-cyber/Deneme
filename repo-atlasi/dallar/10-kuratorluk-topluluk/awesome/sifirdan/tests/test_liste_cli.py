import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import liste
from tests.yerel_sunucu import YerelSunucu

KOK = Path(__file__).resolve().parent.parent


def calistir(*argv: str) -> tuple[int, str, str]:
    cikti, hata = io.StringIO(), io.StringIO()
    with redirect_stdout(cikti), redirect_stderr(hata):
        kod = liste.main(list(argv))
    return kod, cikti.getvalue(), hata.getvalue()


class CliTesti(unittest.TestCase):
    def setUp(self):
        self._gecici = tempfile.TemporaryDirectory()
        self.klasor = Path(self._gecici.name)

    def tearDown(self):
        self._gecici.cleanup()

    def test_denetle_bozuk_liste_1_doner(self):
        kod, cikti, hata = calistir("denetle", str(KOK / "ornekler" / "bozuk-liste.txt"), "--yerel", "tr")
        self.assertEqual(kod, 1)
        self.assertIn("guvensiz-sema", cikti)
        self.assertIn("hata", hata)

    def test_denetle_json(self):
        kod, cikti, _ = calistir("denetle", str(KOK / "ornekler" / "bozuk-liste.txt"), "--yerel", "tr", "--json")
        self.assertEqual(kod, 1)
        self.assertTrue(all({"kural", "satir", "mesaj", "onem"} <= set(b) for b in json.loads(cikti)))

    def test_uret_ve_tazelik_denetimi(self):
        veri, readme = KOK / "ornekler" / "turkce-kaynaklar.json", self.klasor / "README.md"
        self.assertEqual(calistir("uret", str(veri), "-o", str(readme))[0], 0)
        self.assertEqual(calistir("denetle", str(readme), "--yerel", "tr")[0], 0)
        self.assertEqual(calistir("uret", str(veri), "-o", str(readme), "--denetle")[0], 0)
        readme.write_text(readme.read_text("utf-8") + "- elle eklenen satır\n", "utf-8")
        kod, cikti, _ = calistir("uret", str(veri), "-o", str(readme), "--denetle")
        self.assertEqual(kod, 1)
        self.assertIn("-- elle eklenen satır", cikti)

    def test_uret_bozuk_veri(self):
        bozuk = self.klasor / "bozuk.json"
        bozuk.write_text(json.dumps({"baslik": "X", "aciklama": "Y.", "kategoriler": []}), "utf-8")
        kod, _, hata = calistir("uret", str(bozuk))
        self.assertEqual(kod, 1)
        self.assertIn("kategoriler", hata)

    def test_baglanti_ve_durum_dosyasi(self):
        with YerelSunucu() as sunucu:
            readme = self.klasor / "README.md"
            readme.write_text(
                f"## A\n\n- [Ölü]({sunucu.adres('/yok')}) - Ölü.\n- [Sağlam]({sunucu.adres('/tamam')}) - Sağlam.\n",
                "utf-8",
            )
            durum = self.klasor / "durum.json"
            for gun in ("2026-11-02", "2026-11-09"):
                kod, cikti, hata = calistir("baglanti", str(readme), "--durum", str(durum), "--bugun", gun)
            self.assertEqual(kod, 1)
            self.assertIn("OLU", cikti)
            self.assertIn("KALDIRMA ADAYI", hata)
            kayitlar = json.loads(durum.read_text("utf-8"))
            self.assertEqual(kayitlar[sunucu.adres("/yok")]["ardisik_hata"], 2)

    def test_ceviri_matrisi(self):
        for ad in ("HOWTO.md", "HOWTO-tr.md", "CONTRIBUTING.md", "CONTRIBUTING-de.md", "HOWTO-de.md"):
            (self.klasor / ad).write_text("# x\n", "utf-8")
        kod, cikti, _ = calistir("ceviri", "--matris", str(self.klasor))
        self.assertEqual(kod, 0)
        self.assertIn("tr", cikti)
        self.assertIn("CONTRIBUTING", cikti)


if __name__ == "__main__":
    unittest.main()
