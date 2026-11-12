"""Aşama 2: persona üretimi (LLM ve yedek kurallar) ve izleme grafiği."""

import unittest

import minifish as mf
from minifish.persona import from_llm
from tests.yardimci import ILISKILER, VARLIKLAR, BozukLLM


class Persona(unittest.TestCase):
    def test_llm_yolu_citli_json_ayristirilir(self):
        a = from_llm(VARLIKLAR["Selin Yurt"], 0, mf.KuralliLLM())
        self.assertIn("Selin Yurt", a.bio)
        self.assertTrue(0 <= a.activity_level <= 1 and 0 <= a.openness <= 1)

    def test_bozuk_llm_kural_tabanli_yedege_duser(self):
        a = from_llm(VARLIKLAR["Kıyı Postası"], 0, BozukLLM())
        self.assertEqual((a.activity_level, a.influence), (0.9, 3.0))  # MediaOutlet varsayılanları

    def test_sakinler_deterministik(self):
        a = mf.build_agents(VARLIKLAR, n_citizens=10, seed=3)
        b = mf.build_agents(VARLIKLAR, n_citizens=10, seed=3)
        self.assertEqual([x.stance for x in a], [x.stance for x in b])
        self.assertEqual(len(a), len(VARLIKLAR) + 10)
        self.assertFalse(a[-1].named)

    def test_herkes_medyayi_izler(self):
        agents = mf.build_agents(VARLIKLAR, n_citizens=5)
        graph = mf.build_follow_graph(agents, ILISKILER)
        medya = next(a.agent_id for a in agents if a.type == "MediaOutlet")
        self.assertTrue(all(medya in f for aid, f in graph.items() if aid != medya))


if __name__ == "__main__":
    unittest.main()
