"""Şema bağlama: soruya (ve ipucuna) göre ilgili tablo ve sütunları seçer.

BIRD veritabanlarında onlarca tablo ve yüzlerce sütun vardır; hepsini isteme koymak hem bağlamı doldurur hem de
modeli yanlış sütuna çeker. Burada hafif, deterministik bir sıralama yapılır (model çağrısı yok):

- sözcük örtüşmesi (soru/ipucu sözcükleri ↔ tablo/sütun adı parçaları, Türkçe ve İngilizce kök kırpma),
- bulanık benzerlik (rapidfuzz `partial_ratio`),
- değer eşleşmesi (soru içindeki bir ifade sütunun örnek değerlerinden biriyse o sütun kesin ilgilidir),
- yabancı anahtar kapanışı (seçilen iki tabloyu birbirine bağlayan tablo da alınır; ara tablo düşmesin).

Çıktı: `LinkResult(tables, columns, scores)`; `index.subset(...)` ile istem şeması üretilir.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .schema import SchemaIndex

try:
    from rapidfuzz import fuzz
except ImportError:  # pragma: no cover - rapidfuzz çekirdek bağımlılık
    fuzz = None

_WORD_RE = re.compile(r"[\wçğıöşüÇĞİÖŞÜ]+", re.UNICODE)
_STOP = {
    # Türkçe
    "ve", "ile", "bir", "bu", "şu", "o", "için", "en", "mi", "mı", "mu", "mü", "ne", "kaç", "hangi", "olan", "göre",
    "da", "de", "ki", "her", "tüm", "bütün", "son", "ilk", "önce", "sonra", "var", "yok", "nedir", "kadar",
    # İngilizce
    "the", "a", "an", "of", "in", "on", "for", "to", "and", "or", "is", "are", "was", "were", "what", "which", "how",
    "many", "much", "list", "all", "with", "by", "from", "that", "this", "those", "these", "than", "as", "at", "be",
    "per", "number", "total", "average", "please", "give", "show", "find", "name", "names", "id", "ids",
}  # fmt: skip
_TR_SUFFIXES = (
    "lardan", "lerden", "larda", "lerde", "ların", "lerin", "ları", "leri", "lar", "ler",
    "dan", "den", "tan", "ten", "nın", "nin", "nun", "nün", "ın", "in", "un", "ün",
    "da", "de", "ta", "te", "ya", "ye", "yı", "yi", "yu", "yü", "ı", "i", "u", "ü", "a", "e",
    "sı", "si", "su", "sü", "ları", "leri",
)  # fmt: skip
_EN_SUFFIXES = ("ies", "es", "s", "ing", "ed")
_TR_SUFFIXES = tuple(sorted(set(_TR_SUFFIXES), key=len, reverse=True))


def _stem(word: str, min_len: int = 3) -> str:
    """Kaba kök kırpma: bilinen Türkçe/İngilizce ekleri sondan tekrar tekrar atar (illere → il, invoices → invoice)."""
    w = word.lower()
    changed = True
    while changed and len(w) > min_len:
        changed = False
        for suf in _TR_SUFFIXES + _EN_SUFFIXES:
            if w.endswith(suf) and len(w) - len(suf) >= min_len:
                w = w[: -len(suf)] + ("y" if suf == "ies" else "")
                changed = True
                break
    return w


def _is_suffix_chain(rest: str) -> bool:
    """`rest` yalnız bilinen eklerden mi oluşuyor? ("lere" → "ler"+"e" → evet)"""
    while rest:
        for suf in _TR_SUFFIXES + _EN_SUFFIXES:
            if rest.endswith(suf):
                rest = rest[: -len(suf)]
                break
        else:
            return False
    return True


def _matches(part: str, token: str) -> bool:
    """Şema adı parçası ile soru sözcüğü eşleşiyor mu? (kök eşitliği veya kök + ek zinciri)"""
    if part == token:
        return True
    ps, ts = _stem(part), _stem(token)
    if ps == ts:
        return True
    if len(part) >= 3 and token.startswith(part):
        return True
    return len(part) >= 2 and token.startswith(part) and _is_suffix_chain(token[len(part) :])


def tokens(text: str) -> list[str]:
    return [t.lower() for t in _WORD_RE.findall(text or "") if t.lower() not in _STOP and len(t) > 1]


def _name_parts(name: str) -> list[str]:
    # CamelCase, snake_case, boşluk, parantez: "FreeMealCount (K-12)" → ["free","meal","count","k","12"]
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name)
    return [p.lower() for p in _WORD_RE.findall(spaced) if p]


@dataclass
class LinkResult:
    tables: list[str]
    columns: dict[str, list[str]]  # tablo → seçilen sütunlar (anahtarlar `subset` içinde ayrıca korunur)
    scores: dict[str, float] = field(default_factory=dict)  # "tablo.sütun" → puan

    def schema(self, index: SchemaIndex) -> SchemaIndex:
        return index.subset(self.tables, self.columns)


def _score_name(q_tokens: list[str], q_stems: set[str], q_text: str, name: str) -> float:
    parts = _name_parts(name)
    if not parts:
        return 0.0
    score = 0.0
    exact = sum(1 for p in parts if any(_matches(p, t) for t in q_tokens))
    score += 3.0 * exact
    joined = " ".join(parts)
    if joined and joined in q_text:
        score += 4.0
    if fuzz is not None and q_tokens:
        best = max((fuzz.partial_ratio(joined, t) for t in q_tokens if len(t) >= 4), default=0)
        if best >= 85:
            score += 1.5 * (best / 100)
    return score


def _value_hits(q_text: str, samples: list[str]) -> float:
    hits = 0.0
    for s in samples:
        s_low = s.lower().strip()
        if len(s_low) >= 3 and not s_low.replace(".", "").replace("-", "").isdigit() and s_low in q_text:
            hits += 5.0
    return hits


def _quoted_values(question: str, evidence: str) -> list[str]:
    text = f"{question} {evidence}"
    return [m.group(1) or m.group(2) for m in re.finditer(r"'([^']+)'|\"([^\"]+)\"", text)]


def link_schema(
    index: SchemaIndex,
    question: str,
    evidence: str = "",
    *,
    max_tables: int = 6,
    max_columns_per_table: int = 12,
    min_tables: int = 1,
) -> LinkResult:
    """Soru ve ipucuna göre tablo/sütun seçimi. Küçük şemalarda (≤ max_tables tablo) hepsi alınır."""
    q_text = f"{question} {evidence}".lower()
    q_tokens = tokens(q_text)
    q_stems = {_stem(t) for t in q_tokens}
    quoted = [v.lower() for v in _quoted_values(question, evidence)]

    table_scores: dict[str, float] = {}
    col_scores: dict[str, dict[str, float]] = {}
    for t in index.tables.values():
        ts = _score_name(q_tokens, q_stems, q_text, t.name)
        if t.description:
            ts += 0.5 * len({_stem(x) for x in tokens(t.description)} & q_stems)
        cols: dict[str, float] = {}
        for c in t.columns:
            cs = _score_name(q_tokens, q_stems, q_text, c.name)
            if c.description:
                cs += 1.0 * len({_stem(x) for x in tokens(c.description)} & q_stems)
            cs += _value_hits(q_text, c.samples)
            for qv in quoted:
                if any(qv == s.lower() for s in c.samples):
                    cs += 6.0
            # ipucu (evidence) sütun adını doğrudan geçiyorsa (BIRD'de çok yaygın: `frpm.Enrollment (K-12)`)
            if evidence and c.name.lower() in evidence.lower():
                cs += 6.0
            cols[c.name] = cs
        col_scores[t.name] = cols
        table_scores[t.name] = ts + sum(sorted(cols.values(), reverse=True)[:3])

    all_tables = list(index.tables.values())
    if len(all_tables) <= max_tables:
        chosen = [t.name for t in all_tables]
    else:
        ranked = sorted(table_scores.items(), key=lambda kv: (-kv[1], kv[0]))
        chosen = [name for name, s in ranked[:max_tables] if s > 0] or [ranked[0][0]]
        while len(chosen) < min_tables and len(chosen) < len(ranked):
            chosen.append(ranked[len(chosen)][0])
        chosen = _fk_closure(index, chosen, max_tables + 2)

    columns: dict[str, list[str]] = {}
    scores: dict[str, float] = {}
    for tname in chosen:
        t = index.table(tname)
        if t is None:
            continue
        cols = col_scores.get(t.name, {})
        if len(t.columns) <= max_columns_per_table:
            keep = [c.name for c in t.columns]
        else:
            ranked_cols = sorted(cols.items(), key=lambda kv: (-kv[1], kv[0]))
            keep = [n for n, s in ranked_cols if s > 0][:max_columns_per_table]
            # puanı 0 olanlarla doldur: sıra şemadaki sırayla (sütunun doğal yeri bilgi taşır)
            if len(keep) < max_columns_per_table:
                for c in t.columns:
                    if c.name not in keep:
                        keep.append(c.name)
                    if len(keep) >= max_columns_per_table:
                        break
        columns[t.name] = keep
        for n, s in cols.items():
            if s > 0:
                scores[f"{t.name}.{n}"] = round(s, 2)
    return LinkResult(
        tables=[index.table(n).name for n in chosen if index.table(n)], columns=columns, scores=scores
    )


def _fk_closure(index: SchemaIndex, chosen: list[str], cap: int) -> list[str]:
    """Seçilen iki tablo arasında köprü olan (ikisine de FK veren) tabloyu ekler."""
    chosen_l = {c.lower() for c in chosen}
    out = list(chosen)
    for t in index.tables.values():
        if t.name.lower() in chosen_l or len(out) >= cap:
            continue
        refs = {c.references[0].lower() for c in t.columns if c.references}
        if len(refs & chosen_l) >= 2:
            out.append(t.name)
    return out
