"""Ortak test ayarları: ağ isteyen testler (``@pytest.mark.ag``) yalnız VERIHAVUZU_AG=1 iken koşar."""

from __future__ import annotations

import os

import pytest


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("VERIHAVUZU_AG") == "1":
        return
    skip = pytest.mark.skip(reason="ağ ister; açmak için VERIHAVUZU_AG=1")
    for item in items:
        if "ag" in item.keywords:
            item.add_marker(skip)
