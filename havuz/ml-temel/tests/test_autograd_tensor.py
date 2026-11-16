"""Tensor çekirdeği: yayınlama, birikme, no_grad, hata iletileri, sayısal kararlılık."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel import autograd as ag
from ml_temel.autograd import Tensor, no_grad, unbroadcast


def test_known_derivative() -> None:
    x = Tensor([1.0, 2.0, 3.0], requires_grad=True)
    y = (x * x * x).sum()  # dy/dx = 3x²
    y.backward()
    assert x.grad is not None
    np.testing.assert_allclose(x.grad, [3.0, 12.0, 27.0])


def test_broadcast_gradient_is_summed_back() -> None:
    a = Tensor(np.ones((2, 3)), requires_grad=True)
    b = Tensor(np.ones(3), requires_grad=True)
    c = Tensor(2.0, requires_grad=True)
    (a * b + c).sum().backward()
    assert a.grad is not None and b.grad is not None and c.grad is not None
    assert a.grad.shape == (2, 3)
    np.testing.assert_allclose(b.grad, [2.0, 2.0, 2.0])
    np.testing.assert_allclose(c.grad, 6.0)


def test_unbroadcast_shapes() -> None:
    g = np.ones((4, 2, 3))
    assert unbroadcast(g, (2, 3)).shape == (2, 3)
    assert unbroadcast(g, (2, 1)).shape == (2, 1)
    assert unbroadcast(g, ()).shape == ()
    np.testing.assert_allclose(unbroadcast(g, (1, 3)), np.full((1, 3), 8.0))


def test_tensor_used_twice_accumulates() -> None:
    x = Tensor(3.0, requires_grad=True)
    (x * x + x).backward()  # 2x + 1
    assert x.grad is not None
    assert float(x.grad) == pytest.approx(7.0)


def test_diamond_graph_visits_each_node_once() -> None:
    x = Tensor(2.0, requires_grad=True)
    a = x * 3.0
    y = a + a * a  # dy/dx = 3 + 2·a·3 = 3 + 36
    y.backward()
    assert x.grad is not None
    assert float(x.grad) == pytest.approx(39.0)
    order = y.topological_order()
    assert len({id(node) for node in order}) == len(order)
    assert order[-1] is y


def test_leaf_gradients_accumulate_until_zeroed() -> None:
    x = Tensor([1.0, 2.0], requires_grad=True)
    y = (x * 2.0).sum()
    y.backward()
    y.backward()
    assert x.grad is not None
    np.testing.assert_allclose(x.grad, [4.0, 4.0])
    x.zero_grad()
    assert x.grad is None


def test_sibling_leaves_do_not_share_gradient_memory() -> None:
    a = Tensor([1.0, 2.0], requires_grad=True)
    b = Tensor([3.0, 4.0], requires_grad=True)
    (a + b).sum().backward()
    assert a.grad is not None and b.grad is not None
    a.grad *= 10.0  # yerinde değişiklik b'yi etkilememeli
    np.testing.assert_allclose(b.grad, [1.0, 1.0])


def test_no_grad_builds_no_graph() -> None:
    x = Tensor([1.0, 2.0], requires_grad=True)
    with no_grad():
        y = (x * x).sum()
    assert not y.requires_grad
    assert y.topological_order() == [y]
    assert ag.is_grad_enabled()
    with pytest.raises(RuntimeError, match="gradyan gerektirmiyor"):
        y.backward()


def test_backward_on_non_scalar_needs_grad() -> None:
    x = Tensor([1.0, 2.0], requires_grad=True)
    y = x * 2.0
    with pytest.raises(RuntimeError, match="skaler"):
        y.backward()
    y.backward(np.array([1.0, 10.0]))
    assert x.grad is not None
    np.testing.assert_allclose(x.grad, [2.0, 20.0])


def test_deep_graph_does_not_overflow_recursion() -> None:
    x = Tensor(1.0, requires_grad=True)
    y = x
    for _ in range(5000):
        y = y + 0.001
    y.backward()
    assert x.grad is not None
    assert float(x.grad) == pytest.approx(1.0)


def test_numpy_on_the_left_returns_tensor() -> None:
    x = Tensor([1.0, 2.0], requires_grad=True)
    y = np.array([3.0, 4.0]) * x + 1.0 - x / 2.0
    assert isinstance(y, Tensor)
    z = np.eye(2) @ x
    assert isinstance(z, Tensor)
    (y.sum() + z.sum()).backward()
    assert x.grad is not None
    np.testing.assert_allclose(x.grad, [3.5, 4.5])


def test_softmax_and_log_softmax_are_stable_for_huge_inputs() -> None:
    x = Tensor([[1000.0, 1001.0, -1000.0], [-1e6, 0.0, 1e6]], requires_grad=True)
    probs = ag.softmax(x)
    assert np.isfinite(probs.data).all()
    np.testing.assert_allclose(probs.data.sum(axis=-1), [1.0, 1.0])
    logp = ag.log_softmax(x)
    assert np.isfinite(logp.data[0, :2]).all()
    logp.sum().backward()
    assert x.grad is not None
    assert np.isfinite(x.grad).all()


def test_sigmoid_and_bce_do_not_overflow() -> None:
    z = Tensor([-800.0, 0.0, 800.0], requires_grad=True)
    np.testing.assert_allclose(ag.sigmoid(z).data, [0.0, 0.5, 1.0], atol=1e-12)
    loss = ag.binary_cross_entropy_with_logits(z, np.array([0.0, 1.0, 1.0]))
    assert loss.item() == pytest.approx(np.log(2.0) / 3.0)
    loss.backward()
    assert z.grad is not None
    assert np.isfinite(z.grad).all()


def test_cross_entropy_matches_manual_value_and_ignores_padding() -> None:
    logits = Tensor([[2.0, 0.0, 0.0], [0.0, 3.0, 0.0], [5.0, 5.0, 5.0]], requires_grad=True)
    targets = np.array([0, 1, -1])
    loss = ag.cross_entropy(logits, targets, ignore_index=-1)
    expected = -(np.log(np.exp(2) / (np.exp(2) + 2)) + np.log(np.exp(3) / (np.exp(3) + 2))) / 2
    assert loss.item() == pytest.approx(expected)
    loss.backward()
    assert logits.grad is not None
    np.testing.assert_allclose(logits.grad[2], 0.0)
    with pytest.raises(ValueError, match="aralığında"):
        ag.cross_entropy(logits, np.array([0, 1, 7]))


def test_wrong_backward_shape_is_reported() -> None:
    from ml_temel.autograd.tensor import make

    x = Tensor(np.ones((2, 3)), requires_grad=True)
    bad = make(x.data.sum(), (x,), lambda g: x.accumulate(np.ones((3, 2))), "bad")
    with pytest.raises(RuntimeError, match="biçim"):
        bad.backward()


def test_reshape_accepts_both_spellings_and_item() -> None:
    x = Tensor(np.arange(6.0))
    assert x.reshape(2, 3).shape == (2, 3)
    assert x.reshape((3, -1)).shape == (3, 2)
    assert x.reshape(2, 3).T.shape == (3, 2)
    assert Tensor(4.5).item() == 4.5
    with pytest.raises(ValueError, match="tek elemanlı"):
        x.item()
