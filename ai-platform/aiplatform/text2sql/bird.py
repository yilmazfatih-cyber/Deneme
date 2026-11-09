"""BIRD (bird-bench.github.io) değerlendirmesi: yürütme doğruluğu (EX) ve resmi biçimde tahmin dosyası.

Kullanım (herhangi bir OpenAI uyumlu uç nokta: vLLM, llama-server, Ollama, platform geçidi):

    python -m aiplatform.text2sql.bird \\
        --dev dev/dev.json --db-root dev/dev_databases \\
        --base-url http://127.0.0.1:8001/v1 --model qwen2.5-coder-7b \\
        --candidates 4 --max-repairs 2 --lang en --out out/bird

Çıktı: `out/bird/predict_dev.json` (resmi değerlendirici biçimi: {"idx": "SQL\\t----- bird -----\\tdb_id"}),
`out/bird/report.json` (toplam ve zorluk başına EX, hata türleri, tur sayıları), `out/bird/attempts.jsonl`.

Not: Resmi puan için BIRD'ün kendi `evaluation.py` betiği `predict_dev.json` ile çalıştırılır; buradaki EX aynı
kuralı (sonuç kümesi eşitliği, sıra bağımsız) uygular ve geliştirme döngüsü için yeterlidir.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sqlite3
import time
from collections import Counter
from pathlib import Path
from typing import Any

import httpx

from .pipeline import Text2SQL, Text2SQLError, _signature
from .schema import SchemaIndex

READ_ONLY_HINT = "Bu araç yalnız SELECT gönderir; yine de veritabanı dosyasını salt-okunur açar."


# ---------------------------------------------------------------------- veri
def load_items(dev_path: Path, limit: int | None = None, db_ids: set[str] | None = None) -> list[dict]:
    items = json.loads(dev_path.read_text(encoding="utf-8"))
    out = []
    for i, it in enumerate(items):
        if db_ids and it.get("db_id") not in db_ids:
            continue
        out.append(
            {
                "idx": it.get("question_id", i),
                "db_id": it["db_id"],
                "question": it["question"],
                "evidence": it.get("evidence", "") or "",
                "gold": it.get("SQL") or it.get("query") or "",
                "difficulty": it.get("difficulty", ""),
            }
        )
    return out[:limit] if limit else out


def db_path(db_root: Path, db_id: str) -> Path:
    p = db_root / db_id / f"{db_id}.sqlite"
    if not p.exists():
        alt = list((db_root / db_id).glob("*.sqlite"))
        if alt:
            return alt[0]
    return p


def load_descriptions(db_root: Path, db_id: str, index: SchemaIndex) -> None:
    """BIRD `database_description/*.csv` dosyalarındaki sütun açıklamalarını dizine ekler (varsa)."""
    import csv

    desc_dir = db_root / db_id / "database_description"
    if not desc_dir.is_dir():
        return
    for csv_path in desc_dir.glob("*.csv"):
        t = index.table(csv_path.stem)
        if t is None:
            continue
        try:
            with csv_path.open(encoding="utf-8", errors="replace", newline="") as fh:
                for row in csv.DictReader(fh):
                    orig = (row.get("original_column_name") or "").strip()
                    col = t.column(orig) if orig else None
                    if col is None:
                        continue
                    bits = [
                        (row.get("column_description") or "").strip(),
                        (row.get("value_description") or "").strip(),
                    ]
                    col.description = " ; ".join(b for b in bits if b)[:160]
        except (OSError, csv.Error):
            continue


# ---------------------------------------------------------------------- çalıştırma
def run_sqlite(path: Path, sql: str, timeout_s: float = 30.0, max_rows: int = 5000) -> list[tuple]:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=timeout_s)
    try:
        con.text_factory = lambda b: b.decode("utf-8", "replace")
        deadline = time.monotonic() + timeout_s
        con.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10000)
        cur = con.execute(sql)
        return cur.fetchmany(max_rows)
    finally:
        con.close()


def exec_match(pred_rows: list[tuple] | None, gold_rows: list[tuple]) -> bool:
    if pred_rows is None:
        return False
    return _signature(pred_rows) == _signature(gold_rows)


# ---------------------------------------------------------------------- model istemcisi
class OpenAICompatible:
    """Ham /v1/chat/completions istemcisi. JSON modu desteklenmiyorsa düz üretime düşer."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "sk-local",
        max_tokens: int = 768,
        timeout: float = 180,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.headers = {"Authorization": f"Bearer {api_key}"}
        self.max_tokens = max_tokens
        self.client = httpx.AsyncClient(timeout=timeout)
        self._json_mode = True

    async def __call__(self, messages: list[dict], temperature: float) -> str:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": self.max_tokens,
        }
        if self._json_mode:
            body["response_format"] = {"type": "json_object"}
        r = await self.client.post(f"{self.base_url}/chat/completions", json=body, headers=self.headers)
        if r.status_code in (400, 422) and self._json_mode:
            self._json_mode = False
            return await self(messages, temperature)
        r.raise_for_status()
        return r.json()["choices"][0]["message"].get("content") or ""

    async def aclose(self) -> None:
        await self.client.aclose()


