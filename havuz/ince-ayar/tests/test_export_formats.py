"""Dışa aktarım biçimleri: GGUF başlık okuyucusu, Ollama şablon ailesi ve Modelfile, HTML rapor."""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path

import pytest
import trl

from ince_ayar.export.gguf_info import read_gguf_info, summarize
from ince_ayar.export.ollama import TEMPLATE_DIR, build_modelfile, detect_family
from ince_ayar.report.html import build_report, loss_chart, summary_rows
from tests.conftest import make_chat_tokenizer

TRL_TEMPLATES = Path(trl.__file__).parent / "chat_templates"
# Ollama deposundan kopyalanan şablonların özetleri (KAYNAK.md): yanlışlıkla değiştirilmesin.
TEMPLATE_HASHES = {
    "chatml": "e3b2721cec511e3a627ae0993753abbf5c72cdf4cfcdbc8f5c33ce15c4c4e04b",
    "gemma3-instruct": "680a6206c5762f5a0915d25b2e5d85f8a1aecbc07a03a504bcbe21b5796b34ca",
    "llama3-instruct": "61dc7b1a77154f4015bbf548fb63b33550162cfd5d6cbf59b7e7843ece99a49e",
    "phi-3": "35360843d0c84fb1506952a131bbef13cd2bb4a541251f22535170c05b56e672",
}


def _gguf_string(text: str) -> bytes:
    data = text.encode("utf-8")
    return struct.pack("<Q", len(data)) + data


def _write_gguf(path: Path) -> None:
    """Elle yazılmış küçük bir GGUF v3 başlığı (llama.cpp biçim tanımına göre)."""
    kv = [
        (_gguf_string("general.architecture"), 8, _gguf_string("llama")),
        (_gguf_string("llama.context_length"), 4, struct.pack("<I", 4096)),
        (_gguf_string("tokenizer.chat_template"), 8, _gguf_string("{{ messages }}")),
        (_gguf_string("general.flag"), 7, struct.pack("<?", True)),
        (
            _gguf_string("tokenizer.ggml.tokens"),
            9,
            struct.pack("<IQ", 8, 100) + b"".join(_gguf_string(f"t{i}") for i in range(100)),
        ),
        (
            _gguf_string("tokenizer.ggml.scores"),
            9,
            struct.pack("<IQ", 6, 3) + struct.pack("<3f", 0.5, 1.0, 2.0),
        ),
    ]
    body = b"".join(key + struct.pack("<I", kind) + value for key, kind, value in kv)
    path.write_bytes(b"GGUF" + struct.pack("<IQQ", 3, 7, len(kv)) + body)


def test_gguf_basligi_okunur(tmp_path: Path) -> None:
    path = tmp_path / "m.gguf"
    _write_gguf(path)
    info = read_gguf_info(path)
    assert (info.version, info.tensor_count) == (3, 7)
    assert info.metadata["general.architecture"] == "llama"
    assert info.metadata["llama.context_length"] == 4096
    assert info.metadata["general.flag"] is True
    assert info.metadata["tokenizer.ggml.scores"] == [0.5, 1.0, 2.0]
    assert info.array_lengths["tokenizer.ggml.tokens"] == 100
    assert "tokenizer.ggml.tokens" not in info.metadata  # uzun dizi yalnız uzunlukla
    summary = summarize(path)
    assert summary["sohbet_sablonu_var"] is True and summary["sozluk"] == 100


def test_gguf_olmayan_dosya(tmp_path: Path) -> None:
    (tmp_path / "x.gguf").write_bytes(b"NOPE")
    with pytest.raises(ValueError, match="GGUF dosyası değil"):
        read_gguf_info(tmp_path / "x.gguf")


@pytest.mark.parametrize(("name", "digest"), sorted(TEMPLATE_HASHES.items()))
def test_ollama_sablonlari_degistirilmemis(name: str, digest: str) -> None:
    content = (TEMPLATE_DIR / f"{name}.gotmpl").read_bytes()
    assert hashlib.sha256(content).hexdigest() == digest


FAMILY_CASES = [
    ("qwen2_5_base", ["<|endoftext|>", "<|im_start|>", "<|im_end|>"], "<|im_end|>", None, "chatml"),
    ("qwen3", ["<|endoftext|>", "<|im_start|>", "<|im_end|>"], "<|im_end|>", None, "chatml"),
    (
        "llama3",
        ["<|begin_of_text|>", "<|start_header_id|>", "<|end_header_id|>", "<|eot_id|>"],
        "<|eot_id|>",
        "<|begin_of_text|>",
        "llama3-instruct",
    ),
    (
        "gemma3",
        ["<bos>", "<eos>", "<start_of_turn>", "<end_of_turn>"],
        "<eos>",
        "<bos>",
        "gemma3-instruct",
    ),
    (
        "phi3",
        ["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"],
        "<|endoftext|>",
        None,
        "phi-3",
    ),
]


@pytest.mark.parametrize(("template", "specials", "eos", "bos", "family"), FAMILY_CASES)
def test_sablon_ailesi_taninir(
    template: str, specials: list[str], eos: str, bos: str | None, family: str
) -> None:
    text = (TRL_TEMPLATES / f"{template}.jinja").read_text(encoding="utf-8")
    assert detect_family(make_chat_tokenizer(specials, text, eos=eos, bos=bos)) == family


def test_modelfile_icerigi() -> None:
    text = build_modelfile(
        "m-q8_0.gguf", "chatml", "Kısa yanıt ver.", 2048, "<|im_end|>", "Lisans notu"
    )
    assert text.splitlines()[2] == "FROM ./m-q8_0.gguf"
    assert (TEMPLATE_DIR / "chatml.gotmpl").read_text(encoding="utf-8") in text
    assert 'PARAMETER stop "<|im_end|>"' in text and "PARAMETER num_ctx 2048" in text
    assert 'SYSTEM """Kısa yanıt ver."""' in text
    unknown = build_modelfile("m.gguf", None, None, 4096, "</s>", "x")
    assert (
        "TEMPLATE" not in unknown.replace("TEMPLATE satırını", "")
        and 'PARAMETER stop "</s>"' in unknown
    )
    with pytest.raises(ValueError, match="üç tırnak"):
        build_modelfile("m.gguf", None, 'kötü """ metin', 4096, None, "x")


def test_rapor_kacislanir_ve_egri_cizer() -> None:
    logs = [{"adim": 1, "loss": 2.0}, {"adim": 2, "loss": 1.5}, {"adim": 2, "eval_loss": 1.7}]
    samples = [{"adim": 2, "girdi": "<script>alert(1)</script>", "beklenen": "a", "uretilen": "b"}]
    page = build_report(
        "Rapor <x>",
        summary_rows({"taban": "m", "adim": 2}, ["taban", "adim"]),
        logs,
        samples,
        ["not & uyarı"],
    )
    assert "<script>alert" not in page and "&lt;script&gt;" in page
    assert "Rapor &lt;x&gt;" in page and "not &amp; uyarı" in page
    assert page.count("<polyline") == 2 and "Taban model" in page
    assert "Kayıp kaydı yok" in loss_chart([])
