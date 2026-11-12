"""Aşama 2 testleri: JSON gidiş-dönüş, yapısal doğrulama, topolojik sıra, statik bağlantılar."""

import unittest

from asama2_graf import Graph, GraphValidationError, base_pin, topological_order, validate_graph
from tests.yardimci import CIKIS, GIRIS, METIN, SABIT, TOPLA, graf, ornek_graf


class GrafTest(unittest.TestCase):
    def test_json_gidis_donus(self):
        g = ornek_graf()
        ikinci = Graph.from_json(g.to_json())
        self.assertEqual([n.id for n in ikinci.nodes], [n.id for n in g.nodes])
        self.assertEqual(len(ikinci.links), len(g.links))

    def test_ornek_graf_gecerli_ve_statik_baglanti_isaretlenir(self):
        g = ornek_graf()
        validate_graph(g, for_run=True, inputs={"tutarlar": [1]})
        statikler = [b for b in g.links if b.is_static]
        self.assertEqual([(b.source_id, b.sink_name) for b in statikler], [("esik", "value2")])

    def test_baslangic_dugumleri(self):
        self.assertEqual({n.id for n in ornek_graf().starting_nodes()}, {"giris", "esik"})

    def test_bilinmeyen_pin_ve_blok(self):
        g = graf(
            [("a", TOPLA, {"a": 1, "b": 2}), ("c", TOPLA, {"b": 1}), ("b", "00000000-0000-4000-8000-000000000000", {})],
            [("a", "toplam", "c", "a")],
        )
        with self.assertRaises(GraphValidationError) as baglam:
            validate_graph(g)
        metin = " | ".join(baglam.exception.hatalar)
        self.assertIn("bilinmeyen blok", metin)
        self.assertIn("'toplam'", metin)

    def test_tip_uyumsuzlugu(self):
        g = graf(
            [("m", METIN, {"format": "x"}), ("t", TOPLA, {"b": 1})],
            [("m", "output", "t", "a")],  # str → float
        )
        with self.assertRaises(GraphValidationError) as baglam:
            validate_graph(g)
        self.assertTrue(any("tip uyumsuz" in h for h in baglam.exception.hatalar))

    def test_zorunlu_giris_eksik(self):
        g = graf([("t", TOPLA, {"a": 1})], [])
        with self.assertRaises(GraphValidationError) as baglam:
            validate_graph(g)
        self.assertIn("'b'", baglam.exception.hatalar[0])

    def test_calistirirken_giris_degeri_istenir(self):
        g = graf([("g", GIRIS, {"name": "x"}), ("c", CIKIS, {"name": "y"})], [("g", "result", "c", "value")])
        validate_graph(g)  # kayıt anında sorun yok
        with self.assertRaises(GraphValidationError):
            validate_graph(g, for_run=True, inputs={})

    def test_dongu_yakalanir(self):
        g = graf(
            [("a", TOPLA, {"b": 1}), ("b", TOPLA, {"b": 1})],
            [("a", "result", "b", "a"), ("b", "result", "a", "a")],
        )
        with self.assertRaises(ValueError):
            topological_order(g)
        with self.assertRaises(GraphValidationError):
            validate_graph(g)

    def test_yinelenen_id_dongu_sanilmaz(self):
        g = graf([("a", TOPLA, {"a": 1, "b": 2}), ("a", TOPLA, {"a": 3, "b": 4})], [])
        with self.assertRaises(GraphValidationError) as baglam:
            validate_graph(g)
        self.assertEqual(baglam.exception.hatalar, ["yinelenen düğüm id: a"])

    def test_topolojik_sira_bagimliliklara_uyar(self):
        sira = topological_order(ornek_graf())
        self.assertLess(sira.index("gez"), sira.index("kosul"))
        self.assertLess(sira.index("kosul"), sira.index("buyuk_metin"))

    def test_dinamik_pin_kok_adi(self):
        self.assertEqual(base_pin("values_#_tutar"), "values")
        self.assertEqual(base_pin("items_$_2"), "items")
        g = graf(
            [("s", SABIT, {"data": 5}), ("m", METIN, {"format": "{n}"})],
            [("s", "output", "m", "values_#_n")],
        )
        validate_graph(g)  # dinamik pin kök alana ('values') göre doğrulanır


if __name__ == "__main__":
    unittest.main()
