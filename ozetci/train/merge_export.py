"""LoRA'yı taban modele katar, tam modeli kaydeder; GGUF'a dönüştürme komutlarını yazdırır/çalıştırır.

Örnek::

    python train/merge_export.py --adapter runs/qwen3-0.6b-ozet --out models/ozetci-qwen3-0.6b
    # GGUF (llama.cpp deposu gerekir):
    python train/merge_export.py --adapter runs/qwen3-0.6b-ozet --out models/ozetci-qwen3-0.6b --gguf --llama-cpp ~/llama.cpp
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--adapter", required=True, help="sft_lora.py çıktısı (LoRA ya da tam model)")
    p.add_argument("--base", default=None, help="taban model; adapter_config.json'dan okunur")
    p.add_argument("--out", required=True)
    p.add_argument("--gguf", action="store_true")
    p.add_argument("--llama-cpp", default=None, help="llama.cpp klonu (convert_hf_to_gguf.py için)")
    p.add_argument("--quant", default="Q8_0", help="Q8_0 (kalite) | Q5_K_M | Q4_K_M (hız/boyut)")
    args = p.parse_args(argv)

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    adapter = Path(args.adapter)
    out = Path(args.out)
    if (adapter / "adapter_config.json").exists():
        from peft import PeftModel
        import json

        base = args.base or json.loads((adapter / "adapter_config.json").read_text())["base_model_name_or_path"]
        model = AutoModelForCausalLM.from_pretrained(base, dtype=torch.float32)
        model = PeftModel.from_pretrained(model, str(adapter)).merge_and_unload()
        tokenizer = AutoTokenizer.from_pretrained(str(adapter))
    else:
        model = AutoModelForCausalLM.from_pretrained(str(adapter), dtype=torch.float32)
        tokenizer = AutoTokenizer.from_pretrained(str(adapter))
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out, safe_serialization=True)
    tokenizer.save_pretrained(out)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"birleştirildi -> {out}  ({n_params/1e6:.1f} M parametre, {'1B altı' if n_params < 1e9 else '1B ÜSTÜ'})", file=sys.stderr)

    if args.gguf:
        if not args.llama_cpp:
            print("GGUF için --llama-cpp <klon yolu> verin. Komutlar:\n"
                  f"  python <llama.cpp>/convert_hf_to_gguf.py {out} --outfile {out}/model-f16.gguf --outtype f16\n"
                  f"  <llama.cpp>/build/bin/llama-quantize {out}/model-f16.gguf {out}/model-{args.quant}.gguf {args.quant}", file=sys.stderr)
            return 0
        lc = Path(args.llama_cpp).expanduser()
        f16 = out / "model-f16.gguf"
        subprocess.run([sys.executable, str(lc / "convert_hf_to_gguf.py"), str(out), "--outfile", str(f16), "--outtype", "f16"], check=True)
        quant_bin = next((pth for pth in (lc / "build" / "bin" / "llama-quantize", lc / "llama-quantize") if pth.exists()), None)
        if quant_bin:
            subprocess.run([str(quant_bin), str(f16), str(out / f"model-{args.quant}.gguf"), args.quant], check=True)
            print(f"GGUF -> {out / f'model-{args.quant}.gguf'}", file=sys.stderr)
        else:
            print(f"f16 GGUF -> {f16} (llama-quantize bulunamadı; derleyip nicemleyin)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
