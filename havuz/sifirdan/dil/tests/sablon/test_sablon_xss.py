"""Güvenlik (XSS ve kum havuzu) testleri: varsayılan kaçış, Markup, tojson, safe_url, yükleyici."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from sablon import DictLoader, Environment, FileLoader, Markup, TemplateError, escape, render

ATTACKS = [
    "<script>alert(1)</script>",
    '" onmouseover="alert(1)',
    "' onfocus='alert(1)",
    "<img src=x onerror=alert(1)>",
    "&lt;zaten&gt; & <b>",
]


@pytest.mark.parametrize("attack", ATTACKS)
def test_text_and_attribute_contexts_are_escaped(attack: str) -> None:
    html = render("<p title=\"{{ x }}\" data-a='{{ x }}'>{{ x }}</p>", x=attack)
    inner = html[html.index(">") + 1 : html.rindex("<")]
    assert "<" not in inner and ">" not in inner
    for quoted in ('title="', "data-a='"):
        value = html.split(quoted, 1)[1]
        closing = '"' if quoted.endswith('"') else "'"
        assert value.index(closing) == len(escape(attack))  # tırnak içinden çıkılamadı


def test_all_five_characters_are_escaped() -> None:
    assert render("{{ x }}", x="&<>\"'") == "&amp;&lt;&gt;&#34;&#39;"


def test_markup_is_trusted_and_never_double_escaped() -> None:
    assert render("{{ x }}", x=Markup("<b>güvenli</b>")) == "<b>güvenli</b>"
    once = escape("<a>")
    assert escape(once) == once == "&lt;a&gt;"
    assert render("{{ x | e | e }}", x="<a>") == "&lt;a&gt;"


def test_markup_plus_untrusted_text_escapes_the_text() -> None:
    combined = Markup("<b>") + "<script>"
    assert combined == "<b>&lt;script&gt;"
    assert isinstance(combined, Markup)
    assert "<b>" + Markup("<i>") == "&lt;b&gt;<i>"


def test_safe_filter_is_the_only_bypass() -> None:
    assert render("{{ x | safe }}", x="<b>") == "<b>"
    assert render("{{ x | upper }}", x="<b>") == "&lt;B&gt;"
    assert render("{{ x | join(', ') }}", x=["<a>", Markup("<b>")]) == "&lt;a&gt;, <b>"
    assert render("{{ '<i>' ~ x }}", x="y") == "&lt;i&gt;y"  # şablondaki dizgi de kaçışlanır


def test_tojson_cannot_close_script_tag() -> None:
    payload = {"ad": "</script><script>alert(1)</script>", "tek": "'"}
    html = render("<script>var v = {{ v | tojson }};</script>", v=payload)
    assert html.count("</script>") == 1
    assert "\\u003c/script\\u003e" in html and "\\u0027" in html


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "  javascript:alert(1)",
        "java\tscript:alert(1)",
        "java\x00script:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html,<script>alert(1)</script>",
    ],
)
def test_safe_url_blocks_dangerous_schemes(url: str) -> None:
    assert render('<a href="{{ u | safe_url }}">', u=url) == '<a href="#">'


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://ornek.com/a?b=1&c=2", "https://ornek.com/a?b=1&amp;c=2"),
        ("/yerel/sayfa", "/yerel/sayfa"),
        ("#bolum", "#bolum"),
        ("mailto:ali@ornek.com", "mailto:ali@ornek.com"),
    ],
)
def test_safe_url_allows_normal_links(url: str, expected: str) -> None:
    assert render('<a href="{{ u | safe_url }}">', u=url) == f'<a href="{expected}">'


@pytest.mark.parametrize(
    "source",
    ["{{ x.__class__ }}", "{{ x['__class__'] }}", "{{ _gizli }}", "{{ x._ozel }}", "{{ s.upper }}"],
)
def test_sandbox_blocks_private_names_and_methods(source: str) -> None:
    class Nesne:
        _ozel = "gizli"

    with pytest.raises(TemplateError):
        render(source, x=Nesne(), s="metin", _gizli=1)


def test_file_loader_blocks_path_traversal(tmp_path: Path) -> None:
    root = tmp_path / "sablonlar"
    root.mkdir()
    (tmp_path / "gizli.txt").write_text("PAROLA", encoding="utf-8")
    os.symlink(tmp_path / "gizli.txt", root / "bag.html")
    env = Environment(FileLoader(root))
    for name in ["../gizli.txt", str(tmp_path / "gizli.txt"), "bag.html", "a/../../gizli.txt"]:
        template = env.from_string("{% include '" + name + "' %}")
        with pytest.raises(TemplateError, match="dışında"):
            template.render()


def test_include_recursion_is_limited() -> None:
    env = Environment(
        DictLoader({"a.html": "{% include 'b.html' %}", "b.html": "{% include 'a.html' %}"})
    )
    with pytest.raises(TemplateError, match="include çok derin") as info:
        env.get_template("a.html").render()
    assert info.value.hint is not None and "a.html → b.html → a.html" in info.value.hint


def test_autoescape_off_is_explicit_opt_in() -> None:
    assert Environment(autoescape=False).from_string("{{ x }}").render(x="<b>") == "<b>"
    assert Environment().from_string("{{ x }}").render(x="<b>") == "&lt;b&gt;"
