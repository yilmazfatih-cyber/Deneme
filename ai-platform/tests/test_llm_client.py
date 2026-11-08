"""LLMClient — httpx.MockTransport ile OpenAI uyumlu sahte sunucu (ağ ve model yok)."""

from __future__ import annotations

import json

import httpx
import pytest

from aiplatform.config import reset_settings
from aiplatform.db import init_db
from aiplatform.kvkk.tckn import generate_valid_tckn
from aiplatform.modules.base import ModuleError, ModuleNotReady
from aiplatform.runtimes.llm import LLMClient, extract_json, select_model

SCHEMA = {"type": "object", "required": ["ozet"], "properties": {"ozet": {"type": "string"}}}


def _completion(content="", tool_calls=None, model="sahte-model"):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {
        "id": "x",
        "object": "chat.completion",
        "model": model,
        "choices": [{"index": 0, "message": msg, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }


class FakeServer:
    """İstekleri kaydeden ve kurala göre yanıt veren sahte OpenAI sunucusu."""

    def __init__(self, reject_formats=(), content='{"ozet": "tamam"}', models=("sahte-model",)):
        self.reject_formats = set(reject_formats)
        self.content = content
        self.models = models
        self.requests: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"object": "list", "data": [{"id": m} for m in self.models]})
        body = json.loads(request.content)
        body["_url"] = str(request.url)
        self.requests.append(body)
        rf = (body.get("response_format") or {}).get("type")
        if rf in self.reject_formats:
            return httpx.Response(400, json={"error": {"message": f"{rf} desteklenmiyor"}})
        return httpx.Response(200, json=_completion(self.content, model=body["model"]))


def client(server, **kw) -> LLMClient:
    return LLMClient(base_url="http://llm.test/v1", transport=httpx.MockTransport(server), **kw)


@pytest.fixture(autouse=True)
def _db(aip_data_dir):
    init_db()


async def test_json_schema_path():
    srv = FakeServer()
    res = await client(srv).chat([{"role": "user", "content": "özetle"}], json_schema=SCHEMA, model="m1")
    assert res.parsed == {"ozet": "tamam"} and res.json_mode == "json_schema"
    rf = srv.requests[0]["response_format"]
    assert rf["type"] == "json_schema" and rf["json_schema"]["schema"] == SCHEMA
    assert res.usage["total_tokens"] == 8 and res.model == "m1"


async def test_json_object_fallback():
    srv = FakeServer(reject_formats={"json_schema"})
    res = await client(srv).chat(
        [{"role": "system", "content": "Sistem"}, {"role": "user", "content": "x"}],
        json_schema=SCHEMA,
        model="m1",
    )
    assert res.json_mode == "json_object" and res.parsed == {"ozet": "tamam"}
    second = srv.requests[1]
    assert second["response_format"] == {"type": "json_object"}
    assert "JSON şeması" in second["messages"][0]["content"] and second["messages"][0]["content"].startswith(
        "Sistem"
    )


async def test_prompt_fallback_extracts_first_json_block():
    srv = FakeServer(
        reject_formats={"json_schema", "json_object"},
        content='<think>düşünüyorum</think>İşte sonuç:\n```json\n{"ozet": "blok"}\n```\nBaşka metin {"x": 1}',
    )
    res = await client(srv).chat([{"role": "user", "content": "x"}], json_schema=SCHEMA, model="m1")
    assert res.json_mode == "prompt" and res.parsed == {"ozet": "blok"}
    assert "response_format" not in srv.requests[-1]
    assert "<think>" not in res.content


async def test_invalid_json_raises_module_error():
    srv = FakeServer(content="JSON yok burada")
    with pytest.raises(ModuleError):
        await client(srv).chat([{"role": "user", "content": "x"}], json_schema=SCHEMA, model="m1")


async def test_model_resolved_from_v1_models():
    srv = FakeServer(content="merhaba", models=("llama-yerel",))
    res = await client(srv).chat([{"role": "user", "content": "selam"}])
    assert srv.requests[0]["model"] == "llama-yerel" and res.content == "merhaba"


async def test_model_from_engine_state(aip_data_dir):
    (aip_data_dir / "llm_engine.json").write_text(
        json.dumps(
            {
                "engine": "llamacpp",
                "base_url": "http://127.0.0.1:8001/v1",
                "model_name": "qwen-sunulan",
                "model_id": "qwen3.5-4b",
            }
        )
    )
    srv = FakeServer(content="ok")
    await client(srv).chat([{"role": "user", "content": "x"}])
    assert srv.requests[0]["model"] == "qwen-sunulan"
    await client(srv).chat([{"role": "user", "content": "x"}], model="qwen3.5-4b")
    assert srv.requests[1]["model"] == "qwen-sunulan"


