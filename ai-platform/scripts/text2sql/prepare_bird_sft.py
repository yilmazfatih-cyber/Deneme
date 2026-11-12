#!/usr/bin/env python
"""BIRD / Spider eğitim kümesinden SFT (LoRA) verisi üretir — çıkarımla birebir aynı istem biçiminde.

Her örnek `aiplatform.text2sql.Text2SQL.messages_for(...)` ile kurulur: aynı sistem istemi, aynı şema bağlama,
aynı DDL biçimi, aynı İPUCU/SORU düzeni. Böylece eğitimde gördüğü ile üretimde gördüğü istem aynıdır.

Temizlik: altın SQL (1) veritabanında hatasız çalışmalı, (2) şemaya bağlanmalı (`ground`). BIRD'ün eğitim
kümesinde bozuk/uydurma sütunlu altın sorgular vardır; bunlar atılır (sayısı raporlanır).

Onarım örnekleri (`--repair-ratio`): altın sorgunun bir sütunu kasıtlı bozulur → model yanlış yanıt verir →
kullanıcı çıkarımdaki **gerçek** hata metniyle (yine `ground` üretir) düzeltme ister → model doğru sorguyu yazar.
Model böylece "sütun uydurduğunda nasıl geri dönüleceğini" de öğrenir.

Kullanım:
  python scripts/text2sql/prepare_bird_sft.py --train bird/train/train.json --db-root bird/train/train_databases \\
      --out data/bird_sft.jsonl --lang en --repair-ratio 0.3
  python scripts/text2sql/prepare_bird_sft.py --train spider/train_spider.json --db-root spider/database --spider ...

Çıktı satırı: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}], "db_id": ...}
"""

from __future__ import annotations

import argparse
import json
import random
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from aiplatform.text2sql import GroundingError, SchemaIndex, Text2SQL, ground
from aiplatform.text2sql.bird import db_path, load_descriptions, run_sqlite

_WRONG_SUFFIXES = ("_name", "_id", "_code", "_date", "_count", "_total", "s")
_SYNONYMS = {
    "name": "title",
    "title": "name",
    "id": "key",
    "date": "time",
    "count": "number",
    "total": "sum",
    "amount": "value",
    "city": "town",
    "country": "nation",
    "price": "cost",
    "ad": "isim",
    "tutar": "miktar",
    "tarih": "zaman",
    "unvan": "ad",
    "il": "sehir",
}


def load_train(path: Path, spider: bool) -> list[dict]:
    items = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for i, it in enumerate(items):
        out.append(
            {
                "idx": it.get("question_id", i),
                "db_id": it["db_id"],
                "question": it["question"],
                "evidence": "" if spider else (it.get("evidence") or ""),
                "gold": (it.get("query") if spider else it.get("SQL")) or "",
                "difficulty": it.get("difficulty", ""),
            }
        )
    return out


def corrupt_column(sql: str, columns: list[str], rng: random.Random) -> tuple[str, str] | None:
    """Gold SQL'de geçen bir sütun adını şemada olmayan bir ada çevirir. (bozuk_sql, bozuk_ad) veya None."""
    cands = [c.split(".", 1)[1] for c in columns]
    rng.shuffle(cands)
    for col in cands:
        low = col.lower()
        wrong = _SYNONYMS.get(low) or (
            low.rsplit("_", 1)[0] if "_" in low and rng.random() < 0.5 else low + rng.choice(_WRONG_SUFFIXES)
        )
        if wrong == low:
            continue
        for quoted in (f"`{col}`", f'"{col}"', col):
            if quoted in sql:
                return sql.replace(quoted, wrong if quoted == col else f"`{wrong}`", 1), wrong
    return None


