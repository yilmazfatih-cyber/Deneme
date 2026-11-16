"""nn katmanları: parametre bulma, kaydet/yükle, kipler, katman gradyanları, nedensellik."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from ml_temel import nn
from ml_temel.autograd import Tensor, assert_gradcheck, no_grad


def test_named_parameters_use_attribute_paths() -> None:
    model = nn.Sequential(nn.Linear(3, 4, rng=0), nn.Tanh(), nn.Linear(4, 2, bias=False, rng=1))
    names = [name for name, _ in model.named_parameters()]
    assert names == ["layers.0.weight", "layers.0.bias", "layers.2.weight"]
    assert model.num_parameters() == 3 * 4 + 4 + 4 * 2


def test_state_dict_round_trip_through_npz(tmp_path: Path) -> None:
    model = nn.MLP([3, 5, 2], rng=0)
    path = model.save(tmp_path / "agirlik")
    assert path.suffix == ".npz"
    other = nn.MLP([3, 5, 2], rng=99)
    x = Tensor(np.random.default_rng(0).standard_normal((4, 3)))
    assert not np.allclose(model(x).data, other(x).data)
    other.load(path)
    np.testing.assert_allclose(model(x).data, other(x).data)


def test_load_state_dict_reports_mismatches() -> None:
    model = nn.MLP([3, 5, 2], rng=0)
    state = model.state_dict()
    wrong_shape = dict(state)
    wrong_shape["linears.0.weight"] = np.zeros((3, 9))
    with pytest.raises(ValueError, match="biçimi uyuşmuyor"):
        model.load_state_dict(wrong_shape)
    missing = dict(state)
    del missing["linears.1.bias"]
    with pytest.raises(ValueError, match="uyuşmuyor"):
        model.load_state_dict(missing)


def test_state_dict_is_a_copy() -> None:
    layer = nn.Linear(2, 2, rng=0)
    state = layer.state_dict()
    state["weight"][:] = 0.0
    assert not np.allclose(layer.weight.data, 0.0)


def test_dropout_is_active_only_in_training() -> None:
    layer = nn.Dropout(0.5, rng=0)
    x = Tensor(np.ones((200, 50)))
    dropped = layer(x).data
    assert 0.4 < (dropped == 0).mean() < 0.6
    assert dropped.mean() == pytest.approx(1.0, abs=0.05)  # ters dropout ortalamayı korur
    layer.eval()
    np.testing.assert_array_equal(layer(x).data, x.data)


def test_train_and_eval_reach_nested_modules() -> None:
    model = nn.GPT(
        nn.GPTConfig(vocab_size=5, block_size=4, n_layer=1, n_embd=8, dropout=0.1), rng=0
    )
    model.eval()
    assert all(not module.training for module in model.modules())
    model.train()
    assert all(module.training for module in model.modules())


def test_linear_layernorm_rmsnorm_gradients() -> None:
    x = Tensor(np.random.default_rng(0).standard_normal((3, 4)))
    for layer in (nn.Linear(4, 3, rng=0), nn.LayerNorm(4), nn.RMSNorm(4)):
        for parameter in layer.parameters():  # ağırlıklar 1/0'dan farklı olsun
            parameter.data = parameter.data + np.random.default_rng(1).standard_normal(
                parameter.shape
            )
        assert_gradcheck(lambda *_, layer=layer: layer(x), layer.parameters())
        x_var = Tensor(x.data, requires_grad=True)
        assert_gradcheck(lambda t, layer=layer: layer(t), [x_var])


def test_layernorm_output_statistics() -> None:
    x = Tensor(np.random.default_rng(0).standard_normal((5, 16)) * 7.0 + 3.0)
    out = nn.LayerNorm(16)(x).data
    np.testing.assert_allclose(out.mean(axis=-1), 0.0, atol=1e-10)
    np.testing.assert_allclose(out.std(axis=-1), 1.0, atol=1e-3)
    rms = nn.RMSNorm(16)(x).data
    np.testing.assert_allclose(np.sqrt((rms**2).mean(axis=-1)), 1.0, atol=1e-3)


def test_embedding_validates_indices() -> None:
    table = nn.Embedding(5, 3, rng=0)
    assert table(np.array([[0, 4], [2, 2]])).shape == (2, 2, 3)
    with pytest.raises(IndexError, match="aralığında"):
        table(np.array([5]))
    with pytest.raises(TypeError, match="tam sayı"):
        table(np.array([0.5]))


def test_attention_block_gradients() -> None:
    block = nn.TransformerBlock(n_embd=8, n_head=2, block_size=4, rng=0)
    x = Tensor(np.random.default_rng(0).standard_normal((2, 4, 8)), requires_grad=True)
    assert_gradcheck(block, [x], rtol=1e-3)
    parameters = [block.attention.query.weight, block.attention.proj.bias, block.expand.weight]
    assert_gradcheck(lambda *_: block(x), parameters, rtol=1e-3)


def test_attention_is_causal() -> None:
    attention = nn.CausalSelfAttention(n_embd=8, n_head=2, block_size=6, rng=0)
    rng = np.random.default_rng(0)
    base = rng.standard_normal((1, 6, 8))
    changed = base.copy()
    changed[0, 4:] = rng.standard_normal((2, 8))  # yalnız "gelecek" değişti
    with no_grad():
        out_base = attention(Tensor(base)).data
        out_changed = attention(Tensor(changed)).data
    np.testing.assert_allclose(out_base[0, :4], out_changed[0, :4], atol=1e-12)
    assert not np.allclose(out_base[0, 4:], out_changed[0, 4:])


def test_gpt_shapes_loss_and_weight_tying() -> None:
    config = nn.GPTConfig(vocab_size=11, block_size=8, n_layer=2, n_head=2, n_embd=16)
    model = nn.GPT(config, rng=0)
    tokens = np.random.default_rng(0).integers(0, 11, size=(3, 8))
    logits, loss = model(tokens, tokens)
    assert logits.shape == (3, 8, 11)
    assert loss is not None
    assert loss.item() == pytest.approx(np.log(11), abs=0.3)  # başlangıçta ≈ düzgün dağılım
    names = [name for name, _ in model.named_parameters()]
    assert "token_embedding.weight" in names
    assert not any(name.startswith("head") for name in names)
    untied = nn.GPT(nn.GPTConfig(vocab_size=11, block_size=8, n_embd=16, tie_weights=False), rng=0)
    assert untied.num_parameters() == model.num_parameters() + 11 * 16
    with pytest.raises(ValueError, match="block_size"):
        model(np.zeros((1, 9), dtype=np.int64))


def test_gpt_is_causal_and_generation_is_seeded() -> None:
    model = nn.GPT(nn.GPTConfig(vocab_size=7, block_size=8, n_embd=16, norm="rms"), rng=0)
    first = np.array([[1, 2, 3, 4, 5, 6]])
    second = np.array([[1, 2, 3, 4, 0, 0]])
    with no_grad():
        logits_first, _ = model(first)
        logits_second, _ = model(second)
    np.testing.assert_allclose(logits_first.data[0, :4], logits_second.data[0, :4], atol=1e-10)
    a = model.generate(np.array([[1, 2]]), max_new_tokens=12, rng=3)
    b = model.generate(np.array([[1, 2]]), max_new_tokens=12, rng=3)
    np.testing.assert_array_equal(a, b)
    assert a.shape == (1, 14)
    assert model.training  # üretim kipi eski hâline döndürür


def test_gpt_save_and_from_file(tmp_path: Path) -> None:
    model = nn.GPT(nn.GPTConfig(vocab_size=9, block_size=6, n_layer=1, n_embd=8), rng=0)
    path = model.save(tmp_path / "gpt.npz")
    restored = nn.GPT.from_file(path)
    assert restored.config == model.config
    tokens = np.array([[1, 2, 3]])
    with no_grad():
        np.testing.assert_allclose(model(tokens)[0].data, restored(tokens)[0].data)


def test_conv2d_matches_naive_loops_and_has_correct_gradients() -> None:
    rng = np.random.default_rng(0)
    layer = nn.Conv2d(2, 3, kernel_size=3, stride=1, padding=1, rng=0)
    assert layer.bias is not None
    layer.bias.data = rng.standard_normal(3)
    x = rng.standard_normal((2, 2, 5, 4))
    out = layer(Tensor(x)).data
    padded = np.pad(x, ((0, 0), (0, 0), (1, 1), (1, 1)))
    naive = np.zeros_like(out)
    for n in range(2):
        for f in range(3):
            for i in range(5):
                for j in range(4):
                    window = padded[n, :, i : i + 3, j : j + 3]
                    naive[n, f, i, j] = (window * layer.weight.data[f]).sum() + layer.bias.data[f]
    np.testing.assert_allclose(out, naive, atol=1e-12)
    assert_gradcheck(lambda *_: layer(Tensor(x)), layer.parameters())
    pooled = nn.MaxPool2d(2)(Tensor(x[:, :, :4, :4]))
    assert pooled.shape == (2, 2, 2, 2)
    assert pooled.data[0, 0, 0, 0] == x[0, 0, :2, :2].max()
