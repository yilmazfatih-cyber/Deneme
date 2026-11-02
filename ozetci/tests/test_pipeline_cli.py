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
    assert isinstance(data, list) and data[0]["dosya"] == str(sample_eml_path) and data[0]["arka_uc"] == "extractive"

    rc = main(["--ocr", "none", "oku", str(sample_eml_path)])
    out = capsys.readouterr().out
    assert rc == 0 and "Konu: Fatura ödeme hatırlatması" in out and "Fatura no 2025-031" in out

    rc = main(["--backend", "extractive", "bilgi"])
    out = capsys.readouterr().out
    assert rc == 0 and "1B altı" in out and "rapidocr" in out
    rc = main(["--backend", "extractive", "--ocr", "none", "bilgi"])
    out = capsys.readouterr().out
    assert "OCR  0" in out and "Toplam 600" in out


def test_param_budget_handles_engine_specs():
    s = Settings(llm="models/ozetci-qwen3-0.6b-Q8_0.gguf", ocr="rapid:en")
    b = s.param_budget()
    assert b == {"llm_M": 600, "ocr_M": 15}
    assert Settings(ocr="none").param_budget()["ocr_M"] == 0
    assert Settings(ocr="ibm-granite/granite-docling-258M").param_budget()["ocr_M"] == 258


def test_cli_missing_and_unsupported_files_do_not_abort(sample_pdf_path, tmp_path, capsys):
    bad = tmp_path / "veri.xyz"
    bad.write_bytes(bytes(range(128, 256)) * 2)  # geçersiz UTF-8: tanınmayan ikili dosya
    rc = main(["--backend", "extractive", "--ocr", "none", "ozetle", str(sample_pdf_path), str(tmp_path / "yok.pdf"), str(bad), "--json"])
    captured = capsys.readouterr()
    assert rc == 1 and "Traceback" not in captured.err
    assert "Dosya bulunamadı" in captured.err and "Desteklenmeyen dosya türü" in captured.err
    data = json.loads(captured.out)
    assert len(data) == 3 and "ozet" in data[0] and "hata" in data[1] and "hata" in data[2]
    # var olmayan dosya tanınmayan uzantıyla da "bulunamadı" diye raporlanır
    rc = main(["--backend", "extractive", "--ocr", "none", "ozetle", str(tmp_path / "yok.dat")])
    assert rc == 1 and "Dosya bulunamadı" in capsys.readouterr().err


def test_backend_model_mismatch_is_an_error():
    import pytest
    from ozetci.pipeline import build_generator

    with pytest.raises(ValueError):
        build_generator(Settings(backend="gguf", llm="Qwen/Qwen3-0.6B"))
    with pytest.raises(ValueError):
        build_generator(Settings(backend="hf", llm="models/x.gguf"))
    rc = main(["--backend", "gguf", "--ocr", "none", "ozetle", "x.pdf"])
    assert rc == 2


def test_mbox_messages_are_labeled_as_messages_not_attachments(tmp_path):
    mbox = ("From a@b.c Mon Jan  1 00:00:00 2025\nFrom: a@b.c\nTo: d@e.f\nSubject: Birinci\n\nBirinci ileti govdesi burada.\n\n"
            "From x@y.z Mon Jan  1 00:00:00 2025\nFrom: x@y.z\nTo: d@e.f\nSubject: Ikinci\n\nIkinci ileti govdesi burada.\n")
    p = tmp_path / "kutu.mbox"
    p.write_text(mbox, encoding="utf-8")
    oz = Ozetci(Settings(backend="extractive", ocr="none"))
    doc = oz.read(p)
    text = doc.full_text()
    assert doc.kind == "mbox" and "[İleti 1/2: Birinci]" in text and "[Ek:" not in text
    s = oz.summarize(doc)
    assert "[İleti" not in s.text


def test_missing_mbox_is_not_created(tmp_path):
    import pytest

    missing = tmp_path / "yok.mbox"
    with pytest.raises(FileNotFoundError):
        Ozetci(Settings(backend="extractive", ocr="none")).read(missing)
    assert not missing.exists()


def test_empty_document_gives_single_note(tmp_path):
    empty = tmp_path / "bos.txt"
    empty.write_text("", encoding="utf-8")
    s = Ozetci(Settings(backend="extractive", ocr="none")).summarize(empty)
    assert s.text == "" and s.notes == ["belgeden metin çıkarılamadı"]
