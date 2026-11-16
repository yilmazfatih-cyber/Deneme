"""Şablon motoru testleri: ifadeler, etiketler, süzgeçler, kapsam, include, hatalar ve CLI."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from sablon import DictLoader, Environment, FileLoader, TemplateError, render
from sablon.__main__ import main


@pytest.mark.parametrize(
    ("source", "data", "expected"),
    [
        ("{{ ad }}", {"ad": "Ayşe"}, "Ayşe"),
        ("{{ a.b.c }}", {"a": {"b": {"c": 3}}}, "3"),
        ("{{ l[1] }} {{ l[-1] }} {{ d['k'] }}", {"l": [1, 2, 3], "d": {"k": "v"}}, "2 3 v"),
        ("{{ 2 + 3 * 4 }} {{ (2 + 3) * 4 }} {{ 7 % 3 }} {{ -2 }}", {}, "14 20 1 -2"),
        ("{{ 'a' ~ 1 ~ none }}", {}, "a1"),
        ("{{ x == 1 and not y }}", {"x": 1, "y": False}, "True"),
        ("{{ 'b' in l }} {{ 'z' not in l }}", {"l": ["a", "b"]}, "True True"),
        ("{{ isim | default('misafir') }}", {}, "misafir"),
        ("{{ '' | default('boş', true) }}", {}, "boş"),
        ("{{ 'istanbul ılık' | upper }}", {}, "İSTANBUL ILIK"),
        ("{{ 'İSTANBUL IŞIK' | lower }}", {}, "istanbul ışık"),
        ("{{ 'iyi günler ılgaz' | title }}", {}, "İyi Günler Ilgaz"),
        ("{{ 'iSTANBUL' | capitalize }}", {}, "İstanbul"),
        ("{{ 1234567.891 | sayi(2) }} {{ 5 | sayi }}", {}, "1.234.567,89 5"),
        (
            "{{ l | join(', ') }} {{ l | length }} {{ l | first }} {{ l | last }}",
            {"l": [3, 1, 2]},
            "3, 1, 2 3 3 2",
        ),
        ("{{ l | sort | reverse | join }}", {"l": [3, 1, 2]}, "321"),
        ("{{ '  a  ' | trim }}|{{ 'abc' | replace('b', 'x') }}", {}, "a|axc"),
        ("{{ 'uzun bir metin' | truncate(8) }}", {}, "uzun bi…"),
        ("{{ 'a b&c' | urlencode }}", {}, "a%20b%26c"),
        ('{{ "}}" }}', {}, "}}"),
        ("a {# yorum #}b", {}, "a b"),
    ],
)
def test_expressions_and_filters(source: str, data: dict[str, object], expected: str) -> None:
    assert render(source, data) == expected


def test_if_elif_else() -> None:
    src = "{% if n > 10 %}büyük{% elif n > 5 %}orta{% else %}küçük{% endif %}"
    assert [render(src, n=n) for n in (20, 7, 1)] == ["büyük", "orta", "küçük"]


def test_for_loop_variables_else_and_unpacking() -> None:
    src = (
        "{% for x in l %}{{ loop.index }}/{{ loop.length }}"
        "{% if loop.last %}.{% else %},{% endif %}{% endfor %}"
    )
    assert render(src, l=["a", "b", "c"]) == "1/3,2/3,3/3."
    assert render("{% for x in l %}{{ x }}{% else %}yok{% endfor %}", l=[]) == "yok"
    pairs = "{% for k, v in d | items %}{{ k }}={{ v }};{% endfor %}"
    assert render(pairs, d={"a": 1, "b": 2}) == "a=1;b=2;"


def test_set_is_scoped_to_loop_body() -> None:
    src = "{% set t = 1 %}{% for x in [1, 2] %}{% set t = x * 10 %}{{ t }} {% endfor %}{{ t }}"
    assert render(src) == "10 20 1"


def test_whitespace_control() -> None:
    src = "<ul>\n  {%- for x in l %}\n  <li>{{ x }}</li>\n  {%- endfor %}\n</ul>"
    assert render(src, l=[1, 2]) == "<ul>\n  <li>1</li>\n  <li>2</li>\n</ul>"
    assert render("a  {{- 'b' -}}  c") == "abc"


def test_objects_attributes() -> None:
    @dataclass
    class Kisi:
        ad: str
        yas: int

    assert render("{{ k.ad }} ({{ k.yas }})", k=Kisi("Ali", 70)) == "Ali (70)"


def test_include_with_dict_loader_and_cache() -> None:
    env = Environment(
        DictLoader({"ana.html": "[{% include 'ust.html' %}]", "ust.html": "{{ baslik }}"})
    )
    assert env.get_template("ana.html").render(baslik="Köprü") == "[Köprü]"
    assert env.get_template("ana.html") is env.get_template("ana.html")


def test_file_loader(tmp_path: Path) -> None:
    (tmp_path / "parca").mkdir()
    (tmp_path / "parca" / "alt.html").write_text("alt:{{ x }}", encoding="utf-8")
    (tmp_path / "sayfa.html").write_text('<{% include "parca/alt.html" %}>', encoding="utf-8")
    env = Environment(FileLoader(tmp_path))
    assert env.get_template("sayfa.html").render(x=1) == "<alt:1>"


def test_non_strict_mode_prints_empty_for_undefined() -> None:
    env = Environment(strict=False)
    assert env.from_string("[{{ yok }}]").render() == "[]"


@pytest.mark.parametrize(
    ("source", "line", "col", "message", "hint"),
    [
        ("Merhaba\n{{ ad }}", 2, 4, "'ad' tanımlı değil", "default"),
        ("{% if x %}a{% endfor %}", 1, 14, "'{% endfor %}' burada beklenmiyordu", "'{% endif %}'"),
        ("ilk\n{% for x in l %}a", 2, 3, "'{% for %}' bloğu kapanmadı", "endfor"),
        ("{{ a | yok_boyle }}", 1, 8, "bilinmeyen süzgeç", "Süzgeçler:"),
        ("{% dongu %}", 1, 3, "bilinmeyen etiket", "Bilinen etiketler"),
        ("{{ a ", 1, 1, "'{{' kapanmadı", "'}}'"),
        ("{{ 1 + 'a' }}", 1, 6, "'+' işlemi sayı ile metin arasında yapılamaz", None),
        ("{% if x > 3 %}{% endif %}", 1, 9, "tanımsız 'x' ile sayı", None),
        ("{{ 'a' if b }}", 1, 8, "fazladan 'if'", "{% if %}"),
        ("{% for in l %}{% endfor %}", 1, 3, "for biçimi hatalı", "Örnek"),
        ("{% for x in 5 %}{% endfor %}", 1, 3, "döngü için liste gerekir", None),
        ("{% endif %}", 1, 3, "beklenmiyordu", "açılış karşılığı yok"),
    ],
)
def test_errors_have_position_and_hint(
    source: str, line: int, col: int, message: str, hint: str | None
) -> None:
    with pytest.raises(TemplateError) as info:
        render(source, l=[1])
    err = info.value
    assert (err.line, err.col) == (line, col), str(err)
    assert message in err.message
    if hint is not None:
        assert err.hint is not None and hint in err.hint


def test_error_render_shows_caret() -> None:
    source = "<p>\n  {{ kullanici.ad }}\n</p>"
    with pytest.raises(TemplateError) as info:
        render(source)
    text = info.value.render(source)
    assert "Şablon hatası (<dizgi>, satır 2, sütun 6)" in text
    assert text.splitlines()[2] == "     | " + " " * 5 + "^"


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tmp_path / "s.html").write_text("<b>{{ ad | upper }}</b>", encoding="utf-8")
    (tmp_path / "v.json").write_text(json.dumps({"ad": "<i>"}), encoding="utf-8")
    (tmp_path / "hata.html").write_text("{{ yok }}", encoding="utf-8")
    assert main(["isle", str(tmp_path / "s.html"), "--veri", str(tmp_path / "v.json")]) == 0
    assert main(["isle", str(tmp_path / "hata.html")]) == 1
    assert main(["isle", str(tmp_path / "yok.html")]) == 2
    out = capsys.readouterr()
    assert out.out == "<b>&lt;İ&gt;</b>"  # Türkçe büyük harf: i → İ
    assert "'yok' tanımlı değil" in out.err and "^" in out.err
