"""OpenAI uyumlu HTTP sunucusu (FastAPI): /v1/models, /v1/completions, /v1/chat/completions.

`stream: true` ile yanıt SSE (`data: {...}` satırları, sonda `data: [DONE]`) olarak akar.
Üretim tek bir kilitle sırayla yapılır (aynı anda bir istek); model iş parçacığında çalışır,
olay döngüsü bloklanmaz. İstemci bağlantıyı koparırsa üretim bir sonraki belirteçte durur.
Güvenli varsayılanlar: yalnız 127.0.0.1, CORS kapalı, istenirse Bearer anahtarı.
`/` adresinde küçük bir deneme sayfası vardır (`web/deneme.html`, metinler `web/tr.json`).

Genişletme: Yeni uç nokta için `create_app` içine bir işlev ekleyin; şeması `serve_schemas.py`ye,
testi tests/test_serve.py'ye.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anyio
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .chat import encode_chat
from .generate import TextStream
from .model import LanguageModel
from .sampling import SamplingConfig
from .serve_schemas import ChatRequest, CompletionRequest, error_body, new_id, now
from .tokenizer import END_OF_TURN
from .tokenizer_api import Tokenizer

WEB = Path(__file__).parent / "web"


@dataclass(frozen=True)
class ServerSettings:
    model_name: str = "dil-modeli"
    default_tokens: int = 128  # istek max_tokens vermezse
    max_tokens: int = 512  # isteklerin üst sınırı (kırpılır)
    api_key: str | None = None  # verilirse "Authorization: Bearer <anahtar>" zorunlu
    cors_origins: tuple[str, ...] = ()


class _Job:
    """Bir üretim işi: belirteçleri iş parçacığında üretir, parçaları sırayla verir."""

    def __init__(self, stream: TextStream) -> None:
        self.stream = stream
        self._pieces: Iterator[str] = iter(stream)

    def next_piece(self) -> str | None:
        return next(self._pieces, None)

    @property
    def usage(self) -> dict[str, int]:
        prompt, completion = self.stream.prompt_tokens, self.stream.completion_tokens
        return {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": prompt + completion,
        }


def create_app(
    model: LanguageModel, tokenizer: Tokenizer, settings: ServerSettings | None = None
) -> FastAPI:
    config = settings or ServerSettings()
    app = FastAPI(title="dil-modeli", docs_url=None, redoc_url=None)
    lock = asyncio.Lock()
    created = now()
    chat_stops = {tokenizer.special_id(END_OF_TURN), tokenizer.eos_id}
    if config.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.cors_origins),
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    @app.exception_handler(RequestValidationError)
    async def _invalid(request: Request, error: RequestValidationError) -> JSONResponse:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        return JSONResponse(
            error_body(f"İstek geçersiz ({where}): {first.get('msg')}"), status_code=400
        )

    async def _authorize(request: Request) -> None:
        if config.api_key and request.headers.get("authorization") != f"Bearer {config.api_key}":
            raise _Unauthorized

    @app.exception_handler(_Unauthorized)
    async def _unauthorized(request: Request, error: Exception) -> JSONResponse:
        body = error_body(
            "API anahtarı eksik ya da yanlış (Authorization: Bearer ...).", "authentication_error"
        )
        return JSONResponse(body, status_code=401)

    @app.get("/v1/models", dependencies=[Depends(_authorize)])
    async def models() -> dict[str, Any]:
        entry = {
            "id": config.model_name,
            "object": "model",
            "created": created,
            "owned_by": "dil-modeli",
        }
        return {"object": "list", "data": [entry]}

    def _job(
        prompt_ids: list[int], sampling: SamplingConfig, stop_ids: set[int] | None = None
    ) -> _Job:
        return _Job(TextStream(model, tokenizer, prompt_ids, sampling, stop_ids=stop_ids))

    async def _run(job: _Job) -> str:
        pieces = []
        while (piece := await anyio.to_thread.run_sync(job.next_piece)) is not None:
            pieces.append(piece)
        return "".join(pieces)

    @app.post("/v1/completions", dependencies=[Depends(_authorize)], response_model=None)
    async def completions(body: CompletionRequest) -> dict[str, Any] | Response:
        sampling = body.sampling(config.default_tokens, config.max_tokens)
        jobs = [_job([tokenizer.bos_id, *tokenizer.encode(p)], sampling) for p in body.prompts]
        ident = new_id("cmpl")
        if body.stream:
            if len(jobs) > 1:
                return JSONResponse(
                    error_body("Akışta yalnız tek prompt desteklenir."), status_code=400
                )
            return _sse(_stream(jobs[0], ident, "text_completion", body.include_usage))
        choices, usage = [], {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        async with lock:
            for index, job in enumerate(jobs):
                text = await _run(job)
                choices.append(
                    {
                        "index": index,
                        "text": text,
                        "logprobs": None,
                        "finish_reason": job.stream.finish_reason,
                    }
                )
                usage = {key: usage[key] + value for key, value in job.usage.items()}
        return {
            "id": ident,
            "object": "text_completion",
            "created": now(),
            "model": config.model_name,
            "choices": choices,
            "usage": usage,
        }

    @app.post("/v1/chat/completions", dependencies=[Depends(_authorize)], response_model=None)
    async def chat(body: ChatRequest) -> dict[str, Any] | Response:
        sampling = body.sampling(config.default_tokens, config.max_tokens)
        prompt = encode_chat(tokenizer, body.chat_messages(), add_generation_prompt=True)
        job = _job(prompt, sampling, chat_stops)
        ident = new_id("chatcmpl")
        if body.stream:
            return _sse(_stream(job, ident, "chat.completion.chunk", body.include_usage))
        async with lock:
            text = await _run(job)
        message = {"role": "assistant", "content": text}
        choice = {"index": 0, "message": message, "finish_reason": job.stream.finish_reason}
        return {
            "id": ident,
            "object": "chat.completion",
            "created": now(),
            "model": config.model_name,
            "choices": [choice],
            "usage": job.usage,
        }

    async def _stream(job: _Job, ident: str, kind: str, include_usage: bool) -> AsyncIterator[str]:
        chat_mode = kind == "chat.completion.chunk"

        def chunk(choice: dict[str, Any] | None, usage: dict[str, int] | None = None) -> str:
            data = {
                "id": ident,
                "object": kind,
                "created": now(),
                "model": config.model_name,
                "choices": [choice] if choice else [],
            }
            if usage is not None:
                data["usage"] = usage
            return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

        def piece_choice(
            text: str | None, finish: str | None, role: bool = False
        ) -> dict[str, Any]:
            if not chat_mode:
                return {"index": 0, "text": text or "", "logprobs": None, "finish_reason": finish}
            delta: dict[str, Any] = {"role": "assistant"} if role else {}
            if text is not None:
                delta["content"] = text
            return {"index": 0, "delta": delta, "finish_reason": finish}

        async with lock:
            if chat_mode:
                yield chunk(piece_choice("", None, role=True))
            while (piece := await anyio.to_thread.run_sync(job.next_piece)) is not None:
                yield chunk(piece_choice(piece, None))
            yield chunk(piece_choice(None, job.stream.finish_reason))
            if include_usage:
                yield chunk(None, job.usage)
            yield "data: [DONE]\n\n"

    @app.get("/", response_model=None)
    async def page() -> FileResponse:
        return FileResponse(WEB / "deneme.html", media_type="text/html; charset=utf-8")

    @app.get("/sozluk.json", response_model=None)
    async def dictionary() -> FileResponse:
        return FileResponse(WEB / "tr.json", media_type="application/json")

    return app


class _Unauthorized(Exception):
    """Anahtar denetimi başarısız (401'e çevrilir)."""


def _sse(events: AsyncIterator[str]) -> StreamingResponse:
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(events, media_type="text/event-stream", headers=headers)
