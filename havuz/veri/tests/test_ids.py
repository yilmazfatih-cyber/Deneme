"""Sağlama algoritmaları: bilinen örnekler, özellik testleri ve python-stdnum ile karşılaştırma."""

from __future__ import annotations

import random

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from stdnum import iban as std_iban
from stdnum import luhn as std_luhn
from stdnum.tr import tckimlik as std_tckn
from stdnum.tr import vkn as std_vkn

from verihavuzu import ids

DIGITS9 = st.text(alphabet="0123456789", min_size=9, max_size=9)


# --- TCKN -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "number",
    [
        "10000000146",  # yaygın sınama numarası; elle doğrulama aşağıdaki testte
        "17291716060",  # python-stdnum belgelerindeki geçerli örnek
    ],
)
def test_tckn_known_valid(number: str) -> None:
    assert ids.is_valid_tckn(number)


def test_tckn_hand_computed() -> None:
    # 1 0 0 0 0 0 0 0 1 → tekler: 1+0+0+0+1 = 2; çiftler: 0; (2×7 − 0) mod 10 = 4
    # ilk 10 hane toplamı: 1+1+4 = 6 → 11. hane 6
    assert ids.tckn_check_digits("100000001") == "46"


@pytest.mark.parametrize(
    "number",
    [
        "17291716050",  # 10. hane bozuk (stdnum örneği)
        "10000000147",  # 11. hane bozuk
        "07291716092",  # 0 ile başlayamaz
        "1729171606",  # 10 hane
        "172917160600",  # 12 hane
        "1729171606a",
        "١٧٢٩١٧١٦٠٦٠",  # ASCII olmayan rakamlar kabul edilmez
        "",
    ],
)
def test_tckn_known_invalid(number: str) -> None:
    assert not ids.is_valid_tckn(number)


@given(DIGITS9.filter(lambda s: s[0] != "0"))
@settings(max_examples=300, deadline=None)
def test_tckn_generated_is_valid_and_matches_stdnum(first9: str) -> None:
    number = first9 + ids.tckn_check_digits(first9)
    assert ids.is_valid_tckn(number)
    assert std_tckn.is_valid(number)


@given(st.text(alphabet="0123456789", min_size=11, max_size=11))
@settings(max_examples=500, deadline=None)
def test_tckn_agrees_with_stdnum_on_random_numbers(number: str) -> None:
    assert ids.is_valid_tckn(number) == std_tckn.is_valid(number)


@given(DIGITS9.filter(lambda s: s[0] != "0"), st.integers(0, 10), st.integers(1, 9))
@settings(max_examples=300, deadline=None)
def test_tckn_single_digit_error_is_detected(first9: str, position: int, delta: int) -> None:
    number = first9 + ids.tckn_check_digits(first9)
    changed = (int(number[position]) + delta) % 10
    broken = number[:position] + str(changed) + number[position + 1 :]
    assert not ids.is_valid_tckn(broken)


# --- VKN ------------------------------------------------------------------------------------


def test_vkn_known_examples() -> None:
    assert ids.is_valid_vkn("4540536920")  # python-stdnum belgelerindeki geçerli örnek
    assert not ids.is_valid_vkn("4540536921")
    assert not ids.is_valid_vkn("454053692")
    assert not ids.is_valid_vkn("45405369200")
    assert not ids.is_valid_vkn("454053692x")


def test_vkn_hand_computed() -> None:
    # "000000000": her k için t = (0 + 10 − k) mod 10 = 10 − k (9,8,…,1); katkı = (t × 2^t) mod 9
    # t=9: 9×512=4608 → 0 → 9 | t=8: 8×256=2048 → 5 | t=7: 7×128=896 → 5 | t=6: 6×64=384 → 6
    # t=5: 5×32=160 → 7 | t=4: 4×16=64 → 1 | t=3: 3×8=24 → 6 | t=2: 2×4=8 → 8 | t=1: 1×2=2 → 2
    # toplam = 49 → sağlama = (10 − 9) mod 10 = 1
    assert ids.vkn_check_digit("000000000") == "1"


