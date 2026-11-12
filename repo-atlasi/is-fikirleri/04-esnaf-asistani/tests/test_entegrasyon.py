"""İsteğe bağlı gerçek entegrasyon: ESNAF_OLLAMA_MODEL tanımlı değilse ya da Ollama'ya ulaşılamıyorsa atlanır.

Örnek: ollama pull qwen2.5:7b && ESNAF_OLLAMA_MODEL=qwen2.5:7b python3 -m unittest tests.test_entegrasyon
"""

import os
import unittest

from esnaf.depo import Depo
from esnaf.ollama import ModelHatasi, OllamaAjani, ollama_adresi
from tests.yardimci import isletme

MODEL = os.environ.get("ESNAF_OLLAMA_MODEL")


@unittest.skipUnless(MODEL, "ESNAF_OLLAMA_MODEL tanımlı değil; gerçek model testi atlandı")
class GercekOllamaTesti(unittest.TestCase):
    def setUp(self):
        depo = Depo()
        self.addCleanup(depo.kapat)
        self.ajan = OllamaAjani(isletme(), depo, model=MODEL, taban_url=ollama_adresi(os.environ.get("OLLAMA_HOST")))
        try:
            self.ajan.denetle()  # POST /api/show: model yerel mi, araç destekli mi?
        except ModelHatasi as hata:
            if "ulaşılamadı" in str(hata):
                self.skipTest(f"Ollama çalışmıyor: {hata}")
            raise

    def test_model_yanit_ya_da_eylem_dondurur(self):
        metin, eylem = self.ajan.yanitla("Yarın sakal tıraşı için boş saatiniz var mı?")
        self.assertTrue(metin or eylem)


if __name__ == "__main__":
    unittest.main()
