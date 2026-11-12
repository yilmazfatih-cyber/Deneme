"""Aşama 6 testleri: zaman ifadeleri, sonraki çalışma, tick'in en fazla bir kez çalıştırması ve teslim."""

import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from asama1_hafiza import SessionDB
from asama4_dongu import AIAgent, LLMResponse, ScriptedLLM, arac
from asama6_zamanlayici import CronScheduler, JobStore, compute_next_run, parse_schedule


class PlanTest(unittest.TestCase):
    def test_bicimler(self):
        self.assertEqual(parse_schedule("30m"), {"kind": "interval", "seconds": 1800})
        self.assertEqual(parse_schedule("every 2h")["seconds"], 7200)
        self.assertEqual(parse_schedule("0 9 * * 1-5")["fields"][4], [1, 2, 3, 4, 5])
        self.assertEqual(parse_schedule("2026-11-10T09:00:00Z")["at"], "2026-11-10T09:00:00")
        for kotu in ["yarın sabah", "61 * * * *", "*/0 * * * *"]:
            with self.subTest(kotu=kotu), self.assertRaises(ValueError):
                parse_schedule(kotu)

    def test_sonraki_calisma(self):
        cuma = datetime(2026, 11, 13, 9, 0)
        self.assertEqual(compute_next_run(parse_schedule("0 9 * * 1-5"), cuma), datetime(2026, 11, 16, 9, 0))
        self.assertIsNone(compute_next_run(parse_schedule("2026-11-01T00:00:00"), cuma))  # geçmişte kaldı


class SchedulerTest(unittest.TestCase):
    def setUp(self):
        self._gecici = tempfile.TemporaryDirectory()
        self.home = Path(self._gecici.name)
        self.db = SessionDB()
        self.store = JobStore(self.home)
        self.teslimler = []
        self.ajanlar = []

        def fabrika(is_):
            ajan = AIAgent(
                ScriptedLLM([LLMResponse(f"çıktı: {is_['name']}")]),
                self.home,
                self.db,
                platform="cron",
                skip_memory=True,
            )
            self.ajanlar.append(ajan)
            return ajan

        self.zamanlayici = CronScheduler(self.store, fabrika, lambda p, c, m: self.teslimler.append((p, c, m)) or True)

    def tearDown(self):
        self._gecici.cleanup()

    def test_bir_kez_calisir_dosyaya_yazar_ve_teslim_eder(self):
        self.store.create("Kur özeti", "every 1h", datetime(2026, 11, 9, 8, 0), deliver="telegram:555", name="kur")
        self.assertEqual(self.zamanlayici.tick(datetime(2026, 11, 9, 8, 59)), [])
        kayitlar = self.zamanlayici.tick(datetime(2026, 11, 9, 9, 0))
        self.assertEqual(self.teslimler, [("telegram", "555", "çıktı: kur")])
        self.assertEqual(Path(kayitlar[0]["file"]).read_text(encoding="utf-8"), "çıktı: kur")
        self.assertEqual(self.zamanlayici.tick(datetime(2026, 11, 9, 9, 0)), [])  # aynı an tekrar koşmaz
        self.assertEqual(self.store.load()[0]["next_run_at"], "2026-11-09T10:00:00")
        self.assertIsNone(self.ajanlar[0].memory_store)  # cron ajanları hafızayı yüklemez
        self.assertEqual(self.db.search("kur")[0]["source"], "cron")

    def test_tek_seferlik_is_kapanir(self):
        self.store.create("Hatırlat", "2026-11-09T12:00:00", datetime(2026, 11, 9, 8, 0))
        self.assertEqual(len(self.zamanlayici.tick(datetime(2026, 11, 9, 12, 30))), 1)
        self.assertFalse(self.store.load()[0]["enabled"])
        self.assertEqual(self.zamanlayici.tick(datetime(2026, 11, 10, 12, 0)), [])

    def test_ajan_arac_ile_is_kurar(self):
        model = ScriptedLLM(
            [
                arac("c1", "cronjob", action="create", prompt="Su iç", schedule="2h", deliver="telegram:1"),
                LLMResponse("Kurdum."),
            ]
        )
        ajan = AIAgent(
            model,
            self.home,
            self.db,
            enabled_toolsets={"cron"},
            tool_context={"cron_store": self.store, "now": datetime(2026, 11, 9, 8, 0)},
        )
        ajan.chat("İki saatte bir bana su içmeyi hatırlat.")
        sonuc = json.loads(model.istekler[1]["messages"][-1]["content"])
        self.assertTrue(sonuc["success"])
        self.assertEqual(self.store.load()[0]["next_run_at"], "2026-11-09T10:00:00")


if __name__ == "__main__":
    unittest.main()
