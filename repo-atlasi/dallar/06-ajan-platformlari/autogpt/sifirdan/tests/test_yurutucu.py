"""Aşama 3 testleri: veri akışı, fan-out, dallanma, statik bağlantı, dinamik pin, hata kaydı."""

import json
import unittest

from asama1_blok import Block, BlockSchema, BlockSchemaOutput, SchemaField
from asama3_yurutucu import ExecutionStatus, ExecutionStore, Executor, merge_dynamic_pins
from tests.yardimci import CIKIS, GEZ, GIRIS, KOSUL, METIN, SABIT, TOPLA, graf, ornek_graf


class PatlayanBlock(Block):
    """Hata yolunu sınamak için: her zaman 'error' üretir."""

    id = "7f0d3057-5d0a-43d2-a68a-6f2a4ae0880e"

    class input_schema(BlockSchema):
        x = SchemaField(object, "Herhangi bir değer")

    class output_schema(BlockSchemaOutput):
        y = SchemaField(object, "Asla üretilmez")

    def run(self, input_data, **kwargs):
        yield "error", f"{input_data['x']} işlenemedi"


class TipHatasiBlock(Block):
    """Hata yolunu sınamak için: run() içinden ham TypeError fırlatır (programcı hatası gibi)."""

    id = "b4b90faf-8e65-4f23-a81f-de570b83b317"

    class input_schema(BlockSchema):
        x = SchemaField(object, "Herhangi bir değer")

    class output_schema(BlockSchemaOutput):
        y = SchemaField(object, "Asla üretilmez")

    def run(self, input_data, **kwargs):
        yield "y", input_data["x"] + 1  # str + int → TypeError


