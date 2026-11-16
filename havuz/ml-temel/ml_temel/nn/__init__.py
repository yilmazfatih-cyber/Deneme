"""nn — sinir ağı katmanları (`autograd` üstünde; arayüz PyTorch'a bilerek benzer).

Kullanım:
    from ml_temel import nn, optim
    from ml_temel.autograd import Tensor, cross_entropy
    model = nn.MLP([2, 16, 2], activation="tanh", rng=0)
    optimizer = optim.Adam(model.parameters(), lr=0.01)
    loss = cross_entropy(model(Tensor(X)), y); model.zero_grad(); loss.backward(); optimizer.step()

Dosyalar: `module.py` (taban), `layers.py`, `norm.py`, `attention.py`, `gpt.py`, `conv.py`,
`init.py`.
Genişletme: AGENTS.md → "Yeni katman ekle".
"""

from ml_temel.nn.attention import CausalSelfAttention, TransformerBlock
from ml_temel.nn.conv import Conv2d, MaxPool2d
from ml_temel.nn.gpt import GPT, GPTConfig
from ml_temel.nn.init import manual_seed
from ml_temel.nn.layers import (
    ACTIVATIONS,
    GELU,
    MLP,
    Dropout,
    Embedding,
    Flatten,
    Linear,
    ReLU,
    Sequential,
    Sigmoid,
    Tanh,
)
from ml_temel.nn.module import Module, Parameter
from ml_temel.nn.norm import LayerNorm, RMSNorm

__all__ = [
    "ACTIVATIONS",
    "GELU",
    "GPT",
    "MLP",
    "CausalSelfAttention",
    "Conv2d",
    "Dropout",
    "Embedding",
    "Flatten",
    "GPTConfig",
    "LayerNorm",
    "Linear",
    "MaxPool2d",
    "Module",
    "Parameter",
    "RMSNorm",
    "ReLU",
    "Sequential",
    "Sigmoid",
    "Tanh",
    "TransformerBlock",
    "manual_seed",
]
