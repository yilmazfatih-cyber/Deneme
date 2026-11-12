"""Aşama 2 testleri: kayıt, toolset süzme, check_fn, hatanın JSON olarak dönmesi, güvenli hesap makinesi."""

import json
import unittest

from asama2_araclar import ToolRegistry, guvenli_hesapla, registry


class RegistryTest(unittest.TestCase):
    def setUp(self):
        self.kayit = ToolRegistry()
        sema = {"description": "x", "parameters": {"type": "object", "properties": {}}}
        self.kayit.register("acik", "temel", sema, lambda args, **_: {"ok": True})
        self.kayit.register("anahtarsiz", "temel", sema, lambda args, **_: "x", check_fn=lambda: False)
        self.kayit.register("patlayan", "riskli", sema, lambda args, **_: 1 / 0)

    def test_tanimlar_toolset_ve_check_fn_ile_suzulur(self):
        adlar = [t["function"]["name"] for t in self.kayit.get_definitions({"temel"})]
        self.assertEqual(adlar, ["acik"])  # check_fn False olan modele gösterilmez
        self.assertEqual(self.kayit.toolsets(), {"temel": ["acik", "anahtarsiz"], "riskli": ["patlayan"]})

    def test_hata_istisna_degil_metin_doner(self):
        self.assertIn("ZeroDivisionError", json.loads(self.kayit.dispatch("patlayan", {}))["error"])
        bilinmeyen = json.loads(self.kayit.dispatch("yok", {}))
        self.assertIn("acik", bilinmeyen["gecerli_araclar"])

    def test_farkli_toolsetle_golgeleme_reddedilir(self):
        with self.assertRaises(ValueError):
            self.kayit.register("acik", "baska", {"parameters": {}}, lambda a, **_: None)
        with self.assertRaises(ValueError):
            self.kayit.register("bozuk", "temel", {"parameters": ["liste"]}, lambda a, **_: None)

    def test_genel_kayitta_cekirdek_araclar(self):
        self.assertTrue({"hesapla", "memory", "session_search"} <= set(registry.names()))


class HesaplaTest(unittest.TestCase):
    def test_aritmetik(self):
        self.assertEqual(guvenli_hesapla("1000*0,20 + 2**3"), 208.0)
        self.assertEqual(guvenli_hesapla("-(3-5)/4"), 0.5)

    def test_kod_calistirilamaz(self):
        for kotu in ["__import__('os').system('ls')", "open('x')", "a+1", "9**999999"]:
            with self.subTest(kotu=kotu), self.assertRaises(ValueError):
                guvenli_hesapla(kotu)


if __name__ == "__main__":
    unittest.main()
