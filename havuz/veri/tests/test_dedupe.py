"""Bulanık yineleme: benzerlik işlevlerinin bilinen değerleri ve kirli veride geri çağırma/kesinlik."""

from __future__ import annotations

import math

from verihavuzu.kalite.clean import clean_rows
from verihavuzu.kalite.dedupe import (
    deduplicate,
    find_duplicates,
    jaro,
    jaro_winkler,
    levenshtein,
    normalize_tr,
)
from verihavuzu.sentetik.dirty import make_dirty
from verihavuzu.sentetik.people import generate_people


def test_similarity_functions_known_values() -> None:
    assert levenshtein("kitten", "sitting") == 3
    assert levenshtein("", "abc") == 3
    # Winkler'in yaygın örnekleri (elle de doğrulanabilir):
    assert math.isclose(jaro("MARTHA", "MARHTA"), 0.9444, abs_tol=1e-4)
    assert math.isclose(jaro_winkler("MARTHA", "MARHTA"), 0.9611, abs_tol=1e-4)
    assert math.isclose(jaro("DWAYNE", "DUANE"), 0.8222, abs_tol=1e-4)
    assert math.isclose(jaro_winkler("DWAYNE", "DUANE"), 0.84, abs_tol=1e-4)
    assert math.isclose(jaro_winkler("DIXON", "DICKSONX"), 0.8133, abs_tol=1e-4)
    assert jaro_winkler("abc", "abc") == 1.0 and jaro("", "a") == 0.0


def test_turkish_normalization() -> None:
    assert normalize_tr("  Ä°STANBUL Cad. No:5 ") == "istanbul caddesi no 5"
    assert normalize_tr("Yıldız Tic. A.Ş.") == normalize_tr("YILDIZ TİCARET AŞ")
    assert normalize_tr("Gül Sk.") == normalize_tr("gul sokak")
    assert normalize_tr(None) == "" and normalize_tr("NULL") == ""


def test_dedupe_finds_seeded_near_duplicates_with_high_precision() -> None:
    people = generate_people(500, 17)
    dirty = make_dirty(people, 17, rate=0.08, duplicate_rate=0.04, protected=["kisi_id"])
    cleaned = clean_rows(dirty.kirli, drop_exact_duplicates=False).satirlar
    columns = ["ad", "soyad", "dogum_tarihi", "ilce", "telefon"]
    report = find_duplicates(cleaned, columns, threshold=0.9)
    truth = {
        (int(e["kaynak_satir"]), int(e["satir"]))
        for e in dirty.kayitlar
        if e["bozulma"] == "yineleme"
    }
    found = {(a, b) for a, b, _ in report.ciftler}
    recall = len(found & truth) / len(truth)
    precision = len(found & truth) / len(found)
    assert len(truth) >= 10
    assert recall >= 0.9, recall
    assert precision >= 0.95, precision
    kept, _ = deduplicate(cleaned, columns, threshold=0.9)
    assert len(kept) == len(cleaned) - sum(len(c) - 1 for c in report.kumeler)
