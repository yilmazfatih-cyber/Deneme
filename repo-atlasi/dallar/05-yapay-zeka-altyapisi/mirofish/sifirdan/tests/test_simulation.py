"""Aşama 3: tekrarlanabilirlik, günlük ritim, akış, olay enjeksiyonu ve LLM politikası."""

import unittest

import minifish as mf
from minifish.simulation import Post
from tests.yardimci import BozukLLM, kur

OLAY_ARTI = [mf.Event(12, "Kıyı Postası", "Belediye esnafa ücretsiz ring servisi sözü verdi.", 0.7)]
OLAY_EKSI = [mf.Event(12, "Kıyı Postası", "Esnaf cirolarının yüzde otuz düştüğü bildirildi.", -0.7)]


class Simulasyon(unittest.TestCase):
    def test_ayni_tohum_ayni_sonuc_farkli_tohum_farkli(self):
        a, b, c = kur(5).run(30), kur(5).run(30), kur(6).run(30)
        self.assertEqual(a.log, b.log)
        self.assertNotEqual(a.log, c.log)

    def test_gece_kimse_etkin_degil_aksam_yogun(self):
        res = kur(0).run(24)  # 08:00'den başlar
        by_hour = {r["hour"]: r["active"] for r in res.rounds}
        self.assertEqual(sum(by_hour[h] for h in range(0, 6)), 0)
        self.assertGreater(by_hour[20], by_hour[10])

    def test_akis_kendi_ve_eski_gonderileri_icermez(self):
        sim = kur(0)
        ajan = sim.agents[0]
        sim.posts = [Post(0, 0, ajan.agent_id, "kendi", 1.0), Post(1, 0, 1, "eski", 1.0), Post(2, 9, 1, "taze", 1.0)]
        self.assertEqual([p.text for p in sim.feed(ajan, 10)], ["taze"])

    def test_olay_gonderisi_akista_one_cikar(self):
        sim = kur(1, events=OLAY_ARTI)
        res = sim.run(13)
        olay = next(p for p in res.posts if p.text.startswith("Belediye esnafa"))
        self.assertEqual(olay.round, 12)
        ilk_siralar = [sim.feed(a, 13)[0] for a in sim.agents if a.type != "MediaOutlet"]
        self.assertTrue(all(p is olay for p in ilk_siralar))  # güçlendirme (boost) akışın en üstüne taşır

    def test_olayin_yonu_topluluk_ortalamasina_yansir(self):
        seeds = range(8)
        arti = mf.ensemble(lambda s: kur(s, events=OLAY_ARTI), seeds, 36)["mean_stance"]["ortalama"]
        eksi = mf.ensemble(lambda s: kur(s, events=OLAY_EKSI), seeds, 36)["mean_stance"]["ortalama"]
        self.assertGreater(arti, eksi)

    def test_llm_politikasi_ve_yedegi(self):
        llm = mf.KuralliLLM()
        res = kur(2, llm=None, policy=mf.LLMPolicy(llm)).run(16)
        self.assertGreater(llm.calls, 0)
        self.assertTrue({e["action"] for e in res.log} <= {"CREATE_POST", "LIKE_POST", "CREATE_COMMENT", "DO_NOTHING"})
        bozuk = mf.LLMPolicy(BozukLLM())
        kur(2, policy=bozuk).run(16)
        self.assertGreater(bozuk.fallbacks, 0)  # bozuk yanıtlar kural tabanlı karara düştü


if __name__ == "__main__":
    unittest.main()
