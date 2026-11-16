"""Markdown örnek-çıktı testleri: her girdi için beklenen HTML (CommonMark biçimine yakın)."""

from __future__ import annotations

import pytest

from markdown import to_html

BLOCKS = [
    ("# Bir\n###### Altı", '<h1 id="bir">Bir</h1>\n<h6 id="alti">Altı</h6>\n'),
    ("## Kapanış ##", '<h2 id="kapanis">Kapanış</h2>\n'),
    ("#Değil", "<p>#Değil</p>\n"),
    ("Başlık\n===\nAlt\n---", '<h1 id="baslik">Başlık</h1>\n<h2 id="alt">Alt</h2>\n'),
    ("bir\niki\n\nüç", "<p>bir\niki</p>\n<p>üç</p>\n"),
    ("***\n---\n___", "<hr />\n<hr />\n<hr />\n"),
    ("```py\nx = '<a>'\n```", "<pre><code class=\"language-py\">x = '&lt;a&gt;'\n</code></pre>\n"),
    ("~~~\nkod\n~~~", "<pre><code>kod\n</code></pre>\n"),
    ("````\n```\n````", "<pre><code>```\n</code></pre>\n"),
    ("```\nkapanmayan", "<pre><code>kapanmayan\n</code></pre>\n"),
    ("    girinti\n    devam", "<pre><code>girinti\ndevam\n</code></pre>\n"),
    ("> alıntı\ntembel", "<blockquote>\n<p>alıntı\ntembel</p>\n</blockquote>\n"),
    (
        "> a\n> > b",
        "<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>\n",
    ),
    ("- a\n- b", "<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n"),
    ("* a\n\n* b", "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n"),
    ("1. a\n1. b", "<ol>\n<li>a</li>\n<li>b</li>\n</ol>\n"),
    ("7) a\n8) b", '<ol start="7">\n<li>a</li>\n<li>b</li>\n</ol>\n'),
    (
        "- a\n  - b\n    - c",
        "<ul>\n<li>a\n<ul>\n<li>b\n<ul>\n<li>c</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n",
    ),
    ("- a\n+ b", "<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>\n"),
    (
        "- [ ] yap\n- [x] bitti",
        (
            '<ul>\n<li><input type="checkbox" disabled="" /> yap</li>\n'
            '<li><input type="checkbox" disabled="" checked="" /> bitti</li>\n</ul>\n'
        ),
    ),
    ("Paragraf\n- kesen liste", "<p>Paragraf</p>\n<ul>\n<li>kesen liste</li>\n</ul>\n"),
    ("Paragraf\n2. kesemez", "<p>Paragraf\n2. kesemez</p>\n"),
    (
        "| a | b |\n|---|:-:|\n| 1 | 2 |",
        (
            '<table>\n<thead>\n<tr>\n<th>a</th>\n<th align="center">b</th>\n</tr>\n</thead>\n'
            '<tbody>\n<tr>\n<td>1</td>\n<td align="center">2</td>\n</tr>\n</tbody>\n</table>\n'
        ),
    ),
    (
        "| x |\n|--|\n| a \\| b | fazla |",
        (
            "<table>\n<thead>\n<tr>\n<th>x</th>\n</tr>\n</thead>\n"
            "<tbody>\n<tr>\n<td>a | b</td>\n</tr>\n</tbody>\n</table>\n"
        ),
    ),
    (
        "a | b\n-- | --",
        "<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n</table>\n",
    ),
]

INLINE = [
    (
        "*eğik* _eğik_ **kalın** __kalın__",
        "<em>eğik</em> <em>eğik</em> <strong>kalın</strong> <strong>kalın</strong>",
    ),
    ("***ikisi***", "<em><strong>ikisi</strong></em>"),
    ("*foo**bar**baz*", "<em>foo<strong>bar</strong>baz</em>"),
    ("**kalın*", "*<em>kalın</em>"),
    ("alt_çizgili_ad ve 2*3*4", "alt_çizgili_ad ve 2<em>3</em>4"),
    ("a * b * c", "a * b * c"),
    ("~~çizik~~ ~tek~", "<del>çizik</del> ~tek~"),
    ("`kod` ``a ` b`` `açık", "<code>kod</code> <code>a ` b</code> `açık"),
    ("[bağ](https://ör.nek/a b)", "[bağ](https://ör.nek/a b)"),
    (
        '[bağ](https://ornek.com/ç "başlık")',
        '<a href="https://ornek.com/%C3%A7" title="başlık">bağ</a>',
    ),
    ("[*vurgulu* bağ](/yol)", '<a href="/yol"><em>vurgulu</em> bağ</a>'),
    ("[a [b](u1)](u2)", '[a <a href="u1">b</a>](u2)'),
    ("![kedi *fotoğrafı*](https://x/k.png)", '<img src="https://x/k.png" alt="kedi fotoğrafı" />'),
    (
        "<https://ornek.com> <ali@ornek.com>",
        (
            '<a href="https://ornek.com">https://ornek.com</a> '
            '<a href="mailto:ali@ornek.com">ali@ornek.com</a>'
        ),
    ),
    ("satır  \nkırık\\\nyine\nyumuşak", "satır<br />\nkırık<br />\nyine\nyumuşak"),
    ("\\*değil\\* \\# \\a", "*değil* # \\a"),
    ("&copy; &#169; &amp; & &yok", "&copy; &#169; &amp; &amp; &amp;yok"),
    ('a < b > c "d"', "a &lt; b &gt; c &quot;d&quot;"),
    ("[başvuru][ad]", "[başvuru][ad]"),
]


@pytest.mark.parametrize(("source", "expected"), BLOCKS)
def test_blocks(source: str, expected: str) -> None:
    assert to_html(source) == expected


@pytest.mark.parametrize(("source", "expected"), INLINE)
def test_inline(source: str, expected: str) -> None:
    assert to_html(source) == f"<p>{expected}</p>\n"


def test_line_endings_and_tabs() -> None:
    assert to_html("a\r\nb\r\n") == "<p>a\nb</p>\n"
    assert to_html("\tkod") == "<pre><code>kod\n</code></pre>\n"
    assert to_html("-\tmadde") == "<ul>\n<li>madde</li>\n</ul>\n"


def test_highlight_hook_is_used_for_fenced_code() -> None:
    html = to_html("```tohum\nyazdır(1)\n```", highlight=lambda lang, code: f"[{lang}]{code}")
    assert html == '<pre><code class="language-tohum">[tohum]yazdır(1)\n</code></pre>\n'
