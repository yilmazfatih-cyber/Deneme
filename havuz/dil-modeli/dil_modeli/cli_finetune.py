"""Komut: `ince-ayar` (sohbet verisiyle LoRA ya da tam ince ayar).

Örnek:
    python -m dil_modeli ince-ayar --model calisma/deneme/en-iyi --veri sohbet.jsonl \
        --cikti calisma/ince-ayar --adim 300
    python -m dil_modeli sohbet --model calisma/ince-ayar/birlesik

Genişletme: `FinetuneConfig`e eklenen her alan için burada bir seçenek açın.
"""

from __future__ import annotations

import argparse

from .cli_common import add_device_args, device_from_args
from .finetune import ADAPTER_DIR, MERGED_DIR, FinetuneConfig, finetune
from .lora import DEFAULT_TARGETS


def add_finetune_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, help="temel model klasörü")
    parser.add_argument(
        "--veri", required=True, help='sohbet verisi (.jsonl, her satır {"messages": [...]})'
    )
    parser.add_argument(
        "--cikti", required=True, help="çıktı klasörü (adaptor/ ve birlesik/ yazılır)"
    )
    parser.add_argument("--tam", action="store_true", help="LoRA yerine bütün ağırlıkları eğit")
    parser.add_argument("--lora-rank", type=int, default=8, help="LoRA rankı (varsayılan: 8)")
    parser.add_argument(
        "--lora-alfa", type=float, default=16.0, help="LoRA ölçeği alfa (varsayılan: 16)"
    )
    parser.add_argument("--lora-dropout", type=float, default=0.0, help="LoRA girdisine dropout")
    parser.add_argument(
        "--lora-hedefler",
        default=",".join(DEFAULT_TARGETS),
        help="virgülle ayrılmış katman adları (varsayılan: bütün dikkat ve ileri besleme)",
    )
    parser.add_argument("--adim", type=int, default=200, help="eğitim adımı")
    parser.add_argument("--yigin", type=int, default=8, help="yığın boyutu (örnek sayısı)")
    parser.add_argument(
        "--ogrenme-orani",
        type=float,
        default=0.0,
        help="öğrenme oranı (0: LoRA için 1e-3, tam ince ayar için 1e-4)",
    )
    parser.add_argument(
        "--dogrulama-orani", type=float, default=0.1, help="doğrulamaya ayrılan oran"
    )
    parser.add_argument(
        "--azami-uzunluk", type=int, default=0, help="örnek uzunluğu sınırı (0: bağlam)"
    )
    parser.add_argument("--tohum", type=int, default=0, help="tohum")
    add_device_args(parser)


def run_finetune(args: argparse.Namespace) -> int:
    targets = tuple(name.strip() for name in args.lora_hedefler.split(",") if name.strip())
    config = FinetuneConfig(
        model_dir=args.model,
        data=args.veri,
        out_dir=args.cikti,
        lora=not args.tam,
        rank=args.lora_rank,
        alpha=args.lora_alfa,
        lora_dropout=args.lora_dropout,
        targets=targets,
        max_steps=args.adim,
        batch_size=args.yigin,
        learning_rate=args.ogrenme_orani or (1e-4 if args.tam else 1e-3),
        val_fraction=args.dogrulama_orani,
        max_len=args.azami_uzunluk,
        seed=args.tohum,
    )
    result = finetune(config, device=device_from_args(args))
    print(
        f"İnce ayar bitti: kayıp {result.first_loss:.3f} -> {result.last_loss:.3f}"
        + (f", doğrulama {result.val_loss:.3f}" if result.val_loss is not None else "")
    )
    if config.lora:
        print(f"Bağdaştırıcı: {args.cikti}/{ADAPTER_DIR}")
    print(f"Tek başına çalışan model: {args.cikti}/{MERGED_DIR}")
    return 0
