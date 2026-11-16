"""Gerçek ağ testleri (varsayılan ATLANIR; VERIHAVUZU_AG=1 ile açılır)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from verihavuzu.hat.examples import tcmb
from verihavuzu.hat.fetch import FetchConfig, Fetcher
from verihavuzu.katalog.catalog import find, load_catalog
from verihavuzu.katalog.verify import verify_entry

pytestmark = pytest.mark.ag
FIXTURES = Path(__file__).parent / "fixtures" / "tcmb"


def _fetcher() -> Fetcher:
    return Fetcher(FetchConfig(user_agent="verihavuzu-test/0.1", min_interval=1.0))


def test_live_catalog_entry_still_verifies() -> None:
    entry = find(load_catalog(), "scikit-learn/iris")
    assert entry is not None
    assert verify_entry(entry, _fetcher())["durum"] == "dogrulandi"


def test_live_tcmb_bulletin_matches_recorded_fixture() -> None:
    reply = _fetcher().get(tcmb.bulletin_url(date(2026, 11, 13)))
    assert reply.status == 200
    assert reply.body == (FIXTURES / "13112026.xml").read_bytes()
