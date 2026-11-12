"""Aşama 6 testleri: elle yazılmış geri yayılımın doğruluğu ve eğitimin kaybı düşürmesi."""

import unittest

import numpy as np

import minitransformers as mt
from minitransformers.trainer import loss_and_grads
from tests.test_tokenizer import METIN


def capraz_entropi(model, x, y):
    logits = model.forward(x).logits
    z = logits - logits.max(-1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(-1, keepdims=True))
    return -np.take_along_axis(logp, y[..., None], axis=-1).mean()


class GeriYayilim(unittest.TestCase):
    def setUp(self):
        cfg = mt.GPTConfig(vocab_size=20, n_positions=8, n_embd=8, n_layer=2, n_head=2, initializer_range=0.5, seed=3)
        self.m = mt.GPTForCausalLM(cfg)
        rng = np.random.default_rng(0)
        for k in self.m.params:  # LayerNorm ve bias'ları da sıfırdan uzaklaştır: her terim sınansın
            if k.endswith("bias") or "ln_" in k:
                self.m.params[k] = self.m.params[k] + rng.normal(0, 0.3, self.m.params[k].shape)
        self.x, self.y = rng.integers(0, 20, (2, 6)), rng.integers(0, 20, (2, 6))

    def test_kayip_modelin_ileri_gecisiyle_ayni(self):
        loss, _ = loss_and_grads(self.m, self.x, self.y)
        self.assertAlmostEqual(loss, capraz_entropi(self.m, self.x, self.y), places=12)

    def test_gradyanlar_sonlu_farklarla_uyusur(self):
        _, grads = loss_and_grads(self.m, self.x, self.y)
        rng = np.random.default_rng(1)
        for name, w in self.m.params.items():
            for _ in range(3):
                idx = tuple(int(rng.integers(0, s)) for s in w.shape)
                eski = w[idx]
                w[idx] = eski + 1e-6
                arti = capraz_entropi(self.m, self.x, self.y)
                w[idx] = eski - 1e-6
                eksi = capraz_entropi(self.m, self.x, self.y)
                w[idx] = eski
                sayisal = (arti - eksi) / 2e-6
                self.assertAlmostEqual(grads[name][idx], sayisal, delta=1e-6 + 1e-4 * abs(sayisal), msg=name)


class Egitim(unittest.TestCase):
    def test_kayip_duser(self):
        tok = mt.ByteLevelBPETokenizer.train([METIN], vocab_size=300)
        cfg = mt.GPTConfig(vocab_size=tok.vocab_size, n_positions=16, n_embd=16, n_layer=1, n_head=2)
        model = mt.GPTForCausalLM(cfg)
        args = mt.TrainingArguments(max_steps=150, batch_size=8, block_size=16, learning_rate=1e-2)
        trainer = mt.Trainer(model, args, tok.encode(METIN))
        out = trainer.train()
        self.assertEqual(out.global_step, 150)
        ilk = np.mean([h["loss"] for h in trainer.log_history[:5]])
        son = np.mean([h["loss"] for h in trainer.log_history[-5:]])
        self.assertLess(son, 0.75 * ilk)


if __name__ == "__main__":
    unittest.main()
