import json

from conftest import EchoGenerator, FakeOCR

from ozetci import Ozetci
from ozetci.cli import main
from ozetci.config import Settings


def test_pipeline_pdf_with_echo_generator(sample_pdf_path):
    oz = Ozetci(Settings(backend="extractive"), generator=EchoGenerator(), ocr=FakeOCR())
    s = oz.summarize(sample_pdf_path)
    assert s.text == "Bu bir deneme özetidir."
    assert s.backend.startswith("llm:")


def test_pipeline_scanned_pdf_without_ocr_notes(scanned_pdf_path):
    oz = Ozetci(Settings(backend="extractive", ocr="none"))
    s = oz.summarize(scanned_pdf_path)
    assert any("OCR" in n for n in s.notes)


def test_pipeline_email_extractive(sample_eml_path):
    oz = Ozetci(Settings(backend="extractive", ocr="none"))
    s = oz.summarize(sample_eml_path)
    assert s.backend == "extractive" and s.language == "tr"
    assert "1.250 TL" in s.text or any("1.250" in b for b in s.bullets)


def test_cli_ozetle_json_and_oku(sample_eml_path, capsys):
    rc = main(["--backend", "extractive", "--ocr", "none", "ozetle", str(sample_eml_path), "--json"])
    assert rc == 0
    data = json.loads(capsys.readouterr().out)
    assert data["dosya"] == str(sample_eml_path) and data["arka_uc"] == "extractive"

    rc = main(["--ocr", "none", "oku", str(sample_eml_path)])
    out = capsys.readouterr().out
    assert rc == 0 and "Konu: Fatura ödeme hatırlatması" in out and "Fatura no 2025-031" in out

    rc = main(["--backend", "extractive", "bilgi"])
    out = capsys.readouterr().out
    assert rc == 0 and "1B altı" in out


def test_param_budget_handles_engine_specs():
    s = Settings(llm="models/ozetci-qwen3-0.6b-Q8_0.gguf", ocr="rapid:en")
    b = s.param_budget()
    assert b == {"llm_M": 600, "ocr_M": 15}
    assert Settings(ocr="none").param_budget()["ocr_M"] == 0
    assert Settings(ocr="ibm-granite/granite-docling-258M").param_budget()["ocr_M"] == 258
