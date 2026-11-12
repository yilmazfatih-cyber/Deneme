"""Aşama 4: metrikler, araç çağrısı ayrıştırma, ReACT döngüsü ve rapor."""

import unittest

import minifish as mf
from minifish.report import react_section
from tests.yardimci import kur


class Rapor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = kur(0).run(36)

    def test_metrikler_tutarli(self):
        m = mf.metrics(self.res)
        self.assertEqual(sum(m["eylem_sayisi"].values()), len(self.res.log))
        self.assertEqual(m["tur_sayisi"], 36)
        self.assertEqual(len(m["en_etkili"]), 3)
        self.assertGreaterEqual(m["en_etkili"][0]["etkilesim"], m["en_etkili"][1]["etkilesim"])

    def test_arac_cagrisi_ayristirma(self):
        text = 'düşünce <tool_call>{"name": "ara", "parameters": {"sorgu": "otopark"}}</tool_call> <tool_call>{bozuk}</tool_call>'
        self.assertEqual(mf.parse_tool_calls(text), [{"name": "ara", "parameters": {"sorgu": "otopark"}}])
        self.assertEqual(mf.parse_json('<think>...</think>```json\n{"a": 1}\n```'), {"a": 1})

    def test_react_dongusu(self):
        cevap, iz = react_section(mf.KuralliLLM(), self.res, "En etkili aktörü yorumla.")
        self.assertEqual([c["arac"] for c in iz], ["istatistik", "roportaj"])
        self.assertIn("Plana", cevap)

    def test_bilinmeyen_arac_ve_sinir(self):
        class Inatci:
            def complete(self, messages):
                return '<tool_call>{"name": "uydurma", "parameters": {}}</tool_call>'

        cevap, iz = react_section(Inatci(), self.res, "görev", max_tool_calls=2)
        self.assertEqual(len(iz), 3)
        self.assertIn("sınır", cevap)

    def test_rapor_bolumleri(self):
        ozet = mf.ensemble(lambda s: kur(s), range(3), 24)
        md = mf.write_report(self.res, llm=mf.KuralliLLM(), ensemble_summary=ozet)
        for baslik in ("## Özet", "## Etkili aktörler", "## Aktör görüşleri", "## Belirsizlik (topluluk)", "## Sınırlılıklar"):
            self.assertIn(baslik, md)


if __name__ == "__main__":
    unittest.main()
