"""Çıkarım: bir yaprağın tüm çekimlerini (gerekirse örtüşen pencerelerle) kodlar."""

from __future__ import annotations

import numpy as np
import torch

from .dataset import Sequence, collate
from .model import MediaFMMini, window_starts, window_weights


@torch.no_grad()
def encode(model: MediaFMMini, seq: Sequence, hide_shot: np.ndarray | None = None,
           stride: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Dönen: (h (n, d), pred (n, 3, in_dim)). `hide_shot` verilirse o çekimler [MASK] ile gizlenir."""
    model.eval()
    n, L = seq.n, model.cfg.max_len
    stride = stride or max(1, L // 2)
    hide = np.zeros(n, bool) if hide_shot is None else hide_shot
    d, D = model.cfg.d, model.cfg.in_dim
    h_acc = torch.zeros(n, d)
    p_acc = torch.zeros(n, 3, D)
    w_acc = torch.zeros(n)
    for a in window_starts(n, L, stride):
        b = min(a + L, n)
        batch = collate([(seq, a, b, hide[a:b], np.zeros((b - a, 3), bool))])
        h, pred = model(batch)
        w = window_weights(b - a) if n > L else torch.ones(b - a)
        h_acc[a:b] += h[0] * w[:, None]
        p_acc[a:b] += pred[0] * w[:, None, None]
        w_acc[a:b] += w
    return (h_acc / w_acc[:, None]).numpy(), (p_acc / w_acc[:, None, None]).numpy()


def l2n(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def pooled(h: np.ndarray) -> np.ndarray:
    """Yaprak vektörü: birim uzunluktaki bağlamsal çekim vektörlerinin ortalaması."""
    return l2n(l2n(h).mean(0))
