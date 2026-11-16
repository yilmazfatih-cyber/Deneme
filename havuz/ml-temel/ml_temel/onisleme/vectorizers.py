"""Metin vektörleyiciler: CountVectorizer (terim sayıları) ve TfidfVectorizer (TF-IDF ağırlıkları).

Fikir ("kelime torbası"): her belge, sözlükteki her terimin o belgede kaç kez geçtiğini söyleyen
bir satıra dönüşür. TF-IDF, her yerde geçen terimleri ("ve", "bir") bastırıp ayırt edici olanları
öne çıkarır:

    idf(t) = ln((1 + n) / (1 + df(t))) + 1        n: belge sayısı, df: terimin geçtiği belge sayısı
    tfidf  = tf · idf, sonra her satır birim uzunluğa (L2) getirilir

Formül scikit-learn ile aynıdır (testte karşılaştırılır). Belirteçleme Türkçe'ye duyarlıdır
(`text.py`). Çıktı YOĞUN float64 matristir: seyrek matris yoktur (numpy tek bağımlılık). Bu yüzden
`max_features` ile sözlüğü sınırlayın; bellek tahmini 2 GiB'ı aşarsa açıklayıcı bir hata verilir.
SIZINTI: sözlük ve idf yalnız eğitim belgelerinden öğrenilir → `Pipeline` içinde kullanın.
Genişletme: yeni bir ağırlıklandırma için `TfidfVectorizer.transform`'u örnek alın.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable, Collection, Iterable
from typing import Any, Self

import numpy as np

from ml_temel.onisleme import text
from ml_temel.onisleme.impute import is_missing
from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array
from ml_temel.ortak.validation import check_is_fitted

MAX_DENSE_BYTES = 2 * 1024**3


def check_documents(documents: Iterable[Any]) -> list[str]:
    """Belgeleri metin listesine çevirir; tek metin verilmişse uyarır, eksikler boş metin olur."""
    if isinstance(documents, str):
        raise TypeError("Tek bir metin değil, metin LİSTESİ verin: vectorizer.transform([metin]).")
    array = np.asarray(documents, dtype=object)
    if array.ndim == 2 and array.shape[1] == 1:
        array = array[:, 0]
    if array.ndim != 1:
        raise ValueError(f"Belgeler 1 boyutlu bir liste olmalı; verilen biçim {array.shape}.")
    return ["" if is_missing(value) else str(value) for value in array.tolist()]


def check_dense_size(n_rows: int, n_columns: int) -> None:
    """Yoğun matris belleğe sığar mı? Sığmayacaksa ne yapılacağını söyleyen hata verir."""
    needed = n_rows * n_columns * 8
    if needed > MAX_DENSE_BYTES:
        raise MemoryError(
            f"{n_rows} belge × {n_columns} terim yoğun matris ≈ {needed / 1024**3:.1f} GiB tutar. "
            "`max_features` (ör. 5000) ya da `min_df` (ör. 3) ile sözlüğü küçültün; çok büyük "
            "metin kümeleri için scikit-learn'ün seyrek matrisli vektörleyicilerine geçin."
        )


def l2_normalize_rows(matrix: Array) -> Array:
    """Her satırı uzunluğu 1 olacak şekilde böler (sıfır satırlar olduğu gibi kalır)."""
    norms = np.sqrt((matrix * matrix).sum(axis=1, keepdims=True))
    return matrix / np.where(norms > 0, norms, 1.0)


class CountVectorizer(BaseEstimator, TransformerMixin):
    """Belgeleri terim sayım matrisine çevirir. Parametre adları scikit-learn ile aynıdır.

    Ek parametreler: `stem_length` (kelimeleri ilk N harfe kırp), `strip_accents=True`
    (ç→c, ş→s…), `tokenizer` (kendi `metin -> terim listesi` fonksiyonunuz).
    """

    def __init__(
        self,
        lowercase: bool = True,
        strip_accents: bool = False,
        analyzer: str = "word",
        ngram_range: tuple[int, int] = (1, 1),
        stop_words: Collection[str] | None = None,
        stem_length: int | None = None,
        min_df: float = 1,
        max_df: float = 1.0,
        max_features: int | None = None,
        binary: bool = False,
        tokenizer: Callable[[str], list[str]] | None = None,
    ) -> None:
        self.lowercase = lowercase
        self.strip_accents = strip_accents
        self.analyzer = analyzer
        self.ngram_range = ngram_range
        self.stop_words = stop_words
        self.stem_length = stem_length
        self.min_df = min_df
        self.max_df = max_df
        self.max_features = max_features
        self.binary = binary
        self.tokenizer = tokenizer

    def analyze(self, document: str) -> list[str]:
        """Bir belgenin terimleri (sözlüğe bakmadan)."""
        if self.tokenizer is not None:
            return text.word_ngrams(self.tokenizer(document), self.ngram_range)
        return text.analyze(
            document,
            analyzer=self.analyzer,
            ngram_range=self.ngram_range,
            lowercase=self.lowercase,
            strip_accents=self.strip_accents,
            stop_words=self.stop_words,
            stem_length=self.stem_length,
        )

    def fit(self, raw_documents: Iterable[Any], y: Any = None) -> Self:
        documents = check_documents(raw_documents)
        n_documents = len(documents)
        document_frequency: Counter[str] = Counter()
        total_count: Counter[str] = Counter()
        for document in documents:
            terms = self.analyze(document)
            total_count.update(terms)
            document_frequency.update(set(terms))
        low = self.min_df if isinstance(self.min_df, int) else self.min_df * n_documents
        high = self.max_df if isinstance(self.max_df, int) else self.max_df * n_documents
        terms = [t for t, df in document_frequency.items() if low <= df <= high]
        if self.max_features is not None and len(terms) > self.max_features:
            terms = sorted(terms, key=lambda t: (-total_count[t], t))[: self.max_features]
        if not terms:
            raise ValueError(
                "Sözlük boş kaldı: belgeler boş olabilir ya da min_df / max_df / stop_words "
                "bütün terimleri elemiş olabilir."
            )
        self.vocabulary_ = {term: index for index, term in enumerate(sorted(terms))}
        self.document_frequency_ = np.array(
            [document_frequency[term] for term in sorted(terms)], dtype=np.float64
        )
        self.n_documents_ = n_documents
        return self

    def _count_matrix(self, raw_documents: Iterable[Any]) -> Array:
        check_is_fitted(self, "vocabulary_")
        documents = check_documents(raw_documents)
        check_dense_size(len(documents), len(self.vocabulary_))
        counts = np.zeros((len(documents), len(self.vocabulary_)))
        for row, document in enumerate(documents):
            for term, count in Counter(self.analyze(document)).items():
                column = self.vocabulary_.get(term)
                if column is not None:
                    counts[row, column] = count
        return np.minimum(counts, 1.0) if self.binary else counts

    def transform(self, raw_documents: Iterable[Any]) -> Array:
        return self._count_matrix(raw_documents)

    def get_feature_names_out(self, input_features: Any = None) -> list[str]:
        """Sütun sırasıyla terimler."""
        check_is_fitted(self, "vocabulary_")
        return sorted(self.vocabulary_, key=self.vocabulary_.__getitem__)


class TfidfVectorizer(CountVectorizer):
    """CountVectorizer + TF-IDF ağırlıkları + satır normalleştirme."""

    def __init__(
        self,
        lowercase: bool = True,
        strip_accents: bool = False,
        analyzer: str = "word",
        ngram_range: tuple[int, int] = (1, 1),
        stop_words: Collection[str] | None = None,
        stem_length: int | None = None,
        min_df: float = 1,
        max_df: float = 1.0,
        max_features: int | None = None,
        binary: bool = False,
        tokenizer: Callable[[str], list[str]] | None = None,
        use_idf: bool = True,
        smooth_idf: bool = True,
        sublinear_tf: bool = False,
        norm: str | None = "l2",
    ) -> None:
        super().__init__(
            lowercase=lowercase,
            strip_accents=strip_accents,
            analyzer=analyzer,
            ngram_range=ngram_range,
            stop_words=stop_words,
            stem_length=stem_length,
            min_df=min_df,
            max_df=max_df,
            max_features=max_features,
            binary=binary,
            tokenizer=tokenizer,
        )
        self.use_idf = use_idf
        self.smooth_idf = smooth_idf
        self.sublinear_tf = sublinear_tf
        self.norm = norm

    def fit(self, raw_documents: Iterable[Any], y: Any = None) -> Self:
        if self.norm not in ("l2", None):
            raise ValueError("norm 'l2' ya da None olmalı.")
        super().fit(raw_documents)
        smooth = 1.0 if self.smooth_idf else 0.0
        self.idf_ = np.log((self.n_documents_ + smooth) / (self.document_frequency_ + smooth)) + 1.0
        return self

    def transform(self, raw_documents: Iterable[Any]) -> Array:
        check_is_fitted(self, "idf_")
        matrix = self._count_matrix(raw_documents)
        if self.sublinear_tf:
            matrix = np.where(matrix > 0, 1.0 + np.log(np.maximum(matrix, 1.0)), 0.0)
        if self.use_idf:
            matrix = matrix * self.idf_
        return l2_normalize_rows(matrix) if self.norm == "l2" else matrix
