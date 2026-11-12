"""Aşama 1 testleri: şema doğrulama, blok kaydı kuralları, blokların kendi örnek testleri."""

import unittest

from asama1_blok import (
    AddNumbersBlock,
    Block,
    BlockExecutionError,
    BlockInputError,
    BlockOutputError,
    BlockSchema,
    BlockSchemaOutput,
    BlockUnknownError,
    ConditionBlock,
    SchemaField,
    StepThroughItemsBlock,
    block_catalog,
    load_all_blocks,
    run_block_self_test,
    validate_block_classes,
)


class IstisnaBlock(Block):
    """run() içinden ham istisna fırlatan blok: Block.execute'un hata çevirisini sınar."""

    id = "be238e13-1e88-4184-832d-69f8ee42f193"

    class input_schema(BlockSchema):
        tur = SchemaField(str, "'tip' ya da 'deger'")

    class output_schema(BlockSchemaOutput):
        sonuc = SchemaField(object, "Asla üretilmez")

    def run(self, input_data, **kwargs):
        if input_data["tur"] == "tip":
            yield "sonuc", 1 + "a"  # TypeError
        raise ValueError("geçersiz değer")


class SchemaTest(unittest.TestCase):
    def test_eksik_zorunlu_alan_reddedilir(self):
        with self.assertRaises(BlockInputError) as baglam:
            list(AddNumbersBlock().execute({"a": 1}))
        self.assertIn("b", str(baglam.exception))

    def test_zorunlu_alana_none_eksik_sayilir(self):
        # None doğrulamayı geçseydi run() içinde TypeError'a dönüşürdü.
        with self.assertRaises(BlockInputError) as baglam:
            list(AddNumbersBlock().execute({"a": None, "b": 2}))
        self.assertIn("eksik zorunlu alan(lar): a", str(baglam.exception))

    def test_run_istisnasi_block_error_ailesine_cevrilir(self):
        with self.assertRaises(BlockUnknownError) as baglam:
            list(IstisnaBlock().execute({"tur": "tip"}))
        self.assertIn("TypeError", str(baglam.exception))
        self.assertIsInstance(baglam.exception.__cause__, TypeError)
        with self.assertRaises(BlockExecutionError):
            list(IstisnaBlock().execute({"tur": "deger"}))

    def test_bool_int_yerine_gecmez(self):
        class S(BlockSchema):
            n = SchemaField(int)

        self.assertIsNotNone(S.validate({"n": True}))
        self.assertIsNone(S.validate({"n": 3}))

    def test_int_float_alanina_uyar(self):
        self.assertEqual(list(AddNumbersBlock().execute({"a": 1, "b": 2})), [("result", 3.0)])

    def test_jsonschema_zorunlulari_listeler(self):
        sema = ConditionBlock.input_schema.jsonschema()
        self.assertEqual(sema["required"], ["operator", "value1", "value2"])
        self.assertEqual(sema["properties"]["operator"]["type"], "string")

    def test_tanimsiz_cikis_pini_hata(self):
        class KotuBlock(Block):
            id = "11111111-1111-4111-8111-111111111111"

            class output_schema(BlockSchemaOutput):
                ok = SchemaField(str)

            def run(self, input_data, **kwargs):
                yield "baska", 1

        # Not: Block'tan türediği için genel kayda girer; geçerli UUID'si ve test örneği olmadığından zararsızdır.
        with self.assertRaises(BlockOutputError):
            list(KotuBlock().execute({}))


class KayitTest(unittest.TestCase):
    """Kural testleri Block'tan türemeyen sahte sınıflarla yapılır; böylece genel kayıt kirlenmez."""

    @staticmethod
    def sahte(ad, block_id):
        return type(ad, (), {"id": block_id, "output_schema": BlockSchemaOutput})

    def test_ornek_bloklar_kayitli(self):
        adlar = {s.__name__ for s in load_all_blocks().values()}
        self.assertTrue({"AgentInputBlock", "ConditionBlock", "StepThroughItemsBlock"} <= adlar)

    def test_ad_block_ile_bitmeli(self):
        with self.assertRaises(ValueError):
            validate_block_classes([self.sahte("Toplayici", "22222222-2222-4222-8222-222222222222")])

    def test_base_ile_biten_atlanir(self):
        self.assertEqual(validate_block_classes([self.sahte("OrtakBase", "gecersiz")]), {})

    def test_gecersiz_uuid_ve_yinelenen_id(self):
        with self.assertRaises(ValueError):
            validate_block_classes([self.sahte("KotuIdBlock", "123")])
        ortak = "33333333-3333-4333-8333-333333333333"
        with self.assertRaises(ValueError):
            validate_block_classes([self.sahte("BirBlock", ortak), self.sahte("IkiBlock", ortak)])

    def test_katalog_json_semalari_tasir(self):
        satir = next(b for b in block_catalog() if b.name == "AddNumbersBlock")
        self.assertEqual(satir.input_schema["properties"]["a"]["type"], "number")


class DavranisTest(unittest.TestCase):
    def test_kosul_yalnizca_bir_dal_uretir(self):
        cikti = list(ConditionBlock().execute({"value1": 1, "operator": ">", "value2": 5}))
        self.assertEqual(cikti, [("result", False), ("no_output", 1)])

    def test_liste_gezme_her_oge_icin_uretir(self):
        cikti = list(StepThroughItemsBlock().execute({"items": [7, 8, 9]}))
        self.assertEqual([d for p, d in cikti if p == "item"], [7, 8, 9])

    def test_her_ornek_blok_kendi_testini_gecer(self):
        for sinif in load_all_blocks().values():
            blok = sinif()
            if blok.test_input:
                with self.subTest(blok=blok.name):
                    run_block_self_test(blok)


if __name__ == "__main__":
    unittest.main()
