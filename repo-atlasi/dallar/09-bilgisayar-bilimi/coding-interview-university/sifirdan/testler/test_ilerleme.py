import contextlib
import doctest
import io
import json
import unittest
from pathlib import Path

import ilerleme

KOK = Path(__file__).resolve().parent.parent
ORNEK = KOK / "ornekler" / "ornek-ilerleme.md"
OSSU_PLANI = KOK.parent.parent / "ossu-computer-science" / "sifirdan" / "ornek-plan-12-ay.md"


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    tests.addTests(doctest.DocTestSuite(ilerleme))
    return tests


def _calistir(*argumanlar: str) -> str:
    tampon = io.StringIO()
    with contextlib.redirect_stdout(tampon):
        ilerleme.main(list(argumanlar))
    return tampon.getvalue()


class IlerlemeTesti(unittest.TestCase):
    def setUp(self) -> None:
        self.maddeler = ilerleme.maddeleri_oku(ORNEK.read_text(encoding="utf-8"))

    def test_bolum_ozetleri(self) -> None:
        ozetler = {o.baslik: (o.biten, o.toplam) for o in ilerleme.ozetle(self.maddeler)}
        self.assertEqual(
            ozetler,
            {"Algoritma karmaşıklığı": (2, 2), "Veri yapıları": (3, 7), "Sıralama": (1, 2)},
        )

    def test_kod_blogundaki_kutu_sayilmaz(self) -> None:
        self.assertFalse(any("kod bloğunda" in m.metin for m in self.maddeler))

    def test_liste_ici_basliklar_ve_yapraklar(self) -> None:
        derin = ilerleme.maddeleri_oku(ORNEK.read_text(encoding="utf-8"), seviye=3)
        ozetler = {o.baslik: (o.biten, o.toplam) for o in ilerleme.ozetle(derin, yalniz_yapraklar=True)}
        self.assertEqual(ozetler["Diziler"], (2, 4), "özet madde (vektör yaz:) sayılmamalı")
        self.assertEqual(ozetler["Bağlı listeler"], (0, 2))

    def test_sonraki_maddeler_belge_sirasinda(self) -> None:
        sonraki = [m.metin for m in ilerleme.sonraki_maddeler(self.maddeler, 2)]
        beklenen = [
            "insert(index, item), delete(index)",
            "resize: doluysa ikiye katla, dörtte bire inince yarıya indir",
        ]
        self.assertEqual(sonraki, beklenen)

    def test_json_cikti(self) -> None:
        veri = json.loads(_calistir(str(ORNEK), "--json", "--sonraki", "1"))
        self.assertEqual(sum(b["toplam"] for b in veri["bolumler"]), 11)
        self.assertEqual(len(veri["sonraki"]), 1)
        self.assertEqual(veri["bolumler"][0]["oran"], 1.0)

    def test_metin_rapor(self) -> None:
        rapor = _calistir(str(ORNEK), "--sonraki", "0")
        self.assertIn("TOPLAM", rapor)
        self.assertIn("6/11", rapor)
        self.assertNotIn("Sıradaki", rapor)

    @unittest.skipUnless(OSSU_PLANI.exists(), "OSSU örnek planı yok")
    def test_ossu_plan_ciktisini_okur(self) -> None:
        """plan_yaz.py çıktısı bu araçla sayılabilir: iki araç dosya biçimi üzerinden konuşur."""
        maddeler = ilerleme.maddeleri_oku(OSSU_PLANI.read_text(encoding="utf-8"), seviye=3)
        haftalar = ilerleme.ozetle(maddeler)
        self.assertGreaterEqual(len(haftalar), 52)
        self.assertTrue(all(h.biten == 0 for h in haftalar))
        self.assertTrue(haftalar[0].baslik.startswith("1. hafta"))


if __name__ == "__main__":
    unittest.main()
