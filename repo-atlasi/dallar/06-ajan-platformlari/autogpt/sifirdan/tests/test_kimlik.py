"""Aşama 4 testleri: kimlik referansı → gizli değer çözümü, sızıntı yok, sahiplik ve sağlayıcı denetimi."""

import unittest

from asama3_yurutucu import ExecutionStatus, ExecutionStore, Executor
from asama4_kimlik import CredentialsStore, FakeLLM, LLMCallBlock, Secret
from tests.yardimci import CIKIS, GIRIS, graf

GIZLI = "sk-test-cok-gizli-123"


def llm_grafi(meta):
    return graf(
        [
            ("g", GIRIS, {"name": "metin"}),
            ("l", LLMCallBlock.id, {"credentials": meta}),
            ("c", CIKIS, {"name": "ozet"}),
        ],
        [("g", "result", "l", "prompt"), ("l", "response", "c", "value")],
    )


class KimlikTest(unittest.TestCase):
    def setUp(self):
        self.kimlikler = CredentialsStore()
        self.anahtar = self.kimlikler.add("ayse", "fake_llm", GIZLI, title="Test anahtarı")
        self.llm = FakeLLM(GIZLI)
        self.store = ExecutionStore()
        self.yurutucu = Executor(self.store, credentials_resolver=self.kimlikler.resolver, services={"llm": self.llm})

    def test_gizli_deger_repr_icinde_gorunmez(self):
        self.assertNotIn(GIZLI, repr(self.anahtar))
        self.assertNotIn(GIZLI, str(Secret(GIZLI)))
        self.assertNotIn(GIZLI, str(self.kimlikler.list_meta("ayse")))  # değerin kendisini ara

    def test_blok_anahtari_cozulmus_olarak_alir(self):
        sonuc = self.yurutucu.run(llm_grafi(self.anahtar.meta()), {"metin": "Uzun bir rapor metni"}, user_id="ayse")
        self.assertEqual(sonuc.status, ExecutionStatus.COMPLETED)
        self.assertEqual(sonuc.outputs["ozet"], ["[özet] Uzun bir rapor metni"])
        self.assertEqual(self.llm.cagrilar, ["Uzun bir rapor metni"])

    def test_gizli_deger_yurutme_kayitlarina_yazilmaz(self):
        self.yurutucu.run(llm_grafi(self.anahtar.meta()), {"metin": "x"}, user_id="ayse")
        dokum = "\n".join(self.store.db.iterdump())
        self.assertNotIn(GIZLI, dokum)
        self.assertIn(self.anahtar.id, dokum)  # yalnızca referans (id) durur

    def test_baskasinin_kimligi_kullanilamaz(self):
        sonuc = self.yurutucu.run(llm_grafi(self.anahtar.meta()), {"metin": "x"}, user_id="mehmet")
        self.assertEqual(sonuc.status, ExecutionStatus.FAILED)
        self.assertIn("size ait değil", sonuc.errors["l"])
        self.assertEqual(self.llm.cagrilar, [])

    def test_saglayici_uyusmazligi_reddedilir(self):
        baska = self.kimlikler.add("ayse", "baska_saglayici", "x")
        sonuc = self.yurutucu.run(llm_grafi(baska.meta()), {"metin": "x"}, user_id="ayse")
        self.assertIn("fake_llm beklenirken", sonuc.errors["l"])

    def test_kimliksiz_graf_calistirilamaz(self):
        from asama2_graf import GraphValidationError

        g = graf([("g", GIRIS, {"name": "metin"}), ("l", LLMCallBlock.id, {})], [("g", "result", "l", "prompt")])
        with self.assertRaises(GraphValidationError):
            self.yurutucu.run(g, {"metin": "x"}, user_id="ayse")


if __name__ == "__main__":
    unittest.main()
