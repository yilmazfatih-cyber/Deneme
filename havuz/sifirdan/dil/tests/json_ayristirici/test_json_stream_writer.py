"""Akış ayrıştırıcısı ve yazıcı testleri: parça sınırları, olaylar, hata eşliği, dumps, CLI."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from json_ayristirici import (
    Event,
    EventKind,
    EventParser,
    JsonError,
    build,
    dumps,
    iter_events,
    loads,
)
from json_ayristirici.__main__ import main
from json_ayristirici.writer import JsonWriteError

K = EventKind


def test_events_for_small_document() -> None:
    events = list(iter_events(['{"a": [1, tr', "ue], ", '"b": null}']))
    assert events == [
        Event(K.START_OBJECT),
        Event(K.KEY, "a"),
        Event(K.START_ARRAY),
        Event(K.VALUE, 1),
        Event(K.VALUE, True),
        Event(K.END_ARRAY),
        Event(K.KEY, "b"),
        Event(K.VALUE, None),
        Event(K.END_OBJECT),
    ]


@pytest.mark.parametrize(
    "text",
    [
        '"merhaba dünya"',
        '"kaçış \\n \\u00e7 \\ud83d\\ude00 son"',
        "-12345.678e-9",
        '[true, false, null, 0, "ğ"]',
        '{"iç": {"içi": [[], {}]}}',
    ],
)
def test_every_single_character_split_gives_same_value(text: str) -> None:
    expected = loads(text)
    chunks = list(text)  # en kötü durum: her karakter ayrı parça
    assert build(iter_events(chunks)) == expected
    for cut in range(len(text) + 1):
        assert build(iter_events([text[:cut], text[cut:]])) == expected


def test_feed_returns_events_as_soon_as_possible() -> None:
    parser = EventParser()
    assert parser.feed("[1") == [Event(K.START_ARRAY)]  # 1 bitmiş olmayabilir (12?)
    assert parser.feed("2, 3") == [Event(K.VALUE, 12)]
    assert parser.feed("]") == [Event(K.VALUE, 3), Event(K.END_ARRAY)]
    assert parser.close() == []
    with pytest.raises(RuntimeError):
        parser.feed("x")


def test_stream_errors_match_recursive_parser() -> None:
    text = '{"a": [1,\n  2,]}'
    with pytest.raises(JsonError) as dom:
        loads(text)
    with pytest.raises(JsonError) as stream:
        build(iter_events([text[:5], text[5:11], text[11:]]))
    assert str(stream.value) == str(dom.value)


def test_stream_depth_limit_without_recursion() -> None:
    with pytest.raises(JsonError, match="çok derin"):
        build(iter_events(["[" * 100_000]))


def test_dumps_matches_stdlib_formatting() -> None:
    value = {"ç": [1, 2.5, None, True, "\x00\x7f\u2028😀"], "b": {"x": []}, "a": {}}
    for options in [
        {},
        {"indent": 2},
        {"indent": 0},
        {"sort_keys": True},
        {"ensure_ascii": False},
        {"separators": (",", ":")},
        {"indent": "\t", "ensure_ascii": False},
    ]:
        assert dumps(value, **options) == json.dumps(value, **options), options  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (float("nan"), "NaN"),
        ({"a": [float("inf")]}, r"\$\['a'\]\[0\]"),
        ({1: "a"}, "anahtarı dizgi olmalı"),
        ({1, 2}, "set türü"),
    ],
)
def test_dumps_errors(value: object, message: str) -> None:
    with pytest.raises(JsonWriteError, match=message):
        dumps(value)


def test_dumps_detects_cycles_and_depth() -> None:
    loop: list[object] = []
    loop.append(loop)
    with pytest.raises(JsonWriteError, match="döngüsel"):
        dumps(loop)
    deep: list[object] = []
    for _ in range(500):
        deep = [deep]
    with pytest.raises(JsonWriteError, match="çok derin"):
        dumps(deep)


def test_dumps_default_hook() -> None:
    assert dumps({"k": {3, 1}}, default=lambda o: sorted(o)) == '{"k": [1, 3]}'  # type: ignore[call-overload]


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    good = tmp_path / "iyi.json"
    good.write_text('{"b": 1, "a": [true]}', encoding="utf-8")
    bad = tmp_path / "kotu.json"
    bad.write_text('{"a": 1,}', encoding="utf-8")
    assert main(["dogrula", str(good)]) == 0
    assert main(["bicimle", str(good), "--sirali"]) == 0
    assert main(["olaylar", str(good), "--parca", "3"]) == 0
    assert main(["dogrula", str(bad)]) == 1
    assert main(["dogrula", str(tmp_path / "yok.json")]) == 2
    out = capsys.readouterr()
    assert '{\n  "a": [\n    true\n  ],\n  "b": 1\n}' in out.out
    assert "nesne_basi" in out.out and "anahtar 'b'" in out.out
    assert "sondaki virgül" in out.err and "^" in out.err
