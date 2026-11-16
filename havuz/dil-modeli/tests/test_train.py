"""Eğitim döngüsü: ayarlar, öğrenme oranı, gradyan biriktirme, bire bir sürdürme, günlük, kayıt."""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import torch

from dil_modeli.data import PrepareOptions, prepare_data
from dil_modeli.model_io import load_model
from dil_modeli.optim import build_optimizer, lr_at
from dil_modeli.tokenizer import BPETokenizer
from dil_modeli.train import BEST_DIR, LAST_DIR, Trainer
from dil_modeli.train_config import TrainConfig, load_train_config, parse_override
from dil_modeli.train_state import read_log

from .helpers import make_corpus

TINY_MODEL = {"dim": 32, "n_layer": 2, "n_head": 2, "max_seq_len": 32, "dropout": 0.1}


@pytest.fixture(scope="module")
def data_dir(tokenizer: BPETokenizer, tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("egitim")
    source = root / "derlem.jsonl"
    lines = [json.dumps({"text": t}, ensure_ascii=False) for t in make_corpus(lines=400, seed=9)]
    source.write_text("\n".join(lines) + "\n", encoding="utf-8")
    prepare_data([source], tokenizer, root / "hazir", options=PrepareOptions(val_fraction=0.1))
    return root / "hazir"


def _config(data_dir: Path, out_dir: Path, **changes: Any) -> TrainConfig:
    values: dict[str, Any] = {
        "data_dir": str(data_dir),
        "out_dir": str(out_dir),
        "model": dict(TINY_MODEL),
        "max_steps": 8,
        "batch_size": 4,
        "warmup_steps": 2,
        "learning_rate": 3e-3,
        "eval_every": 4,
        "eval_batches": 2,
        "log_every": 2,
        "sample_tokens": 8,
        "device": "cpu",
    }
    values.update(changes)
    return TrainConfig.from_dict(values)


def _silent(_: str) -> None:
    return None


def test_resume_is_bit_exact(data_dir: Path, tmp_path: Path) -> None:
    """N adım = N/2 adım + sürdür + N/2 adım (ağırlıklar, eniyileyici ve günlük bire bir)."""
    straight = Trainer(_config(data_dir, tmp_path / "duz", grad_accum=2), log=_silent)
    full = straight.run()
    first = Trainer(_config(data_dir, tmp_path / "parca", grad_accum=2), log=_silent)
    half = first.run(stop_at=3)  # doğrulama adımı olmayan bir yerde kes
    assert (half.step, half.finished) == (3, False)
    second = Trainer(_config(data_dir, tmp_path / "parca", grad_accum=2), resume=True, log=_silent)
    resumed = second.run()
    assert full.finished
    assert resumed.finished
    for name, tensor in straight.model.state_dict().items():
        assert torch.equal(tensor, second.model.state_dict()[name]), name
    a, b = straight.optimizer.state_dict()["state"], second.optimizer.state_dict()["state"]
    for key in a:
        for field in ("exp_avg", "exp_avg_sq", "step"):
            assert torch.equal(a[key][field], b[key][field])
    assert resumed.best_val_loss == full.best_val_loss
    assert resumed.tokens == full.tokens
    assert _without_timing(read_log(tmp_path / "duz")) == _without_timing(
        read_log(tmp_path / "parca")
    )


def _without_timing(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Süreye bağlı alanlar (hız, geçen süre) iki koşuda doğal olarak farklıdır."""
    return [
        {k: v for k, v in r.items() if k not in ("tokens_per_sec", "elapsed_sec")} for r in rows
    ]


def test_outputs_logs_and_checkpoints(data_dir: Path, tmp_path: Path) -> None:
    result = Trainer(_config(data_dir, tmp_path, max_steps=12), log=_silent).run()
    log = read_log(tmp_path)
    train_rows = [row for row in log if "loss" in row]
    eval_rows = [row for row in log if "val_loss" in row]
    assert [row["step"] for row in train_rows] == [2, 4, 6, 8, 10, 12]
    assert [row["step"] for row in eval_rows] == [4, 8, 12]
    assert all(row["tokens_per_sec"] > 0 and math.isfinite(row["loss"]) for row in train_rows)
    assert all(isinstance(row["sample"], str) for row in eval_rows)
    assert train_rows[-1]["loss"] < train_rows[0]["loss"]  # öğreniyor
    assert result.best_val_loss == min(row["val_loss"] for row in eval_rows) or math.isclose(
        result.best_val_loss, min(row["val_loss"] for row in eval_rows), rel_tol=1e-4
    )
    for folder in (LAST_DIR, BEST_DIR):
        model, tokenizer = load_model(tmp_path / folder)
        assert model.config.dim == 32
        assert tokenizer.vocab_size == model.config.vocab_size
    settings = json.loads((tmp_path / "egitim-ayarlari.json").read_text(encoding="utf-8"))
    assert settings["max_steps"] == 12


def test_gradient_accumulation_matches_one_big_batch(
    data_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """2 x 2 dizi biriktirmek, tek seferde 4 dizi ile aynı gradyanı vermeli (dropout kapalı).

    Gradyanlar eniyileyici adımından hemen önce yakalanır: Adam'ın ilk adımı güncellemeyi
    yaklaşık işaret(g) yaptığı için ağırlıkları karşılaştırmak 1e-9'luk farkları büyütürdü.
    """
    fixed = torch.randint(0, 300, (4, 33), generator=torch.Generator().manual_seed(0))
    model = {**TINY_MODEL, "dropout": 0.0}
    captured: list[dict[str, torch.Tensor]] = []
    for batch_size, accum in ((4, 1), (2, 2)):
        config = _config(
            data_dir, tmp_path / str(accum), batch_size=batch_size, grad_accum=accum, model=model
        )
        trainer = Trainer(config, log=_silent)
        calls = itertools.count()

        def fixed_batch(
            size: int,
            length: int,
            rng: np.random.Generator,
            calls: itertools.count[int] = calls,
        ) -> tuple[torch.Tensor, torch.Tensor]:
            start = next(calls) * size
            rows = fixed[start : start + size, : length + 1]
            return rows[:, :-1], rows[:, 1:]

        def capture(trainer: Trainer = trainer) -> None:
            grads = {
                n: p.grad.clone() for n, p in trainer.model.named_parameters() if p.grad is not None
            }
            captured.append(grads)

        monkeypatch.setattr(trainer.train_data, "sample_batch", fixed_batch)
        monkeypatch.setattr(trainer.optimizer, "step", capture)
        trainer._train_step()
    assert captured[0].keys() == captured[1].keys()
    for name, grad in captured[0].items():
        assert torch.allclose(grad, captured[1][name], rtol=1e-4, atol=1e-7), name


def test_time_limit_stops_and_resume_continues(data_dir: Path, tmp_path: Path) -> None:
    ticks = itertools.count()
    fake_clock = lambda: next(ticks) * 40.0  # noqa: E731  (her okumada 40 sn geçiyor)
    config = _config(data_dir, tmp_path, max_steps=8, max_minutes=1.0)
    stopped = Trainer(config, log=_silent, clock=fake_clock).run()
    assert not stopped.finished
    assert 0 < stopped.step < 8
    done = Trainer(_config(data_dir, tmp_path, max_steps=8), resume=True, log=_silent).run()
    assert done.finished
    assert done.step == 8


def test_nan_loss_stops_with_guidance(
    data_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    trainer = Trainer(_config(data_dir, tmp_path), log=_silent)
    monkeypatch.setattr(
        "dil_modeli.train.lm_loss", lambda logits, targets: logits.sum() * float("nan")
    )
    with pytest.raises(FloatingPointError, match="learning_rate"):
        trainer.run()


def test_resume_rejects_a_different_model(data_dir: Path, tmp_path: Path) -> None:
    Trainer(_config(data_dir, tmp_path, max_steps=2), log=_silent).run()
    other = {**TINY_MODEL, "dim": 64}
    with pytest.raises(ValueError, match="model biçimi"):
        Trainer(_config(data_dir, tmp_path, model=other), resume=True, log=_silent)
    with pytest.raises(FileNotFoundError, match="--surdur"):
        Trainer(_config(data_dir, tmp_path / "bos"), resume=True, log=_silent)


def test_learning_rate_schedule() -> None:
    def lr(step: int) -> float:
        return lr_at(step, base_lr=1.0, warmup_steps=10, max_steps=110, min_lr_ratio=0.1)

    assert lr(0) == pytest.approx(0.1)
    assert lr(9) == pytest.approx(1.0)
    assert lr(10) == pytest.approx(1.0)
    assert lr(60) == pytest.approx(0.55)  # kosinüsün ortası
    assert lr(110) == pytest.approx(0.1)
    assert lr(500) == pytest.approx(0.1)
    values = [lr(step) for step in range(10, 111)]
    assert all(a >= b for a, b in itertools.pairwise(values))


def test_weight_decay_skips_vectors() -> None:
    layer = torch.nn.Sequential(torch.nn.Linear(4, 4, bias=True), torch.nn.LayerNorm(4))
    optimizer = build_optimizer(layer.parameters(), learning_rate=1e-3, weight_decay=0.1)
    decay, no_decay = optimizer.param_groups
    assert decay["weight_decay"] == 0.1
    assert [p.dim() for p in decay["params"]] == [2]
    assert no_decay["weight_decay"] == 0.0
    assert all(p.dim() == 1 for p in no_decay["params"])


def test_config_file_and_overrides(tmp_path: Path) -> None:
    path = tmp_path / "ayar.toml"
    path.write_text(
        'preset = "mini"\nmax_steps = 50\nlearning_rate = 1\n[model]\ndim = 64\n', "utf-8"
    )
    config = load_train_config(path, ["max_steps=70", "model.n_layer=3", "out_dir=calisma/x"])
    assert (config.preset, config.max_steps, config.out_dir) == ("mini", 70, "calisma/x")
    assert config.learning_rate == 1.0
    assert isinstance(config.learning_rate, float)
    assert config.model == {"dim": 64, "n_layer": 3}
    model = config.model_config(vocab_size=100)
    assert (model.dim, model.n_layer, model.max_seq_len) == (64, 3, 512)
    assert parse_override("sample_prompt=Ankara") == ("sample_prompt", "Ankara")
    assert parse_override("compile=true") == ("compile", True)
    with pytest.raises(ValueError, match="Bunu mu demek istediniz: 'max_steps'"):
        load_train_config(None, ["max_step=3"])
    with pytest.raises(ValueError, match="tamsayı olmalı"):
        load_train_config(None, ["batch_size=yarim"])
    with pytest.raises(ValueError, match="biçimi yanlış"):
        load_train_config(None, ["batch_size"])
    with pytest.raises(ValueError, match="bağlamından"):
        TrainConfig(seq_len=4096).window(model)
    with pytest.raises(ValueError, match="en az 1"):
        TrainConfig(max_steps=0)
