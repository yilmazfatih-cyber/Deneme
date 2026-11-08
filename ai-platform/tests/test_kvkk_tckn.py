"""TCKN / VKN / TR IBAN sağlama algoritmaları. Gerçek kişi numarası kullanılmaz: numaralar algoritmayla üretilir."""

from __future__ import annotations

import pytest

from aiplatform.kvkk.tckn import (
    generate_valid_tckn,
    generate_valid_tr_iban,
    generate_valid_vkn,
    is_valid_tckn,
    is_valid_tr_iban,
    is_valid_vkn,
)


def _flip(s: str, i: int) -> str:
    return s[:i] + str((int(s[i]) + 1) % 10) + s[i + 1 :]


@pytest.mark.parametrize("seed", range(30))
def test_generated_tckn_valid(seed):
    t = generate_valid_tckn(seed)
    assert len(t) == 11 and t.isdigit() and t[0] != "0"
    assert is_valid_tckn(t)


@pytest.mark.parametrize("seed", range(10))
def test_corrupted_tckn_invalid(seed):
    t = generate_valid_tckn(seed)
    assert not is_valid_tckn(_flip(t, 10))  # 11. hane
    assert not is_valid_tckn(_flip(t, 9))  # 10. hane


def test_tckn_check_digit_formula():
    t = generate_valid_tckn(42)
    d = [int(c) for c in t]
    assert d[9] == ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10
    assert d[10] == sum(d[:10]) % 10


@pytest.mark.parametrize(
    "bad", ["", "123", "0" + generate_valid_tckn(1)[1:], "1234567890a", "123456789012", None]
)
def test_tckn_bad_formats(bad):
    assert not is_valid_tckn(bad)


@pytest.mark.parametrize("seed", range(20))
def test_vkn(seed):
    v = generate_valid_vkn(seed)
    assert len(v) == 10 and is_valid_vkn(v)
    assert not is_valid_vkn(_flip(v, 9))


def test_vkn_bad_formats():
    assert not is_valid_vkn("123")
    assert not is_valid_vkn("12345678901")
    assert not is_valid_vkn("abcdefghij")


@pytest.mark.parametrize("seed", range(20))
def test_iban(seed):
    iban = generate_valid_tr_iban(seed)
    assert iban.startswith("TR") and len(iban) == 26
    assert is_valid_tr_iban(iban)
    spaced = " ".join(iban[i : i + 4] for i in range(0, 26, 4))
    assert is_valid_tr_iban(spaced)
    assert is_valid_tr_iban(iban.lower())
    assert not is_valid_tr_iban(_flip(iban, 15))


def test_iban_bad_formats():
    iban = generate_valid_tr_iban(7)
    assert not is_valid_tr_iban("DE" + iban[2:])
    assert not is_valid_tr_iban(iban[:-1])
    assert not is_valid_tr_iban(iban + "0")
