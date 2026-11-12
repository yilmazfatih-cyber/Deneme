"""
Doctest'leri unittest'e bağlar: TheAlgorithms/Python'da `pytest --doctest-modules`
(pyproject.toml > [tool.pytest] addopts) ne yapıyorsa burada `load_tests`
protokolüyle aynısını yapıyoruz. Her modül ayrı bir test olarak raporlanır.
"""

import doctest
import importlib
import unittest

from betikler.kontrol import modul_adlari


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    for ad in modul_adlari():
        tests.addTests(doctest.DocTestSuite(importlib.import_module(ad), optionflags=doctest.ELLIPSIS))
    return tests


class DoctestKapsamiTesti(unittest.TestCase):
    def test_her_algoritma_modulunde_doctest_var(self) -> None:
        bulucu = doctest.DocTestFinder()
        for ad in modul_adlari():
            with self.subTest(modul=ad):
                ornekler = [t for t in bulucu.find(importlib.import_module(ad)) if t.examples]
                self.assertTrue(ornekler, f"{ad} içinde hiç doctest yok")
