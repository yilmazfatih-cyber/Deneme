"""Qwen3-0.6B'yi (ya da başka bir 1B altı sohbet modelini) LoRA ile özetlemeye ince ayarlar.

* TRL ``SFTTrainer`` + PEFT LoRA; loss yalnızca yanıt (completion) belirteçlerinde.
* Qwen3 şablonunda düşünme kapalı: hedef yanıtların başına boş ``<think></think>`` bloğu eklenir
  (Qwen3 belgelerinin önerdiği "düşünmeyen" SFT biçimi); çalışma zamanı da aynı biçimi üretir.
* Ücretsiz Colab/Kaggle T4 (16 GB) için varsayılanlar: bf16 yok -> fp16; 0.6B + LoRA r=16 rahat sığar.
* CPU'da da çalışır (çok yavaş; küçük denemeler için ``--max-steps 20``).

Örnek::

    python train/sft_lora.py --data data --out runs/qwen3-0.6b-ozet --epochs 2
    python train/sft_lora.py --model google/gemma-3-270m-it --data data --out runs/gemma-270m-ozet
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from common import ROOT, read_jsonl


def _no_think_prefix(model_id: str) -> str:
    return "<think>\n\n</think>\n\n" if "qwen3" in model_id.lower() else ""


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default="Qwen/Qwen3-0.6B")
    p.add_argument("--data", default=str(ROOT / "data"))
    p.add_argument("--out", default=str(ROOT / "runs" / "qwen3-0.6b-ozet"))
    p.add_argument("--epochs", type=float, default=2.0)
    p.add_argument("--max-steps", type=int, default=-1)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch", type=int, default=4)
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument("--max-length", type=int, default=3072)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--full", action="store_true", help="LoRA yerine tam ince ayar (0.6B için 16 GB GPU yeter)")
    p.add_argument("--cpu", action="store_true")
    p.add_argument("--limit", type=int, default=None, help="hızlı deneme için örnek sayısı")
    args = p.parse_args(argv)

    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    train_rows = read_jsonl(Path(args.data) / "train.jsonl")
    eval_rows = read_jsonl(Path(args.data) / "eval.jsonl")
    if args.limit:
        train_rows, eval_rows = train_rows[: args.limit], eval_rows[: max(8, args.limit // 10)]
    prefix = _no_think_prefix(args.model)
    for r in train_rows + eval_rows:
        if prefix and not r["completion"][0]["content"].startswith("<think>"):
            r["completion"][0]["content"] = prefix + r["completion"][0]["content"]
    cols = ("prompt", "completion")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def fits(r) -> bool:
        try:
            n = len(tokenizer.apply_chat_template(r["prompt"] + r["completion"], tokenize=True, add_generation_prompt=False))
        except Exception:
            return True
        return n <= args.max_length - 1

    before = len(train_rows)
    train_rows = [r for r in train_rows if fits(r)]
    eval_rows = [r for r in eval_rows if fits(r)]
    if before - len(train_rows):
        print(f"UYARI: {before - len(train_rows)} örnek --max-length={args.max_length} sınırına sığmadığı için (yanıt kesilirdi) düşürüldü", file=sys.stderr)
    train_ds = Dataset.from_list([{k: r[k] for k in cols} for r in train_rows])
    eval_ds = Dataset.from_list([{k: r[k] for k in cols} for r in eval_rows]) if eval_rows else None

    use_cuda = torch.cuda.is_available() and not args.cpu
    if use_cuda:
        try:
            bf16_ok = torch.cuda.is_bf16_supported(including_emulation=False)  # T4: emülasyon var, gerçek bf16 yok
        except TypeError:  # eski torch
            bf16_ok = torch.cuda.is_bf16_supported()
    else:
        bf16_ok = False
    fp16 = use_cuda and not bf16_ok
    # fp16'da ağırlıklar fp32 kalır (Trainer autocast ile hesaplar); fp16 ağırlık + --full GradScaler'da çöker
    dtype = torch.bfloat16 if bf16_ok else torch.float32

    extra = {"attn_implementation": "eager"} if "gemma" in args.model.lower() else {}  # Gemma 3 için önerilen
    model = AutoModelForCausalLM.from_pretrained(args.model, dtype=dtype, **extra)

    peft_config = None
    if not args.full:
        peft_config = LoraConfig(
            r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none", task_type="CAUSAL_LM",
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        )

    # transformers 5: warmup_ratio kalktı, warmup_steps float oranı kabul ediyor; 4.x: warmup_ratio var
    warmup = {"warmup_ratio": 0.03} if "warmup_ratio" in SFTConfig.__dataclass_fields__ else {"warmup_steps": 0.03}
    cfg = SFTConfig(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.lr if not args.full else 2e-5,
        lr_scheduler_type="cosine",
        **warmup,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=use_cuda,
        bf16=bf16_ok,
        fp16=fp16,
        use_cpu=not use_cuda,
        max_length=args.max_length,
        packing=False,
        completion_only_loss=True,
        logging_steps=10,
        eval_strategy="steps" if eval_ds is not None else "no",
        eval_steps=200,
        save_strategy="steps",
        save_steps=200,
        save_total_limit=2,
        report_to="none",
        dataset_num_proc=2,
        seed=42,
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=train_ds, eval_dataset=eval_ds, processing_class=tokenizer, peft_config=peft_config)
    n_after = len(trainer.train_dataset)
    if n_after < len(train_ds):
        print(f"UYARI: {len(train_ds) - n_after} örnek --max-length={args.max_length} sınırını aştığı için düşürüldü", file=sys.stderr)
    if n_after == 0:
        raise SystemExit("Eğitim kümesi boş: --max-length değerini büyütün ya da build_dataset.py'de MAX_INPUT_CHARS'ı küçültün.")
    print(f"model={args.model} örnek={len(train_ds)} cihaz={'cuda' if use_cuda else 'cpu'} dtype={dtype} fp16={fp16} lora={'hayır' if args.full else args.lora_r}", file=sys.stderr)
    trainer.train()
    trainer.save_model(args.out)
    tokenizer.save_pretrained(args.out)
    print(f"kaydedildi -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
