"""anki/sistem-tasarimi-tr.tsv dosyasının Anki'ye sorunsuz aktarılabilir olduğunu denetler."""

import re
import unittest
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent / "anki" / "sistem-tasarimi-tr.tsv"


class AnkiDeckTest(unittest.TestCase):
    def setUp(self) -> None:
        lines = DECK.read_text(encoding="utf-8").splitlines()
        self.headers = [line for line in lines if line.startswith("#")]
        self.rows = [line.split("\t") for line in lines if line and not line.startswith("#")]

    def test_headers_declare_tab_separator_and_tag_column(self) -> None:
        self.assertIn("#separator:tab", self.headers)
        self.assertIn("#tags column:3", self.headers)

    def test_every_row_has_front_back_tags(self) -> None:
        self.assertGreaterEqual(len(self.rows), 30)
        for row in self.rows:
            with self.subTest(front=row[0][:40]):
                self.assertEqual(len(row), 3)
                self.assertTrue(all(field.strip() for field in row))
                self.assertRegex(row[2], re.compile(r"^[a-z-]+( [a-z-]+)*$"))

    def test_fronts_are_unique(self) -> None:
        fronts = [row[0] for row in self.rows]
        self.assertEqual(len(fronts), len(set(fronts)))


if __name__ == "__main__":
    unittest.main()
