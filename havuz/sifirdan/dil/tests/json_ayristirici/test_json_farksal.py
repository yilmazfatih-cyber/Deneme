"""Farksal testler (hypothesis): stdlib `json` ile ve akış ↔ özyinelemeli ayrıştırıcı arasında.

1. Geçerli belgeler: rastgele değer → `json.dumps` (rastgele biçim) → iki ayrıştırıcı aynı
   değeri verir.
2. Bozuk belgeler: geçerli metne rastgele silme/ekleme/değiştirme → ya ikisi de kabul eder (aynı
   değer) ya da ikisi de reddeder. stdlib'in RFC dışı kabulleri (NaN, Infinity, taşan ondalık)
   kancalarla kapatılır; eşi olmayan vekil için bizde `allow_lone_surrogates=True` kullanılır.
3. Akış: aynı metin rastgele parçalara bölünür; olaylardan kurulan değer ya da hata (ileti + satır +
   sütun) özyinelemeli ayrıştırıcıyla birebir aynıdır.
4. Yazıcı: `dumps` çıktısı stdlib ile aynı; `loads(dumps(x)) == x`.
"""

from __future__ import annotations

import json
import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from json_ayristirici import JsonError, Options, build, dumps, iter_events, loads

SCALARS = (
    st.none()
    | st.booleans()
    | st.integers(min_value=-(10**30), max_value=10**30)
    | st.floats(allow_nan=False, allow_infinity=False)
    | st.text(max_size=6)
)
VALUES = st.recursive(
    SCALARS,
    lambda children: (
        st.lists(children, max_size=4) | st.dictionaries(st.text(max_size=4), children, max_size=4)
    ),
    max_leaves=10,
)
FORMATS = st.sampled_from(
    [{}, {"indent": 2}, {"separators": (",", ":")}, {"ensure_ascii": False}, {"indent": "\t"}]
)
PALETTE = '[]{}",:0123456789-.eE \t\ntrufalsn\\/ax'
LENIENT = Options(allow_lone_surrogates=True)


def strict_float(text: str) -> float:
    value = float(text)
    if math.isinf(value):
        raise ValueError("taşma")
    return value


def reject_constant(name: str) -> object:
    raise ValueError(f"RFC dışı sabit: {name}")


def stdlib(text: str) -> tuple[str, object]:
    try:
        value = json.loads(text, parse_float=strict_float, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        return ("hata", None)
    return ("tamam", repr(value))


def ours(text: str) -> tuple[str, object]:
    try:
        return ("tamam", repr(loads(text, LENIENT)))
    except JsonError:
        return ("hata", None)


def dom_result(text: str) -> str:
    try:
        return "değer " + repr(loads(text))
    except JsonError as err:
        return "hata " + str(err)


def stream_result(chunks: list[str]) -> str:
    try:
        return "değer " + repr(build(iter_events(chunks)))
    except JsonError as err:
        return "hata " + str(err)


def mutate(text: str, data: st.DataObject) -> str:
    for _ in range(data.draw(st.integers(min_value=1, max_value=3))):
        pos = data.draw(st.integers(min_value=0, max_value=len(text)))
        kind = data.draw(st.sampled_from(["sil", "ekle", "değiştir"]))
        char = data.draw(st.sampled_from(PALETTE))
        if kind == "sil":
            text = text[:pos] + text[pos + 1 :]
        elif kind == "ekle":
            text = text[:pos] + char + text[pos:]
        else:
            text = text[:pos] + char + text[pos + 1 :]
    return text


def split(text: str, data: st.DataObject) -> list[str]:
    cuts = sorted(data.draw(st.lists(st.integers(min_value=0, max_value=len(text)), max_size=6)))
    pieces, last = [], 0
    for cut in cuts:
        pieces.append(text[last:cut])
        last = cut
    pieces.append(text[last:])
    return pieces


@given(VALUES, FORMATS)
def test_valid_documents_match_stdlib(value: object, fmt: dict[str, object]) -> None:
    text = json.dumps(value, **fmt)  # type: ignore[arg-type]
    assert ours(text) == stdlib(text)
    assert ours(text)[0] == "tamam"


@given(VALUES, FORMATS, st.data())
def test_mutated_documents_accept_or_reject_like_stdlib(
    value: object, fmt: dict[str, object], data: st.DataObject
) -> None:
    text = mutate(json.dumps(value, **fmt), data)  # type: ignore[arg-type]
    assert ours(text) == stdlib(text), repr(text)


@given(VALUES, st.data())
def test_stream_equals_recursive_parser(value: object, data: st.DataObject) -> None:
    text = json.dumps(value, ensure_ascii=data.draw(st.booleans()))
    if data.draw(st.booleans()):
        text = mutate(text, data)
    assert stream_result(split(text, data)) == dom_result(text), repr(text)


@given(VALUES, FORMATS)
def test_dumps_matches_stdlib_and_round_trips(value: object, fmt: dict[str, object]) -> None:
    assert dumps(value, **fmt) == json.dumps(value, **fmt)  # type: ignore[arg-type]
    assert repr(loads(dumps(value))) == repr(value)


@pytest.mark.parametrize(
    "text",
    ["[1, 2,]", '{"a": 1', "NaN", '"\\ud83d\\ude0', "-", "[[[", '{"a":}', "tru", "1 2", ""],
)
def test_stream_and_dom_agree_on_classic_errors(text: str) -> None:
    for cut in range(len(text) + 1):
        assert stream_result([text[:cut], text[cut:]]) == dom_result(text)
