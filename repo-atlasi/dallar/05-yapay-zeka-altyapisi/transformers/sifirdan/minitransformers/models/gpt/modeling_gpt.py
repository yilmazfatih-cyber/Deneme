"""Aşama 3 — GPT tarzı kod çözücü (decoder-only) transformer, yalnızca numpy ile.

Blok yapısı (GPT-2 gibi "pre-LN"):
    x = x + Attn(LN1(x))      # nedensel (causal) çok başlı öz-dikkat
    x = x + MLP(LN2(x))       # 4 kat genişleyen ileri besleme, GELU
Çıkışta LN_f ve gömme matrisiyle bağlı (tied) dil modeli başı: logits = h @ wte.T

Gerçek karşılıkları: src/transformers/models/gpt2/modeling_gpt2.py (GPT2Attention, GPT2MLP, GPT2Block,
GPT2Model, GPT2LMHeadModel) ve modern örnek olarak src/transformers/models/llama/modeling_llama.py.
"""

from __future__ import annotations

import dataclasses

import numpy as np

from ...modeling_utils import PreTrainedModel
from .configuration_gpt import GPTConfig


@dataclasses.dataclass
class CausalLMOutput:
    logits: np.ndarray
    past_key_values: list | None = None


def layer_norm(x, g, b, eps):
    mu = x.mean(-1, keepdims=True)
    var = ((x - mu) ** 2).mean(-1, keepdims=True)
    return (x - mu) / np.sqrt(var + eps) * g + b


GELU_C = np.sqrt(2.0 / np.pi)


def gelu(x):
    """GPT-2'nin kullandığı tanh yaklaşımı ('gelu_new')."""
    return 0.5 * x * (1.0 + np.tanh(GELU_C * (x + 0.044715 * x * x * x)))


def split_heads(x, n_head):
    b, t, c = x.shape
    return x.reshape(b, t, n_head, c // n_head).transpose(0, 2, 1, 3)  # (B, H, T, D)


def merge_heads(x):
    b, h, t, d = x.shape
    return x.transpose(0, 2, 1, 3).reshape(b, t, h * d)


def causal_mask(q_len, k_len):
    """Sorgu i'nin mutlak konumu (k_len - q_len + i); yalnızca kendisi ve öncesindeki anahtarları görür."""
    offset = k_len - q_len
    return np.arange(k_len)[None, :] <= (np.arange(q_len)[:, None] + offset)


class GPTForCausalLM(PreTrainedModel):
    config_class = GPTConfig

    def __init__(self, config):
        super().__init__(config)
        c, rng = config, np.random.default_rng(config.seed)
        std = config.initializer_range

        def normal(*shape, scale=1.0):
            return rng.normal(0.0, std * scale, size=shape)

        p = self.params
        p["transformer.wte.weight"] = normal(c.vocab_size, c.n_embd)
        p["transformer.wpe.weight"] = normal(c.n_positions, c.n_embd)
        proj_scale = 1.0 / np.sqrt(2 * c.n_layer)  # artık (residual) dallarını küçük başlat (GPT-2 hilesi)
        for i in range(c.n_layer):
            pre = f"transformer.h.{i}."
            p[pre + "ln_1.weight"], p[pre + "ln_1.bias"] = np.ones(c.n_embd), np.zeros(c.n_embd)
            p[pre + "attn.c_attn.weight"] = normal(c.n_embd, 3 * c.n_embd)
            p[pre + "attn.c_attn.bias"] = np.zeros(3 * c.n_embd)
            p[pre + "attn.c_proj.weight"] = normal(c.n_embd, c.n_embd, scale=proj_scale)
            p[pre + "attn.c_proj.bias"] = np.zeros(c.n_embd)
            p[pre + "ln_2.weight"], p[pre + "ln_2.bias"] = np.ones(c.n_embd), np.zeros(c.n_embd)
            p[pre + "mlp.c_fc.weight"] = normal(c.n_embd, 4 * c.n_embd)
            p[pre + "mlp.c_fc.bias"] = np.zeros(4 * c.n_embd)
            p[pre + "mlp.c_proj.weight"] = normal(4 * c.n_embd, c.n_embd, scale=proj_scale)
            p[pre + "mlp.c_proj.bias"] = np.zeros(c.n_embd)
        p["transformer.ln_f.weight"], p["transformer.ln_f.bias"] = np.ones(c.n_embd), np.zeros(c.n_embd)
        # lm_head ayrı parametre değil: wte ile bağlı (tie_word_embeddings)

    def forward(self, input_ids, past_key_values=None, use_cache=False):
        c, p = self.config, self.params
        ids = np.atleast_2d(np.asarray(input_ids))
        b, t = ids.shape
        past_len = 0 if past_key_values is None else past_key_values[0][0].shape[2]
        if past_len + t > c.n_positions:
            raise ValueError(f"Dizi uzunluğu {past_len + t} > n_positions={c.n_positions}")
        x = p["transformer.wte.weight"][ids] + p["transformer.wpe.weight"][past_len : past_len + t]
        new_past = []
        scale = 1.0 / np.sqrt(c.n_embd // c.n_head)
        for i in range(c.n_layer):
            pre = f"transformer.h.{i}."
            h = layer_norm(x, p[pre + "ln_1.weight"], p[pre + "ln_1.bias"], c.layer_norm_epsilon)
            qkv = h @ p[pre + "attn.c_attn.weight"] + p[pre + "attn.c_attn.bias"]
            q, k, v = (split_heads(z, c.n_head) for z in np.split(qkv, 3, axis=-1))
            if past_key_values is not None:  # DynamicCache.update: dizi ekseninde birleştir
                k = np.concatenate([past_key_values[i][0], k], axis=2)
                v = np.concatenate([past_key_values[i][1], v], axis=2)
            new_past.append((k, v))
            scores = (q @ k.transpose(0, 1, 3, 2)) * scale  # (B, H, T, T_toplam)
            scores = np.where(causal_mask(t, k.shape[2]), scores, -np.inf)
            scores = np.exp(scores - scores.max(-1, keepdims=True))
            att = scores / scores.sum(-1, keepdims=True)
            y = merge_heads(att @ v)
            x = x + y @ p[pre + "attn.c_proj.weight"] + p[pre + "attn.c_proj.bias"]
            h2 = layer_norm(x, p[pre + "ln_2.weight"], p[pre + "ln_2.bias"], c.layer_norm_epsilon)
            m = gelu(h2 @ p[pre + "mlp.c_fc.weight"] + p[pre + "mlp.c_fc.bias"])
            x = x + m @ p[pre + "mlp.c_proj.weight"] + p[pre + "mlp.c_proj.bias"]
        x = layer_norm(x, p["transformer.ln_f.weight"], p["transformer.ln_f.bias"], c.layer_norm_epsilon)
        logits = x @ p["transformer.wte.weight"].T
        return CausalLMOutput(logits=logits, past_key_values=new_past if use_cache else None)

    __call__ = forward
