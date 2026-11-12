"""Aşama 6 — Trainer: elle yazılmış geri yayılım + AdamW ile küçük bir eğitim döngüsü.

Gerçek Trainer (src/transformers/trainer.py) türevi PyTorch autograd'a bırakır; train() ->
_inner_training_loop() -> training_step() -> compute_loss() zincirini, karma duyarlık, dağıtık eğitim,
geri çağrılar (trainer_callback.py) ve kontrol noktalarıyla yönetir. Burada autograd olmadığı için
her katmanın türevini zincir kuralıyla kendimiz yazıyoruz; doğruluğu testte sonlu farklarla sınanıyor.
"""

from __future__ import annotations

import dataclasses

import numpy as np

from .models.gpt.modeling_gpt import GELU_C, causal_mask, gelu, merge_heads, split_heads


def _ln_forward(x, g, b, eps):
    mu = x.mean(-1, keepdims=True)
    rstd = 1.0 / np.sqrt(((x - mu) ** 2).mean(-1, keepdims=True) + eps)
    xhat = (x - mu) * rstd
    return xhat * g + b, (xhat, rstd, g)


def _ln_backward(dy, cache):
    xhat, rstd, g = cache
    c = xhat.shape[-1]
    dg = (dy * xhat).reshape(-1, c).sum(0)
    db = dy.reshape(-1, c).sum(0)
    dxhat = dy * g
    dx = rstd * (dxhat - dxhat.mean(-1, keepdims=True) - xhat * (dxhat * xhat).mean(-1, keepdims=True))
    return dx, dg, db


def _gelu_grad(x):
    t = np.tanh(GELU_C * (x + 0.044715 * x * x * x))
    return 0.5 * (1 + t) + 0.5 * x * (1 - t * t) * GELU_C * (1 + 3 * 0.044715 * x * x)


