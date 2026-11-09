"""N25 Kayıt Eşleştirme — cari/ürün kayıtlarında mükerrer ve eşleşme bulma.

RapidFuzz `token_set_ratio` her zaman çalışır. Splink kuruluysa ve `method="splink"` istenirse olasılıksal
eşleştirme denenir; hata olursa RapidFuzz sonucuna dönülür ve meta'da belirtilir.
Ad normalizasyonu Türkçe: İ→i, I→ı, casefold; "anonim şirketi"/"a.ş." → "as", "limited şirketi"/"ltd. şti." → "ltd".
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, has_package, not_ready, note, require

_SUFFIXES = [
    (r"\banonim\s+şirketi\b", " as "),
    (r"\ba\.?\s?ş\.?(?=\s|$)", " as "),
    (r"\ba\.\s?s\.(?=\s|$)", " as "),
    (r"\blimited\s+şirketi\b", " ltd "),
    (r"\bltd\.?\s*şti\.?(?=\s|$)", " ltd "),
    (r"\bltd\.?(?=\s|$)", " ltd "),
    (r"\bşti\.?(?=\s|$)", " ltd "),
    (r"\bsanayi\s+ve\s+ticaret\b", " sanayi ticaret "),
    (r"\bsan\.?\s*ve\s*tic\.?(?=\s|$)", " sanayi ticaret "),
    (r"\bsan\.?\s*tic\.?(?=\s|$)", " sanayi ticaret "),
    (r"\bve\b", " "),
]
_TR_ASCII = str.maketrans(
    {"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"}
)


def tr_lower(text: str) -> str:
    return text.replace("İ", "i").replace("I", "ı").casefold()


def normalize_name(text: str) -> str:
    s = tr_lower(str(text or ""))
    for pat, rep in _SUFFIXES:
        s = re.sub(pat, rep, s)
    s = s.translate(_TR_ASCII)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _record_text(rec: Any, fields: list[str] | None) -> str:
    if isinstance(rec, dict):
        keys = fields or [
            k for k, v in rec.items() if isinstance(v, (str, int, float)) and k not in ("id", "_id")
        ]
        return " ".join(str(rec.get(k, "")) for k in keys if rec.get(k) not in (None, ""))
    return str(rec)


def _rec_id(rec: Any, idx: int):
    if isinstance(rec, dict):
        for k in ("id", "_id", "kod", "code"):
            if k in rec:
                return rec[k]
    return idx


def _threshold(v) -> float:
    t = float(v if v is not None else 85)
    return t * 100 if t <= 1 else t


def rapidfuzz_duplicates(records: list, threshold: float, fields: list[str] | None) -> dict:
    from rapidfuzz import fuzz, process

    norm = [normalize_name(_record_text(r, fields)) for r in records]
    scores = process.cdist(norm, norm, scorer=fuzz.token_set_ratio, workers=1)
    parent = list(range(len(records)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    pairs = []
    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            sc = float(scores[i][j])
            if sc >= threshold and norm[i] and norm[j]:
                pairs.append(
                    {
                        "a": _rec_id(records[i], i),
                        "b": _rec_id(records[j], j),
                        "a_index": i,
                        "b_index": j,
                        "score": round(sc, 1),
                    }
                )
                parent[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for i in range(len(records)):
        groups.setdefault(find(i), []).append(i)
    dup_groups = [[_rec_id(records[i], i) for i in g] for g in groups.values() if len(g) > 1]
    pairs.sort(key=lambda p: -p["score"])
    return {"pairs": pairs, "groups": dup_groups, "normalized": norm}


def splink_duplicates(
    records: list, threshold: float, fields: list[str] | None
) -> dict:  # pragma: no cover - splink yok
    import pandas as pd
    import splink.comparison_library as cl
    from splink import DuckDBAPI, Linker, SettingsCreator, block_on

    norm = [normalize_name(_record_text(r, fields)) for r in records]
    df = pd.DataFrame(
        {"unique_id": list(range(len(records))), "name": norm, "blk": [n[:1] if n else "" for n in norm]}
    )
    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[cl.JaroWinklerAtThresholds("name", [0.95, 0.88, 0.7])],
        blocking_rules_to_generate_predictions=[block_on("blk")],
    )
    linker = Linker(df, settings, db_api=DuckDBAPI())
    linker.training.estimate_u_using_random_sampling(max_pairs=1e5)
    pred = linker.inference.predict(threshold_match_probability=threshold / 100).as_pandas_dataframe()
    pairs = [
        {
            "a": _rec_id(records[int(r.unique_id_l)], int(r.unique_id_l)),
            "b": _rec_id(records[int(r.unique_id_r)], int(r.unique_id_r)),
            "a_index": int(r.unique_id_l),
            "b_index": int(r.unique_id_r),
            "score": round(float(r.match_probability) * 100, 1),
        }
        for r in pred.itertuples()
    ]
    return {"pairs": pairs, "groups": [], "normalized": norm}


@register("kayit-eslestirme")
class KayitEslestirme(BaseRuntime):
    requires = ("rapidfuzz",)

    async def do_find_duplicates(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "records")
        records = payload["records"]
        if not isinstance(records, list):
            raise ModuleError("'records' liste olmalı")
        if len(records) > 20000:
            raise ModuleError("Tek seferde en fazla 20.000 kayıt karşılaştırılabilir; parçalara bölün")
        threshold = _threshold(payload.get("threshold"))
        fields = payload.get("fields")
        engine = "rapidfuzz"
        if payload.get("method") == "splink":
            if not has_package("splink"):
                raise not_ready("splink", "kayit-eslestirme")
            try:
                res = await asyncio.to_thread(splink_duplicates, records, threshold, fields)
                engine = "splink"
            except Exception as e:  # pragma: no cover
                note(ctx, splink_error=str(e)[:200])
                res = await asyncio.to_thread(rapidfuzz_duplicates, records, threshold, fields)
        else:
            res = await asyncio.to_thread(rapidfuzz_duplicates, records, threshold, fields)
        note(ctx, engine=engine)
        res.pop("normalized", None)
        return {**res, "threshold": threshold, "engine": engine, "record_count": len(records)}

    async def do_match(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "record", "candidates")
        from rapidfuzz import fuzz

        fields = payload.get("fields")
        threshold = _threshold(payload.get("threshold", 70))
        top_k = int(payload.get("top_k", 5))
        q = normalize_name(_record_text(payload["record"], fields))
        scored = []
        for i, c in enumerate(payload["candidates"] or []):
            sc = float(fuzz.token_set_ratio(q, normalize_name(_record_text(c, fields))))
            if sc >= threshold:
                scored.append({"index": i, "id": _rec_id(c, i), "candidate": c, "score": round(sc, 1)})
        scored.sort(key=lambda x: -x["score"])
        note(ctx, engine="rapidfuzz")
        return {"matches": scored[:top_k], "best": scored[0] if scored else None, "threshold": threshold}
