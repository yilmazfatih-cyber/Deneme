"""scripts/text2sql: ağırlık birleştirme (sentetik küçük model) ve SFT veri hazırlama (sentetik BIRD veritabanı)."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("sqlglot")
pytest.importorskip("safetensors")

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts" / "text2sql"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


merge_weights = _load("merge_weights")
prepare = _load("prepare_bird_sft")
train_lora = _load("train_lora")


# ----------------------------------------------------------------------------- merge_weights


def _write_model(d: Path, tensors: dict[str, np.ndarray], shards: int = 2) -> None:
    from safetensors.numpy import save_file

    d.mkdir(parents=True, exist_ok=True)
    keys = sorted(tensors)
    weight_map = {}
    for i in range(shards):
        part = {k: tensors[k] for k in keys[i::shards]}
        name = f"model-{i + 1:05d}-of-{shards:05d}.safetensors"
        save_file(part, str(d / name), metadata={"format": "pt"})
        weight_map.update({k: name for k in part})
    (d / "model.safetensors.index.json").write_text(json.dumps({"metadata": {}, "weight_map": weight_map}))
    (d / "config.json").write_text(json.dumps({"architectures": ["Toy"], "hidden_size": 4}))


def _read_model(d: Path) -> dict[str, np.ndarray]:
    from safetensors.numpy import load_file

    out = {}
    for f in d.glob("*.safetensors"):
        out.update(load_file(str(f)))
    return out


@pytest.fixture
def toy(tmp_path):
    rng = np.random.default_rng(0)
    base = {
        "model.layers.0.self_attn.q_proj.weight": rng.normal(size=(4, 4)).astype(np.float32),
        "model.layers.0.mlp.up_proj.weight": rng.normal(size=(6, 4)).astype(np.float32),
        "model.embed_tokens.weight": rng.normal(size=(5, 4)).astype(np.float32),
    }
    delta = {k: rng.normal(size=v.shape).astype(np.float32) for k, v in base.items()}
    donor = {k: base[k] + delta[k] for k in base}
    donor["model.embed_tokens.weight"] = rng.normal(size=(7, 4)).astype(np.float32)  # boyut farklı → atlanır
    _write_model(tmp_path / "base", base)
    _write_model(tmp_path / "donor", donor)
    # LoRA: q_proj için r=2, alpha=4 → ölçek 2
    from safetensors.numpy import save_file

    lora = tmp_path / "lora"
    lora.mkdir()
    A = rng.normal(size=(2, 4)).astype(np.float32)
    B = rng.normal(size=(4, 2)).astype(np.float32)
    save_file(
        {
            "base_model.model.model.layers.0.self_attn.q_proj.lora_A.weight": A,
            "base_model.model.model.layers.0.self_attn.q_proj.lora_B.weight": B,
        },
        str(lora / "adapter_model.safetensors"),
    )
    (lora / "adapter_config.json").write_text(json.dumps({"r": 2, "lora_alpha": 4}))
    return {"base": base, "delta": delta, "A": A, "B": B, "dir": tmp_path}


def test_merge_task_vector_lora_and_report(toy):
    d = toy["dir"]
    report = merge_weights.merge(
        d / "base",
        d / "out",
        donor_dir=d / "donor",
        lora_dir=d / "lora",
        lam=0.5,
        density=1.0,
        out_dtype="fp32",
        log=lambda *_: None,
    )
    out = _read_model(d / "out")
    q = "model.layers.0.self_attn.q_proj.weight"
    up = "model.layers.0.mlp.up_proj.weight"
    expected_q = toy["base"][q] + 0.5 * toy["delta"][q] + 2.0 * (toy["B"] @ toy["A"])
    np.testing.assert_allclose(out[q], expected_q, rtol=1e-5, atol=1e-6)
    np.testing.assert_allclose(out[up], toy["base"][up] + 0.5 * toy["delta"][up], rtol=1e-5, atol=1e-6)
    np.testing.assert_array_equal(out["model.embed_tokens.weight"], toy["base"]["model.embed_tokens.weight"])
    assert (
        report["tensors_task_vector"] == 2
        and report["tensors_lora"] == 1
        and report["tensors_skipped_shape"] == 1
    )
    assert report["params_total"] == 16 + 24 + 20 and report["params_changed"] == 40
    assert report["params_changed_pct"] == round(100 * 40 / 60, 4)
    assert (d / "out" / "config.json").exists() and (d / "out" / "model.safetensors.index.json").exists()
    saved = json.loads((d / "out" / "merge_report.json").read_text())
    assert saved["lambda"] == 0.5 and saved["lora_unmatched"] == []


def test_merge_ties_density_prunes_small_deltas(toy):
    d = toy["dir"]
    merge_weights.merge(
        d / "base",
        d / "out2",
        donor_dir=d / "donor",
        lam=1.0,
        density=0.25,
        out_dtype="fp32",
        log=lambda *_: None,
    )
    out = _read_model(d / "out2")
    up = "model.layers.0.mlp.up_proj.weight"
    changed = out[up] != toy["base"][up]
    assert 0 < changed.sum() <= int(np.ceil(0.25 * changed.size)) + 1
    kept_idx = np.argwhere(changed)
    thr = np.abs(toy["delta"][up])[tuple(kept_idx.T)].min()
    assert thr >= np.quantile(np.abs(toy["delta"][up]), 0.75) - 1e-6  # yalnız en büyük %25 kaldı


def test_merge_only_filter_and_requires_source(toy):
    d = toy["dir"]
    with pytest.raises(SystemExit):
        merge_weights.merge(d / "base", d / "out3", out_dtype="fp32", log=lambda *_: None)
    report = merge_weights.merge(
        d / "base", d / "out3", donor_dir=d / "donor", only=["mlp"], out_dtype="fp32", log=lambda *_: None
    )
    assert report["tensors_task_vector"] == 1
    out = _read_model(d / "out3")
    q = "model.layers.0.self_attn.q_proj.weight"
    np.testing.assert_array_equal(out[q], toy["base"][q])


# ----------------------------------------------------------------------------- prepare_bird_sft


@pytest.fixture
def bird_train(tmp_path):
    root = tmp_path / "train_databases"
    db_dir = root / "shop"
    db_dir.mkdir(parents=True)
    con = sqlite3.connect(db_dir / "shop.sqlite")
    con.executescript(
        """
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), total REAL, status TEXT);
        INSERT INTO customers VALUES (1,'Ada','Ankara'),(2,'Can','İzmir');
        INSERT INTO orders VALUES (1,1,100.0,'paid'),(2,1,50.0,'open'),(3,2,70.0,'paid');
        """
    )
    con.commit()
    con.close()
    items = [
        {"idx": 0, "db_id": "shop", "question": "Total paid amount per customer name", "evidence": "paid means status = 'paid'",
         "gold": "SELECT c.name, SUM(o.total) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'paid' GROUP BY c.name"},
        {"idx": 1, "db_id": "shop", "question": "How many customers in Ankara?", "evidence": "",
         "gold": "SELECT COUNT(*) FROM customers WHERE city = 'Ankara'"},
        {"idx": 2, "db_id": "shop", "question": "bad gold", "evidence": "", "gold": "SELECT revenue FROM orders"},
        {"idx": 3, "db_id": "shop", "question": "broken sql", "evidence": "", "gold": "SELECT FROM WHERE"},
        {"idx": 4, "db_id": "missing", "question": "no db", "evidence": "", "gold": "SELECT 1"},
    ]  # fmt: skip
    return root, items


def test_prepare_builds_direct_and_repair_examples(bird_train):
    root, items = bird_train
    examples, stats = prepare.build_examples(
        items, root, lang="en", repair_ratio=1.0, seed=1, log=lambda *_: None
    )
    assert stats == {"total": 5, "kept": 2, "repair": 2, "gold_fails": 1, "gold_ungrounded": 1, "no_db": 1}
    direct = [e for e in examples if e["kind"] == "direct"]
    repair = [e for e in examples if e["kind"] == "repair"]
    assert len(direct) == 2 and len(repair) == 2
    m = direct[0]["messages"]
    assert [x["role"] for x in m] == ["system", "user", "assistant"]
    assert "SQL-only engine" in m[0]["content"] and "CREATE TABLE orders" in m[1]["content"]
    assert "EVIDENCE" not in m[1]["content"] and "İPUCU" in m[1]["content"]  # istem gövdesi platformla aynı
    ans = json.loads(m[2]["content"])
    assert ans["sql"] == items[0]["gold"] and ans["explanation"] == "Tables: customers, orders"
    r = repair[0]["messages"]
    assert [x["role"] for x in r] == ["system", "user", "assistant", "user", "assistant"]
    bad = json.loads(r[2]["content"])["sql"]
    assert (
        bad != items[0]["gold"]
        and "rejected" in r[3]["content"]
        and "Şemada olmayan sütun" in r[3]["content"]
    )
    assert json.loads(r[4]["content"])["sql"] == items[0]["gold"]


def test_prepare_repair_message_matches_pipeline(bird_train):
    from aiplatform.text2sql import Text2SQL

    assert Text2SQL.repair_message("X", "en").startswith("The previous query was rejected: X")
    assert Text2SQL.repair_message("X", "tr").startswith("Önceki sorgu reddedildi: X")


def test_prepare_load_train_formats(tmp_path):
    bird = tmp_path / "train.json"
    bird.write_text(
        json.dumps([{"question_id": 3, "db_id": "a", "question": "q", "evidence": "e", "SQL": "SELECT 1"}])
    )
    spider = tmp_path / "spider.json"
    spider.write_text(json.dumps([{"db_id": "b", "question": "q2", "query": "SELECT 2"}]))
    assert prepare.load_train(bird, spider=False)[0]["gold"] == "SELECT 1"
    sp = prepare.load_train(spider, spider=True)[0]
    assert sp["gold"] == "SELECT 2" and sp["evidence"] == "" and sp["idx"] == 0


def test_corrupt_column_produces_unknown_name():
    import random

    sql = "SELECT c.name, SUM(o.total) FROM orders o JOIN customers c ON c.id = o.customer_id"
    res = prepare.corrupt_column(sql, ["customers.name", "orders.total"], random.Random(0))
    assert res is not None
    bad_sql, wrong = res
    assert bad_sql != sql and wrong in bad_sql and wrong not in ("name", "total")


# ----------------------------------------------------------------------------- train_lora (eğitimsiz)


def test_train_lora_dry_run_validates_data(tmp_path, bird_train):
    root, items = bird_train
    examples, _ = prepare.build_examples(
        items, root, lang="en", repair_ratio=1.0, seed=1, log=lambda *_: None
    )
    data = tmp_path / "sft.jsonl"
    data.write_text("\n".join(json.dumps(e) for e in examples) + "\n", encoding="utf-8")
    out = tmp_path / "lora"
    assert train_lora.main(["--data", str(data), "--out", str(out), "--dry-run"]) == 0
    cfg = json.loads((out / "train_config.json").read_text())
    assert cfg["data_info"] == {"examples": 4, "kinds": {"direct": 2, "repair": 2}, "max_turns": 5}
    assert cfg["target_modules"] == train_lora.TARGET_MODULES and cfg["r"] == 64
