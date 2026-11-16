"""Markdown güvenlik, kimlik/içindekiler, dayanıklılık testleri ve CLI.

Güvenlik özelliği (hypothesis): rastgele Markdown benzeri girdide çıktıdaki HER etiket ve öznitelik
izin listesindedir; hiçbir href/src tehlikeli şemayla başlamaz.
"""

from __future__ import annotations

import re
import time
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from markdown import convert, slugify, to_html
from markdown.__main__ import main

ALLOWED_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "em", "strong", "del", "code", "pre", "a", "img",
    "ul", "ol", "li", "blockquote", "hr", "br", "table", "thead", "tbody", "tr", "th", "td",
    "input", "nav",
}  # fmt: skip
ALLOWED_ATTRS = {
    "id",
    "href",
    "title",
    "src",
    "alt",
    "class",
    "start",
    "align",
    "type",
    "disabled",
    "checked",
}
TAG = re.compile(r"<(/?)([a-zA-Z0-9]+)([^>]*)>")
ATTR = re.compile(r'\s*([a-zA-Z-]+)="([^"]*)"')
DANGEROUS = re.compile(r"^\s*(javascript|vbscript|data|file):", re.IGNORECASE)


def assert_safe(html: str) -> None:
    for _closing, name, attrs in TAG.findall(html):
        assert name in ALLOWED_TAGS, f"izinsiz etiket <{name}> çıktıda: {html!r}"
        rest = attrs.rstrip(" /")
        consumed = "".join(m.group(0) for m in ATTR.finditer(rest))
        assert consumed.replace(" ", "") == rest.replace(" ", ""), (
            f"çözülemeyen öznitelik: {attrs!r}"
        )
        for key, value in ATTR.findall(rest):
            assert key in ALLOWED_ATTRS, key
            if key in ("href", "src"):
                assert not DANGEROUS.match(value), value
    assert "<script" not in html.lower()  # tr-güvenli: ASCII karşılaştırma


@pytest.mark.parametrize(
    "source",
    [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "[tık](javascript:alert(1))",
        "[tık](JaVaScRiPt:alert(1))",
        "[tık]( javascript:alert(1))",
        "[tık](<java\tscript:alert(1)>)",
        "[tık](&#106;avascript:alert(1))",
        "[tık](javascript&#58;alert(1))",
        "![r](data:image/svg+xml;base64,PHN2Zz4=)",
        "<javascript:alert(1)>",
        '[a](https://x "t\\" onmouseover=\\"alert(1))',
        '[a](https://x" onmouseover="alert(1))',
        "```\n</code></pre><script>x</script>\n```",
        "`<b>kod</b>`",
        "| <i>a</i> |\n|---|\n| <script> |",
    ],
)
def test_attacks_are_neutralized(source: str) -> None:
    html = to_html(source)
    assert_safe(html)
    assert 'href="javascript' not in html.lower()  # tr-güvenli: ASCII karşılaştırma


def test_unsafe_link_keeps_text_only() -> None:
    assert to_html("[tık](javascript:alert(1))") == "<p>tık</p>\n"
    assert to_html("![resim](data:x)") == "<p>resim</p>\n"


@given(st.text(alphabet="<>\"'&*_~`[]()!:/\\#-|=+. \nabjvscript", max_size=60))
def test_any_input_produces_safe_html(source: str) -> None:
    assert_safe(to_html(source))


@pytest.mark.parametrize(
    ("text", "slug"),
    [
        ("Çalışma Ortamı & Kurulum", "calisma-ortami-kurulum"),
        ("İĞNE ve IŞIK", "igne-ve-isik"),
        ("Şükrü'nün Öğütleri", "sukru-nun-ogutleri"),
        ("Crème brûlée", "creme-brulee"),
        ("   ", "bolum"),
        ("2026 Planı!", "2026-plani"),
    ],
)
def test_slugify_turkish(text: str, slug: str) -> None:
    assert slugify(text) == slug


def test_duplicate_headings_get_numbered_ids_and_toc() -> None:
    result = convert("# Giriş\n## Kurulum\n## Kurulum\n### *Ayrıntı*\n\n[[içindekiler]]")
    assert [e.id for e in result.toc] == ["giris", "kurulum", "kurulum-1", "ayrinti"]
    assert [e.text for e in result.toc] == ["Giriş", "Kurulum", "Kurulum", "Ayrıntı"]
    assert '<nav class="icindekiler">' in result.html
    assert '<li><a href="#kurulum-1">Kurulum</a></li>' in result.html
    assert result.html.count("<ul>") == result.html.count("</ul>") == 3


def test_deep_nesting_is_limited_without_crash() -> None:
    assert_safe(to_html(">" * 5000 + " derin"))
    assert_safe(to_html("".join("  " * i + "- a\n" for i in range(300))))


def test_pathological_emphasis_is_fast() -> None:
    started = time.perf_counter()
    to_html("*a " * 20_000 + "_b " * 20_000)
    to_html("[" * 20_000 + "]" * 20_000)
    assert time.perf_counter() - started < 10  # karesel davranış olsaydı dakikalar sürerdi


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    doc = tmp_path / "belge.md"
    doc.write_text("# Başlık\n\nMerhaba *dünya*.\n\n## Alt Başlık\n", encoding="utf-8")
    out_file = tmp_path / "belge.html"
    assert main(["cevir", str(doc)]) == 0
    assert main(["cevir", str(doc), "-o", str(out_file), "--tam-sayfa"]) == 0
    assert main(["icindekiler", str(doc)]) == 0
    assert main(["cevir", str(tmp_path / "yok.md")]) == 2
    printed = capsys.readouterr().out
    assert '<h1 id="baslik">Başlık</h1>' in printed
    assert "  - Alt Başlık  (#alt-baslik)" in printed
    page = out_file.read_text(encoding="utf-8")
    assert page.startswith("<!doctype html>") and "<title>Başlık</title>" in page