@given(st.text(alphabet="0123456789", min_size=10, max_size=10))
@settings(max_examples=500, deadline=None)
def test_vkn_agrees_with_stdnum_on_random_numbers(number: str) -> None:
    assert ids.is_valid_vkn(number) == std_vkn.is_valid(number)


@given(DIGITS9)
@settings(max_examples=300, deadline=None)
def test_vkn_generated_is_valid(first9: str) -> None:
    number = first9 + ids.vkn_check_digit(first9)
    assert ids.is_valid_vkn(number)
    assert std_vkn.is_valid(number)
    wrong = first9 + str((int(number[9]) + 1) % 10)
    assert not ids.is_valid_vkn(wrong)


# --- IBAN -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "number",
    [
        "TR330006100519786457841326",  # IBAN kayıt belgesindeki Türkiye örneği
        "TR33 0006 1005 1978 6457 8413 26",
        "GB82WEST12345698765432",  # yaygın İngiltere örneği
        "DE89370400440532013000",  # yaygın Almanya örneği
    ],
)
def test_iban_known_valid(number: str) -> None:
    assert ids.is_valid_iban(number)
    assert std_iban.is_valid(number)


def test_iban_tr_structure() -> None:
    assert ids.is_valid_iban_tr("TR330006100519786457841326")
    assert not ids.is_valid_iban_tr("GB82WEST12345698765432")  # geçerli ama Türkiye değil
    assert not ids.is_valid_iban_tr("TR330006100519786457841327")  # sağlama bozuk
    assert not ids.is_valid_iban_tr("TR33000610051978645784132")  # 25 karakter
    assert not ids.is_valid_iban_tr("tr330006100519786457841326")  # küçük harf
    assert ids.format_iban("TR330006100519786457841326") == "TR33 0006 1005 1978 6457 8413 26"


def test_iban_check_digits_reproduce_known_example() -> None:
    assert ids.iban_check_digits("TR", "0006100519786457841326") == "33"
    assert ids.iban_check_digits("GB", "WEST12345698765432") == "82"


def test_iban_generated_matches_stdnum() -> None:
    rng = random.Random(7)
    for _ in range(500):
        bban = "".join(rng.choice("0123456789") for _ in range(22))
        iban = "TR" + ids.iban_check_digits("TR", bban) + bban
        assert ids.is_valid_iban_tr(iban)
        assert std_iban.is_valid(iban)
        position = rng.randrange(4, 26)
        changed = str((int(iban[position]) + rng.randrange(1, 10)) % 10)
        broken = iban[:position] + changed + iban[position + 1 :]
        assert not ids.is_valid_iban(broken)  # mod 97 tek hane hatasını her zaman yakalar


# --- Luhn -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "number",
    ["4111111111111111", "5555555555554444", "378282246310005", "79927398713"],
)
def test_luhn_known_valid(number: str) -> None:
    assert ids.is_valid_luhn(number)
    assert std_luhn.is_valid(number)


def test_luhn_invalid_and_card_format() -> None:
    assert not ids.is_valid_luhn("4111111111111112")
    assert not ids.is_valid_luhn("")
    assert ids.is_valid_card_number("4111 1111 1111 1111")
    assert ids.is_valid_card_number("4111-1111-1111-1111")
    assert not ids.is_valid_card_number("79927398713")  # Luhn tutar ama 11 hane: kart değil


@given(st.text(alphabet="0123456789", min_size=1, max_size=25))
@settings(max_examples=500, deadline=None)
def test_luhn_agrees_with_stdnum(body: str) -> None:
    number = body + ids.luhn_check_digit(body)
    assert ids.is_valid_luhn(number)
    assert std_luhn.is_valid(number)
    assert ids.is_valid_luhn(body) == std_luhn.is_valid(body)
