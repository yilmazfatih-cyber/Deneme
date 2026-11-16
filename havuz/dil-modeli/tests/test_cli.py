"""Komut satırı duman testleri: belgelenen her komut gerçek `main()` üzerinden bir kez çalışır."""

from __future__ import annotations

import asyncio
import importlib
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from dil_modeli import cli
from dil_modeli.export_web import load_web
from dil_modeli.model_io import load_model

from .helpers import FIXTURES, make_corpus

TINY = [
    "model.dim=32",
    "model.n_layer=2",
    "model.n_head=2",
    "model.max_seq_len=32",
    "batch_size=4",
    "max_steps=6",
    "eval_every=3",
    "eval_batches=2",
    "log_every=3",
    "warmup_steps=2",
    "device=cpu",
    "sample_tokens=5",
]


def run(*argv: str) -> int:
    return cli.main([*argv])


@pytest.fixture(scope="module")
def workspace(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Tokenizer -> veri -> eğitim hattını bir kez çalıştırır; diğer testler çıktıyı kullanır."""
    root = tmp_path_factory.mktemp("cli")
    corpus = root / "derlem.txt"
    corpus.write_text("\n".join(make_corpus(lines=300, seed=3)), encoding="utf-8")
    assert (
        run(
            "tokenizer-egit",
            "--girdi",
            str(corpus),
            "--cikti",
            str(root / "tok.json"),
            "--sozluk",
            "400",
        )
        == 0
    )
    assert (
        run(
            "veri-hazirla",
            "--girdi",
            str(corpus),
            "--tokenizer",
            str(root / "tok.json"),
            "--cikti",
            str(root / "veri"),
            "--dogrulama-orani",
            "0.1",
            "--satir-belge",
        )
        == 0
    )
    settings = [f"data_dir={root / 'veri'}", f"out_dir={root / 'egitim'}", *TINY]
    assert run("egit", *[arg for item in settings for arg in ("--ayar", item)]) == 0
    return root


def test_training_outputs(workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert (workspace / "egitim" / "en-iyi" / "model.safetensors").is_file()
    settings = [
        f"data_dir={workspace / 'veri'}",
        f"out_dir={workspace / 'egitim'}",
        *TINY,
        "max_steps=9",
    ]
    assert run("egit", "--surdur", *[arg for item in settings for arg in ("--ayar", item)]) == 0
    assert "adım 9/9" in capsys.readouterr().out


def test_generate_evaluate_and_report(workspace: Path, capsys: pytest.CaptureFixture[str]) -> None:
    model = str(workspace / "egitim" / "en-iyi")
    assert run("uret", "--model", model, "--istem", "Korkma", "--azami", "8", "--tohum", "1") == 0
    assert run("uret", "--model", model, "--adet", "2", "--azami", "5", "--sicaklik", "0") == 0
    assert "örnek 2" in capsys.readouterr().out
    assert (
        run("degerlendir", "--model", model, "--girdi", str(FIXTURES / "metin.txt"), "--json") == 0
    )
    result = json.loads(capsys.readouterr().out)
    assert result["saskinlik"] > 1
    assert result["karakter_basina_bit"] > 0
    assert run("degerlendir", "--model", model, "--veri", str(workspace / "veri")) == 0
    assert run("rapor", "--egitim", str(workspace / "egitim")) == 0
    report = (workspace / "egitim" / "rapor.html").read_text(encoding="utf-8")
    assert "<svg" in report
    assert "<th>süre (dk)</th><td>-</td>" not in report  # süre günlükten okunur
    assert run("boyutlar", "--sozluk", "4096") == 0


def test_chat_finetune_and_exports(
    workspace: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    model = str(workspace / "egitim" / "en-iyi")
    out = workspace / "ince"
    assert (
        run(
            "ince-ayar",
            "--model",
            model,
            "--veri",
            str(FIXTURES / "sohbet.jsonl"),
            "--cikti",
            str(out),
            "--adim",
            "4",
            "--yigin",
            "2",
        )
        == 0
    )
    lines = iter(["Merhaba", "/temizle", "/cik"])
    monkeypatch.setattr("builtins.input", lambda prompt="": next(lines))
    assert run("sohbet", "--model", str(out / "birlesik"), "--azami", "5") == 0
    assert "Model:" in capsys.readouterr().out
    assert (
        run(
            "disa-aktar",
            "--model",
            model,
            "--adaptor",
            str(out / "adaptor"),
            "--bicim",
            "kendi",
            "--cikti",
            str(workspace / "katilmis"),
        )
        == 0
    )
    merged, _ = load_model(out / "birlesik")
    joined, _ = load_model(workspace / "katilmis")
    for name, tensor in merged.state_dict().items():
        assert (tensor - joined.state_dict()[name]).abs().max() < 1e-6, name
    assert (
        run(
            "disa-aktar", "--model", model, "--bicim", "tarayici", "--cikti", str(workspace / "web")
        )
        == 0
    )
    assert load_web(workspace / "web")[0].config.dim == 32
    assert (
        run("disa-aktar", "--model", model, "--bicim", "hf", "--cikti", str(workspace / "hf")) == 0
    )
    assert json.loads((workspace / "hf" / "config.json").read_text())["model_type"] == "llama"


def test_serve_command_builds_a_working_app(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr("uvicorn.run", lambda app, **kwargs: captured.update(app=app, **kwargs))
    assert (
        run("sun", "--model", str(workspace / "egitim" / "en-iyi"), "--kapi", "0", "--ad", "deneme")
        == 0
    )
    assert captured["host"] == "127.0.0.1"

    async def call() -> httpx.Response:
        transport = httpx.ASGITransport(app=captured["app"])
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/v1/models")

    assert asyncio.run(call()).json()["data"][0]["id"] == "deneme"


def test_user_errors_print_one_helpful_line(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run("uret", "--model", str(tmp_path / "yok")) == 1
    error = capsys.readouterr().err
    assert error.startswith("Hata: ")
    assert "config.json" in error
    assert run("egit", "--ayar", "max_step=3") == 1
    assert "max_steps" in capsys.readouterr().err
    assert run() == 2  # komutsuz: yardım


@pytest.mark.parametrize("command", cli.COMMANDS, ids=[c.name for c in cli.COMMANDS])
def test_every_command_is_registered_correctly(
    command: cli.Command, capsys: pytest.CaptureFixture[str]
) -> None:
    """Kural: her kaydın dosyası, add_/run_ işlevleri, ASCII adı ve Türkçe yardımı var."""
    module = importlib.import_module(f"dil_modeli.{command.module}")
    assert callable(getattr(module, f"add_{command.function}_args"))
    assert callable(getattr(module, f"run_{command.function}"))
    assert command.name.isascii()
    assert command.name == command.name.lower()
    with pytest.raises(SystemExit) as done:
        run(command.name, "--help")
    assert done.value.code == 0
    assert "kullanım:" in capsys.readouterr().out
