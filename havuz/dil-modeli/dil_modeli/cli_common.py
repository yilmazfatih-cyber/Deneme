"""Komutların ortak seçenekleri ve küçük yardımcıları (aygıt, iş parçacığı, derlem okuma).

Genişletme: Birden çok komutun kullandığı yeni bir seçenek buraya `add_*` işlevi olarak eklenir.
"""

from __future__ import annotations

import argparse

import torch

from .corpus import CorpusOptions
from .device import pick_device


def add_device_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--cihaz", default="auto", help="auto | cpu | cuda | mps (varsayılan: auto)"
    )
    parser.add_argument(
        "--is-parcacigi",
        type=int,
        default=0,
        help="CPU iş parçacığı sayısı (0: PyTorch varsayılanı)",
    )


def device_from_args(args: argparse.Namespace) -> torch.device:
    if args.is_parcacigi:
        torch.set_num_threads(args.is_parcacigi)
    return pick_device(args.cihaz)


def add_corpus_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--girdi",
        nargs="+",
        required=True,
        help="metin dosyaları ya da klasörler (.txt, .md, .jsonl)",
    )
    parser.add_argument(
        "--alan", default="text", help=".jsonl satırındaki metin alanı (varsayılan: text)"
    )
    parser.add_argument(
        "--satir-belge", action="store_true", help=".txt dosyasında her satırı ayrı belge say"
    )
    parser.add_argument(
        "--kodlama", default="utf-8-sig", help="dosya kodlaması (eski Türkçe dosyalar için: cp1254)"
    )


def corpus_from_args(args: argparse.Namespace) -> CorpusOptions:
    return CorpusOptions(
        text_field=args.alan, line_documents=args.satir_belge, encoding=args.kodlama
    )


def add_sampling_args(parser: argparse.ArgumentParser, *, max_tokens: int = 200) -> None:
    parser.add_argument("--azami", type=int, default=max_tokens, help="en çok üretilecek belirteç")
    parser.add_argument("--sicaklik", type=float, default=0.8, help="0: açgözlü; büyüdükçe çeşitli")
    parser.add_argument(
        "--top-k", type=int, default=0, help="en olası k belirteçten seç (0: kapalı)"
    )
    parser.add_argument(
        "--top-p", type=float, default=0.95, help="çekirdek örnekleme eşiği (1: kapalı)"
    )
    parser.add_argument(
        "--yineleme-cezasi", type=float, default=1.1, help="yinelemeyi azaltır (1: kapalı)"
    )
    parser.add_argument(
        "--dur", action="append", default=[], help="bu yazı üretilince dur (birden çok verilebilir)"
    )
    parser.add_argument("--tohum", type=int, default=None, help="aynı tohum -> aynı çıktı")
