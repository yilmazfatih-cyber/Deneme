"""Komutlar: `uret` (istemin devamı) ve `sohbet` (uçbirimde sohbet).

Örnek:
    python -m dil_modeli uret --model ornek-model --istem "Türkiye'nin başkenti" --azami 80
    python -m dil_modeli uret --model ornek-model --istem "İstanbul" --adet 3 --tohum 1
    python -m dil_modeli sohbet --model calisma/ince-ayar/birlesik --sistem "Kısa yanıt ver."

Genişletme: Yeni bir örnekleme seçeneği önce `sampling.py`ye, sonra `cli_common.add_sampling_args`
ve `sampling_from_args`a eklenir.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Callable

from .chat import ChatMessage, encode_chat
from .cli_common import add_device_args, add_sampling_args, device_from_args
from .generate import TextStream, generate_batch
from .model import LanguageModel
from .model_io import load_model
from .sampling import SamplingConfig
from .tokenizer import END_OF_TURN, EOS
from .tokenizer_api import Tokenizer


def sampling_from_args(args: argparse.Namespace) -> SamplingConfig:
    return SamplingConfig(
        max_new_tokens=args.azami,
        temperature=args.sicaklik,
        top_k=args.top_k,
        top_p=args.top_p,
        repetition_penalty=args.yineleme_cezasi,
        stop=tuple(args.dur),
        seed=args.tohum,
    )


def add_generate_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, help="model klasörü (ör. ornek-model)")
    parser.add_argument("--istem", default="", help="devam ettirilecek metin (boş: belge başından)")
    parser.add_argument(
        "--adet", type=int, default=1, help="kaç ayrı örnek üretilsin (toplu üretim)"
    )
    parser.add_argument("--bas-yok", action="store_true", help="istemin başına <|bas|> ekleme")
    add_sampling_args(parser)
    add_device_args(parser)


def run_generate(args: argparse.Namespace) -> int:
    model, tokenizer = load_model(args.model, device_from_args(args))
    settings = sampling_from_args(args)
    prompt = ([] if args.bas_yok else [tokenizer.bos_id]) + tokenizer.encode(args.istem)
    if not prompt:
        raise ValueError("--bas-yok ile boş istem verilemez; bir --istem yazın.")
    started = time.perf_counter()
    if args.adet > 1:
        rows = generate_batch(
            model,
            [prompt] * args.adet,
            settings,
            pad_id=tokenizer.pad_id,
            stop_ids={tokenizer.eos_id},
        )
        for number, row in enumerate(rows, start=1):
            print(f"--- örnek {number} ---\n{args.istem}{tokenizer.decode(row)}")
        produced = sum(len(row) for row in rows)
    else:
        stream = TextStream(model, tokenizer, prompt, settings)
        print(args.istem, end="", flush=True)
        for piece in stream:
            print(piece, end="", flush=True)
        print()
        produced = stream.completion_tokens
    elapsed = time.perf_counter() - started
    print(
        f"[{produced} belirteç, {produced / max(elapsed, 1e-9):.1f} belirteç/sn]", file=sys.stderr
    )
    return 0


def add_chat_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, help="sohbet ince ayarı yapılmış model klasörü")
    parser.add_argument("--sistem", default="", help="sistem iletisi (modelin rolü)")
    add_sampling_args(parser, max_tokens=256)
    add_device_args(parser)


def fit_history(tokenizer: Tokenizer, messages: list[ChatMessage], limit: int) -> list[ChatMessage]:
    """İstem `limit` belirtece sığana dek en eski turları atar; sistem iletisi korunur."""
    system = messages[:1] if messages and messages[0].role == "system" else []
    turns = messages[len(system) :]
    while turns and len(encode_chat(tokenizer, system + turns, add_generation_prompt=True)) > limit:
        turns = turns[1:]
    return system + turns


def chat_loop(
    model: LanguageModel,
    tokenizer: Tokenizer,
    settings: SamplingConfig,
    *,
    system: str = "",
    read: Callable[[str], str] | None = None,
    write: Callable[[str], None] | None = None,
) -> list[ChatMessage]:
    """Etkileşimli sohbet. Komutlar: /cik, /temizle, /sistem <metin>. Geçmişi döndürür.

    `read`/`write` verilmezse uçbirim kullanılır (testler kendi işlevlerini verir).
    """
    read = read or input
    write = write or _print
    start = [ChatMessage(role="system", content=system)] if system else []
    messages = list(start)
    stop_ids = {tokenizer.special_id(END_OF_TURN), tokenizer.special_id(EOS)}
    limit = max(8, model.config.max_seq_len - settings.max_new_tokens)
    write("Sohbet başladı. Çıkmak için /cik, geçmişi silmek için /temizle yazın.\n")
    while True:
        try:
            line = read("Siz: ").strip()
        except (EOFError, KeyboardInterrupt):
            write("\n")
            return messages
        if line == "/cik":
            return messages
        if line == "/temizle":
            messages = list(start)
            write("(geçmiş silindi)\n")
            continue
        if line.startswith("/sistem "):
            start = [ChatMessage(role="system", content=line.removeprefix("/sistem ").strip())]
            messages = start + [m for m in messages if m.role != "system"]
            write("(sistem iletisi değişti)\n")
            continue
        if not line:
            continue
        messages = fit_history(
            tokenizer, [*messages, ChatMessage(role="user", content=line)], limit
        )
        prompt = encode_chat(tokenizer, messages, add_generation_prompt=True)
        write("Model: ")
        pieces: list[str] = []
        for piece in TextStream(model, tokenizer, prompt, settings, stop_ids=stop_ids):
            write(piece)
            pieces.append(piece)
        write("\n")
        messages.append(ChatMessage(role="assistant", content="".join(pieces).strip()))


def _print(text: str) -> None:
    print(text, end="", flush=True)


def run_chat(args: argparse.Namespace) -> int:
    model, tokenizer = load_model(args.model, device_from_args(args))
    chat_loop(model, tokenizer, sampling_from_args(args), system=args.sistem)
    return 0
