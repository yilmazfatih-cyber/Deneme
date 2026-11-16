"""OpenAI uyumlu sunucu: ağsız (httpx ASGI aktarımı) uç uca istekler."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
import torch
from fastapi import FastAPI

from dil_modeli.config import ModelConfig
from dil_modeli.generate import generate_ids
from dil_modeli.model import LanguageModel
from dil_modeli.sampling import SamplingConfig
from dil_modeli.serve import ServerSettings, create_app
from dil_modeli.tokenizer import BPETokenizer


@pytest.fixture(scope="module")
def model(tokenizer: BPETokenizer) -> LanguageModel:
    torch.manual_seed(0)
    config = ModelConfig(
        vocab_size=tokenizer.vocab_size, dim=32, n_layer=2, n_head=2, max_seq_len=64
    )
    return LanguageModel(config).eval()


def _request(app: FastAPI, method: str, url: str, **kwargs: Any) -> httpx.Response:
    async def call() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, url, **kwargs)

    return asyncio.run(call())


def _events(response: httpx.Response) -> list[Any]:
    lines = [line.removeprefix("data: ") for line in response.text.split("\n\n") if line]
    assert lines[-1] == "[DONE]"
    return [json.loads(line) for line in lines[:-1]]


def test_models(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer, ServerSettings(model_name="deneme"))
    response = _request(app, "GET", "/v1/models")
    assert response.status_code == 200
    assert response.json()["data"][0]["id"] == "deneme"


def test_completion_matches_local_generation(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer)
    body = {
        "model": "x",
        "prompt": "Korkma",
        "max_tokens": 12,
        "temperature": 0,
        "user": "yok sayılır",
    }
    response = _request(app, "POST", "/v1/completions", json=body)
    assert response.status_code == 200, response.text
    data = response.json()
    prompt = [tokenizer.bos_id, *tokenizer.encode("Korkma")]
    tokens = list(generate_ids(model, prompt, SamplingConfig(12, 0.0), stop_ids={tokenizer.eos_id}))
    assert data["choices"][0]["text"] == tokenizer.decode(tokens)
    assert data["usage"] == {
        "prompt_tokens": len(prompt),
        "completion_tokens": len(tokens),
        "total_tokens": len(prompt) + len(tokens),
    }
    assert data["object"] == "text_completion"
    assert data["choices"][0]["finish_reason"] in ("stop", "length")
    many = _request(app, "POST", "/v1/completions", json={**body, "prompt": ["a", "b"]}).json()
    assert [c["index"] for c in many["choices"]] == [0, 1]


def test_streaming_completion_concatenates_to_full_text(
    model: LanguageModel, tokenizer: BPETokenizer
) -> None:
    app = create_app(model, tokenizer)
    body = {"prompt": "Korkma", "max_tokens": 12, "temperature": 0}
    full = _request(app, "POST", "/v1/completions", json=body).json()["choices"][0]["text"]
    response = _request(app, "POST", "/v1/completions", json={**body, "stream": True})
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _events(response)
    assert "".join(e["choices"][0]["text"] for e in events) == full
    assert events[-1]["choices"][0]["finish_reason"] in ("stop", "length")


def test_chat_and_chat_stream(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer)
    messages = [
        {"role": "developer", "content": "Kısa yanıt ver."},
        {"role": "user", "content": [{"type": "text", "text": "Merhaba"}]},
    ]
    body = {"messages": messages, "max_tokens": 10, "temperature": 0}
    data = _request(app, "POST", "/v1/chat/completions", json=body).json()
    assert data["object"] == "chat.completion"
    message = data["choices"][0]["message"]
    assert message["role"] == "assistant"
    stream = _request(
        app,
        "POST",
        "/v1/chat/completions",
        json={**body, "stream": True, "stream_options": {"include_usage": True}},
    )
    events = _events(stream)
    assert events[0]["choices"][0]["delta"]["role"] == "assistant"
    text = "".join(e["choices"][0]["delta"].get("content", "") for e in events if e["choices"])
    assert text == message["content"]
    assert events[-1]["choices"] == []
    assert events[-1]["usage"]["completion_tokens"] == data["usage"]["completion_tokens"]


def test_errors_use_openai_format(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer)
    cases = [
        ("/v1/completions", {"prompt": "a", "temperature": 9}),
        ("/v1/completions", {"prompt": "a", "n": 2}),
        ("/v1/completions", {}),
        ("/v1/chat/completions", {"messages": []}),
        ("/v1/chat/completions", {"messages": [{"role": "tool", "content": "x"}]}),
        (
            "/v1/chat/completions",
            {"messages": [{"role": "user", "content": "x"}], "tools": [{"type": "function"}]},
        ),
        ("/v1/completions", {"prompt": "a", "stop": ["", "x"]}),
    ]
    for url, body in cases:
        response = _request(app, "POST", url, json=body)
        assert response.status_code == 400, (body, response.text)
        assert response.json()["error"]["type"] == "invalid_request_error"
        assert "İstek geçersiz" in response.json()["error"]["message"]


def test_max_tokens_are_capped(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer, ServerSettings(max_tokens=5))
    data = _request(app, "POST", "/v1/completions", json={"prompt": "a", "max_tokens": 500}).json()
    assert data["usage"]["completion_tokens"] <= 5


def test_api_key_and_cors(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(
        model, tokenizer, ServerSettings(api_key="gizli", cors_origins=("http://localhost:5310",))
    )
    assert _request(app, "GET", "/v1/models").status_code == 401
    assert (
        _request(app, "GET", "/v1/models", headers={"Authorization": "Bearer yanlis"}).status_code
        == 401
    )
    ok = _request(
        app,
        "GET",
        "/v1/models",
        headers={"Authorization": "Bearer gizli", "Origin": "http://localhost:5310"},
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5310"
    closed = create_app(model, tokenizer)
    response = _request(closed, "GET", "/v1/models", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers  # varsayılan: CORS kapalı


def test_test_page_and_dictionary(model: LanguageModel, tokenizer: BPETokenizer) -> None:
    app = create_app(model, tokenizer)
    page = _request(app, "GET", "/")
    assert page.status_code == 200
    assert 'lang="tr"' in page.text
    words = _request(app, "GET", "/sozluk.json").json()
    keys = set(__import__("re").findall(r'data-metin="([a-z_]+)"', page.text))
    assert keys <= set(words), keys - set(words)
