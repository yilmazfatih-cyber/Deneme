import doctest
import importlib
import unittest

MODULLER = ["mufredat", "takvim", "plan_yaz"]


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    for ad in MODULLER:
        tests.addTests(doctest.DocTestSuite(importlib.import_module(ad)))
    return tests
