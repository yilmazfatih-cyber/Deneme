"""Komut: `sun` (OpenAI uyumlu HTTP sunucusu).

Örnek:
    python -m dil_modeli sun --model ornek-model            # http://127.0.0.1:8430
    curl http://127.0.0.1:8430/v1/chat/completions -H "Content-Type: application/json" \
        -d '{"messages": [{"role": "user", "content": "Merhaba"}]}'

Genişletme: Yeni bir sunucu ayarı için `ServerSettings`e alan, burada seçenek ekleyin.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from .cli_common import add_device_args, device_from_args
from .model_io import load_model
from .serve import ServerSettings, create_app

DEFAULT_PORT = 8430  # havuz/STANDARTLAR.md §12
KEY_VARIABLE = "DIL_MODELI_ANAHTAR"


def add_serve_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--model", required=True, help="model klasörü")
    parser.add_argument(
        "--kapi", type=int, default=DEFAULT_PORT, help=f"kapı (varsayılan: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--adres", default="127.0.0.1", help="dinlenecek adres (varsayılan: yalnız bu bilgisayar)"
    )
    parser.add_argument("--ad", help="istemcilere görünen model adı (varsayılan: klasör adı)")
    parser.add_argument(
        "--azami-belirtec", type=int, default=512, help="bir yanıtta en çok belirteç"
    )
    parser.add_argument(
        "--varsayilan-belirtec", type=int, default=128, help="istek belirtmezse belirteç"
    )
    parser.add_argument(
        "--cors", action="append", default=[], help="tarayıcıdan erişimine izin verilen köken"
    )
    add_device_args(parser)


def run_serve(args: argparse.Namespace) -> int:
    import uvicorn

    api_key = os.environ.get(KEY_VARIABLE) or None
    if args.adres not in ("127.0.0.1", "localhost", "::1") and not api_key:
        print(
            f"Uyarı: sunucu ağa açılıyor ama anahtar yok. "
            f"{KEY_VARIABLE} ortam değişkenini ayarlayın."
        )
    model, tokenizer = load_model(args.model, device_from_args(args))
    settings = ServerSettings(
        model_name=args.ad or Path(args.model).resolve().name,
        default_tokens=args.varsayilan_belirtec,
        max_tokens=args.azami_belirtec,
        api_key=api_key,
        cors_origins=tuple(args.cors),
    )
    print(
        f"Deneme sayfası: http://{args.adres}:{args.kapi}/  ·  API: http://{args.adres}:{args.kapi}/v1"
    )
    uvicorn.run(
        create_app(model, tokenizer, settings), host=args.adres, port=args.kapi, log_level="info"
    )
    return 0
