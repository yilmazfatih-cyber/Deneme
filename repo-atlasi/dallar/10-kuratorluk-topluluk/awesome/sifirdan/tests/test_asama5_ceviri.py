import unittest

from asama5_ceviri import dil_matrisi, eksikler, karsilastir

# free-programming-books docs/ klasöründen bir kesit (8bc5e37)
FPB_DOCS = [
    "CODE_OF_CONDUCT.md",
    "CODE_OF_CONDUCT-de.md",
    "CODE_OF_CONDUCT-tr.md",
    "CONTRIBUTING.md",
    "CONTRIBUTING-de.md",
    "CONTRIBUTING-fa_IR.md",
    "HOWTO.md",
    "HOWTO-de.md",
    "HOWTO-fa_IR.md",
    "HOWTO-tr.md",
    "README.md",
]

TEMEL = """# Başlık

## Neden?

Bu bölüm uzun bir açıklama cümlesi içerir ve çevrilmesi gerekir.

- [Bağlantı bir](https://a.example)
- [Bağlantı iki](https://b.example)

## Nasıl katılırım?

Katılım adımlarını anlatan ikinci uzun açıklama cümlesi burada.
"""


class DilMatrisiTesti(unittest.TestCase):
    def test_ad_ve_dil_ayrisir(self):
        matris = dil_matrisi(FPB_DOCS)
        self.assertEqual(matris["HOWTO"], {"en", "de", "fa_IR", "tr"})
        self.assertNotIn("README", matris)

    def test_turkce_contributing_eksik(self):
        eksik = eksikler(dil_matrisi(FPB_DOCS))
        self.assertEqual(eksik["tr"], ["CONTRIBUTING"])
        self.assertEqual(eksik["fa_IR"], ["CODE_OF_CONDUCT"])
        self.assertNotIn("de", eksik)


class KarsilastirmaTesti(unittest.TestCase):
    def test_tam_ceviri_uyari_vermez(self):
        ceviri = TEMEL.replace("Başlık", "Title").replace("Neden?", "Why?").replace("Nasıl katılırım?", "How?")
        ceviri = ceviri.replace("Bu bölüm uzun bir açıklama cümlesi içerir ve çevrilmesi gerekir.", "Translated long sentence one, done.")
        ceviri = ceviri.replace("Katılım adımlarını anlatan ikinci uzun açıklama cümlesi burada.", "Translated long sentence two, done.")
        ceviri = ceviri.replace("Bağlantı", "Link")
        self.assertEqual(karsilastir(TEMEL, ceviri)["uyarilar"], [])

    def test_eksik_bolum_ve_cevrilmemis_satir(self):
        eksik = "\n".join(TEMEL.splitlines()[:8])  # ikinci bölüm yok, metin çevrilmemiş
        rapor = karsilastir(TEMEL, eksik)
        self.assertEqual(rapor["temel"]["baslik"], 3)
        self.assertEqual(rapor["ceviri"]["baslik"], 2)
        self.assertEqual(len(rapor["uyarilar"]), 2)
        self.assertTrue(any("başlık" in u for u in rapor["uyarilar"]))
        self.assertTrue(any("çevrilmemiş" in u for u in rapor["uyarilar"]))


if __name__ == "__main__":
    unittest.main()