async def test_images_attached_as_data_uri():
    srv = FakeServer(content="bir fatura")
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    await client(srv).chat([{"role": "user", "content": "Bu nedir?"}], images=[png], model="m1")
    parts = srv.requests[0]["messages"][-1]["content"]
    assert parts[0] == {"type": "text", "text": "Bu nedir?"}
    assert parts[1]["type"] == "image_url" and parts[1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )


async def test_tool_calls_parsed():
    def handler(request):
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "m"}]})
        return httpx.Response(
            200,
            json=_completion(
                "",
                tool_calls=[
                    {
                        "id": "c1",
                        "type": "function",
                        "function": {"name": "npv_irr", "arguments": '{"rate": 0.1}'},
                    }
                ],
            ),
        )

    res = await client(handler).chat(
        [{"role": "user", "content": "x"}], tools=[{"type": "function", "function": {"name": "npv_irr"}}]
    )
    assert res.tool_calls == [{"id": "c1", "name": "npv_irr", "arguments": {"rate": 0.1}}]


async def test_unreachable_server_is_not_ready():
    def handler(request):
        raise httpx.ConnectError("bağlantı reddedildi", request=request)

    with pytest.raises(ModuleNotReady):
        await client(handler).chat([{"role": "user", "content": "x"}], model="m1")


async def test_http_errors_mapped():
    with pytest.raises(ModuleNotReady):
        await client(lambda r: httpx.Response(503, text="yükleniyor")).chat(
            [{"role": "user", "content": "x"}], model="m"
        )
    with pytest.raises(ModuleError):
        await client(lambda r: httpx.Response(401, text="yetkisiz")).chat(
            [{"role": "user", "content": "x"}], model="m"
        )


def test_select_model_priority():
    assert select_model({"qwen3.5-4b", "qwen3.5-9b"}) == "qwen3.5-9b"
    assert select_model(["qwen3.5-0.8b"]) == "qwen3.5-0.8b"
    with pytest.raises(ModuleNotReady, match="Ana model kurulu değil"):
        select_model({"bge-m3"})


def test_extract_json_variants():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json("önce [1, 2] sonra") == [1, 2]
    assert extract_json("yok") is None


async def test_client_role_masks_before_server(monkeypatch):
    """İstemci rolünde sunucu /v1'e giden mesaj maskelenir, yanıt geri açılır; sunucu yoksa yerele düşer."""
    monkeypatch.setenv("AIP_ROLE", "client")
    monkeypatch.setenv("AIP_SERVER_URL", "http://sunucu.test:8080")
    monkeypatch.setenv("AIP_LLM_BASE_URL", "http://yerel.test/v1")
    reset_settings()
    tckn = generate_valid_tckn(9)
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append((request.url.host, body))
        text = body["messages"][-1]["content"]
        return httpx.Response(200, json=_completion(f"Kayıt: {text.split()[-1]}", model=body["model"]))

    res = await LLMClient(transport=httpx.MockTransport(handler)).chat(
        [{"role": "user", "content": f"TCKN {tckn}"}]
    )
    host, body = seen[0]
    assert host == "sunucu.test" and tckn not in json.dumps(body)
    assert body["messages"][-1]["content"] == "TCKN <TCKN_1>" and body["model"] == "auto"
    assert res.content == f"Kayıt: {tckn}" and res.masked_entities == 1 and res.endpoint == "sunucu"

    def failing_server(request):
        if request.url.host == "sunucu.test":
            raise httpx.ConnectError("yok", request=request)
        return handler(request)

    seen.clear()
    res = await LLMClient(transport=httpx.MockTransport(failing_server)).chat(
        [{"role": "user", "content": f"TCKN {tckn}"}], model="yerel-model"
    )
    assert seen[0][0] == "yerel.test" and tckn in json.dumps(seen[0][1])  # yerel LLM: veri makineden çıkmaz
    assert res.endpoint == "yerel" and res.masked_entities == 0


async def test_stream_chat_lines():
    sse = 'data: {"choices":[{"index":0,"delta":{"content":"Mer"}}]}\n\ndata: {"choices":[{"index":0,"delta":{"content":"haba"}}]}\n\ndata: [DONE]\n\n'

    def handler(request):
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, text=sse, headers={"content-type": "text/event-stream"})

    stats: dict = {}
    lines = [
        ln
        async for ln in client(handler).stream_chat(
            [{"role": "user", "content": "x"}], model="m", stats=stats
        )
    ]
    assert lines[-1] == "data: [DONE]" and len(lines) == 3 and stats["model"] == "m"
