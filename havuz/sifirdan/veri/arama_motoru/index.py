"""Ters dizin: alan başına konumlu gönderi listeleri (terim → belge → konumlar), belge uzunlukları,
yüzey sözcük sıklıkları (otomatik tamamlama ve yazım önerisi için); diske kaydet/yükle.

Dosya biçimi (gzip'li JSON, sürümlü; README'de örnek):
    {"surum": 1, "analyzer": {...}, "fields": {"baslik": 2.0, ...},
     "documents": {id: {alan: metin}}, "postings": {alan: {terim: {id: [konum, ...]}}},
     "lengths": {alan: {id: uzunluk}}, "words": {sözcük: sıklık}}
Yükleme gönderi listelerini yeniden ÇÖZÜMLEMEDEN olduğu gibi okur.

Genişletme: büyük derlemler için gönderi listelerini delta + değişken uzunluklu tamsayıyla
sıkıştırıp ikili bir dosyaya yazın (`save`/`load` dışında hiçbir şey değişmez).
"""

from __future__ import annotations

import gzip
import json
from collections import Counter
from pathlib import Path

from .text import Analyzer

FORMAT_VERSION = 1
DEFAULT_FIELDS = {"baslik": 2.0, "govde": 1.0}


class IndexFormatError(Exception):
    """Dizin dosyası okunamadı (sürüm ya da biçim uyuşmuyor). Dizini yeniden kurun."""


class InvertedIndex:
    def __init__(self, analyzer: Analyzer | None = None, fields: dict[str, float] | None = None):
        self.analyzer = analyzer or Analyzer()
        self.fields = dict(fields or DEFAULT_FIELDS)
        self.documents: dict[str, dict[str, str]] = {}
        self.postings: dict[str, dict[str, dict[str, list[int]]]] = {f: {} for f in self.fields}
        self.lengths: dict[str, dict[str, int]] = {f: {} for f in self.fields}
        self.words: Counter[str] = Counter()  # yüzey sözcük → kaç kez geçti

    def __len__(self) -> int:
        return len(self.documents)

    def add(self, doc_id: str, fields: dict[str, str]) -> None:
        """Belgeyi ekler (aynı kimlik varsa önce eskisini çıkarır)."""
        unknown = set(fields) - set(self.fields)
        if unknown:
            raise ValueError(
                f"Bilinmeyen alan(lar): {sorted(unknown)}. Alanlar: {list(self.fields)}"
            )
        if doc_id in self.documents:
            self.remove(doc_id)
        self.documents[doc_id] = dict(fields)
        for field, text in fields.items():
            tokens = self.analyzer.tokens(text)
            self.lengths[field][doc_id] = sum(len(token.terms) for token in tokens)
            postings = self.postings[field]
            for token in tokens:
                self.words[token.word] += 1
                for term in token.terms:
                    postings.setdefault(term, {}).setdefault(doc_id, []).append(token.position)

    def remove(self, doc_id: str) -> None:
        fields = self.documents.pop(doc_id, None)
        if fields is None:
            return
        for field, text in fields.items():
            self.lengths[field].pop(doc_id, None)
            postings = self.postings[field]
            for token in self.analyzer.tokens(text):
                self.words[token.word] -= 1
                if self.words[token.word] <= 0:
                    del self.words[token.word]
                for term in token.terms:
                    by_doc = postings.get(term)
                    if by_doc is not None:
                        by_doc.pop(doc_id, None)
                        if not by_doc:
                            del postings[term]

    # ── İstatistikler (BM25 kullanır) ──────────────────────────────────────────────────────────

    def document_frequency(self, field: str, term: str) -> int:
        return len(self.postings[field].get(term, {}))

    def average_length(self, field: str) -> float:
        lengths = self.lengths[field]
        return sum(lengths.values()) / len(lengths) if lengths else 0.0

    def field_documents(self, field: str) -> int:
        return len(self.lengths[field])

    def terms_with_prefix(self, field: str, prefix: str, limit: int = 50) -> list[str]:
        return sorted(term for term in self.postings[field] if term.startswith(prefix))[:limit]

    # ── Kaydet / yükle ──────────────────────────────────────────────────────────────────────────

    def save(self, path: str | Path) -> None:
        data = {
            "surum": FORMAT_VERSION,
            "analyzer": self.analyzer.config(),
            "fields": self.fields,
            "documents": self.documents,
            "postings": self.postings,
            "lengths": self.lengths,
            "words": dict(self.words),
        }
        with gzip.open(Path(path), "wt", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, sort_keys=True)

    @classmethod
    def load(cls, path: str | Path) -> InvertedIndex:
        try:
            with gzip.open(Path(path), "rt", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as error:
            raise IndexFormatError(f"Dizin dosyası okunamadı: {error}") from error
        if not isinstance(data, dict) or data.get("surum") != FORMAT_VERSION:
            raise IndexFormatError(f"Dizin sürümü {FORMAT_VERSION} değil; dizini yeniden kurun.")
        config = data["analyzer"]
        analyzer = Analyzer(str(config["mode"]), int(config["ngram"]), bool(config["stop_words"]))
        index = cls(analyzer, {str(k): float(v) for k, v in data["fields"].items()})
        index.documents = data["documents"]
        index.postings = data["postings"]
        index.lengths = data["lengths"]
        index.words = Counter(data["words"])
        return index
