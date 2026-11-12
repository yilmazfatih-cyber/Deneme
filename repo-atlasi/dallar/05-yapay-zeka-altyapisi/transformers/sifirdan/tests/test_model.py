"""Aşama 2-5 testleri: model, KV önbelleği, kaydet/yükle, Auto kaydı, generate ve pipeline."""

import tempfile
import unittest

import numpy as np

import minitransformers as mt
from minitransformers.models.auto import AutoConfig


def kucuk_model(seed=0, **kw):
    cfg = mt.GPTConfig(vocab_size=50, n_positions=32, n_embd=16, n_layer=2, n_head=4, seed=seed, **kw)
    return mt.GPTForCausalLM(cfg)


class Model(unittest.TestCase):
    def test_sekiller(self):
        out = kucuk_model().forward(np.zeros((3, 7), dtype=int))
        self.assertEqual(out.logits.shape, (3, 7, 50))

    def test_nedensellik_gelecek_gecmisi_etkilemez(self):
        m = kucuk_model()
        a = np.array([[1, 2, 3, 4, 5]])
        b = a.copy()
        b[0, 4] = 9  # yalnızca son belirteç değişti
        np.testing.assert_allclose(m.forward(a).logits[:, :4], m.forward(b).logits[:, :4])

    def test_kv_onbellek_onbelleksiz_ile_ayni(self):
        m = kucuk_model()
        ids = np.array([[3, 1, 4, 1, 5, 9, 2, 6]])
        tam = m.forward(ids).logits
        out = m.forward(ids[:, :5], use_cache=True)  # önce 5 belirteçlik ön ek
        parcalar = [out.logits]
        past = out.past_key_values
        for i in range(5, 8):  # sonra birer birer
            out = m.forward(ids[:, i : i + 1], past_key_values=past, use_cache=True)
            parcalar.append(out.logits)
            past = out.past_key_values
        np.testing.assert_allclose(np.concatenate(parcalar, axis=1), tam, atol=1e-10)
        self.assertEqual(past[0][0].shape, (1, 4, 8, 4))  # (B, H, T, D)

    def test_konum_siniri(self):
        with self.assertRaises(ValueError):
            kucuk_model().forward(np.zeros((1, 33), dtype=int))


class KaydetYukle(unittest.TestCase):
    def test_gidis_donus_ve_auto(self):
        m = kucuk_model(seed=5)
        ids = np.array([[1, 2, 3]])
        with tempfile.TemporaryDirectory() as d:
            m.save_pretrained(d)
            self.assertEqual(AutoConfig.from_pretrained(d), m.config)
            m2 = mt.AutoModelForCausalLM.from_pretrained(d)
        self.assertIsInstance(m2, mt.GPTForCausalLM)
        self.assertEqual(m2.config.architectures, ["GPTForCausalLM"])
        np.testing.assert_array_equal(m2.forward(ids).logits, m.forward(ids).logits)

    def test_uyumsuz_agirlik_reddedilir(self):
        m = kucuk_model()
        sd = m.state_dict()
        sd.pop("transformer.ln_f.bias")
        sd["fazla.agirlik"] = np.zeros(3)
        with self.assertRaises(RuntimeError):
            m.load_state_dict(sd)
        rapor = m.load_state_dict(sd, strict=False)
        self.assertEqual(rapor["missing"], ["transformer.ln_f.bias"])
        self.assertEqual(rapor["unexpected"], ["fazla.agirlik"])

    def test_yerel_hub_ve_bulunamayan_model(self):
        m, tok = kucuk_model(), mt.ByteLevelBPETokenizer.train(["deneme metni"], vocab_size=260)
        from minitransformers import hub

        with tempfile.TemporaryDirectory() as h:
            hub.publish(m, tok, "atlas/mini-gpt", h)
            self.assertIsInstance(mt.AutoModelForCausalLM.from_pretrained("atlas/mini-gpt", hub_dir=h), mt.GPTForCausalLM)
            with self.assertRaises(OSError):
                mt.AutoModelForCausalLM.from_pretrained("atlas/yok", hub_dir=h)

    def test_ozel_model_kaydi(self):
        class BenimConfig(mt.GPTConfig):
            model_type = "benim-gpt"

        class BenimModel(mt.GPTForCausalLM):
            config_class = BenimConfig

        mt.AutoConfig.register("benim-gpt", BenimConfig)
        mt.AutoModelForCausalLM.register(BenimConfig, BenimModel)
        model = mt.AutoModelForCausalLM.from_config(mt.AutoConfig.for_model("benim-gpt", vocab_size=10, n_embd=8))
        self.assertIsInstance(model, BenimModel)
        with self.assertRaises(ValueError):
            mt.AutoConfig.register("benim-gpt", BenimConfig)  # iki kez kayıt yok


class Uretim(unittest.TestCase):
    def test_onbellekli_ve_onbelleksiz_acgozlu_ayni(self):
        m = kucuk_model(seed=1)
        a = m.generate([1, 2, 3], max_new_tokens=10, use_cache=True)
        b = m.generate([1, 2, 3], max_new_tokens=10, use_cache=False)
        np.testing.assert_array_equal(a, b)
        self.assertEqual(a.shape, (1, 13))

    def test_top_k_1_acgozlu_ile_ayni(self):
        m = kucuk_model(seed=2)
        a = m.generate([4, 5], max_new_tokens=8)
        b = m.generate([4, 5], max_new_tokens=8, do_sample=True, top_k=1, temperature=0.7, seed=123)
        np.testing.assert_array_equal(a, b)

    def test_tohum_ile_tekrarlanabilir_ornekleme(self):
        m = kucuk_model(seed=3)
        a = m.generate([1], max_new_tokens=12, do_sample=True, seed=7)
        b = m.generate([1], max_new_tokens=12, do_sample=True, seed=7)
        np.testing.assert_array_equal(a, b)

    def test_top_p_dusuk_olasiliklari_eler(self):
        from minitransformers.generation_utils import TopPLogitsWarper

        skor = np.log(np.array([[0.5, 0.3, 0.15, 0.05]]))
        out = TopPLogitsWarper(0.7)(None, skor)
        self.assertEqual(list(np.isfinite(out[0])), [True, True, False, False])

    def test_eos_gorulunce_durur(self):
        m = kucuk_model(seed=4)
        ilk = int(m.generate([2], max_new_tokens=1)[0, -1])  # açgözlü ilk belirteç
        out = m.generate([2], max_new_tokens=10, eos_token_id=ilk)
        self.assertEqual(out.shape, (1, 2))

    def test_bilinmeyen_parametre_hatasi(self):
        with self.assertRaises(TypeError):
            kucuk_model().generate([1], max_yeni=3)


class PipelineTesti(unittest.TestCase):
    def test_metin_uretimi(self):
        tok = mt.ByteLevelBPETokenizer.train(["merhaba dünya, merhaba deniz"], vocab_size=270)
        cfg = mt.GPTConfig(vocab_size=tok.vocab_size, n_positions=32, n_embd=16, n_layer=1, n_head=2)
        with tempfile.TemporaryDirectory() as d:
            mt.GPTForCausalLM(cfg).save_pretrained(d)
            tok.save_pretrained(d)
            uretici = mt.pipeline("text-generation", model=d)
        sonuc = uretici("merhaba", max_new_tokens=5)
        self.assertTrue(sonuc[0]["generated_text"].startswith("merhaba"))
        self.assertEqual(len(uretici(["a", "b"], max_new_tokens=2)), 2)
        with self.assertRaises(KeyError):
            mt.pipeline("ozetleme", model=d)


if __name__ == "__main__":
    unittest.main()
