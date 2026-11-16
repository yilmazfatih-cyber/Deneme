"""sema modülünün testi: JSON tanımından kurulan şemalarla ortak vektörler + parse davranışı."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane.sema import (
    Schema,
    SchemaError,
    array,
    boolean,
    literal,
    number,
    object_,
    one_of,
    record,
    string,
    union,
)


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


def _build(spec: dict[str, Any]) -> Schema:
    """Vektör dosyasındaki JSON tanımından şema kurar (TypeScript testindeki build ile aynı kurallar)."""
    kind = spec["tip"]
    schema: Schema
    if kind == "string":
        s = string()
        if spec.get("trim"):
            s = s.trim()
        if "min" in spec:
            s = s.min(spec["min"])
        if "max" in spec:
            s = s.max(spec["max"])
        if spec.get("email"):
            s = s.email()
        if "regex" in spec:
            s = s.regex(spec["regex"])
        schema = s
    elif kind == "number":
        n = number(coerce=spec.get("coerce", False))
        if spec.get("integer"):
            n = n.integer()
        if "min" in spec:
            n = n.min(spec["min"])
        if "max" in spec:
            n = n.max(spec["max"])
        if spec.get("positive"):
            n = n.positive()
        schema = n
    elif kind == "boolean":
        schema = boolean(coerce=spec.get("coerce", False))
    elif kind == "literal":
        schema = literal(spec["value"])
    elif kind == "oneOf":
        schema = one_of(spec["values"])
    elif kind == "array":
        a = array(_build(spec["item"]))
        if "min" in spec:
            a = a.min(spec["min"])
        if "max" in spec:
            a = a.max(spec["max"])
        schema = a
    elif kind == "object":
        o = object_({key: _build(value) for key, value in spec["shape"].items()})
        mode = spec.get("mode")
        schema = o.strict() if mode == "strict" else o.passthrough() if mode == "passthrough" else o
    elif kind == "union":
        schema = union([_build(option) for option in spec["options"]])
    elif kind == "record":
        schema = record(_build(spec["value"]))
    else:
        raise ValueError(f"Bilinmeyen tip: {kind}")
    if spec.get("optional"):
        schema = schema.optional()
    if spec.get("nullable"):
        schema = schema.nullable()
    if "default" in spec:
        schema = schema.default(spec["default"])
    return schema


_CASES = [
    pytest.param(case, id=f"safeParse#{index + 1}")
    for index, case in enumerate(_load_vectors("sema")["safeParse"])
]


@pytest.mark.parametrize("case", _CASES)
def test_vectors(case: dict[str, Any]) -> None:
    spec, value = case["girdi"]
    assert _build(spec).safe_parse(value) == case["cikti"]


def test_parse_reports_all_issues() -> None:
    person = object_(
        {
            "ad": string().trim().min(2),
            "yas": number().integer().min(0).optional(),
            "rol": one_of(["okur", "yazar"]).default("okur"),
            "etiketler": array(string()).max(3),
        }
    )
    assert person.parse({"ad": " Ali ", "etiketler": []}) == {
        "ad": "Ali",
        "rol": "okur",
        "etiketler": [],
    }
    with pytest.raises(SchemaError) as info:
        person.parse({"ad": "A", "yas": -1, "etiketler": ["a", "b", "c", "d"]})
    paths = [".".join(map(str, issue["path"])) for issue in info.value.issues]
    assert paths == ["ad", "yas", "etiketler"]
    assert "ad: En az 2 karakter olmalı." in str(info.value)


def test_refine_and_transform() -> None:
    password = (
        string()
        .min(8)
        .refine(lambda v: re.search("[0-9]", v) is not None, "En az bir rakam içermeli.")
        .transform(len)
    )
    assert password.safe_parse("abcdefgh") == {
        "ok": False,
        "issues": [{"path": [], "message": "En az bir rakam içermeli."}],
    }
    assert password.parse("abcdefg1") == 8
