"""Başvuru çözümü: initials_tr, Türkçe büyük harf için upper_tr ile; test eklenir.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: text.py'nin işlev sırası değişirse ekleme yerini (`def fold_ascii`) güncelleyin.
"""

from pathlib import Path

from exam.edit import insert_before, run, write

FUNCTION = '''def initials_tr(full_name: str) -> str:
    """Ad soyadın baş harfleri (ilk ve son sözcük), Türkçe büyük harfle: "ilker iğci" → "İİ"."""
    words = full_name.split()
    if not words:
        return ""
    chosen = words[:1] if len(words) == 1 else [words[0], words[-1]]
    return "".join(upper_tr(word[0]) for word in chosen)


'''

TEST = '''"""initials_tr: Türkçe büyük harfle baş harfler (i → İ, ı → I)."""

import pytest

from verihavuzu.text import initials_tr


@pytest.mark.parametrize(
    ("name", "expected"),
    [("ayşe nur yılmaz", "AY"), ("Mehmet Öz", "MÖ"), ("ilker", "İ"), ("  can   ışık ", "CI"), ("", "")],
)
def test_initials_tr(name: str, expected: str) -> None:
    assert initials_tr(name) == expected
'''


def coz(kopya: Path) -> None:
    insert_before(kopya / "verihavuzu/text.py", "def fold_ascii(", FUNCTION)
    write(kopya / "tests/test_initials.py", TEST)
    run(
        [str(kopya / ".venv/bin/python"), "-m", "ruff", "format", "-q", "tests/test_initials.py"],
        kopya,
    )