# ---------------------------------------------------------------------- değerlendirme
async def evaluate(
    items: list[dict],
    db_root: Path,
    generate,
    *,
    candidates: int = 1,
    max_repairs: int = 2,
    lang: str = "en",
    concurrency: int = 4,
    out_dir: Path | None = None,
    link: bool = True,
    verbose: bool = False,
) -> dict:
    indexes: dict[str, SchemaIndex] = {}

    def index_for(db_id: str) -> SchemaIndex:
        if db_id not in indexes:
            idx = SchemaIndex.from_sqlite(db_path(db_root, db_id))
            load_descriptions(db_root, db_id, idx)
            indexes[db_id] = idx
        return indexes[db_id]

    sem = asyncio.Semaphore(concurrency)
    results: list[dict] = []
    attempts_fh = (out_dir / "attempts.jsonl").open("w", encoding="utf-8") if out_dir else None

    async def one(it: dict) -> dict:
        path = db_path(db_root, it["db_id"])
        index = index_for(it["db_id"])
        engine = Text2SQL(
            generate,
            executor=lambda sql, p=path: asyncio.to_thread(run_sqlite, p, sql),
            dialect="sqlite",
            lang=lang,
            max_repairs=max_repairs,
            candidates=candidates,
            link=link,
            empty_result_is_error=False,
        )
        rec: dict[str, Any] = {"idx": it["idx"], "db_id": it["db_id"], "difficulty": it["difficulty"]}
        async with sem:
            t0 = time.monotonic()
            try:
                res = await engine.run(it["question"], index, it["evidence"])
                rec.update(sql=res.sql, selected_by=res.selected_by, turns=len(res.attempts), error=None)
                pred_rows = res.rows
                attempts = res.attempts
            except Text2SQLError as e:
                rec.update(sql="", error=e.message, turns=len(e.attempts))
                pred_rows, attempts = None, e.attempts
            except Exception as e:  # noqa: BLE001 - uç nokta/ağ hatası tek soruyu düşürür, koşuyu değil
                rec.update(sql="", error=f"{type(e).__name__}: {e}", turns=0)
                pred_rows, attempts = None, []
            rec["seconds"] = round(time.monotonic() - t0, 2)
        try:
            gold_rows = await asyncio.to_thread(run_sqlite, path, it["gold"]) if it["gold"] else []
            rec["correct"] = exec_match(pred_rows, gold_rows) if it["gold"] else None
        except sqlite3.Error as e:
            rec["correct"] = None
            rec["gold_error"] = str(e)
        rec["error_kinds"] = sorted({a.get("error_kind") for a in attempts if a.get("error_kind")})
        if attempts_fh:
            attempts_fh.write(json.dumps({"idx": it["idx"], "attempts": attempts}, ensure_ascii=False) + "\n")
        if verbose:
            mark = "✓" if rec.get("correct") else "✗"
            print(f"{mark} [{it['db_id']}] {it['idx']}: {rec.get('sql') or rec.get('error')}"[:200])
        return rec

    try:
        results = await asyncio.gather(*(one(it) for it in items))
    finally:
        if attempts_fh:
            attempts_fh.close()

    report = summarize(results)
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
        pred = {str(r["idx"]): f"{r['sql']}\t----- bird -----\t{r['db_id']}" for r in results}
        (out_dir / "predict_dev.json").write_text(
            json.dumps(pred, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        (out_dir / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (out_dir / "results.jsonl").write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n", encoding="utf-8"
        )
    return report


def summarize(results: list[dict]) -> dict:
    scored = [r for r in results if r.get("correct") is not None]
    by_diff: dict[str, list[bool]] = {}
    for r in scored:
        by_diff.setdefault(r.get("difficulty") or "all", []).append(bool(r["correct"]))
    kinds = Counter(k for r in results for k in r.get("error_kinds", []))
    return {
        "n": len(results),
        "scored": len(scored),
        "execution_accuracy": round(100 * sum(1 for r in scored if r["correct"]) / len(scored), 2)
        if scored
        else None,
        "by_difficulty": {
            k: {"n": len(v), "ex": round(100 * sum(v) / len(v), 2)} for k, v in sorted(by_diff.items())
        },
        "no_valid_sql": sum(1 for r in results if not r.get("sql")),
        "selected_by": dict(Counter(r.get("selected_by") for r in results if r.get("selected_by"))),
        "repair_error_kinds": dict(kinds),
        "avg_turns": round(sum(r.get("turns", 0) for r in results) / len(results), 2) if results else 0,
        "avg_seconds": round(sum(r.get("seconds", 0) for r in results) / len(results), 2) if results else 0,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="BIRD dev kümesinde Text2SQL yürütme doğruluğu")
    ap.add_argument("--dev", required=True, type=Path, help="dev.json (veya train.json)")
    ap.add_argument("--db-root", required=True, type=Path, help="dev_databases/ klasörü")
    ap.add_argument("--base-url", default="http://127.0.0.1:8001/v1")
    ap.add_argument("--model", default="qwen2.5-coder-7b")
    ap.add_argument("--api-key", default="sk-local")
    ap.add_argument("--candidates", type=int, default=1)
    ap.add_argument("--max-repairs", type=int, default=2)
    ap.add_argument("--lang", default="en", choices=["en", "tr"])
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--db", action="append", help="yalnız bu db_id'ler (tekrarlanabilir)")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--no-link", action="store_true", help="şema bağlamayı kapat (tüm şema isteme girer)")
    ap.add_argument("--out", type=Path, default=Path("out/bird"))
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    items = load_items(a.dev, a.limit, set(a.db) if a.db else None)
    gen = OpenAICompatible(a.base_url, a.model, a.api_key)
    a.out.mkdir(parents=True, exist_ok=True)
    try:
        report = asyncio.run(
            evaluate(
                items,
                a.db_root,
                gen,
                candidates=a.candidates,
                max_repairs=a.max_repairs,
                lang=a.lang,
                concurrency=a.concurrency,
                out_dir=a.out,
                link=not a.no_link,
                verbose=a.verbose,
            )
        )
    finally:
        asyncio.run(gen.aclose())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
