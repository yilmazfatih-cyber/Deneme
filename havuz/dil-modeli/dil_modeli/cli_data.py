"""Komutlar: `tokenizer-egit` ve `veri-hazirla`.

Örnek:
    python -m dil_modeli tokenizer-egit --girdi metin.txt --cikti calisma/tok.json --sozluk 8192
    python -m dil_modeli veri-hazirla --girdi metin.txt --tokenizer calisma/tok.json \
        --cikti veri/hazir

Genişletme: Yeni bir seçenek eklerken `add_*_args` ve `run_*` birlikte değişir; duman testi
tests/test_cli.py içindedir.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from .cli_common import add_corpus_args, corpus_from_args
from .corpus import expand_inputs, iter_texts
from .data import TRAIN, VAL, PrepareOptions, prepare_data
from .tokenizer_api import Tokenizer, load_tokenizer
from .tokenizer_char import CharTokenizer
from .tokenizer_train import train_bpe

SAMPLE_SENTENCE = "Iğdır'dan İzmir'e giden otobüs saat 08:30'da kalkıyor."


def add_tokenizer_args(parser: argparse.ArgumentParser) -> None:
    add_corpus_args(parser)
    parser.add_argument("--cikti", required=True, help="yazılacak tokenizer.json")
    parser.add_argument("--sozluk", type=int, default=8192, help="sözlük boyutu (varsayılan: 8192)")
    parser.add_argument("--en-az-siklik", type=int, default=2, help="bundan seyrek çift birleşmez")
    parser.add_argument(
        "--hizli",
        action="store_true",
        help="eğitimi `tokenizers` kütüphanesine yaptır (aynı sonuç)",
    )
    parser.add_argument(
        "--karakter", action="store_true", help="BPE yerine karakter düzeyi tokenizer eğit"
    )


def run_tokenizer(args: argparse.Namespace) -> int:
    files = expand_inputs(args.girdi)
    texts = iter_texts(files, corpus_from_args(args))
    started = time.perf_counter()
    tokenizer: Tokenizer
    if args.karakter:
        tokenizer = CharTokenizer.train(texts)
    else:

        def progress(done: int, total: int) -> None:
            print(f"  birleştirme {done}/{total} ({time.perf_counter() - started:.0f} sn)")

        tokenizer = train_bpe(
            texts,
            args.sozluk,
            min_frequency=args.en_az_siklik,
            fast=args.hizli,
            progress=None if args.hizli else progress,
        )
    out = Path(args.cikti)
    out.parent.mkdir(parents=True, exist_ok=True)
    tokenizer.save(out)
    ids = tokenizer.encode(SAMPLE_SENTENCE)
    print(
        f"Tokenizer yazıldı: {out} (sözlük {tokenizer.vocab_size}, "
        f"{time.perf_counter() - started:.1f} sn)"
    )
    print(f"Örnek: {SAMPLE_SENTENCE!r} -> {len(ids)} belirteç")
    return 0


def add_prepare_args(parser: argparse.ArgumentParser) -> None:
    add_corpus_args(parser)
    parser.add_argument("--tokenizer", required=True, help="tokenizer.json yolu")
    parser.add_argument("--cikti", required=True, help="hazırlanmış verinin klasörü")
    parser.add_argument(
        "--dogrulama-orani", type=float, default=0.01, help="doğrulamaya ayrılan oran"
    )
    parser.add_argument("--tohum", type=int, default=0, help="eğitim/doğrulama ayrımının tohumu")
    parser.add_argument(
        "--parca-belirtec",
        type=int,
        default=50_000_000,
        help="bir .bin dosyasındaki en çok belirteç",
    )
    parser.add_argument(
        "--hizli",
        action="store_true",
        help="kodlamayı `tokenizers` ile yap (aynı kimlikler, daha hızlı)",
    )


def run_prepare(args: argparse.Namespace) -> int:
    tokenizer = load_tokenizer(args.tokenizer)
    options = PrepareOptions(
        val_fraction=args.dogrulama_orani,
        seed=args.tohum,
        shard_tokens=args.parca_belirtec,
        fast=args.hizli,
    )
    started = time.perf_counter()

    def progress(pieces: int, chars: int) -> None:
        print(
            f"  {pieces} parça, {chars / 1e6:.1f} M karakter "
            f"({time.perf_counter() - started:.0f} sn)"
        )

    meta = prepare_data(
        args.girdi, tokenizer, args.cikti, corpus_from_args(args), options, progress=progress
    )
    train_tokens = meta["splits"][TRAIN]["tokens"]
    val_tokens = meta["splits"][VAL]["tokens"]
    print(
        f"Hazır: {args.cikti} | {meta['documents']} belge, {meta['chars'] / 1e6:.1f} M karakter | "
        f"eğitim {train_tokens:,} / doğrulama {val_tokens:,} belirteç | "
        f"{meta['chars'] / max(1, train_tokens + val_tokens):.2f} karakter/belirteç | "
        f"{time.perf_counter() - started:.1f} sn"
    )
    return 0
