"""Sorgu dili ayrıştırıcısı.

    kedi süt                 iki sözcük de geçmeli (varsayılan VE; any_term=True ile VEYA)
    "süt içti"               tam ifade (sözcükler bu sırayla ve yan yana)
    "kedi süt"~3             yakınlık: sözcükler sırası fark etmeksizin 2 - 1 + 3 = 4 genişlikte
    pencerede baslik:kedi              yalnız o alanda ara kita*                    ön ek: "kitap",
    "kitaplar"... (en sık 50 açılım) -köpek                   bu sözcüğü içeren belgeleri dışarıda
    bırak (ifade ve alanla da olur)

Genişletme: yeni bir işleç (ör. `+zorunlu` ya da `^2` ağırlık) → `_PART` düzenli ifadesine bir grup
ve `Clause`'a bir alan; değerlendirme `search.py`'de.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .text import Analyzer, Token, lower_tr

_PART = re.compile(r'(-)?(?:(\w+):)?(?:"([^"]*)"(?:~(\d+))?|(\S+))', re.UNICODE)


class QueryError(ValueError):
    """Sorgu anlaşılamadı; ileti düzeltmeyi söyler."""


@dataclass(frozen=True)
class Clause:
    kind: str  # "word", "phrase", "prefix"
    tokens: tuple[Token, ...]  # çözümlenmiş sözcükler (ön ekte boş)
    text: str  # kullanıcının yazdığı biçim
    field: str | None = None
    negated: bool = False
    slop: int | None = None  # ifade için yakınlık payı; None = tam ifade
    prefix: str = ""


def parse_query(query: str, analyzer: Analyzer, fields: list[str]) -> list[Clause]:
    clauses: list[Clause] = []
    for match in _PART.finditer(query):
        minus, field, phrase, slop, word = match.groups()
        if field is not None and field not in fields:
            raise QueryError(f"'{field}' diye bir alan yok. Alanlar: {', '.join(fields)}.")
        text, negated = match.group(), minus is not None
        if phrase is not None:
            tokens = tuple(analyzer.tokens(phrase))
            distance = None if slop is None else int(slop)
            if tokens:
                clauses.append(Clause("phrase", tokens, text, field, negated, distance))
            continue
        assert word is not None
        if word.endswith("*") and len(word) > 1:
            prefix = lower_tr(word.rstrip("*"))
            clauses.append(Clause("prefix", (), text, field, negated, prefix=prefix))
            continue
        tokens = tuple(analyzer.tokens(word))
        if len(tokens) == 1:
            clauses.append(Clause("word", tokens, text, field, negated))
        elif tokens:  # "e-posta" gibi: tire sözcükleri ayırır → ifade say
            clauses.append(Clause("phrase", tokens, text, field, negated))
    return clauses
