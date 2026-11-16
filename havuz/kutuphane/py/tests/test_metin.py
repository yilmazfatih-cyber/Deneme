"""metin modülünün testi: ortak vektörler + kısaltma/sarma özellikleri."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import metin
from kutuphane.metin import TemplateError, escape_html, fill_template, truncate, wrap


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
    for name, cases in _load_vectors("metin").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(metin, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(ValueError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


_SAMPLE = (
    "Türkiye Büyük Millet Meclisi, 23 Nisan 1920 günü Ankara’da açıldı; çağdaş devletin temelidir."
)


def test_truncate_never_exceeds_and_is_prefix() -> None:
    for limit in range(len(_SAMPLE) + 3):
        result = truncate(_SAMPLE, limit)
        assert len(result) <= limit
        if result.endswith("…"):
            assert _SAMPLE.startswith(result[:-1])


def test_wrap_respects_width_and_keeps_words() -> None:
    for width in range(1, 31):
        lines = wrap(_SAMPLE, width)
        assert all(len(line) <= width for line in lines)
        assert "".join(lines).replace(" ", "") == _SAMPLE.replace(" ", "")


def test_template_escape_and_errors() -> None:
    assert (
        fill_template("<b>{ad}</b>", {"ad": "<script>"}, escape=escape_html)
        == "<b>&lt;script&gt;</b>"
    )
    with pytest.raises(TemplateError):
        fill_template("{x}", {"x": float("nan")})
