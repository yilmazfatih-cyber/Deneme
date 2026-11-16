"""csv modülünün testi: ortak vektörler + yaz/oku gidiş-dönüş + parça sınırından bağımsızlık (akış)."""

from __future__ import annotations

import csv as stdlib_csv
import io
import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import csv
from kutuphane.csv import CsvError, CsvParser, iter_csv, parse_csv, to_csv


def _load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    here = Path(__file__).resolve().parent
    for candidate in (
        here / "vektorler" / f"{name}.json",
        here.parents[1] / "vektorler" / f"{name}.json",
    ):
        if candidate.exists():
            data: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
            return dict(data["islevler"])
    raise FileNotFoundError(f"vektorler/{name}.json bulunamadı")


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("csv").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(csv, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(CsvError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


_ALPHABET = ["a", "b", "ç", "Ş", ",", ";", '"', "\n", "\r", " ", "=", "1"]


def _random_table(rng: random.Random) -> list[list[str]]:
    table = [
        [
            "".join(rng.choice(_ALPHABET) for _ in range(rng.randint(0, 5)))
            for _ in range(rng.randint(1, 4))
        ]
        for _ in range(rng.randint(1, 5))
    ]
    return [row for row in table if row != [""]]


def test_round_trip_with_every_delimiter() -> None:
    rng = random.Random(51)
    for _ in range(500):
        table = _random_table(rng)
        for delimiter in (",", ";", "\t"):
            assert (
                parse_csv(to_csv(table, delimiter=delimiter), delimiter=delimiter, strict=True)
                == table
            )


def test_chunk_boundaries_do_not_matter() -> None:
    rng = random.Random(52)
    for _ in range(200):
        # Ayırıcı ilk satırdan bulunduğu için ilk satır iki sütunlu bir başlıktır.
        table = [["ad", "soyad"], *_random_table(rng)]
        text = to_csv(table, delimiter=";", bom=True)
        parser = CsvParser()
        rows: list[list[str]] = []
        at = 0
        while at < len(text):
            size = rng.randint(1, 4)
            rows += parser.push(text[at : at + size])
            at += size
        rows += parser.end()
        assert rows == parse_csv(text) == table


def test_agrees_with_stdlib_csv_on_rfc_data() -> None:
    """Standart kütüphane csv modülüyle (başvuru gerçeklemesi) aynı tabloyu okur."""
    rng = random.Random(53)
    for _ in range(300):
        table = _random_table(rng)
        text = to_csv(table)
        reference = list(stdlib_csv.reader(io.StringIO(text, newline="")))
        assert parse_csv(text, delimiter=",") == reference


def test_iter_csv_and_errors() -> None:
    assert list(iter_csv(["a,b\n", "1,", "2"])) == [["a", "b"], ["1", "2"]]
    with pytest.raises(CsvError, match="Satır 3"):
        parse_csv('a\nb\n"c,d')
    with pytest.raises(CsvError):
        to_csv([[float("nan")]])
