"""Aşama 4 testleri: araç döngüsü, sınırlar, sabit sistem istemi ve uçtan uca öğrenme döngüsü."""

import json
import tempfile
import unittest
from pathlib import Path

from asama1_hafiza import SessionDB
from asama3_beceriler import SkillStore
from asama4_dongu import AIAgent, LLMResponse, ScriptedLLM, ToolCall, arac

BECERI = "---\nname: kdv-hesaplama\ndescription: KDV ve KDV dahil toplam hesaplama\n---\n1. KDV = tutar × oran\n"


class _Temel(unittest.TestCase):
    def setUp(self):
        self._gecici = tempfile.TemporaryDirectory()
        self.home = Path(self._gecici.name)
        self.db = SessionDB(self.home / "state.db")

    def tearDown(self):
        self.db.db.close()
        self._gecici.cleanup()


class DonguTest(_Temel):
    def test_arac_sonucu_modele_geri_doner(self):
        model = ScriptedLLM([arac("c1", "hesapla", ifade="6*7"), LLMResponse("Cevap 42.")])
        sonuc = AIAgent(model, self.home, self.db).run_conversation("6 kere 7?")
        self.assertEqual(sonuc["final_response"], "Cevap 42.")
        arac_mesaji = model.istekler[1]["messages"][-1]
        self.assertEqual((arac_mesaji["role"], json.loads(arac_mesaji["content"])), ("tool", {"sonuc": 42}))
        self.assertEqual([m["role"] for m in sonuc["messages"]], ["user", "assistant", "tool", "assistant"])

    def test_iterasyon_siniri(self):
        model = ScriptedLLM([arac(f"c{i}", "hesapla", ifade="1+1") for i in range(10)])
        sonuc = AIAgent(model, self.home, self.db, max_iterations=3).run_conversation("döngü")
        self.assertEqual(sonuc["api_calls"], 3)
        self.assertIn("iterasyon sınırı", sonuc["final_response"])

    def test_gosterilmeyen_arac_calistirilamaz(self):
        model = ScriptedLLM([arac("c1", "memory", action="add", content="x"), LLMResponse("tamam")])
        ajan = AIAgent(model, self.home, self.db, enabled_toolsets={"hesap"})
        sonuc = ajan.run_conversation("not al")
        self.assertIn("olmayan araç", sonuc["messages"][2]["content"])
        self.assertEqual(model.istekler[0]["tools"], ["hesapla"])

    def test_paralel_arac_cagrilari_sirayla_islenir(self):
        cift = LLMResponse(
            tool_calls=[ToolCall("a", "hesapla", {"ifade": "1+1"}), ToolCall("b", "hesapla", {"ifade": "2+2"})]
        )
        sonuc = AIAgent(ScriptedLLM([cift, LLMResponse("bitti")]), self.home, self.db).run_conversation("iki işlem")
        self.assertEqual([m.get("tool_call_id") for m in sonuc["messages"] if m["role"] == "tool"], ["a", "b"])

    def test_sistem_istemi_oturum_ortasinda_degismez(self):
        model = ScriptedLLM(
            [arac("c1", "memory", action="add", target="user", content="Adı Ayşe."), LLMResponse("Not aldım.")]
        )
        ajan = AIAgent(model, self.home, self.db)
        once = ajan.system_prompt
        ajan.chat("Benim adım Ayşe, bunu hatırla.")
        self.assertEqual(ajan.system_prompt, once)  # disk değişti, istem aynı (önbellek korunur)
        self.assertEqual(model.istekler[1]["messages"][0]["content"], once)
        self.assertIn("Adı Ayşe.", AIAgent(ScriptedLLM([]), self.home, self.db).system_prompt)  # yeni oturum görür

    def test_gecmis_ayni_oturumda_yeniden_yuklenir(self):
        ajan = AIAgent(ScriptedLLM([LLMResponse("Merhaba."), LLMResponse("Yine merhaba.")]), self.home, self.db)
        ajan.chat("selam")
        ajan.chat("tekrar selam")
        self.assertEqual(len(ajan.llm.istekler[1]["messages"]), 4)  # sistem + 2 kullanıcı + 1 asistan


