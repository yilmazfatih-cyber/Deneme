"""Ezberleme testleri: ağ gerçekten öğreniyor mu? (MLP XOR'u, minik GPT kısa bir diziyi öğrenir.)"""

from __future__ import annotations

import numpy as np

from ml_temel import nn, optim
from ml_temel.autograd import Tensor, cross_entropy, no_grad


def test_mlp_learns_xor() -> None:
    X = np.array([[0.0, 0.0], [0.0, 1.0], [1.0, 0.0], [1.0, 1.0]])
    y = np.array([0, 1, 1, 0])
    model = nn.MLP([2, 8, 2], activation="tanh", rng=0)
    optimizer = optim.Adam(model.parameters(), lr=0.05)
    loss_value = float("inf")
    for _ in range(300):
        loss = cross_entropy(model(Tensor(X)), y)
        model.zero_grad()
        loss.backward()
        optimizer.step()
        loss_value = loss.item()
    with no_grad():
        predicted = model(Tensor(X)).data.argmax(axis=1)
    np.testing.assert_array_equal(predicted, y)
    assert loss_value < 0.05


def test_sgd_with_momentum_fits_a_line() -> None:
    rng = np.random.default_rng(0)
    X = rng.standard_normal((64, 3))
    true_w = np.array([[1.5], [-2.0], [0.5]])
    y = X @ true_w + 0.7
    layer = nn.Linear(3, 1, rng=0)
    optimizer = optim.SGD(layer.parameters(), lr=0.05, momentum=0.9)
    for _ in range(200):
        difference = layer(Tensor(X)) - y
        loss = (difference * difference).mean()
        layer.zero_grad()
        loss.backward()
        optimizer.step()
    assert layer.bias is not None
    np.testing.assert_allclose(layer.weight.data, true_w, atol=1e-3)
    np.testing.assert_allclose(layer.bias.data, [0.7], atol=1e-3)


def test_tiny_gpt_memorizes_a_short_sequence() -> None:
    text = "gel gör beni aşk neyledi"
    chars = sorted(set(text))
    encode = {char: position for position, char in enumerate(chars)}
    tokens = np.array([encode[char] for char in text])
    config = nn.GPTConfig(vocab_size=len(chars), block_size=len(tokens) - 1, n_layer=1, n_embd=32)
    model = nn.GPT(config, rng=0)
    optimizer = optim.AdamW(model.parameters(), lr=1e-2, weight_decay=0.0)
    inputs, targets = tokens[None, :-1], tokens[None, 1:]
    loss_value = float("inf")
    for _ in range(150):
        _, loss = model(inputs, targets)
        assert loss is not None
        model.zero_grad()
        loss.backward()
        optim.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        loss_value = loss.item()
    assert loss_value < 0.1
    generated = model.generate(tokens[None, :1], max_new_tokens=len(tokens) - 1, temperature=0.0)
    assert "".join(chars[i] for i in generated[0]) == text
