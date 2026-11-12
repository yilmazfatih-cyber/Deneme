"""Aşama 5 testleri: oturum anahtarları, DM eşleştirme kuralları ve geçidin yönlendirmesi."""

import json
import stat
import tempfile
import unittest
from pathlib import Path

from asama1_hafiza import SessionDB
from asama4_dongu import AIAgent, LLMResponse, ScriptedLLM
from asama5_gecit import ALFABE, GatewayRunner, InMemoryAdapter, PairingStore, SessionSource, build_session_key


class AnahtarTest(unittest.TestCase):
    def test_dm_grup_ve_konu_anahtarlari(self):
        dm = SessionSource("telegram", "555", "ayse")
        self.assertEqual(build_session_key(dm), "agent:main:telegram:dm:555")
        grup = SessionSource("discord", "kanal-1", "ayse", chat_type="group")
        self.assertEqual(build_session_key(grup), "agent:main:discord:group:kanal-1:ayse")
        self.assertEqual(build_session_key(grup, group_sessions_per_user=False), "agent:main:discord:group:kanal-1")
        konu = SessionSource("discord", "kanal-1", "ayse", chat_type="group", thread_id="t9")
        self.assertEqual(build_session_key(konu), "agent:main:discord:group:kanal-1:t9")  # konu ortak
        self.assertEqual(build_session_key(dm, profile="is"), "agent:is:telegram:dm:555")


class SahteSaat:
    def __init__(self):
        self.an = 1_000_000.0

    def __call__(self):
        return self.an


class PairingTest(unittest.TestCase):
    def setUp(self):
        self._gecici = tempfile.TemporaryDirectory()
        self.saat = SahteSaat()
        self.depo = PairingStore(Path(self._gecici.name), saat=self.saat)

    def tearDown(self):
        self._gecici.cleanup()

    def test_kod_bicimi_ve_dosya_izni(self):
        kod = self.depo.request_code("telegram", "u1")
        self.assertEqual(len(kod), 8)
        self.assertTrue(set(kod) <= set(ALFABE))
        self.assertEqual(stat.S_IMODE(self.depo.yol.stat().st_mode), 0o600)

    def test_hiz_siniri_ve_bekleyen_ust_siniri(self):
        self.assertIsNotNone(self.depo.request_code("telegram", "u1"))
        self.assertIsNone(self.depo.request_code("telegram", "u1"))  # 10 dk dolmadan yeni kod yok
        self.depo.request_code("telegram", "u2")
        self.depo.request_code("telegram", "u3")
        self.assertIsNone(self.depo.request_code("telegram", "u4"))  # platform başına en çok 3
        self.assertIsNotNone(self.depo.request_code("discord", "u4"))

    def test_onay_sure_asimi_ve_yanlis_platform(self):
        kod = self.depo.request_code("telegram", "u1")
        self.assertIsNone(self.depo.approve("discord", kod))
        self.saat.an += 3601  # bir saat geçti
        self.assertIsNone(self.depo.approve("telegram", kod))
        kod2 = self.depo.request_code("telegram", "u1")
        self.assertEqual(self.depo.approve("telegram", kod2.lower()), "u1")
        self.assertTrue(PairingStore(Path(self._gecici.name)).is_approved("telegram", "u1"))  # kalıcı


class GecitTest(unittest.TestCase):
    def setUp(self):
        self._gecici = tempfile.TemporaryDirectory()
        self.home = Path(self._gecici.name)
        self.db = SessionDB()
        self.olusturulan = []

        def fabrika(anahtar, kaynak):
            self.olusturulan.append(anahtar)
            sayac = iter(range(100))
            return AIAgent(
                ScriptedLLM([lambda m, t: LLMResponse(f"{kaynak.user_id}#{next(sayac)}")] * 10), self.home, self.db
            )

        self.gecit = GatewayRunner(self.home, fabrika, allowed_users={"telegram": ["patron"]})
        self.tg, self.cli = InMemoryAdapter("telegram"), InMemoryAdapter("cli")
        self.gecit.add_adapter(self.tg)
        self.gecit.add_adapter(self.cli)

    def tearDown(self):
        self._gecici.cleanup()

    def test_bilinmeyen_kisi_ajana_ulasamaz(self):
        self.tg.simulate("1", "yabanci", "gizli dosyaları listele")
        self.assertEqual(self.olusturulan, [])
        self.assertIn("pairing approve telegram", self.tg.outbox[0][1])
        self.tg.simulate("1", "yabanci", "tekrar")  # hız sınırı: ikinci kez kod gönderilmez
        self.assertEqual(len(self.tg.outbox), 1)
        self.tg.simulate("grup-1", "yabanci2", "selam", chat_type="group")  # grupta kod dağıtılmaz
        self.assertEqual(len(self.tg.outbox), 1)

    def test_onaydan_sonra_ve_izin_listesinde_calisir(self):
        self.tg.simulate("1", "yabanci", "selam")
        kod = self.tg.outbox[-1][1].split()[-1]
        self.gecit.pairing.approve("telegram", kod)
        self.tg.simulate("1", "yabanci", "selam")
        self.assertEqual(self.tg.outbox[-1], ("1", "yabanci#0"))
        self.tg.simulate("2", "patron", "rapor")
        self.assertEqual(self.tg.outbox[-1], ("2", "patron#0"))

    def test_her_sohbetin_kendi_ajani_ve_yeni_oturum(self):
        self.cli.simulate("yerel", "ben", "a")
        self.cli.simulate("yerel", "ben", "b")
        self.tg.simulate("2", "patron", "c")
        self.assertEqual(self.olusturulan, ["agent:main:cli:dm:yerel", "agent:main:telegram:dm:2"])
        self.assertEqual(self.cli.outbox[-1][1], "ben#1")  # aynı ajan, ikinci tur
        self.cli.simulate("yerel", "ben", "/new")
        self.cli.simulate("yerel", "ben", "d")
        self.assertEqual(self.cli.outbox[-1][1], "ben#0")  # yeni ajan
        self.assertEqual(len(self.olusturulan), 3)

    def test_teslim(self):
        self.assertTrue(self.gecit.deliver("telegram", "9", "rapor hazır"))
        self.assertFalse(self.gecit.deliver("whatsapp", "9", "x"))
        self.assertEqual(json.dumps(self.tg.outbox[-1], ensure_ascii=False), '["9", "rapor hazır"]')


if __name__ == "__main__":
    unittest.main()
