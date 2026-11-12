"""Aşama 1 testleri: bayt düzeyinde BPE."""

import os
import tempfile
import unittest

from minitransformers import AutoTokenizer, ByteLevelBPETokenizer

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(KOK, "veri", "turkce.txt"), encoding="utf-8") as f:
    METIN = f.read()


class BPETesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tok = ByteLevelBPETokenizer.train([METIN], vocab_size=400)

    def test_gidis_donus_turkce_ve_bilinmeyen_karakterler(self):
        for s in [
            "İstanbul'da ılık bir sabah; ŞEMSİYE, ğ, ü, ö, ç!",
            "Görülmemiş harfler: ẞ, ñ, 漢字 ve emoji 🙂",
            "  çoklu   boşluk\n\tsekme ve 2026 sayısı  ",
            "",
        ]:
            self.assertEqual(self.tok.decode(self.tok.encode(s)), s)

    def test_sozluk_boyutu_ve_sikistirma(self):
        self.assertEqual(self.tok.vocab_size, 400)
        ids = self.tok.encode(METIN)
        self.assertLess(len(ids), 0.6 * len(METIN.encode("utf-8")))  # birleştirmeler işe yarıyor

    def test_ozel_belirtec_tek_kimlik(self):
        ids = self.tok.encode("çay<|endoftext|>simit")
        self.assertIn(self.tok.eos_token_id, ids)
        self.assertEqual(ids.count(self.tok.eos_token_id), 1)
        self.assertEqual(self.tok.decode(ids, skip_special_tokens=True), "çaysimit")

    def test_egitim_deterministik(self):
        diger = ByteLevelBPETokenizer.train([METIN], vocab_size=400)
        self.assertEqual(diger.merges, self.tok.merges)

    def test_kaydet_yukle_ve_auto(self):
        with tempfile.TemporaryDirectory() as d:
            self.tok.save_pretrained(d)
            yuklenen = AutoTokenizer.from_pretrained(d)
        self.assertIsInstance(yuklenen, ByteLevelBPETokenizer)
        self.assertEqual(yuklenen.encode(METIN), self.tok.encode(METIN))


if __name__ == "__main__":
    unittest.main()
