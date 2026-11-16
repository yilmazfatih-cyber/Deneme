"""Arama: sorgu tümcelerini değerlendirir, BM25 ile puanlar, alan ağırlıklarını uygular, özet
üretir.

BM25 (k1 = 1.2, b = 0.75; Lucene'in her zaman pozitif IDF'si):
    idf(t)       = ln(1 + (N - n + 0.5) / (n + 0.5))          N: alandaki belge, n: t'yi içeren
    belge puan(t, d)   = idf · tf · (k1 + 1) / (tf + k1 · (1 - b + b · |d| / ortalama|d|))
Belge puanı = Σ tümce Σ alan (alan_ağırlığı · Σ terim puan). İfade ve yakınlık tümceleri konumla
süzülür, puanları terimlerinin toplamıdır.

Genişletme: BM25F (alanları önce birleştirip sonra doyurmak) ya da ifade eşleşmesine ek ödül için
`_clause_score`'u değiştirin; puanı elle hesaplanmış örnekle sınayan testi güncelleyin.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .index import InvertedIndex
from .query import Clause, parse_query
from .snippet import make_snippet
from .spelling import closest_word, completions
from .text import Token

K1 = 1.2
B = 0.75
MAX_PREFIX_EXPANSIONS = 50

Matches = dict[str, set[int]]  # belge → eşleşen sözcük konumları


@dataclass
class Hit:
    doc_id: str
    score: float
    snippet: str
    fields: dict[str, str]


def bm25(index: InvertedIndex, field: str, term: str, doc_id: str) -> float:
    positions = index.postings[field].get(term, {}).get(doc_id)
    if not positions:
        return 0.0
    total = index.field_documents(field)
    containing = index.document_frequency(field, term)
    idf = math.log(1 + (total - containing + 0.5) / (containing + 0.5))
    tf = len(positions)
    length, average = index.lengths[field][doc_id], index.average_length(field)
    return idf * tf * (K1 + 1) / (tf + K1 * (1 - B + B * length / average))


def _word_matches(index: InvertedIndex, field: str, terms: tuple[str, ...]) -> Matches:
    """Sözcüğün BÜTÜN terimlerinin aynı konumda geçtiği belgeler (kök kipinde tek terim)."""
    result: Matches | None = None
    for term in terms:
        current = {doc: set(pos) for doc, pos in index.postings[field].get(term, {}).items()}
        if result is None:
            result = current
        else:
            result = {d: result[d] & current[d] for d in result.keys() & current.keys()}
            result = {d: p for d, p in result.items() if p}
    return result or {}


def _phrase_matches(index: InvertedIndex, field: str, clause: Clause) -> Matches:
    per_word = [_word_matches(index, field, token.terms) for token in clause.tokens]
    documents = set.intersection(*(set(m) for m in per_word)) if per_word else set()
    offsets = [token.position - clause.tokens[0].position for token in clause.tokens]
    result: Matches = {}
    for doc in documents:
        sets = [m[doc] for m in per_word]
        if clause.slop is None:  # tam ifade: p, p+o1, p+o2... hepsi var mı?
            starts = [
                p for p in sets[0] if all(p + o in s for o, s in zip(offsets, sets, strict=True))
            ]
            if starts:
                result[doc] = {p + o for p in starts for o in offsets}
        else:
            window = _smallest_window(sets)
            if window is not None and window[1] - window[0] <= len(sets) - 1 + clause.slop:
                result[doc] = {p for s in sets for p in s if window[0] <= p <= window[1]}
    return result


def _smallest_window(sets: list[set[int]]) -> tuple[int, int] | None:
    """Her kümeden en az bir konum içeren en dar [başlangıç, bitiş] (sıra fark etmez)."""
    events = sorted((p, i) for i, s in enumerate(sets) for p in s)
    counts = [0] * len(sets)
    covered, left, best = 0, 0, None
    for position, which in events:
        counts[which] += 1
        covered += counts[which] == 1
        while covered == len(sets):
            start, first = events[left]
            if best is None or position - start < best[1] - best[0]:
                best = (start, position)
            counts[first] -= 1
            covered -= counts[first] == 0
            left += 1
    return best


def _clause_matches(index: InvertedIndex, field: str, clause: Clause) -> tuple[Matches, set[str]]:
    """(belge → konumlar, puanlanacak terimler)."""
    if clause.kind == "phrase":
        phrase_terms = {t for token in clause.tokens for t in token.terms}
        return _phrase_matches(index, field, clause), phrase_terms
    if clause.kind == "word":
        return _word_matches(index, field, clause.tokens[0].terms), set(clause.tokens[0].terms)
    expansions = sorted(
        (word for word in index.words if word.startswith(clause.prefix)),
        key=lambda word: (-index.words[word], word),
    )[:MAX_PREFIX_EXPANSIONS]
    merged: Matches = {}
    terms: set[str] = set()
    for word in expansions:
        word_terms = index.analyzer.terms_of(word)
        terms |= set(word_terms)
        for doc, positions in _word_matches(index, field, word_terms).items():
            merged.setdefault(doc, set()).update(positions)
    return merged, terms


def search(
    index: InvertedIndex,
    query: str,
    *,
    limit: int = 10,
    any_term: bool = False,
    marks: tuple[str, str] = ("[", "]"),
    as_html: bool = False,
) -> list[Hit]:
    """Sorguyu çalıştırır; puana göre sıralı sonuçlar (eşitlikte belge kimliğine göre)."""
    clauses = parse_query(query, index.analyzer, list(index.fields))
    positive = [c for c in clauses if not c.negated]
    if not positive:
        return []
    scores: dict[str, float] = {}
    hits_per_clause: list[set[str]] = []
    highlight: dict[str, dict[str, set[int]]] = {}  # belge → alan → konumlar
    for clause in positive:
        matched_docs: set[str] = set()
        for field, boost in index.fields.items():
            if clause.field not in (None, field):
                continue
            matches, terms = _clause_matches(index, field, clause)
            for doc, positions in matches.items():
                matched_docs.add(doc)
                score = sum(bm25(index, field, term, doc) for term in terms)
                scores[doc] = scores.get(doc, 0.0) + boost * score
                highlight.setdefault(doc, {}).setdefault(field, set()).update(positions)
        hits_per_clause.append(matched_docs)
    combine = set.union if any_term else set.intersection
    candidates = combine(*hits_per_clause)
    for clause in clauses:
        if clause.negated:
            for field in index.fields:
                if clause.field in (None, field):
                    candidates -= set(_clause_matches(index, field, clause)[0])
    ranked = sorted(candidates, key=lambda doc: (-scores[doc], doc))[:limit]
    return [_hit(index, doc, scores[doc], highlight[doc], marks, as_html) for doc in ranked]


def _hit(
    index: InvertedIndex,
    doc: str,
    score: float,
    fields: dict[str, set[int]],
    marks: tuple[str, str],
    as_html: bool,
) -> Hit:
    # Özet: en çok eşleşmenin olduğu alandan (eşitlikte en düşük ağırlıklı, yani gövde) üretilir.
    field = max(fields, key=lambda name: (len(fields[name]), -index.fields[name]))
    text = index.documents[doc].get(field, "")
    snippet = make_snippet(text, fields[field], index.analyzer, marks=marks, as_html=as_html)
    return Hit(doc, score, snippet, index.documents[doc])


def did_you_mean(index: InvertedIndex, query: str) -> str | None:
    """Hiç sonuç vermeyen sözcükleri sözlükteki en yakın sözcükle değiştirir; değişiklik yoksa
    None."""
    changed = False
    parts: list[str] = []
    for part in query.split():
        bare = part.strip('"-*~')
        tokens: list[Token] = index.analyzer.tokens(bare)
        known = any(
            _word_matches(index, field, token.terms) for token in tokens for field in index.fields
        )
        if tokens and not known:
            suggestion = closest_word(bare, index.words, _stem_table(index))
            if suggestion is not None:
                parts.append(part.replace(bare, suggestion))
                changed = True
                continue
        parts.append(part)
    return " ".join(parts) if changed else None


def _stem_table(index: InvertedIndex) -> dict[str, tuple[str, int]]:
    """Kök → (en sık yüzey sözcüğü, sıklık); yalnız kök kipinde."""
    if index.analyzer.mode != "stem":
        return {}
    table: dict[str, tuple[str, int]] = {}
    for word, count in sorted(index.words.items()):
        stem = index.analyzer.terms_of(word)[0]
        if stem not in table or count > table[stem][1]:
            table[stem] = (word, count)
    return table


def complete(index: InvertedIndex, prefix: str, limit: int = 5) -> list[str]:
    """Otomatik tamamlama: ön eki tutan en sık sözcükler."""
    return completions(prefix, index.words, limit)
