#!/usr/bin/env python
"""LoRA / QLoRA ile SQL-only ince ayar: yeni ağırlıkları üretir (adapter_model.safetensors).

Girdi: prepare_bird_sft.py çıktısı (jsonl, `messages` alanı). Taban: Qwen2.5-Coder-7B-Instruct (Apache-2.0;
katalogda `qwen2.5-coder-7b`). Çıktı adaptörü `merge_weights.py --lora` ile tabana eklenir ya da vLLM'de
`--enable-lora` ile doğrudan servis edilir.

Varsayılanlar 24 GB tek GPU'ya göre (QLoRA 4-bit, r=64, uzunluk 4096, etkin batch 16). 80 GB GPU'da `--no-qlora`
ve `--batch 4` ile bf16 LoRA daha iyi sonuç verir. Yaklaşık süre: BIRD train (~9 bin örnek + onarımlar) × 2 epok,
A100'de 3-4 saat; RTX 4090'da 8-10 saat.

  pip install -e ".[text2sql-train]"
  python scripts/text2sql/train_lora.py --data data/bird_sft.jsonl --out out/lora-text2sql
  python scripts/text2sql/merge_weights.py --base Qwen/Qwen2.5-Coder-7B-Instruct --lora out/lora-text2sql --out out/koprusql-7b

Değerlendirme (eğitim verisine girmemiş dev kümesinde):
  vllm serve out/koprusql-7b --served-model-name koprusql-7b --port 8001
  python -m aiplatform.text2sql.bird --dev bird/dev/dev.json --db-root bird/dev/dev_databases --model koprusql-7b --candidates 4
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True, type=Path, help="jsonl; her satırda messages listesi")
    ap.add_argument("--eval-data", type=Path, default=None)
    ap.add_argument("--base", default="Qwen/Qwen2.5-Coder-7B-Instruct")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--r", type=int, default=64)
    ap.add_argument("--alpha", type=int, default=128)
    ap.add_argument("--dropout", type=float, default=0.05)
    ap.add_argument("--max-length", type=int, default=4096)
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument(
        "--no-qlora", action="store_true", help="4-bit yükleme yerine bf16 (daha çok VRAM, daha iyi)"
    )
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true", help="veriyi doğrula ve ayarları yaz, eğitme")
    return ap.parse_args(argv)


def validate_data(path: Path) -> dict:
    n, kinds, max_turns = 0, {}, 0
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            ex = json.loads(line)
            msgs = ex["messages"]
            assert msgs[0]["role"] == "system" and msgs[-1]["role"] == "assistant", "messages biçimi bozuk"
            json.loads(msgs[-1]["content"])["sql"]  # son yanıt geçerli JSON ve sql alanı var
            n += 1
            kinds[ex.get("kind", "?")] = kinds.get(ex.get("kind", "?"), 0) + 1
            max_turns = max(max_turns, len(msgs))
    return {"examples": n, "kinds": kinds, "max_turns": max_turns}


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    info = validate_data(a.data)
    config = {
        **vars(a),
        "data": str(a.data),
        "out": str(a.out),
        "eval_data": str(a.eval_data) if a.eval_data else None,
    }
    config["target_modules"] = TARGET_MODULES
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "train_config.json").write_text(
        json.dumps({**config, "data_info": info}, indent=2), encoding="utf-8"
    )
    print(json.dumps(info, indent=2))
    if a.dry_run:
        print("dry-run: eğitim atlandı")
        return 0

    try:
        import torch
        from datasets import load_dataset
        from peft import LoraConfig
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from trl import SFTConfig, SFTTrainer
    except ImportError as e:  # pragma: no cover
        raise SystemExit(
            f"Eğitim bağımlılıkları eksik ({e}). Kurulum: pip install -e '.[text2sql-train]'"
        ) from e

    tok = AutoTokenizer.from_pretrained(a.base)
    tok.pad_token = tok.pad_token or tok.eos_token
    model_kwargs: dict = {"torch_dtype": torch.bfloat16, "attn_implementation": "sdpa"}
    if not a.no_qlora:
        from transformers import BitsAndBytesConfig

        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
    model = AutoModelForCausalLM.from_pretrained(a.base, device_map="auto", **model_kwargs)

    data_files = {"train": str(a.data)}
    if a.eval_data:
        data_files["eval"] = str(a.eval_data)
    ds = load_dataset("json", data_files=data_files)
    ds = ds.remove_columns([c for c in ds["train"].column_names if c != "messages"])

    peft_cfg = LoraConfig(
        r=a.r,
        lora_alpha=a.alpha,
        lora_dropout=a.dropout,
        target_modules=TARGET_MODULES,
        task_type="CAUSAL_LM",
    )
    sft_cfg = SFTConfig(
        output_dir=str(a.out),
        num_train_epochs=a.epochs,
        learning_rate=a.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        per_device_train_batch_size=a.batch,
        gradient_accumulation_steps=a.grad_accum,
        gradient_checkpointing=True,
        bf16=True,
        max_length=a.max_length,
        packing=False,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch" if a.eval_data else "no",
        report_to="none",
        seed=a.seed,
    )
    trainer = SFTTrainer(
        model=model,
        args=sft_cfg,
        train_dataset=ds["train"],
        eval_dataset=ds.get("eval"),
        processing_class=tok,
        peft_config=peft_cfg,
    )
    trainer.train()
    trainer.save_model(str(a.out))  # adapter_config.json + adapter_model.safetensors
    tok.save_pretrained(str(a.out))
    print(
        f"adaptör kaydedildi: {a.out}\nbirleştirme: python scripts/text2sql/merge_weights.py --base {a.base} --lora {a.out} --out out/koprusql-7b"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
