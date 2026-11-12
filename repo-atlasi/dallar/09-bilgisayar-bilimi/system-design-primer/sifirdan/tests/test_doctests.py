"""Modüllerdeki doctest'leri unittest koşusuna ekler."""

import doctest
import importlib
import unittest

MODULES = ["lru_cache", "consistent_hashing", "rate_limiter", "url_shortener", "load_balancer", "cache_strategies"]


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    for name in MODULES:
        tests.addTests(doctest.DocTestSuite(importlib.import_module(name)))
    return tests
