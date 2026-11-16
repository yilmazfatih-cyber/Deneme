from __future__ import annotations

import hashlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.merkle_tree import MerkleTree, leaf_hash, node_hash, verify_proof


def _recursive_root(leaves: list[bytes]) -> bytes:
    """Başvuru: düzey düzey değil, tanımdan (iki yarıya böl) — tek kalan yukarı taşınır."""
    level = [leaf_hash(x) for x in leaves]
    while len(level) > 1:
        paired = [node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
        level = paired + ([level[-1]] if len(level) % 2 else [])
    return level[0]


def test_hand_checked_example() -> None:
    tree = MerkleTree([b"tx1", b"tx2"])
    expected = hashlib.sha256(
        b"\x01" + hashlib.sha256(b"\x00tx1").digest() + hashlib.sha256(b"\x00tx2").digest()
    ).digest()
    assert tree.root == expected and len(tree) == 2
    assert tree.proof(0) == [(leaf_hash(b"tx2"), "right")]


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        MerkleTree([])
    single = MerkleTree([b"tek"])
    assert single.root == leaf_hash(b"tek") and single.proof(0) == []
    assert verify_proof(b"tek", [], single.root)
    with pytest.raises(IndexError):
        single.proof(1)
    assert not verify_proof(b"tek", [(b"x" * 32, "orta")], single.root)
    # yaprak/iç düğüm ayrımı: iki yaprağın birleşimi bir yaprak gibi gösterilemez
    pair = MerkleTree([b"a", b"b"])
    assert MerkleTree([leaf_hash(b"a") + leaf_hash(b"b")]).root != pair.root


@given(st.lists(st.binary(max_size=8), min_size=1, max_size=20), st.data())
def test_proofs_and_tampering(leaves: list[bytes], data: st.DataObject) -> None:
    tree = MerkleTree(leaves)
    assert tree.root == _recursive_root(leaves)
    for i, leaf in enumerate(leaves):
        proof = tree.proof(i)
        assert verify_proof(leaf, proof, tree.root)
        assert len(proof) <= max(1, (len(leaves) - 1).bit_length())
    i = data.draw(st.integers(0, len(leaves) - 1))
    changed = list(leaves)
    changed[i] = leaves[i] + b"!"
    assert MerkleTree(changed).root != tree.root
    assert not verify_proof(changed[i], tree.proof(i), tree.root)
