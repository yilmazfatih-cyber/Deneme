"""Sözcük düzeyinde fark: metni sözcük/boşluk/noktalama belirteçlerine bölüp Myers uygular.

Çıktı iki biçimde: işaretli metin (`git diff --word-diff=plain` gibi: `[-eski-]{+yeni+}`) ya da
HTML (`<del>`/`<ins>`, içerik kaçışlı). Türkçe harfler sözcüğün parçasıdır (`\\w` Unicode'dur).
Genişletme: karakter düzeyi fark için `TOKEN` yerine `list(metin)` kullanan bir işlev ekleyin.
"""

from __future__ import annotations

import html
import re

from .myers import opcodes

TOKEN = re.compile(r"\w+|\s+|[^\w\s]")


def tokens(text: str) -> list[str]:
    return TOKEN.findall(text)


def word_segments(old: str, new: str) -> list[tuple[str, str]]:
    """(tür, metin) parçaları: "=" aynı, "-" silinen, "+" eklenen; komşu aynı türler birleşir."""
    a, b = tokens(old), tokens(new)
    segments: list[tuple[str, str]] = []

    def push(kind: str, text: str) -> None:
        if not text:
            return
        if segments and segments[-1][0] == kind:
            segments[-1] = (kind, segments[-1][1] + text)
        else:
            segments.append((kind, text))

    for tag, i1, i2, j1, j2 in opcodes(a, b):
        if tag == "equal":
            push("=", "".join(a[i1:i2]))
        else:
            push("-", "".join(a[i1:i2]))
            push("+", "".join(b[j1:j2]))
    return segments


def word_diff(old: str, new: str) -> str:
    """İşaretli metin: `Bugün [-hava-]{+gökyüzü+} güzel`."""
    marks = {"=": "{}", "-": "[-{}-]", "+": "{{+{}+}}"}
    return "".join(marks[kind].format(text) for kind, text in word_segments(old, new))


def word_diff_html(old: str, new: str) -> str:
    """HTML: silinenler `<del>`, eklenenler `<ins>` içinde; tüm metin kaçışlıdır."""
    tags = {"=": "{}", "-": "<del>{}</del>", "+": "<ins>{}</ins>"}
    return "".join(tags[kind].format(html.escape(text)) for kind, text in word_segments(old, new))
