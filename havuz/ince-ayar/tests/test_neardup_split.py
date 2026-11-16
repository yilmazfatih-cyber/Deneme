"""Yakın yineleme (MinHash LSH ↔ kaba kuvvet) ve sızıntısız ayrım testleri."""

from __future__ import annotations

import random

import pytest

from ince_ayar.data.neardup import (
    NearDuplicateIndex,
    brute_force_pairs,
    capture_probability,
    choose_rows,
    find_duplicate_groups,
)
from ince_ayar.data.split import TEST, TRAIN, VALIDATION, count_leaks, leak_free_split
from ince_ayar.errors import UserError

WORDS = [
    "kargo",
    "iade",
    "fatura",
    "şifre",
    "sipariş",
    "teslim",
    "ödeme",
    "kart",
    "adres",
    "hesap",
    "müşteri",
    "ürün",
    "mağaza",
    "indirim",
    "kampanya",
    "destek",
    "gün",
    "saat",
    "hafta",
    "ücret",
]


def _corpus(seed: int, count: int = 60) -> list[str]:
    rng = random.Random(seed)
    base = [" ".join(rng.choice(WORDS) for _ in range(12)) for _ in range(count)]
    medium = [text.replace(text.split()[3], "değişik", 1) for text in base[:10]]  # J ≈ 0,7–0,8
    close = [text + " lütfen" for text in base[10:20]]  # J ≈ 0,9
    return base + medium + close


@pytest.mark.parametrize("threshold", [0.5, 0.62, 0.7, 0.78, 0.85, 0.95])
def test_esikte_yakalama_olasiligi_en_az_yuzde_99(threshold: float) -> None:
    assert capture_probability(threshold, choose_rows(threshold)) >= 0.99


@pytest.mark.parametrize(("seed", "threshold"), [(1, 0.7), (2, 0.85), (3, 0.6)])
def test_lsh_kaba_kuvvetle_ayni_ciftleri_bulur(seed: int, threshold: float) -> None:
    texts = _corpus(seed)
    expected = brute_force_pairs(texts, threshold)
    groups = find_duplicate_groups(texts, threshold).group_of
    # Kaba kuvvetin bulduğu her çift aynı gruba düşmeli (LSH kaçırmadı)
    assert all(groups[a] == groups[b] for a, b in expected)
    assert len(expected) >= 8


def test_turkce_harf_buyuklugu_yinelemesi_tam_yineleme_sayilir() -> None:
    result = find_duplicate_groups(["İSTANBUL ŞUBESİ", "istanbul şubesi", "Ankara şubesi"], 1.0)
    assert result.group_of == [0, 0, 1]
    assert result.exact_duplicates == 1


def test_artimli_dizin() -> None:
    index = NearDuplicateIndex(0.8)
    first = "Siparişler üç iş günü içinde teslim edilir ve kargo ücretsizdir."
    index.add(first)
    assert index.find(first.replace("ücretsizdir", "ücretsiz")) == 0
    assert index.find("Mağaza pazar günü kapalıdır.") is None
    assert len(index) == 1


def test_ayrimda_yakin_yinelemeler_ve_gruplar_ayni_tarafta() -> None:
    texts = _corpus(7)
    groups: list[str | None] = [None] * len(texts)
    groups[0] = groups[30] = groups[40] = "musteri-1"
    result = leak_free_split(texts, {TRAIN: 0.6, VALIDATION: 0.2, TEST: 0.2}, seed=3, groups=groups)
    side = {i: name for name, rows in result.indices.items() for i in rows}
    assert sorted(side) == list(range(len(texts)))
    for a, b in brute_force_pairs(texts, 0.85):
        assert side[a] == side[b]
    assert side[0] == side[30] == side[40]


def test_katmanli_ayrim_ve_belirlenimcilik() -> None:
    texts = [f"örnek metin numarası {i} {WORDS[i % len(WORDS)]}" for i in range(100)]
    labels = ["az" if i % 5 == 0 else "cok" for i in range(100)]
    first = leak_free_split(texts, {TRAIN: 0.8, VALIDATION: 0.2}, seed=1, labels=labels)
    again = leak_free_split(texts, {TRAIN: 0.8, VALIDATION: 0.2}, seed=1, labels=labels)
    assert first.indices == again.indices
    counts = first.report.label_counts[VALIDATION]
    assert counts["az"] == 4 and counts["cok"] == 16


def test_egitimde_olmayan_etiket_onarilir() -> None:
    texts = ["tek örnek nadir sınıf", "bir", "iki üç", "dört beş altı", "yedi sekiz", "dokuz on"]
    labels = ["nadir", "x", "x", "x", "x", "x"]
    result = leak_free_split(texts, {TRAIN: 0.5, VALIDATION: 0.5}, seed=0, labels=labels)
    assert 0 in result.indices[TRAIN]


def test_az_grup_hatasi() -> None:
    with pytest.raises(UserError, match="bağımsız grup kaldı"):
        leak_free_split(["aynı", "AYNI"], {TRAIN: 0.5, VALIDATION: 0.5}, seed=0)


def test_iki_dosya_arasi_sizinti_sayimi() -> None:
    train = ["Kargom ne zaman gelir?", "İade nasıl yapılır?"]
    test = ["kargom ne zaman gelir", "Mağaza pazar açık mı?"]
    assert count_leaks(train, test) == 1
