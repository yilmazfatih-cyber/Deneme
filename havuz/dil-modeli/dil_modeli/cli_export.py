"""Komut: `disa-aktar` (modeli başka biçimlere taşır).

Biçimler:
    kendi     bu paketin klasörü (ör. LoRA bağdaştırıcısını katıp tek model yapmak, float16 kayıt)
    hf        Hugging Face `LlamaForCausalLM` klasörü (transformers, llama.cpp/GGUF için girdi)
    tarayici  tarayici/ çalışma zamanının okuduğu model.bin + manifest.json (+ int8/float16)
    onnx      ONNX dosyası (isteğe bağlı; `pip install -e ".[onnx]"` gerekir)
Örnek:
    python -m dil_modeli disa-aktar --model ornek-model --bicim hf --cikti calisma/hf
    python -m dil_modeli disa-aktar --model ornek-model --bicim tarayici --cikti calisma/web

Genişletme: Yeni biçim için `FORMATS` sözlüğüne "YENİ BİÇİM BURAYA" satırının üstüne bir işlev
ekleyin.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path

from .export_hf import export_hf
from .export_web import DTYPES, export_web
from .lora import load_adapter, remove_lora
from .model import LanguageModel
from .model_io import load_model, save_model
from .tokenizer_api import Tokenizer


def _own(model: LanguageModel, tokenizer: Tokenizer, out: Path, args: argparse.Namespace) -> str:
    save_model(out, model, tokenizer, half=args.tur == "float16", info={"kaynak": args.model})
    return f"model klasörü ({'float16' if args.tur == 'float16' else 'float32'})"


def _hf(model: LanguageModel, tokenizer: Tokenizer, out: Path, args: argparse.Namespace) -> str:
    export_hf(model, tokenizer, out)
    return "Hugging Face LlamaForCausalLM klasörü (GGUF/Ollama için: docs/OLLAMA.md)"


def _web(model: LanguageModel, tokenizer: Tokenizer, out: Path, args: argparse.Namespace) -> str:
    manifest = export_web(model, tokenizer, out, args.tur or "int8")
    return f"tarayıcı klasörü ({manifest['dtype']}, {manifest['bytes'] / 1e6:.2f} MB)"


def _onnx(model: LanguageModel, tokenizer: Tokenizer, out: Path, args: argparse.Namespace) -> str:
    from .export_onnx import export_onnx

    path = export_onnx(model, tokenizer, out)
    return f"ONNX dosyası: {path}"


FORMATS: dict[str, Callable[[LanguageModel, Tokenizer, Path, argparse.Namespace], str]] = {
    "kendi": _own,
    "hf": _hf,
    "tarayici": _web,
    "onnx": _onnx,
    # YENİ BİÇİM BURAYA
}


def add_export_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, help="model klasörü")
    parser.add_argument("--bicim", required=True, choices=sorted(FORMATS), help="hedef biçim")
    parser.add_argument("--cikti", required=True, help="çıktı klasörü")
    parser.add_argument(
        "--tur",
        choices=DTYPES,
        default=None,
        help="ağırlık türü: tarayici için varsayılan int8, kendi için float32",
    )
    parser.add_argument(
        "--adaptor", help="önce bu LoRA bağdaştırıcısını modele kat (ince-ayar çıktısı/adaptor)"
    )


def run_export(args: argparse.Namespace) -> int:
    model, tokenizer = load_model(args.model)
    if args.adaptor:
        load_adapter(model, args.adaptor)
        remove_lora(model)
        model.eval()
    out = Path(args.cikti)
    description = FORMATS[args.bicim](model, tokenizer, out, args)
    print(f"Yazıldı: {out} — {description}")
    return 0
