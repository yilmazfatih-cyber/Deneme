"""Komutlar: `egit`, `degerlendir`, `boyutlar`.

Örnek:
    python -m dil_modeli egit --yapilandirma yapilandirma/cpu-deneme.toml --ayar max_steps=300
    python -m dil_modeli egit --yapilandirma yapilandirma/cpu-deneme.toml --surdur
    python -m dil_modeli degerlendir --model calisma/deneme/en-iyi --girdi metin.txt
    python -m dil_modeli boyutlar --sozluk 8192

Genişletme: Eğitim ayarları komut satırına tek tek eklenmez; `--ayar anahtar=değer` her
`TrainConfig` alanını zaten değiştirebilir (bkz. train_config.py).
"""

from __future__ import annotations

import argparse
import json
import math

from .batches import TokenData
from .cli_common import add_device_args, corpus_from_args, device_from_args
from .config import PRESETS, count_parameters, preset_config
from .evaluate import evaluate_text, mean_loss
from .model_io import load_model
from .train import train
from .train_config import load_train_config


def add_train_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--yapilandirma", help="TOML ayar dosyası (ör. yapilandirma/cpu-deneme.toml)"
    )
    parser.add_argument(
        "--ayar",
        action="append",
        default=[],
        metavar="ANAHTAR=DEĞER",
        help="ayarı değiştir, birden çok verilebilir (ör. --ayar max_steps=500 "
        "--ayar model.dim=192)",
    )
    parser.add_argument("--surdur", action="store_true", help="out_dir'deki yarım eğitimi sürdür")


def run_train(args: argparse.Namespace) -> int:
    config = load_train_config(args.yapilandirma, args.ayar)
    result = train(config, resume=args.surdur)
    state = "tamamlandı" if result.finished else "durduruldu (sürdürmek için --surdur)"
    print(
        f"Eğitim {state}: adım {result.step}/{config.max_steps} | en iyi doğrulama kaybı "
        f"{result.best_val_loss:.4f} | {result.tokens:,} belirteç | {result.seconds / 60:.1f} dk"
    )
    print(f"Model klasörleri: {config.out_dir}/en-iyi ve {config.out_dir}/son")
    return 0


def add_eval_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--model", required=True, help="model klasörü (config.json + model.safetensors)"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--girdi", nargs="+", help="değerlendirilecek metin dosyaları")
    source.add_argument("--veri", help="hazırlanmış veri klasörü (doğrulama bölümü kullanılır)")
    parser.add_argument("--alan", default="text", help=".jsonl satırındaki metin alanı")
    parser.add_argument("--satir-belge", action="store_true", help=".txt'de her satır ayrı belge")
    parser.add_argument("--kodlama", default="utf-8-sig", help="dosya kodlaması")
    parser.add_argument(
        "--adim", type=int, default=0, help="kayan pencere adımı (0: bağlamın yarısı)"
    )
    parser.add_argument("--yigin", type=int, default=8, help="yığın boyutu")
    parser.add_argument("--json", action="store_true", help="sonucu JSON olarak yaz")
    add_device_args(parser)


def run_eval(args: argparse.Namespace) -> int:
    device = device_from_args(args)
    model, tokenizer = load_model(args.model, device)
    if args.veri:
        data = TokenData(args.veri, "dogrulama")
        loss = mean_loss(model, data.eval_batches(args.yigin, model.config.max_seq_len), device)
        result: dict[str, float | int] = {
            "kayip": round(loss, 6),
            "saskinlik": round(math.exp(loss), 4),
            "belirtec": data.tokens,
        }
    else:
        result = evaluate_text(
            model,
            tokenizer,
            args.girdi,
            corpus_options=corpus_from_args(args),
            stride=args.adim or None,
            batch_size=args.yigin,
            device=device,
        ).to_dict()
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        for key, value in result.items():
            print(f"{key:>20}: {value}")
    return 0


def add_sizes_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--sozluk", type=int, default=8192, help="sözlük boyutu (varsayılan: 8192)")


def run_sizes(args: argparse.Namespace) -> int:
    print(f"{'boyut':<8} {'dim':>5} {'katman':>6} {'baş':>4} {'bağlam':>6} {'parametre':>12}")
    for name in PRESETS:
        config = preset_config(name, args.sozluk)
        print(
            f"{name:<8} {config.dim:>5} {config.n_layer:>6} {config.n_head:>4} "
            f"{config.max_seq_len:>6} {count_parameters(config) / 1e6:>10.2f} M"
        )
    return 0
