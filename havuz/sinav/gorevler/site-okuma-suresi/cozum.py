"""Başvuru çözümü: ortak işlevde en az 1 dakika; test geri eklenir.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: çözüm değişirse gizli testin geçtiğini `dogrula` ile doğrulayın.
"""

from pathlib import Path

from exam.edit import replace, write

TEST = """import { describe, expect, it } from 'vitest'
import { readingMinutes } from '../../src/lib/collections.ts'

describe('okuma süresi', () => {
  it('en az 1 dakika; uzun yazıda kelime sayısına göre', () => {
    expect(readingMinutes('kısa')).toBe(1)
    expect(readingMinutes(Array.from({ length: 1000 }, () => 'kelime').join(' '))).toBe(5)
  })
})
"""


def coz(kopya: Path) -> None:
    replace(
        kopya / "src/lib/collections.ts",
        "  return Math.round(countWords(markdownToPlainText(markdown)) / WORDS_PER_MINUTE)",
        "  return Math.max(1, Math.round(countWords(markdownToPlainText(markdown)) / WORDS_PER_MINUTE))",
    )
    write(kopya / "tests/unit/reading-time.test.ts", TEST)
