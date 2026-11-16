"""Katalog: küçük YAML okuyucu (PyYAML ile karşılaştırmalı), kayıt kuralları, arama, sahte API ile
doğrulama ve indirme (ağsız)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
import yaml
from hypothesis import given, settings
from hypothesis import strategies as st

from verihavuzu.hat.fetch import FetchConfig, Fetcher, Response
from verihavuzu.katalog import download as dl
from verihavuzu.katalog.catalog import load_catalog, search
from verihavuzu.katalog.model import DatasetEntry, commercial_use_from_tags, is_not_more_permissive
from verihavuzu.katalog.verify import latest_report, unverified, verify_entry
from verihavuzu.katalog.yamlmini import YamlError, dumps_list, loads
from verihavuzu.paths import catalog_dir


class Fake:
    def __init__(self, routes: dict[str, Response]) -> None:
        self.routes = routes
        self.calls: list[str] = []

    def send(self, url: str, headers: dict[str, str], timeout: float) -> Response:
        self.calls.append(url)
        return self.routes.get(url, Response(url, 404, {}, b""))


def _fetcher(routes: dict[str, Response]) -> Fetcher:
    return Fetcher(
        FetchConfig(user_agent="test", min_interval=0.0, respect_robots=False),
        Fake(routes),
        sleep=lambda s: None,
    )


# --- YAML ---------------------------------------------------------------------------------------


def test_catalog_file_reads_identically_with_pyyaml() -> None:
    text = (catalog_dir() / "kumeler.yaml").read_text(encoding="utf-8")
    assert loads(text) == yaml.safe_load(text)


def test_yaml_subset_matches_pyyaml_on_tricky_values() -> None:
    text = (
        "# yorum\nbaslik: 'Tek ''tırnak'''\nsayi: 42\nacik: true\nbos: null\n"
        'liste:\n  - ad: "iki: nokta # değil yorum"\n    etiket: [a, "b, c", 3]  # yorum\n'
        "  - ad: düz-metin_1\n    bos_liste: []\n"
    )
    assert loads(text) == yaml.safe_load(text)
    for ambiguous in ("düz metin", "yes", "1.5", "2026-11-16", "10M<n<100M"):
        with pytest.raises(YamlError, match="tırnak"):
            loads(f"liste:\n  - a: {ambiguous}\n")


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("liste:\n\t- a: 1\n", "sekme"),
        ("liste:\n  - a: 1\n     b: 2\n", "hiza"),
        ("a: b: c\n", "tırnak"),
        ("liste:\n  - a: [1, 2\n", "akış listesi"),
        ("liste:\n  - a: 1\n    a: 2\n", "iki kez"),
        ("  girintili: 1\n", "liste anahtarının"),
    ],
)
def test_yaml_errors_name_the_line(text: str, message: str) -> None:
    with pytest.raises(YamlError, match=message):
        loads(text)


SINGLE_LINE = st.characters(
    blacklist_categories=("Cs", "Cc", "Zl", "Zp"), blacklist_characters="\x85"
)


@given(st.lists(st.text(alphabet=SINGLE_LINE, max_size=30), min_size=1, max_size=4))
@settings(max_examples=150, deadline=None)
def test_dump_then_load_round_trips(values: list[str]) -> None:
    items = [{"metin": value, "liste": [value, "x"]} for value in values]
    text = dumps_list("kayitlar", items)
    assert loads(text) == {"kayitlar": items}
    assert yaml.safe_load(text) == {"kayitlar": items}


# --- kayıtlar, kural, arama -----------------------------------------------------------------------


def test_catalog_entries_are_valid_and_rules_hold() -> None:
    entries = load_catalog()
    assert len(entries) >= 50
    for entry in entries:
        by_rule, _ = commercial_use_from_tags(entry.license_tags())
        assert is_not_more_permissive(entry.ticari_kullanim, by_rule), entry.kimlik
    areas = {entry.alan for entry in entries}
    assert {"tr-dogal-dil", "tablo", "zaman-serisi", "goruntu"} <= areas
    tasks = {entry.gorev for entry in entries if entry.alan == "tr-dogal-dil"}
    assert {
        "derlem",
        "metin-siniflandirma",
        "soru-yanit",
        "ozetleme",
        "ceviri",
        "varlik-tanima",
    } <= tasks


def test_every_catalog_entry_is_verified_in_the_latest_report() -> None:
    report = latest_report()
    assert report is not None
    assert (catalog_dir() / "dogrulama-2026-11-16.json").is_file(), (
        "ilk doğrulama kaydı silinmemeli"
    )
    assert unverified(load_catalog(), report) == [], (
        "python scripts/verify_catalog.py ile yeniden doğrulayın"
    )


@pytest.mark.parametrize(
    ("tags", "verdict"),
    [
        ([], "belirsiz"),
        (["mit"], "evet"),
        (["cc-by-nc-4.0"], "hayir"),
        (["cc-by-nc-nd-4.0"], "hayir"),
        (["cc-by-sa-3.0", "gfdl"], "evet"),
        (["unknown"], "belirsiz"),
        (["other"], "belirsiz"),
        (["cc-by-nd-4.0"], "belirsiz"),
        (["mit", "other"], "belirsiz"),
    ],
)
def test_commercial_use_rule(tags: list[str], verdict: str) -> None:
    assert commercial_use_from_tags(tags)[0] == verdict


def test_search_filters() -> None:
    entries = load_catalog()
    assert all(e.gorev == "ceviri" for e in search(entries, gorev="ceviri"))
    assert [e.kimlik for e in search(entries, "IRIS")] == ["scikit-learn/iris"]
    assert all(e.ticari_kullanim == "hayir" for e in search(entries, ticari="hayir"))
    assert (
        search(entries, "ozetleme", ticari="evet") == []
    )  # Türkçe özetleme kümelerinin hepsi kısıtlı
    assert search(entries, "çeviri") == search(
        entries, "ceviri"
    )  # Türkçe karakter farkı gözetilmez


# --- doğrulama (sahte API) -----------------------------------------------------------------------


def _entry(**changes: object) -> DatasetEntry:
    data: dict[str, object] = {
        "kimlik": "ornek/kume",
        "gorev": "derlem",
        "alan": "tr-dogal-dil",
        "dil": ["tr"],
        "boyut": "1K<n<10K",
        "lisans": "cc-by-4.0",
        "ticari_kullanim": "evet",
        "atif": "ornek · https://huggingface.co/datasets/ornek/kume",
        "not": "",
    }
    data.update(changes)
    return DatasetEntry.model_validate(data)


def _api(**changes: object) -> Response:
    data = {
        "id": "ornek/kume",
        "tags": ["license:cc-by-4.0", "size_categories:1K<n<10K", "language:tr"],
        "downloads": 12,
        "gated": False,
        "private": False,
        "disabled": False,
    }
    data.update(changes)
    url = "https://huggingface.co/api/datasets/ornek/kume"
    return Response(url, 200, {}, json.dumps(data).encode())


def test_verify_entry_outcomes() -> None:
    url = "https://huggingface.co/api/datasets/ornek/kume"
    assert verify_entry(_entry(), _fetcher({url: _api()}))["durum"] == "dogrulandi"
    changed = verify_entry(
        _entry(),
        _fetcher(
            {url: _api(tags=["license:cc-by-nc-4.0", "size_categories:1K<n<10K", "language:tr"])}
        ),
    )
    assert changed["durum"] == "uyumsuz" and any("lisans" in f for f in changed["farklar"])
    assert any("serbest" in f for f in changed["farklar"])  # katalog "evet" ama NC lisans
    renamed = verify_entry(_entry(), _fetcher({url: _api(id="yeni/ad")}))
    assert "kimlik değişmiş: yeni/ad" in renamed["farklar"]
    not_turkish = verify_entry(
        _entry(), _fetcher({url: _api(tags=["license:cc-by-4.0", "size_categories:1K<n<10K"])})
    )
    assert any("Türkçe" in f for f in not_turkish["farklar"])
    assert verify_entry(_entry(), _fetcher({}))["durum"] == "bulunamadi"


# --- indirme (sahte HF) --------------------------------------------------------------------------

TREE = "https://huggingface.co/api/datasets/ornek/kume/tree/main?recursive=1"
FILE = "https://huggingface.co/datasets/ornek/kume/resolve/main/"


def test_download_sample_and_full(tmp_path: Path) -> None:
    csv_body = ("a,b\n" + "".join(f"{i},x\n" for i in range(20))).encode()
    jsonl_body = b'{"a": 1}\n{"a": 2}\n'
    tree = [
        {"type": "file", "path": "README.md", "size": 10},
        {"type": "file", "path": "veri/egitim.csv", "size": len(csv_body)},
        {
            "type": "file",
            "path": "veri/buyuk.jsonl",
            "size": 999,
            "lfs": {"oid": hashlib.sha256(jsonl_body).hexdigest(), "size": len(jsonl_body)},
        },
    ]
    routes = {
        TREE: Response(TREE, 200, {}, json.dumps(tree).encode()),
        FILE + "veri/egitim.csv": Response("", 200, {}, csv_body),
        FILE + "veri/buyuk.jsonl": Response("", 200, {}, jsonl_body),
    }
    sample = dl.download("ornek/kume", tmp_path, _fetcher(routes), sample=2)
    assert sample["kaynak_dosya"] == "veri/buyuk.jsonl"  # LFS boyutu (küçük olan) seçildi
    assert (Path(sample["klasor"]) / "ornek.jsonl").read_text(encoding="utf-8").count("\n") == 2
    full = dl.download("ornek/kume", tmp_path, _fetcher(routes))
    assert sorted(full["dosyalar"]) == ["veri/buyuk.jsonl", "veri/egitim.csv"]
    routes[FILE + "veri/buyuk.jsonl"] = Response("", 200, {}, b"bozuk")
    with pytest.raises(dl.DownloadError, match="SHA-256"):
        dl.download("ornek/kume", tmp_path, _fetcher(routes))


def test_download_errors(tmp_path: Path) -> None:
    with pytest.raises(dl.DownloadError, match="HF_TOKEN"):
        dl.download("ornek/kume", tmp_path, _fetcher({TREE: Response(TREE, 401, {}, b"")}))
    with pytest.raises(dl.DownloadError, match="bulunamadı"):
        dl.download("ornek/kume", tmp_path, _fetcher({}))
    evil = [{"type": "file", "path": "../../kotu.csv", "size": 3}]
    routes = {
        TREE: Response(TREE, 200, {}, json.dumps(evil).encode()),
        FILE + "../../kotu.csv": Response("", 200, {}, b"a\n"),
    }
    with pytest.raises(dl.DownloadError, match="Güvenli olmayan"):
        dl.download("ornek/kume", tmp_path, _fetcher(routes))
    big = [{"type": "file", "path": "x.parquet", "size": 10**9}]
    with pytest.raises(dl.DownloadError, match="sınır"):
        dl.download(
            "ornek/kume",
            tmp_path,
            _fetcher({TREE: Response(TREE, 200, {}, json.dumps(big).encode())}),
            max_mb=5,
        )


def test_download_parquet_sample_with_duckdb(tmp_path: Path) -> None:
    duckdb = pytest.importorskip("duckdb")
    source = tmp_path / "kaynak.parquet"
    connection = duckdb.connect()
    connection.execute(
        f"COPY (SELECT range AS no, 'satır ' || range AS metin FROM range(10)) TO '{source}' (FORMAT parquet)"
    )
    connection.close()
    body = source.read_bytes()
    tree = [{"type": "file", "path": "d/egitim.parquet", "size": len(body)}]
    routes = {
        TREE: Response(TREE, 200, {}, json.dumps(tree).encode()),
        FILE + "d/egitim.parquet": Response("", 200, {}, body),
    }
    result = dl.download("ornek/kume", tmp_path / "out", _fetcher(routes), sample=3)
    rows = [
        json.loads(line)
        for line in (Path(result["klasor"]) / "ornek.jsonl")
        .read_text(encoding="utf-8")
        .splitlines()
    ]
    assert rows == [
        {"no": 0, "metin": "satır 0"},
        {"no": 1, "metin": "satır 1"},
        {"no": 2, "metin": "satır 2"},
    ]


def test_dump_rejects_multiline_text() -> None:
    with pytest.raises(ValueError, match="tek satır"):
        dumps_list("k", [{"metin": "iki\nsatır"}])


def test_next_page_link_parsing() -> None:
    header = '<https://huggingface.co/api/datasets/x/tree/main?cursor=abc>; rel="next"'
    assert dl._next_page(header) == "https://huggingface.co/api/datasets/x/tree/main?cursor=abc"
    assert dl._next_page(None) is None
