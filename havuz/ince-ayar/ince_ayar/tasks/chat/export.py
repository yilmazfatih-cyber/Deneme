"""Birleştirilmiş sohbet modelini GGUF'a çevirir ve Ollama için `Modelfile` yazar.

Kim kullanır: `python -m ince_ayar sohbet disa-aktar`.

Adımlar:
1. llama.cpp'nin `convert_hf_to_gguf.py` betiği bulunur (`--llama-cpp` ya da `LLAMA_CPP_DIR`).
   Yoksa nasıl edinileceği yazılır; `Modelfile` yine üretilir.
2. Dönüştürme: `--tur q8_0` (varsayılan; Python içinde nicemlenir), `f16`, `bf16`, `f32`.
3. İsteğe bağlı nicemleme (`--nicem Q4_K_M`): derlenmiş `llama-quantize` gerekir.
4. GGUF başlığı okunup özetlenir (mimari, tensör sayısı, şablon var mı): `export/gguf_info.py`.

DİKKAT: GGUF'un llama.cpp/Ollama ile **çalıştırılması** bu makinede denenmedi (bkz. README Sınırlar).

Genişletme: başka bir çalışma ortamı (ör. LM Studio) için `write_modelfile` yanına ayrı bir
yazıcı ekleyin.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from ince_ayar import console
from ince_ayar.errors import UserError
from ince_ayar.export.gguf_info import summarize
from ince_ayar.export.ollama import build_modelfile, detect_family
from ince_ayar.messages import t
from ince_ayar.tasks.chat.modeling import find_model_dir, load_tokenizer

LLAMA_CPP_ENV = "LLAMA_CPP_DIR"
CONVERTER = "convert_hf_to_gguf.py"
OUT_TYPES = ("q8_0", "f16", "bf16", "f32")


def find_converter(llama_cpp: str | None) -> Path | None:
    """llama.cpp klasöründeki dönüştürücüyü bulur."""
    root = llama_cpp or os.environ.get(LLAMA_CPP_ENV, "")
    if not root:
        return None
    candidate = Path(root).expanduser() / CONVERTER
    return candidate if candidate.is_file() else None


def find_quantizer(llama_cpp: str | None) -> str | None:
    """Derlenmiş `llama-quantize` programını bulur (klasör içinde ya da PATH'te)."""
    root = Path(llama_cpp or os.environ.get(LLAMA_CPP_ENV, ".")).expanduser()
    for candidate in (root / "build" / "bin" / "llama-quantize", root / "llama-quantize"):
        if candidate.is_file():
            return str(candidate)
    return shutil.which("llama-quantize")


def _run(command: list[str], hint: str) -> None:
    console.info("$ " + " ".join(command))
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise UserError(t("disa.komut_basarisiz", kod=completed.returncode, ipucu=hint))


def export_for_ollama(
    model_path: Path,
    out_dir: Path,
    llama_cpp: str | None,
    out_type: str,
    quant: str | None,
    name: str,
    system: str | None,
    context: int,
) -> Path:
    """GGUF + Modelfile üretir; Modelfile yolunu döndürür."""
    directory, is_adapter = find_model_dir(model_path)
    if is_adapter:
        raise UserError(t("disa.once_birlestir", yol=model_path))
    if out_type not in OUT_TYPES:
        raise UserError(t("disa.tur_gecersiz", tur=out_type, secenekler=", ".join(OUT_TYPES)))
    tokenizer = load_tokenizer(str(directory))
    out_dir.mkdir(parents=True, exist_ok=True)
    gguf_path = out_dir / f"{name}-{out_type}.gguf"
    converter = find_converter(llama_cpp)
    if converter is None:
        console.warn(t("disa.llama_cpp_yok", ortam=LLAMA_CPP_ENV))
    else:
        requirements = converter.parent / "requirements" / "requirements-convert_hf_to_gguf.txt"
        _run(
            [
                sys.executable,
                str(converter),
                str(directory),
                "--outfile",
                str(gguf_path),
                "--outtype",
                out_type,
            ],
            t("disa.donusturucu_ipucu", gereksinim=requirements),
        )
    final = gguf_path
    if quant and converter is not None:
        quantizer = find_quantizer(llama_cpp)
        if quantizer is None:
            console.warn(t("disa.nicem_yok", nicem=quant))
        else:
            final = out_dir / f"{name}-{quant}.gguf"
            _run([quantizer, str(gguf_path), str(final), quant], t("disa.nicem_ipucu"))
    family = detect_family(tokenizer)
    license_note = t("disa.lisans_notu", model=directory)
    modelfile = out_dir / "Modelfile"
    modelfile.write_text(
        build_modelfile(final.name, family, system, context, tokenizer.eos_token, license_note),
        encoding="utf-8",
    )
    if final.is_file():
        console.result(t("disa.gguf_ozet", yol=final, **summarize(final)))
    console.result(t("disa.bitti", modelfile=modelfile, aile=family or "-", ad=name))
    return modelfile