class YurutucuTest(unittest.TestCase):
    def setUp(self):
        self.store = ExecutionStore()
        self.yurutucu = Executor(self.store)

    def durumlar(self, gex, node_id):
        return [k["status"] for k in self.store.node_executions(gex) if k["node_id"] == node_id]

    def test_ornek_graf_uctan_uca(self):
        sonuc = self.yurutucu.run(ornek_graf(), {"tutarlar": [120, 40, 300]})
        self.assertEqual(sonuc.status, ExecutionStatus.COMPLETED)
        self.assertEqual(sonuc.outputs["buyukler"], ["Büyük sipariş: 120 TL", "Büyük sipariş: 300 TL"])
        self.assertEqual(sonuc.outputs["kucukler"], ["Küçük sipariş: 40 TL"])

    def test_fan_out_her_oge_icin_ayri_yurutme(self):
        sonuc = self.yurutucu.run(ornek_graf(), {"tutarlar": [1, 2, 3, 4]})
        self.assertEqual(self.durumlar(sonuc.graph_exec_id, "kosul"), ["COMPLETED"] * 4)

    def test_statik_deger_her_yurutmede_yeniden_kullanilir(self):
        sonuc = self.yurutucu.run(ornek_graf(), {"tutarlar": [101, 99]})
        girisler = self.store.db.execute(
            """SELECT io.value FROM node_io io JOIN node_executions ne ON ne.id = io.node_exec_id
               WHERE ne.graph_exec_id = ? AND ne.node_id = 'kosul' AND io.name = 'value2'""",
            (sonuc.graph_exec_id,),
        ).fetchall()
        self.assertEqual([json.loads(v) for (v,) in girisler], [100, 100])

    def test_dal_gelmeyen_dugum_eksik_kalir(self):
        # Koşul hiç 'no_output' üretmezse ona bağlı düğümün iki girişinden biri asla gelmez.
        g = graf(
            [
                ("g", GIRIS, {"name": "n"}),
                ("k", KOSUL, {"operator": ">", "value2": 0}),
                ("s", SABIT, {"data": 1}),
                ("t", TOPLA, {}),
                ("c", CIKIS, {"name": "toplam"}),
            ],
            [
                ("g", "result", "k", "value1"),
                ("k", "no_output", "t", "a"),
                ("s", "output", "t", "b"),
                ("t", "result", "c", "value"),
            ],
        )
        sonuc = self.yurutucu.run(g, {"n": 5})  # 5 > 0 → yalnızca yes_output
        self.assertEqual(sonuc.outputs, {})
        self.assertEqual(self.durumlar(sonuc.graph_exec_id, "t"), ["INCOMPLETE"])
        sonuc2 = self.yurutucu.run(g, {"n": -2})  # -2 > 0 değil → no_output → t çalışır
        self.assertEqual(sonuc2.outputs, {"toplam": [-1.0]})

    def test_fan_in_iki_kaynagi_bekler(self):
        g = graf(
            [("a", GIRIS, {"name": "a"}), ("b", GIRIS, {"name": "b"}), ("t", TOPLA, {}), ("c", CIKIS, {"name": "s"})],
            [("a", "result", "t", "a"), ("b", "result", "t", "b"), ("t", "result", "c", "value")],
        )
        sonuc = self.yurutucu.run(g, {"a": 2, "b": 40})
        self.assertEqual(sonuc.outputs["s"], [42.0])
        self.assertEqual(self.durumlar(sonuc.graph_exec_id, "t"), ["COMPLETED"])

    def test_dinamik_sozluk_pinleri_birlesir(self):
        g = graf(
            [
                ("ad", GIRIS, {"name": "ad"}),
                ("sehir", GIRIS, {"name": "sehir"}),
                ("m", METIN, {"format": "{ad} / {sehir}"}),
                ("c", CIKIS, {"name": "metin"}),
            ],
            [
                ("ad", "result", "m", "values_#_ad"),
                ("sehir", "result", "m", "values_#_sehir"),
                ("m", "output", "c", "value"),
            ],
        )
        sonuc = self.yurutucu.run(g, {"ad": "Ayşe", "sehir": "İzmir"})
        self.assertEqual(sonuc.outputs["metin"], ["Ayşe / İzmir"])
        self.assertEqual(merge_dynamic_pins({"v_$_1": "b", "v_$_0": "a"}), {"v": ["a", "b"]})

    def test_liste_alt_degeri_kaynak_pinden_secilir(self):
        g = graf(
            [("g", GIRIS, {"name": "liste"}), ("gez", GEZ, {}), ("c", CIKIS, {"name": "ilk"})],
            [("g", "result_$_0", "c", "value"), ("g", "result", "gez", "items")],
        )
        sonuc = self.yurutucu.run(g, {"liste": ["x", "y"]})
        self.assertEqual(sonuc.outputs["ilk"], ["x"])

    def test_hata_kaydedilir_ve_hata_pini_baglanabilir(self):
        g = graf(
            [("g", GIRIS, {"name": "x"}), ("p", PatlayanBlock.id, {}), ("c", CIKIS, {"name": "hata"})],
            [("g", "result", "p", "x"), ("p", "error", "c", "value")],
        )
        sonuc = self.yurutucu.run(g, {"x": "kayıt-7"})
        self.assertEqual(sonuc.status, ExecutionStatus.FAILED)
        self.assertIn("kayıt-7 işlenemedi", sonuc.errors["p"])
        self.assertEqual(sonuc.outputs["hata"], ["PatlayanBlock: kayıt-7 işlenemedi"])
        self.assertEqual(self.durumlar(sonuc.graph_exec_id, "p"), ["FAILED"])

    def graf_kaydi(self, gex):
        return self.store.db.execute("SELECT status, ended_at FROM graph_executions WHERE id = ?", (gex,)).fetchone()

    def test_beklenmeyen_istisna_grafi_yarida_birakmaz(self):
        g = graf(
            [("g", GIRIS, {"name": "x"}), ("p", TipHatasiBlock.id, {}), ("c", CIKIS, {"name": "hata"})],
            [("g", "result", "p", "x"), ("p", "error", "c", "value")],
        )
        sonuc = self.yurutucu.run(g, {"x": "metin"})  # istisna dışarı fırlamaz
        self.assertEqual(sonuc.status, ExecutionStatus.FAILED)
        self.assertEqual(self.durumlar(sonuc.graph_exec_id, "p"), ["FAILED"])
        self.assertIn("TypeError", sonuc.outputs["hata"][0])  # hata pinine bağlı düğüm çalıştı
        durum, bitis = self.graf_kaydi(sonuc.graph_exec_id)
        self.assertEqual(durum, "FAILED")
        self.assertIsNotNone(bitis)  # RUNNING'de asılı kalmadı

    def test_bir_ogedeki_hata_diger_ogeleri_durdurmaz(self):
        # "abc" > 100 karşılaştırması TypeError verir; 5 ise küçük dala gider.
        sonuc = self.yurutucu.run(ornek_graf(), {"tutarlar": ["abc", 5]})
        self.assertEqual(sonuc.status, ExecutionStatus.FAILED)
        self.assertIn("TypeError", sonuc.errors["kosul"])
        self.assertEqual(sonuc.outputs["kucukler"], ["Küçük sipariş: 5 TL"])
        self.assertEqual(sorted(self.durumlar(sonuc.graph_exec_id, "kosul")), ["COMPLETED", "FAILED"])
        self.assertEqual(self.graf_kaydi(sonuc.graph_exec_id)[0], "FAILED")

    def test_kayitlar_kalici_dosyada_durur(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as klasor:
            yol = str(Path(klasor) / "yurutme.sqlite3")
            sonuc = Executor(ExecutionStore(yol)).run(ornek_graf(), {"tutarlar": [500]})
            yeni_baglanti = ExecutionStore(yol)  # süreç yeniden başlamış gibi
            kayitlar = yeni_baglanti.node_executions(sonuc.graph_exec_id)
            self.assertEqual(len(kayitlar), 6)
            durum = yeni_baglanti.db.execute(
                "SELECT status FROM graph_executions WHERE id = ?", (sonuc.graph_exec_id,)
            ).fetchone()[0]
            self.assertEqual(durum, "COMPLETED")
            yeni_baglanti.db.close()
            # Windows dışı sistemlerde açık bağlantı silmeyi engellemez; yine de kapatmak iyi alışkanlık.


if __name__ == "__main__":
    unittest.main()
