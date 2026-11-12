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

from .grounding import GroundingError, ground
from .pipeline import Text2SQL, Text2SQLError, _signature, parse_output
from .schema import SchemaIndex


class _RawDone(Exception):
    """Ham modda tek üretim bitti (akış denetimi)."""


READ_ONLY_HINT = "Bu araç yalnız SELECT gönderir; yine de veritabanı dosyasını salt-okunur açar."


# ---------------------------------------------------------------------- veri
def load_items(dev_path: Path, limit: int | None = None, db_ids: set[str] | None = None) -> list[dict]:
    text = dev_path.read_text(encoding="utf-8")
    if dev_path.suffix == ".jsonl":  # BIRD mini-dev (2026) jsonl dağıtılıyor
        items = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        items = json.loads(text)
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


def _cpu_has_bf16() -> bool:
    """AVX512-BF16 / AMX varsa CPU'da bf16 matris çarpımı fp32'den ~3 kat hızlı (ölçüldü: 1.5B, 4 çekirdek)."""
    try:
        flags = Path("/proc/cpuinfo").read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return "avx512_bf16" in flags or "amx_bf16" in flags


class TransformersLocal:
    """Sunucusuz yerel çıkarım (transformers, CPU/GPU). Ağırlık varyantlarını hızlı karşılaştırmak için.

    Üretim sırayla yapılır (tek model örneği); `evaluate(..., concurrency=1)` ile kullanın.
    """

    def __init__(
        self,
        model_dir: str | Path,
        max_new_tokens: int = 384,
        dtype: str = "auto",
        threads: int | None = None,
    ):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if threads:
            torch.set_num_threads(threads)
        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(str(model_dir))
        if dtype == "auto":
            dt = torch.bfloat16 if (torch.cuda.is_available() or _cpu_has_bf16()) else torch.float32
        else:
            dt = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[dtype]
        self.dtype = str(dt).replace("torch.", "")
        try:  # transformers ≥ 5: `dtype`; eski sürümler: `torch_dtype`
            self.model = AutoModelForCausalLM.from_pretrained(str(model_dir), dtype=dt)
        except TypeError:
            self.model = AutoModelForCausalLM.from_pretrained(str(model_dir), torch_dtype=dt)
        self.model.eval()
        if torch.cuda.is_available():
            self.model.to("cuda")
        self.max_new_tokens = max_new_tokens
        self.model_name = Path(model_dir).name
        self.tokens_in = 0
        self.tokens_out = 0
        self._lock = asyncio.Lock()

    def _generate(self, messages: list[dict], temperature: float) -> str:
        torch = self.torch
        text = self.tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        enc = self.tok(text, return_tensors="pt").to(self.model.device)
        kw: dict[str, Any] = {"max_new_tokens": self.max_new_tokens, "pad_token_id": self.tok.eos_token_id}
        if temperature > 0:
            kw.update(do_sample=True, temperature=temperature, top_p=0.95)
        else:
            kw.update(do_sample=False, temperature=None, top_p=None, top_k=None)
        with torch.inference_mode():
            out = self.model.generate(**enc, **kw)
        new = out[0, enc["input_ids"].shape[1] :]
        self.tokens_in += int(enc["input_ids"].shape[1])
        self.tokens_out += int(new.shape[0])
        return self.tok.decode(new, skip_special_tokens=True)

    async def __call__(self, messages: list[dict], temperature: float) -> str:
        async with self._lock:
            return await asyncio.to_thread(self._generate, messages, temperature)

    async def aclose(self) -> None:
        return None


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
    raw: bool = False,
    style: str = "json",
) -> dict:
    """`raw=True`: denetimsiz tek üretim (şema bağlama/düzeltme/oylama yok); yalnız ölçüm için. Her ham sorgunun
    şemaya bağlanıp bağlanmadığı yine kaydedilir → modelin kendi başına sütun uydurma oranı (`hallucinated`)."""
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
            style=style,
        )
        rec: dict[str, Any] = {"idx": it["idx"], "db_id": it["db_id"], "difficulty": it["difficulty"]}
        async with sem:
            t0 = time.monotonic()
            try:
                if raw:
                    raw_out = await generate(engine.messages_for(index, it["question"], it["evidence"]), 0.0)
                    sql = parse_output(raw_out)[0]
                    rec["raw_tail"] = str(raw_out)[-300:]
                    rec.update(sql=sql, selected_by="raw", turns=1, error=None if sql else "boş yanıt")
                    try:
                        ground(sql, index, "sqlite")
                        rec["hallucinated"] = False
                    except GroundingError as ge:
                        rec["hallucinated"] = not ge.message.startswith("SQL ayrıştırılamadı")
                        rec["unparsable"] = ge.message.startswith("SQL ayrıştırılamadı")
                    try:
                        pred_rows = await asyncio.to_thread(run_sqlite, path, sql) if sql else None
                    except sqlite3.Error as e:
                        rec["error"] = str(e)
                        pred_rows = None
                    attempts = []
                    raise _RawDone
                res = await engine.run(it["question"], index, it["evidence"])
                rec.update(sql=res.sql, selected_by=res.selected_by, turns=len(res.attempts), error=None)
                pred_rows = res.rows
                attempts = res.attempts
            except _RawDone:
                pass
            except Text2SQLError as e:
                rec.update(sql="", error=e.message, turns=len(e.attempts))
                pred_rows, attempts = None, e.attempts
                rec["gave_up_on"] = next((a.get("sql") for a in reversed(e.attempts) if a.get("sql")), "")
            except Exception as e:  # noqa: BLE001 - uç nokta/ağ hatası tek soruyu düşürür, koşuyu değil
                rec.update(sql="", error=f"{type(e).__name__}: {e}", turns=0)
                pred_rows, attempts = None, []
            rec["seconds"] = round(time.monotonic() - t0, 2)
        try:
            gold_rows = await asyncio.to_thread(run_sqlite, path, it["gold"]) if it["gold"] else []
            rec["correct"] = exec_match(pred_rows, gold_rows) if it["gold"] else None
            # Hattın ilk adayının ilk turu (sıcaklık 0) = denetimsiz ham üretim. Aynı koşudan eşleştirilmiş
            # "ham" doğruluğu ve uydurma oranı çıkar; ayrıca --raw koşusu gerekmez.
            first = next((a for a in attempts if a.get("candidate") == 0 and a.get("turn") == 0), None)
            if first is not None and it["gold"]:
                rec["hallucinated"] = first.get("error_kind") == "grounding"
                if first.get("ok"):
                    rec["first_turn_correct"] = rec["correct"] if rec.get("turns") == 1 else None
                if rec.get("first_turn_correct") is None:
                    try:
                        rows0 = (
                            await asyncio.to_thread(run_sqlite, path, first["sql"])
                            if first.get("sql")
                            else None
                        )
                    except sqlite3.Error:
                        rows0 = None
                    rec["first_turn_correct"] = exec_match(rows0, gold_rows)
            elif raw and it["gold"]:
                rec["first_turn_correct"] = rec["correct"]
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
        "hallucinated_column_or_table": sum(1 for r in results if r.get("hallucinated")),
        "repaired_then_correct": sum(1 for r in results if r.get("correct") and r.get("turns", 1) > 1),
        "first_turn_ex": (
            round(100 * sum(1 for r in scored if r.get("first_turn_correct")) / len(scored), 2)
            if scored
            else None
        ),
        "fixed_by_pipeline": sum(1 for r in scored if r["correct"] and not r.get("first_turn_correct")),
        "broken_by_pipeline": sum(1 for r in scored if r.get("first_turn_correct") and not r["correct"]),
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
    ap.add_argument(
        "--hf-model", type=Path, default=None, help="sunucu yerine yerel transformers modeli (klasör)"
    )
    ap.add_argument("--max-new-tokens", type=int, default=384)
    ap.add_argument("--dtype", default="auto", choices=["auto", "bf16", "fp16", "fp32"])
    ap.add_argument(
        "--style", default="json", choices=["json", "cot"], help="istem stili (cot: düşün + ```sql```)"
    )
    ap.add_argument("--raw", action="store_true", help="denetimsiz tek üretim (karşılaştırma tabanı)")
    ap.add_argument("--offset", type=int, default=0, help="ilk N soruyu atla")
    ap.add_argument("--stride", type=int, default=1, help="her k. soruyu al (dengeli alt küme)")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    items = load_items(a.dev, None, set(a.db) if a.db else None)[a.offset :: a.stride]
    if a.limit:
        items = items[: a.limit]
    if a.hf_model:
        gen = TransformersLocal(a.hf_model, max_new_tokens=a.max_new_tokens, dtype=a.dtype)
        concurrency = 1
    else:
        gen = OpenAICompatible(a.base_url, a.model, a.api_key)
        concurrency = a.concurrency
    a.out.mkdir(parents=True, exist_ok=True)

    async def _run() -> dict:
        try:
            return await evaluate(
                items,
                a.db_root,
                gen,
                candidates=a.candidates,
                max_repairs=a.max_repairs,
                lang=a.lang,
                concurrency=concurrency,
                out_dir=a.out,
                link=not a.no_link,
                verbose=a.verbose,
                raw=a.raw,
                style=a.style,
            )
        finally:
            await gen.aclose()

    report = asyncio.run(_run())
    if isinstance(gen, TransformersLocal):
        report["tokens_in"], report["tokens_out"] = gen.tokens_in, gen.tokens_out
        report["dtype"] = gen.dtype
    report["model"] = str(a.hf_model or a.model)
    report["mode"] = (
        "raw" if a.raw else f"pipeline(c={a.candidates},r={a.max_repairs})"
    ) + f",style={a.style}"
    (a.out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
