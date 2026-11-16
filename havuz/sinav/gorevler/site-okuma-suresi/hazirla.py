"""Başlangıç: `readingMinutes` en az 1 dakika sınırını kaybetmiş; onu sınayan test çıkarılmış.

Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin collections.ts'i ya da testi değişirse aranan metinleri güncelleyin.
"""

from pathlib import Path

from exam.edit import remove_between, replace


def hazirla(kopya: Path) -> None:
    replace(
        kopya / "src/lib/collections.ts",
        "  return Math.max(1, Math.round(countWords(markdownToPlainText(markdown)) / WORDS_PER_MINUTE))",
        "  return Math.round(countWords(markdownToPlainText(markdown)) / WORDS_PER_MINUTE)",
    )
    test = kopya / "tests/unit/collections.test.ts"
    remove_between(test, "\n\n  it('okuma süresini en az 1 dakika verir'", "\n})\n")
    replace(test, "  readingMinutes,\n", "")
