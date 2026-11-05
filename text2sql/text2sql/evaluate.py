"""Küçük A/B değerlendirmesi: sorular.md'deki her soruyu modelden geçirir, üretilen ve beklenen SQL'in
sonuçlarını (sıra gözetmeden) karşılaştırır. İki modeli kendi GPU'nuzda kıyaslamak için."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .errors import BackendError, Text2SQLError
from .run import execute


@dataclass
class EvalRow:
    question: str
    ok: bool
    sql: str
    reason: str = ""


def _norm(v):
    if isinstance(v, float):
        return round(v, 2)
    return v


def _bag(rows, by_value: bool) -> Counter:
    # by_value: sütun sırası/adı farklıysa da eşleşsin diye her satırın değerleri sıralanır
    return Counter(tuple(sorted(map(str, map(_norm, r)))) if by_value else tuple(map(_norm, r)) for r in rows)


def same_result(a: list[tuple], b: list[tuple]) -> bool:
    return _bag(a, False) == _bag(b, False) or _bag(a, True) == _bag(b, True)


def evaluate(t2s, pairs: list[tuple[str, str]], retries: int = 1, limit: int = 10_000) -> list[EvalRow]:
    out = []
    for question, expected in pairs:
        try:
            want = execute(t2s.db, expected, limit=limit).rows
            ans = t2s.ask(question, retries=retries, limit=limit)
        except BackendError:
            raise  # sunucu yoksa her soru aynı hatayı verir: hemen dur
        except Text2SQLError as exc:
            out.append(EvalRow(question, False, "", str(exc)))
            continue
        if ans.result is None:
            out.append(EvalRow(question, False, ans.sql, ans.error or "sonuç yok"))
        else:
            ok = same_result(ans.result.rows, want)
            out.append(EvalRow(question, ok, ans.sql, "" if ok else "sonuç farklı"))
    return out