def build_examples(
    items: list[dict],
    db_root: Path,
    *,
    lang: str = "en",
    repair_ratio: float = 0.3,
    max_tables: int = 6,
    seed: int = 7,
    style: str = "json",
    log=print,
) -> tuple[list[dict], dict]:
    rng = random.Random(seed)
    engine = Text2SQL(
        lambda m, t: None, dialect="sqlite", lang=lang, max_tables=max_tables, style=style
    )  # yalnız istem için
    indexes: dict[str, SchemaIndex] = {}
    stats = {"total": len(items), "kept": 0, "repair": 0, "gold_fails": 0, "gold_ungrounded": 0, "no_db": 0}
    out: list[dict] = []
    for it in items:
        path = db_path(db_root, it["db_id"])
        if not path.exists():
            stats["no_db"] += 1
            continue
        if it["db_id"] not in indexes:
            idx = SchemaIndex.from_sqlite(path)
            load_descriptions(db_root, it["db_id"], idx)
            indexes[it["db_id"]] = idx
        index = indexes[it["db_id"]]
        gold = it["gold"].strip().rstrip(";")
        try:
            g = ground(gold, index, "sqlite")
        except GroundingError as e:
            key = "gold_fails" if e.message.startswith("SQL ayrıştırılamadı") else "gold_ungrounded"
            stats[key] += 1
            log(f"  atlandı (altın SQL: {e.message[:120]}) {it['db_id']}#{it['idx']}")
            continue
        try:
            run_sqlite(path, gold, timeout_s=20, max_rows=1)
        except sqlite3.Error as e:
            stats["gold_fails"] += 1
            log(f"  atlandı (altın SQL çalışmadı) {it['db_id']}#{it['idx']}: {e}")
            continue
        messages = engine.messages_for(index, it["question"], it["evidence"])
        explanation = ("Tables: " if lang == "en" else "Tablolar: ") + ", ".join(g.tables)
        answer = engine.assistant_echo(gold, explanation)
        out.append(
            {
                "messages": [*messages, {"role": "assistant", "content": answer}],
                "db_id": it["db_id"],
                "kind": "direct",
            }
        )
        stats["kept"] += 1

        if repair_ratio > 0 and rng.random() < repair_ratio and g.columns:
            corrupted = corrupt_column(gold, g.columns, rng)
            if not corrupted:
                continue
            bad_sql, _wrong = corrupted
            try:
                ground(bad_sql, index, "sqlite")
                continue  # bozulan ad tesadüfen şemada varmış; onarım örneği olmaz
            except GroundingError as e:
                error = e.message
            except Exception:  # noqa: BLE001, S112 - ayrıştırılamayan bozulma; örnek üretilmez
                continue
            repair_user = Text2SQL.repair_message(error, lang, style)
            out.append(
                {
                    "messages": [
                        *messages,
                        {"role": "assistant", "content": engine.assistant_echo(bad_sql, explanation)},
                        {"role": "user", "content": repair_user},
                        {"role": "assistant", "content": answer},
                    ],
                    "db_id": it["db_id"],
                    "kind": "repair",
                }
            )
            stats["repair"] += 1
    return out, stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--train", required=True, type=Path)
    ap.add_argument("--db-root", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lang", default="en", choices=["en", "tr"])
    ap.add_argument(
        "--style",
        default="json",
        choices=["json", "cot"],
        help="çıkarımda kullanılacak istem stiliyle aynı olmalı",
    )
    ap.add_argument("--repair-ratio", type=float, default=0.3)
    ap.add_argument("--max-tables", type=int, default=6)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--spider", action="store_true", help="Spider biçimi (query alanı, ipucu yok)")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(argv)
    items = load_train(a.train, a.spider)
    if a.limit:
        items = items[: a.limit]
    examples, stats = build_examples(
        items,
        a.db_root,
        lang=a.lang,
        repair_ratio=a.repair_ratio,
        max_tables=a.max_tables,
        seed=a.seed,
        style=a.style,
    )
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("w", encoding="utf-8") as fh:
        for ex in examples:
            fh.write(json.dumps(ex, ensure_ascii=False) + "\n")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"{len(examples)} örnek → {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