class OgrenmeDongusuTest(_Temel):
    def test_is_beceri_olur_ve_sonraki_oturumda_kullanilir(self):
        # Oturum 1: üç model çağrısı → iters_since_skill = 3 ≥ eşik → gözden geçirme beceri yazar
        model = ScriptedLLM(
            [arac("c1", "hesapla", ifade="1000*0.2"), arac("c2", "hesapla", ifade="1000+200"), LLMResponse("1200 TL")]
        )
        gozden = ScriptedLLM(
            [
                arac("r1", "skill_manage", action="create", name="kdv-hesaplama", content=BECERI),
                LLMResponse("kaydettim"),
            ]
        )
        ajan1 = AIAgent(model, self.home, self.db, skill_nudge_interval=3, memory_nudge_interval=0, review_llm=gozden)
        self.assertTrue(ajan1.run_conversation("1000 TL için KDV dahil toplam?")["reviewed"])
        self.assertEqual(ajan1.iters_since_skill, 0)
        self.assertEqual(gozden.istekler[0]["tools"], ["skill_manage", "skill_view", "skills_list"])  # beyaz liste
        self.assertIn("hesapla", gozden.istekler[0]["messages"][-1]["content"])  # konuşmanın kopyası gitti
        self.assertEqual([s["name"] for s in SkillStore(self.home / "skills").list()], ["kdv-hesaplama"])
        self.assertNotIn("kdv-hesaplama", ajan1.system_prompt)  # mevcut oturumun istemi değişmedi

        # Oturum 2: yeni istem dizini içerir; model beceriyi okuyup uygular
        model2 = ScriptedLLM([arac("d1", "skill_view", name="kdv-hesaplama"), LLMResponse("600 TL")])
        ajan2 = AIAgent(model2, self.home, self.db)
        self.assertIn("kdv-hesaplama: KDV ve KDV dahil toplam hesaplama", ajan2.system_prompt)
        ajan2.chat("500 TL için?")
        okunan = json.loads(model2.istekler[1]["messages"][-1]["content"])
        self.assertIn("KDV = tutar × oran", okunan["content"])

    def test_esik_altinda_gozden_gecirme_yok(self):
        gozden = ScriptedLLM([])
        ajan = AIAgent(ScriptedLLM([LLMResponse("kısa cevap")]), self.home, self.db, review_llm=gozden)
        self.assertFalse(ajan.run_conversation("selam")["reviewed"])
        self.assertEqual(gozden.istekler, [])

    def test_ajan_kendisi_beceri_yazarsa_sayac_sifirlanir(self):
        model = ScriptedLLM(
            [arac("c1", "skill_manage", action="create", name="kdv-hesaplama", content=BECERI), LLMResponse("yazdım")]
        )
        ajan = AIAgent(model, self.home, self.db, skill_nudge_interval=2, review_llm=ScriptedLLM([]))
        sonuc = ajan.run_conversation("bu yöntemi beceri olarak kaydet")
        self.assertFalse(sonuc["reviewed"])  # 2 çağrı oldu ama skill_manage sayacı sıfırladı (1 < 2)

    def test_hafiza_durtmesi_ve_arka_plan_is_parcacigi(self):
        gozden = ScriptedLLM(
            [arac("m1", "memory", action="add", target="user", content="Kısa yanıt ister."), LLMResponse("ok")]
        )
        ajan = AIAgent(
            ScriptedLLM([LLMResponse("Tamam.")]), self.home, self.db, memory_nudge_interval=1, review_llm=gozden
        )
        from asama4_dongu import run_background_review

        run_background_review(ajan, [{"role": "user", "content": "kısa yaz"}], True, False, background=True)
        for is_parcacigi in ajan.review_threads:
            is_parcacigi.join(timeout=5)
        self.assertEqual(gozden.istekler[0]["tools"], ["memory"])
        self.assertIn("Kısa yanıt ister.", AIAgent(ScriptedLLM([]), self.home, self.db).system_prompt)


if __name__ == "__main__":
    unittest.main()
