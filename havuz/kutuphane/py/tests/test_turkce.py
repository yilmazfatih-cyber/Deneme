"""turkce modülünün testi: ortak vektörler (vektorler/turkce.json) + özellik testleri."""

from __future__ import annotations

import dataclasses
import datetime
import itertools
import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import turkce
from kutuphane.turkce import (
    compare_tr,
    is_vowel,
    lower_tr,
    sort_key_tr,
    sort_tr,
    syllabify,
    upper_tr,
)

_LOWER = "abcçdefgğhıijklmnoöprsştuüvyz"
_MIXED = _LOWER + "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"
_ALPHABET = "abcçdefgğhıijklmnoöpqrsştuüvwxyz"


def _load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    here = Path(__file__).resolve().parent
    for candidate in (
        here / "vektorler" / f"{name}.json",
        here.parents[1] / "vektorler" / f"{name}.json",
    ):
        if candidate.exists():
            data: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
            return dict(data["islevler"])
    raise FileNotFoundError(
        f"vektorler/{name}.json bulunamadı (testin yanında ya da kutuphane/vektorler altında)"
    )


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _plain(value: Any) -> Any:
    """Python sonucunu JSON'daki beklenen biçime çevirir (dataclass → sözlük, tarih → ISO metni)."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, datetime.date | datetime.datetime):
        return value.isoformat()
    if isinstance(value, list | tuple):
        return [_plain(item) for item in value]
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    return value


def _resolve(module: Any, name: str) -> Any:
    snake = _snake(name)
    fn = getattr(module, snake, None) or getattr(module, snake + "_", None)
    assert callable(fn), f'vektör dosyasındaki "{name}" işlevi ({snake}) modülde yok'
    return fn


def _cases(name: str) -> list[Any]:
    return [
        pytest.param(fn_name, case, id=f"{fn_name}#{index + 1}")
        for fn_name, cases in _load_vectors(name).items()
        for index, case in enumerate(cases)
    ]


@pytest.mark.parametrize(("name", "case"), _cases("turkce"))
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = _resolve(turkce, name)
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(ValueError):
            fn(*case["girdi"], **kwargs)
    else:
        assert _plain(fn(*case["girdi"], **kwargs)) == case["cikti"]


def _random_word(rng: random.Random, alphabet: str, max_length: int = 8) -> str:
    return "".join(rng.choice(alphabet) for _ in range(rng.randint(1, max_length)))


def test_builtin_trap_is_avoided() -> None:
    assert "i".upper() == "I"  # tuzak: yerleşik işlev
    assert upper_tr("i") == "İ"
    assert len("İ".lower()) == 2  # tuzak: i + birleşik nokta
    assert lower_tr("İ") == "i"


def test_case_round_trip_and_idempotence() -> None:
    rng = random.Random(2)
    for _ in range(300):
        word = _random_word(rng, _MIXED)
        assert lower_tr(upper_tr(word)) == lower_tr(word)
        assert upper_tr(upper_tr(word)) == upper_tr(word)
        assert lower_tr(lower_tr(word)) == lower_tr(word)


def test_compare_matches_naive_alphabet_order() -> None:
    """Küçük harfli sözcüklerde sıra, harflerin alfabedeki yerine bakan saf gerçeklemeyle aynıdır."""
    rng = random.Random(5)
    for _ in range(2000):
        a = _random_word(rng, _ALPHABET, 6)
        b = _random_word(rng, _ALPHABET, 6)
        naive_a = [_ALPHABET.index(ch) for ch in a]
        naive_b = [_ALPHABET.index(ch) for ch in b]
        expected = 0 if naive_a == naive_b else (-1 if naive_a < naive_b else 1)
        assert compare_tr(a, b) == expected, f"{a} ~ {b}"


def test_compare_is_antisymmetric_and_sort_is_consistent() -> None:
    rng = random.Random(3)
    words = [_random_word(rng, _MIXED + " -1", 5) for _ in range(60)]
    for a in words:
        for b in words:
            assert compare_tr(a, b) == -compare_tr(b, a)
    original = list(words)
    ordered = sort_tr(words)
    assert words == original
    assert ordered == sorted(words, key=lambda w: (sort_key_tr(w), w))
    for left, right in itertools.pairwise(ordered):
        assert compare_tr(left, right) <= 0


def test_sort_objects_by_field() -> None:
    people = [{"ad": "Şule"}, {"ad": "Selin"}, {"ad": "Çağla"}]
    assert [p["ad"] for p in sort_tr(people, by=lambda p: p["ad"])] == ["Çağla", "Selin", "Şule"]


def test_syllables_join_back_and_have_one_vowel_each() -> None:
    rng = random.Random(7)
    for _ in range(500):
        word = _random_word(rng, _LOWER, 12)
        syllables = syllabify(word)
        assert "".join(syllables) == word
        vowel_count = sum(1 for ch in word if is_vowel(ch))
        if vowel_count > 0:
            assert len(syllables) == vowel_count
            assert all(sum(1 for ch in s if is_vowel(ch)) == 1 for s in syllables)
