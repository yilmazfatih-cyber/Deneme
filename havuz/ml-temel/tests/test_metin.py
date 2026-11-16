"""Türkçe metin işleme: büyük/küçük harf, belirteçleme, TF-IDF (scikit-learn ile), karma."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.onisleme import (
    TURKISH_STOP_WORDS,
    CountVectorizer,
    HashingVectorizer,
    TfidfVectorizer,
    tokenize,
)
from ml_temel.ortak import fold_ascii_tr, lower_ascii, lower_tr, sort_key_tr, upper_tr

DOCS = [
    "Kargo çok geç geldi, memnun değilim.",
    "Ürün harika, kargo hızlı geldi!",
    "İade işlemi nasıl yapılır? İade etmek istiyorum.",
    "Sipariş IĞDIR'a ne zaman ulaşır?",
    "",
]


def test_turkish_case_rules() -> None:
    assert lower_tr("IŞIK İZMİR Iğdır") == "ışık izmir ığdır"
    assert upper_tr("ışık izmir iğne") == "IŞIK İZMİR İĞNE"
    assert lower_tr("İ") == "i"
    assert len(lower_tr("İSTANBUL")) == len("istanbul")  # ayrık nokta işareti kalmaz
    assert lower_tr("I\u0307stanbul") == "istanbul"  # ayrık yazılmış İ (I + nokta) de doğru
    assert upper_tr(lower_tr("ÇĞIİÖŞÜ")) == "ÇĞIİÖŞÜ"
    assert lower_ascii("NaN TRUE İ") == "nan true İ"
    assert fold_ascii_tr("çğıöşü ÇĞİÖŞÜ âîû") == "cgiosu CGIOSU aiu"
    words = ["zil", "çay", "ırmak", "cam", "şal", "ılık", "iz", "su", "ümit", "ufuk", "Ağaç"]
    assert sorted(words, key=sort_key_tr) == [
        "Ağaç", "cam", "çay", "ılık", "ırmak", "iz", "su", "şal", "ufuk", "ümit", "zil",
    ]  # fmt: skip


def test_tokenize_handles_turkish_specifics() -> None:
    assert tokenize("İstanbul'da hava ÇOK güzel; ISPARTA’nın gülü!") == [
        "istanbul", "hava", "çok", "güzel", "ısparta", "gülü",
    ]  # fmt: skip
    assert tokenize("Kitaplarımızdan kitabı", stem_length=5) == ["kitap", "kitab"]
    assert tokenize("çok güzel bir şey", stop_words=TURKISH_STOP_WORDS) == ["güzel"]
    assert tokenize("Şeker çay", strip_accents=True) == ["seker", "cay"]
    assert tokenize("3 adet A4 kağıt, 12.5 TL") == ["adet", "a4", "kağıt", "12", "tl"]
    assert "değil" not in TURKISH_STOP_WORDS  # olumsuzluk bilerek korunur
    assert tokenize("") == []


def test_count_vectorizer_vocabulary_and_filters() -> None:
    vectorizer = CountVectorizer().fit(DOCS)
    names = vectorizer.get_feature_names_out()
    assert names == sorted(names)
    assert {"kargo", "iade", "ığdır", "değilim"} <= set(names)
    counts = vectorizer.transform(["kargo kargo İADE bilinmeyen"])
    assert counts[0, vectorizer.vocabulary_["kargo"]] == 2
    assert counts[0, vectorizer.vocabulary_["iade"]] == 1
    assert counts.sum() == 3  # sözlükte olmayan kelime sayılmaz
    assert CountVectorizer(min_df=2).fit(DOCS).get_feature_names_out() == ["geldi", "kargo"]
    assert CountVectorizer(max_features=1).fit(DOCS).get_feature_names_out() == ["geldi"]
    bigrams = CountVectorizer(ngram_range=(1, 2)).fit(DOCS).get_feature_names_out()
    assert "kargo çok" in bigrams
    chars = CountVectorizer(analyzer="char_wb", ngram_range=(3, 3)).fit(["çay"])
    assert chars.get_feature_names_out() == [" ça", "ay ", "çay"]
    with pytest.raises(TypeError, match="LİSTESİ"):
        vectorizer.transform("tek metin")
    with pytest.raises(ValueError, match="Sözlük boş"):
        CountVectorizer(min_df=9).fit(DOCS)


@pytest.mark.parametrize(
    "options", [{}, {"sublinear_tf": True}, {"use_idf": False}, {"norm": None}]
)
def test_tfidf_matches_sklearn(options: dict[str, object]) -> None:
    sk_text = pytest.importorskip("sklearn.feature_extraction.text")
    ours = TfidfVectorizer(**options)  # type: ignore[arg-type]
    theirs = sk_text.TfidfVectorizer(
        tokenizer=tokenize, token_pattern=None, lowercase=False, **options
    )
    train, test = DOCS[:4], ["Kargo geldi mi, İADE nasıl?", "hiç bilinmeyen kelimeler"]
    np.testing.assert_allclose(ours.fit_transform(train), theirs.fit_transform(train).toarray())
    np.testing.assert_allclose(ours.transform(test), theirs.transform(test).toarray())
    assert ours.get_feature_names_out() == list(theirs.get_feature_names_out())
    if options.get("use_idf", True):
        np.testing.assert_allclose(ours.idf_, theirs.idf_)


def test_tfidf_rows_are_unit_length_and_missing_documents_are_empty() -> None:
    matrix = TfidfVectorizer().fit_transform(DOCS)
    norms = np.sqrt((matrix**2).sum(axis=1))
    np.testing.assert_allclose(norms[:4], 1.0)
    assert norms[4] == 0.0  # boş belge sıfır satırıdır (0'a bölme yok)
    with_missing = TfidfVectorizer().fit(DOCS).transform(np.array(["kargo", None, np.nan], object))
    assert with_missing[1:].sum() == 0.0


def test_dense_size_guard() -> None:
    from ml_temel.onisleme.vectorizers import check_dense_size

    check_dense_size(10_000, 5_000)
    with pytest.raises(MemoryError, match="max_features"):
        check_dense_size(1_000_000, 50_000)


def test_hashing_vectorizer_is_stateless_and_stable() -> None:
    vectorizer = HashingVectorizer(n_features=64)
    first = vectorizer.fit(DOCS).transform(DOCS)
    again = HashingVectorizer(n_features=64).transform(DOCS)  # fit'siz de aynı
    np.testing.assert_array_equal(first, again)
    assert first.shape == (5, 64)
    np.testing.assert_allclose(np.sqrt((first[:4] ** 2).sum(axis=1)), 1.0)
    upper = vectorizer.transform(["KARGO GEÇ GELDİ"])
    lower = vectorizer.transform(["kargo geç geldi"])
    np.testing.assert_array_equal(upper, lower)
    raw = HashingVectorizer(n_features=64, alternate_sign=False, norm=None).transform(["a1 a1 b2"])
    assert raw.sum() == 3.0
    # crc32 kararlıdır: bu değer her makinede ve her çalıştırmada aynı olmalı
    assert (
        int(np.flatnonzero(HashingVectorizer(n_features=1000, norm=None).transform(["kargo"]))[0])
        == (__import__("zlib").crc32(b"kargo") & 0x7FFFFFFF) % 1000
    )
