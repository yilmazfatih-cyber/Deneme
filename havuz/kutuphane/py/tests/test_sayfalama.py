"""sayfalama modülünün testi: ortak vektörler + imleçle bütün listeyi eksiksiz ve yinelemesiz gezme."""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import sayfalama
from kutuphane.sayfalama import CursorError, keyset_where, paginate


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


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _plain(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if hasattr(value, "_asdict"):
        return {_camel(k): _plain(v) for k, v in value._asdict().items()}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("sayfalama").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(sayfalama, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(CursorError):
            fn(*case["girdi"], **kwargs)
    else:
        assert _plain(fn(*case["girdi"], **kwargs)) == case["cikti"]


def test_walk_all_pages_exactly_once() -> None:
    items = [{"tarih": f"2026-01-{1 + i // 4:02d}", "id": i} for i in range(53)]
    for limit in (1, 2, 5, 10, 53, 100):
        seen: list[int] = []
        cursor: str | None = None
        for _ in range(100):
            page = paginate(items, limit=limit, cursor=cursor, sort_keys=["tarih", "id"])
            seen += [item["id"] for item in page.items]
            cursor = page.next_cursor
            if not page.has_more:
                break
        assert seen == [item["id"] for item in items]


def test_custom_placeholder_and_unpacking() -> None:
    clause, params = keyset_where(["a", "b"], [1, 2], placeholder=lambda i: f"${i}")
    assert clause == "(a > $1) OR (a = $2 AND b > $3)"
    assert params == [1, 1, 2]
