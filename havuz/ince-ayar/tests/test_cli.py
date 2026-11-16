"""Komut satırı: Türkçe yardım ve hatalar, her görev/eylem, kuru çalıştırma ve veri araçları."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ince_ayar.cli import main, translate_error
from ince_ayar.registry import TASKS
from tests.conftest import EXAMPLES, ROOT

ENGLISH = ("usage:", "options:", "show this help", "positional arguments", "error:")


def _run(capsys: pytest.CaptureFixture[str], *argv: str) -> tuple[int, str, str]:
    try:
        code = main(list(argv))
    except SystemExit as stop:
        code = int(stop.code or 0)
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_genel_yardim_turkce(capsys: pytest.CaptureFixture[str]) -> None:
    code, out, _ = _run(capsys, "--yardim")
    assert code == 0
    assert "kullanım: python -m ince_ayar" in out and "görevler:" in out
    assert not any(word in out for word in ENGLISH)


@pytest.mark.parametrize(
    ("task", "action"), [(t, a) for t, spec in TASKS.items() for a in spec.actions]
)
def test_her_eylemin_yardimi_turkce(
    capsys: pytest.CaptureFixture[str], task: str, action: str
) -> None:
    code, out, _ = _run(capsys, task, action, "--yardim")
    assert code == 0
    assert f"kullanım: python -m ince_ayar {task} {action}" in out
    assert not any(word in out for word in ENGLISH)


def test_argparse_hatalari_turkcelesir(capsys: pytest.CaptureFixture[str]) -> None:
    code, _, err = _run(capsys, "sohbet", "egit", "--bilinmeyen")
    assert code == 2
    assert "HATA: tanınmayan seçenekler: --bilinmeyen" in err and "--yardim" in err
    assert (
        translate_error("the following arguments are required: --model")
        == "şu seçenekler gerekli: --model"
    )


def test_kullanici_hatasi_cikis_kodu_1(capsys: pytest.CaptureFixture[str]) -> None:
    code, _, err = _run(capsys, "sohbet", "egit")
    assert code == 1 and err.startswith("HATA: Yapılandırma gerekli")


def test_kuru_calistirma_komut_satirindan(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(ROOT)
    code, out, _ = _run(
        capsys,
        "sohbet",
        "egit",
        "--hazir",
        "cpu-deneme",
        "--kuru",
        "-D",
        f"egitim.cikti={str(tmp_path)!r}",
    )
    assert code == 0
    assert "Eğitim planı (sohbet)" in out and "Kuru çalıştırma: eğitim başlatılmadı" in out
    assert not (tmp_path / "bagdastirici").exists()


def test_veri_araclari(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    code, out, _ = _run(
        capsys,
        "veri",
        "dogrula",
        "--bicim",
        "siniflandirma",
        "--girdi",
        str(EXAMPLES / "siniflandirma.csv"),
    )
    assert code == 0 and "24 geçerli örnek" in out
    code, out, _ = _run(
        capsys,
        "veri",
        "ayir",
        "--bicim",
        "siniflandirma",
        "--girdi",
        str(EXAMPLES / "siniflandirma.csv"),
        "--cikti",
        str(tmp_path / "b"),
    )
    assert code == 0
    sizes = json.loads((tmp_path / "b/ayrim_raporu.json").read_text(encoding="utf-8"))["boyutlar"]
    assert sum(sizes.values()) == 24 and all(
        (tmp_path / f"b/{name}.jsonl").is_file() for name in sizes
    )
    code, out, _ = _run(
        capsys,
        "veri",
        "sizinti",
        "--bicim",
        "siniflandirma",
        "--egitim",
        str(EXAMPLES / "siniflandirma.csv"),
        "--test",
        str(tmp_path / "b/test.jsonl"),
    )
    assert code == 1 and "sızıntı" in out
    code, out, _ = _run(
        capsys,
        "veri",
        "kart",
        "--bicim",
        "sohbet",
        "--girdi",
        str(EXAMPLES / "sohbet.jsonl"),
        "--cikti",
        str(tmp_path / "KART.md"),
        "--lisans",
        "MIT",
    )
    card = (tmp_path / "KART.md").read_text(encoding="utf-8")
    assert (
        code == 0 and "| Örnek sayısı | 12" in card and "**DOLDURUN**" in card and "{" not in card
    )


def test_veri_donustur_alpaca(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    source = tmp_path / "alpaca.json"
    source.write_text(
        json.dumps([{"instruction": "Özetle", "input": "Uzun metin", "output": "Kısa"}]),
        encoding="utf-8",
    )
    code, _, _ = _run(
        capsys,
        "veri",
        "donustur",
        "--kaynak-bicim",
        "alpaca",
        "--girdi",
        str(source),
        "--cikti",
        str(tmp_path / "s.jsonl"),
    )
    row = json.loads((tmp_path / "s.jsonl").read_text(encoding="utf-8"))
    assert code == 0
    assert row["messages"] == [
        {"role": "user", "content": "Özetle\n\nUzun metin"},
        {"role": "assistant", "content": "Kısa"},
    ]
    code, _, _ = _run(
        capsys, "veri", "dogrula", "--bicim", "sohbet", "--girdi", str(tmp_path / "s.jsonl")
    )
    assert code == 0


def test_onnx_calisma_zamani_torch_yuklemez() -> None:
    import subprocess
    import sys

    code = (
        "import sys; from ince_ayar.export.onnx_runtime import OnnxClassifier, OnnxEmbedder; "
        "print('torch' in sys.modules or 'transformers' in sys.modules)"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == "False"


def test_yardim_torch_yuklemez() -> None:
    import subprocess
    import sys

    code = "import sys; from ince_ayar.cli import build_parser; build_parser(); print('torch' in sys.modules)"
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == "False"


@pytest.mark.parametrize("task", ["sohbet", "siniflandirma", "gomme", "varlik"])
def test_dogrula_eylemleri(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, task: str
) -> None:
    monkeypatch.chdir(ROOT)
    code, out, _ = _run(capsys, task, "dogrula", "--hazir", "cpu-deneme")
    assert code == 0 and "Doğrulama tamam." in out
    if task == "sohbet":
        assert "⟦" in out and "<|im_end|>" in out


def test_uret_kuru_ve_tarif_uyusmazligi(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(ROOT)
    code, out, _ = _run(
        capsys, "sohbet", "uret", "--ayar", "yapilandirma/uret/talimat.toml", "--kuru"
    )
    assert code == 0 and "istem sürümü talimat-v1" in out and "Kargo teslim süresi" in out
    code, _, err = _run(
        capsys, "gomme", "uret", "--ayar", "yapilandirma/uret/talimat.toml", "--kuru"
    )
    assert code == 1 and "'sorgu' tarifini bekliyor" in err