def loss_and_grads(model, ids, targets):
    """Ortalama çapraz entropi kaybı ve her parametrenin gradyanı."""
    cfg, p = model.config, model.params
    b, t = ids.shape
    c, nh, eps = cfg.n_embd, cfg.n_head, cfg.layer_norm_epsilon
    n, scale, mask = b * t, 1.0 / np.sqrt(cfg.n_embd // cfg.n_head), causal_mask(t, t)
    grads = {k: np.zeros_like(v) for k, v in p.items()}

    # ---- ileri geçiş: geri geçişte gereken ara değerleri sakla
    x = p["transformer.wte.weight"][ids] + p["transformer.wpe.weight"][:t]
    caches = []
    for i in range(cfg.n_layer):
        pre = f"transformer.h.{i}."
        h1, ln1 = _ln_forward(x, p[pre + "ln_1.weight"], p[pre + "ln_1.bias"], eps)
        qkv = h1 @ p[pre + "attn.c_attn.weight"] + p[pre + "attn.c_attn.bias"]
        q, k, v = (split_heads(z, nh) for z in np.split(qkv, 3, axis=-1))
        s = np.where(mask, (q @ k.transpose(0, 1, 3, 2)) * scale, -np.inf)
        s = np.exp(s - s.max(-1, keepdims=True))
        att = s / s.sum(-1, keepdims=True)
        y = merge_heads(att @ v)
        x = x + y @ p[pre + "attn.c_proj.weight"] + p[pre + "attn.c_proj.bias"]
        h2, ln2 = _ln_forward(x, p[pre + "ln_2.weight"], p[pre + "ln_2.bias"], eps)
        f = h2 @ p[pre + "mlp.c_fc.weight"] + p[pre + "mlp.c_fc.bias"]
        gf = gelu(f)
        x = x + gf @ p[pre + "mlp.c_proj.weight"] + p[pre + "mlp.c_proj.bias"]
        caches.append((h1, ln1, q, k, v, att, y, h2, ln2, f, gf))
    xf, lnf = _ln_forward(x, p["transformer.ln_f.weight"], p["transformer.ln_f.bias"], eps)
    wte = p["transformer.wte.weight"]
    logits = xf @ wte.T
    z = logits - logits.max(-1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(-1, keepdims=True))
    flat_t = targets.reshape(-1)
    loss = -logp.reshape(n, -1)[np.arange(n), flat_t].mean()

    # ---- geri geçiş: zincir kuralı, sondan başa
    dlogits = np.exp(logp).reshape(n, -1)
    dlogits[np.arange(n), flat_t] -= 1.0
    dlogits /= n
    grads["transformer.wte.weight"] += dlogits.T @ xf.reshape(n, c)  # bağlı lm_head yolu
    dx, dg, db = _ln_backward((dlogits @ wte).reshape(b, t, c), lnf)
    grads["transformer.ln_f.weight"] += dg
    grads["transformer.ln_f.bias"] += db
    for i in reversed(range(cfg.n_layer)):
        pre = f"transformer.h.{i}."
        h1, ln1, q, k, v, att, y, h2, ln2, f, gf = caches[i]
        # MLP dalı: x_cikis = x_orta + gelu(LN2(x_orta) @ Wfc) @ Wproj
        grads[pre + "mlp.c_proj.weight"] += gf.reshape(n, -1).T @ dx.reshape(n, c)
        grads[pre + "mlp.c_proj.bias"] += dx.reshape(n, c).sum(0)
        df = (dx @ p[pre + "mlp.c_proj.weight"].T) * _gelu_grad(f)
        grads[pre + "mlp.c_fc.weight"] += h2.reshape(n, c).T @ df.reshape(n, -1)
        grads[pre + "mlp.c_fc.bias"] += df.reshape(n, -1).sum(0)
        d, dg, db = _ln_backward(df @ p[pre + "mlp.c_fc.weight"].T, ln2)
        grads[pre + "ln_2.weight"] += dg
        grads[pre + "ln_2.bias"] += db
        dx = dx + d  # artık bağlantı: gradyan iki yoldan toplanır
        # Dikkat dalı: x_orta = x_giris + (softmax(QK^T)V) @ Wproj
        grads[pre + "attn.c_proj.weight"] += y.reshape(n, c).T @ dx.reshape(n, c)
        grads[pre + "attn.c_proj.bias"] += dx.reshape(n, c).sum(0)
        dyh = split_heads(dx @ p[pre + "attn.c_proj.weight"].T, nh)
        datt = dyh @ v.transpose(0, 1, 3, 2)
        dv = att.transpose(0, 1, 3, 2) @ dyh
        ds = att * (datt - (datt * att).sum(-1, keepdims=True)) * scale  # softmax'ın Jacobian'ı
        dq, dk = ds @ k, ds.transpose(0, 1, 3, 2) @ q
        dqkv = np.concatenate([merge_heads(dq), merge_heads(dk), merge_heads(dv)], axis=-1)
        grads[pre + "attn.c_attn.weight"] += h1.reshape(n, c).T @ dqkv.reshape(n, -1)
        grads[pre + "attn.c_attn.bias"] += dqkv.reshape(n, -1).sum(0)
        d, dg, db = _ln_backward(dqkv @ p[pre + "attn.c_attn.weight"].T, ln1)
        grads[pre + "ln_1.weight"] += dg
        grads[pre + "ln_1.bias"] += db
        dx = dx + d
    np.add.at(grads["transformer.wte.weight"], ids, dx)  # gömme tablosuna dağıtarak ekle
    grads["transformer.wpe.weight"][:t] += dx.sum(0)
    return float(loss), grads


@dataclasses.dataclass
class TrainingArguments:
    learning_rate: float = 3e-3
    max_steps: int = 200
    batch_size: int = 8
    block_size: int = 32
    weight_decay: float = 0.01
    beta1: float = 0.9
    beta2: float = 0.99
    eps: float = 1e-8
    seed: int = 0


@dataclasses.dataclass
class TrainOutput:
    global_step: int
    training_loss: float


class Trainer:
    def __init__(self, model, args, train_ids):
        self.model, self.args = model, args
        self.data = np.asarray(train_ids, dtype=np.int64)
        if args.block_size > model.config.n_positions or len(self.data) <= args.block_size + 1:
            raise ValueError("block_size modele sığmalı ve veri block_size'dan uzun olmalı")
        self.m = {k: np.zeros_like(v) for k, v in model.params.items()}
        self.v = {k: np.zeros_like(v) for k, v in model.params.items()}
        self.step = 0
        self.log_history: list[dict] = []

    def get_batch(self, rng):
        bs, n = self.args.block_size, self.args.batch_size
        starts = rng.integers(0, len(self.data) - bs - 1, size=n)
        x = np.stack([self.data[s : s + bs] for s in starts])
        y = np.stack([self.data[s + 1 : s + bs + 1] for s in starts])  # hedef: bir sonraki belirteç
        return x, y

    def _adamw(self, grads):
        a = self.args
        self.step += 1
        corr1, corr2 = 1 - a.beta1**self.step, 1 - a.beta2**self.step
        for k, w in self.model.params.items():
            g = grads[k]
            self.m[k] = a.beta1 * self.m[k] + (1 - a.beta1) * g
            self.v[k] = a.beta2 * self.v[k] + (1 - a.beta2) * g * g
            if w.ndim == 2:  # ağırlık sönümü yalnızca matrislere (bias ve LayerNorm'a değil)
                w -= a.learning_rate * a.weight_decay * w
            w -= a.learning_rate * (self.m[k] / corr1) / (np.sqrt(self.v[k] / corr2) + a.eps)

    def training_step(self, x, y):
        loss, grads = loss_and_grads(self.model, x, y)
        self._adamw(grads)
        return loss

    def train(self):
        rng = np.random.default_rng(self.args.seed)
        losses = []
        for _ in range(self.args.max_steps):
            losses.append(self.training_step(*self.get_batch(rng)))
            self.log_history.append({"step": self.step, "loss": losses[-1]})
        return TrainOutput(global_step=self.step, training_loss=float(np.mean(losses)))
