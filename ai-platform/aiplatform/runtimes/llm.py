"""OpenAI uyumlu LLM istemcisi (llama-server, vLLM, Ollama veya platformun kendi /v1 geçidi).

- `chat(...)` → `LLMResult(content, tool_calls, usage, model, raw, parsed)`.
- JSON şema zorlaması üç kademeli: `response_format=json_schema` → (400/422 ise) `json_object` + istemde şema →
  (yine 400/422 ise) düz üretim + ilk JSON bloğunu ayrıştırma.
- Görseller son kullanıcı mesajına `image_url` (data: URI) olarak eklenir.
- İstemci rolünde (`AIP_ROLE=client`) önce sunucunun `/v1` geçidi denenir, ulaşılamazsa yerel LLM'e düşülür.
  Sunucuya giden mesajlar `mask_before_server` açıksa maskelenir, yanıt geri açılır (eşleme yalnız bellekte).
- Model seçimi: `select_model(kurulu_idler)` → `settings.llm_model_priority` sırasıyla ilk kurulu olan.
"""

from __future__ import annotations

import base64
import copy
import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import get_settings
from ..modules.base import ModuleError, ModuleNotReady

log = logging.getLogger("aiplatform.llm")

NO_LLM_MESSAGE = "Ana model kurulu değil; önce 'ana-model' veya 'yazma-asistani' modülünü kurun"
_DEFAULT_BASE = "http://127.0.0.1:8001/v1"
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)


@dataclass
class LLMResult:
    content: str
    tool_calls: list[dict] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    model: str | None = None
    raw: dict | None = None
    parsed: Any = None  # json_schema verildiyse ayrıştırılmış JSON
    masked_entities: int = 0
    endpoint: str = "yerel"  # "sunucu" | "yerel"
    json_mode: str | None = None  # json_schema | json_object | prompt


@dataclass(frozen=True)
class _Endpoint:
    name: str  # "sunucu" | "yerel"
    base: str
    is_server: bool = False


class _Unreachable(Exception):
    pass


# ----------------------------------------------------------------------------- yardımcılar


def extract_json(text: str) -> Any:
    """Metindeki ilk geçerli JSON nesnesini/dizisini döner; yoksa None."""
    if not text:
        return None
    text = _THINK_RE.sub("", text).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidates = [fence.group(1).strip()] if fence else []
    candidates.append(text)
    dec = json.JSONDecoder()
    for cand in candidates:
        try:
            return json.loads(cand)
        except (json.JSONDecodeError, ValueError):
            pass
        for i, ch in enumerate(cand):
            if ch in "{[":
                try:
                    obj, _ = dec.raw_decode(cand[i:])
                    return obj
                except json.JSONDecodeError:
                    continue
    return None


def _image_mime(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def attach_images(messages: list[dict], images: list[bytes] | None) -> list[dict]:
    if not images:
        return messages
    msgs = copy.deepcopy(messages)
    idx = next((i for i in range(len(msgs) - 1, -1, -1) if msgs[i].get("role") == "user"), None)
    if idx is None:
        msgs.append({"role": "user", "content": ""})
        idx = len(msgs) - 1
    content = msgs[idx].get("content") or ""
    parts = content if isinstance(content, list) else [{"type": "text", "text": content}]
    for img in images:
        b64 = base64.b64encode(img).decode("ascii")
        parts.append({"type": "image_url", "image_url": {"url": f"data:{_image_mime(img)};base64,{b64}"}})
    msgs[idx]["content"] = parts
    return msgs


def _normalize_schema(json_schema: dict) -> tuple[str, dict]:
    if "schema" in json_schema and "type" not in json_schema:
        return json_schema.get("name", "yanit"), json_schema["schema"]
    return str(json_schema.get("title", "yanit")).replace(" ", "_")[:60] or "yanit", json_schema


def _with_schema_instruction(messages: list[dict], schema: dict) -> list[dict]:
    msgs = copy.deepcopy(messages)
    instr = (
        "Yanıtını YALNIZCA aşağıdaki JSON şemasına uyan tek bir JSON nesnesi olarak ver; "
        "açıklama, markdown veya ek metin yazma.\nJSON şeması:\n" + json.dumps(schema, ensure_ascii=False)
    )
    if msgs and msgs[0].get("role") == "system" and isinstance(msgs[0].get("content"), str):
        msgs[0]["content"] = msgs[0]["content"] + "\n\n" + instr
    else:
        msgs.insert(0, {"role": "system", "content": instr})
    return msgs


def _parse_tool_calls(message: dict) -> list[dict]:
    out = []
    for tc in message.get("tool_calls") or []:
        fn = tc.get("function") or {}
        args_raw = fn.get("arguments")
        if isinstance(args_raw, dict):
            args = args_raw
        else:
            try:
                args = json.loads(args_raw or "{}")
            except (json.JSONDecodeError, TypeError):
                args = {"_raw": args_raw}
        out.append({"id": tc.get("id"), "name": fn.get("name"), "arguments": args})
    return out


def _engine_info() -> dict:
    p = get_settings().data_dir / "llm_engine.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # pragma: no cover
        log.warning("llm_engine.json okunamadı: %s", e)
        return {}


def _installed_pairs_raw() -> list | None:
    """Kurulum motorundan (model_id, artifact_id) çiftleri; yoksa `installed_models` tablosu; o da yoksa None."""
    try:
        from ..installer.installer import installed_pairs  # type: ignore[import-not-found]
    except Exception:
        installed_pairs = None
    if installed_pairs is not None:
        try:
            return list(installed_pairs() or [])
        except Exception as e:  # pragma: no cover
            log.warning("installed_pairs() başarısız: %s", e)
    try:
        from sqlalchemy import select

        from ..db import session_scope
        from ..installer.models import InstalledModel  # type: ignore[import-not-found]

        with session_scope() as s:
            return [(m.model_id, m.artifact_id) for m in s.scalars(select(InstalledModel))]
    except Exception:
        return None


def installed_llm_ids() -> list[str] | None:
    """Kurulu sohbet (chat) modellerinin katalog id'leri; kurulum bilgisi hiç yoksa None."""
    pairs = _installed_pairs_raw()
    if pairs is None:
        return None
    ids: list[str] = []
    for p in pairs:
        if isinstance(p, (tuple, list)) and p:
            mid = p[0]
        elif isinstance(p, dict):
            mid = p.get("model_id")
        else:
            mid = getattr(p, "model_id", None)
        if mid and mid not in ids:
            ids.append(str(mid))
    try:
        from ..catalog import get_catalog

        models = get_catalog().models
        ids = [i for i in ids if i in models and "chat" in models[i].capabilities]
    except Exception:  # pragma: no cover
        pass
    return ids


def select_model(installed_model_ids: list[str] | set[str]) -> str:
    installed = set(installed_model_ids)
    for mid in get_settings().llm_model_priority:
        if mid in installed:
            return mid
    raise ModuleNotReady(NO_LLM_MESSAGE)


def served_name(catalog_id: str) -> str:
    """Katalog id'sini motorun beklediği model adına çevirir (bilinmiyorsa aynen)."""
    info = _engine_info()
    models = info.get("models")
    if isinstance(models, dict) and catalog_id in models:
        return str(models[catalog_id])
    if info.get("model_id") == catalog_id:
        for key in ("model_name", "served_model", "served_model_name", "model"):
            if info.get(key):
                return str(info[key])
    if info.get("engine") == "ollama":
        try:
            from ..catalog import get_catalog

            spec = get_catalog().models.get(catalog_id)
            for a in spec.artifacts if spec else []:
                if a.ollama_tag:
                    return a.ollama_tag
        except Exception:  # pragma: no cover
            pass
    return catalog_id


# ----------------------------------------------------------------------------- istemci


class LLMClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 300.0,
        use_server: bool | None = None,
    ) -> None:
        self._explicit_base = base_url.rstrip("/") if base_url else None
        self._api_key = api_key
        self._transport = transport
        self._timeout = timeout
        self._use_server = use_server

    # -- uç noktalar
    def endpoints(self) -> list[_Endpoint]:
        s = get_settings()
        if self._explicit_base:
            return [_Endpoint("yerel", self._explicit_base)]
        local = s.llm_base_url.rstrip("/")
        info_base = _engine_info().get("base_url")
        if info_base and local == _DEFAULT_BASE:
            local = str(info_base).rstrip("/")
        eps: list[_Endpoint] = []
        use_server = (
            self._use_server if self._use_server is not None else (s.role == "client" and bool(s.server_url))
        )
        if use_server and s.server_url:
            eps.append(_Endpoint("sunucu", s.server_url.rstrip("/") + "/v1", True))
        eps.append(_Endpoint("yerel", local))
        return eps

    def _client(self) -> httpx.AsyncClient:
        key = self._api_key or get_settings().llm_api_key
        return httpx.AsyncClient(
            timeout=httpx.Timeout(self._timeout, connect=5.0),
            transport=self._transport,
            headers={"Authorization": f"Bearer {key}"},
        )

    async def _request(self, client: httpx.AsyncClient, method: str, url: str, **kw) -> httpx.Response:
        try:
            return await client.request(method, url, **kw)
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            raise _Unreachable(f"{url}: {e}") from e

    # -- modeller
    async def available_models(self) -> list[str]:
        last: Exception | None = None
        async with self._client() as client:
            for ep in self.endpoints():
                try:
                    return await self._models_on(client, ep)
                except _Unreachable as e:
                    last = e
        raise ModuleNotReady(f"LLM sunucusuna ulaşılamadı: {last}")

    async def _models_on(self, client: httpx.AsyncClient, ep: _Endpoint) -> list[str]:
        r = await self._request(client, "GET", f"{ep.base}/models")
        if r.status_code >= 400:
            raise _Unreachable(f"/models {r.status_code}")
        data = r.json()
        return [str(m.get("id")) for m in data.get("data", []) if m.get("id")]

    async def resolve_model(
        self,
        model: str | None = None,
        preferred: list[str] | None = None,
        client: httpx.AsyncClient | None = None,
        ep: _Endpoint | None = None,
    ) -> str:
        """Yerel motor için model adını çözer (katalog id → sunulan ad)."""
        if model and model != "auto":
            return served_name(model)
        installed = installed_llm_ids()
        if installed:
            for p in preferred or []:
                if p in installed:
                    return served_name(p)
            return served_name(select_model(installed))
        info = _engine_info()
        for key in ("model_name", "served_model", "served_model_name", "model"):
            if info.get(key):
                return str(info[key])
        if client is not None and ep is not None:
            try:
                ids = await self._models_on(client, ep)
            except _Unreachable:
                ids = []
            if ids:
                return ids[0]
        raise ModuleNotReady(NO_LLM_MESSAGE)

    async def _model_for(self, client, ep: _Endpoint, model, preferred) -> str:
        if ep.is_server:  # sunucu geçidi katalog id'sini veya "auto"yu kendisi çözer
            return model or (preferred[0] if preferred else "auto")
        return await self.resolve_model(model, preferred, client, ep)

    # -- sohbet
    async def chat(
        self,
        messages: list[dict],
        *,
        json_schema: dict | None = None,
        tools: list[dict] | None = None,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        model: str | None = None,
        images: list[bytes] | None = None,
        preferred: list[str] | None = None,
        extra: dict | None = None,
    ) -> LLMResult:
        msgs = attach_images(messages, images)
        last: Exception | None = None
        async with self._client() as client:
            for ep in self.endpoints():
                try:
                    return await self._chat_on(
                        client, ep, msgs, json_schema, tools, temperature, max_tokens, model, preferred, extra
                    )
                except _Unreachable as e:
                    log.warning("LLM uç noktasına ulaşılamadı (%s): %s", ep.name, e)
                    last = e
        raise ModuleNotReady(f"LLM sunucusuna ulaşılamadı ({last}). {NO_LLM_MESSAGE}")

    async def _chat_on(
        self, client, ep, msgs, json_schema, tools, temperature, max_tokens, model, preferred, extra
    ):
        from ..kvkk.mask import Masker, mask_structure, unmask_with

        model_name = await self._model_for(client, ep, model, preferred)
        masker = None
        if ep.is_server and get_settings().mask_before_server:
            masker = Masker()
            msgs = mask_structure(msgs, masker)

        body: dict[str, Any] = dict(extra or {})
        body.update({"model": model_name, "messages": msgs, "temperature": temperature})
        if max_tokens:
            body["max_tokens"] = max_tokens
        if tools:
            body["tools"] = tools
            body.setdefault("tool_choice", "auto")
        body.pop("stream", None)

        json_mode = None
        if json_schema:
            name, schema = _normalize_schema(json_schema)
            attempts = [
                (
                    "json_schema",
                    msgs,
                    {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}},
                ),
                ("json_object", _with_schema_instruction(msgs, schema), {"type": "json_object"}),
                ("prompt", _with_schema_instruction(msgs, schema), None),
            ]
            resp = None
            for mode, m, rf in attempts:
                b = dict(body, messages=m)
                if rf is None:
                    b.pop("response_format", None)
                else:
                    b["response_format"] = rf
                resp = await self._request(client, "POST", f"{ep.base}/chat/completions", json=b)
                if resp.status_code in (400, 422) and mode != "prompt":
                    log.info(
                        "response_format=%s desteklenmedi (%s), bir sonraki kademe deneniyor",
                        mode,
                        resp.status_code,
                    )
                    continue
                json_mode = mode
                break
        else:
            resp = await self._request(client, "POST", f"{ep.base}/chat/completions", json=body)
        self._raise_for_status(resp)

        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = _THINK_RE.sub("", message.get("content") or "").strip()
        tool_calls = _parse_tool_calls(message)
        if masker is not None and masker.placeholders:
            content = unmask_with(content, masker.placeholders)
            for tc in tool_calls:
                tc["arguments"] = json.loads(
                    unmask_with(json.dumps(tc["arguments"], ensure_ascii=False), masker.placeholders)
                )
            message["content"] = content
            for tc in message.get("tool_calls") or []:
                fn = tc.get("function") or {}
                if isinstance(fn.get("arguments"), str):
                    fn["arguments"] = unmask_with(fn["arguments"], masker.placeholders)

        result = LLMResult(
            content=content,
            tool_calls=tool_calls,
            usage=data.get("usage") or {},
            model=data.get("model") or model_name,
            raw=data,
            masked_entities=masker.count if masker else 0,
            endpoint=ep.name,
            json_mode=json_mode,
        )
        if json_schema:
            parsed = extract_json(content)
            if parsed is None:
                raise ModuleError("Model geçerli JSON üretmedi; isteği sadeleştirip yeniden deneyin.")
            result.parsed = parsed
        return result

    @staticmethod
    def _raise_for_status(resp: httpx.Response) -> None:
        if resp.status_code < 400:
            return
        detail = resp.text[:300]
        if resp.status_code in (404, 503):
            raise ModuleNotReady(f"LLM modeli hazır değil ({resp.status_code}): {detail}")
        if resp.status_code >= 500:
            raise ModuleNotReady(f"LLM sunucusu hata döndü ({resp.status_code}): {detail}")
        raise ModuleError(f"LLM isteği reddedildi ({resp.status_code}): {detail}")

    # -- akış
    async def stream_chat(
        self,
        messages: list[dict],
        *,
        tools: list[dict] | None = None,
        temperature: float = 0.2,
        max_tokens: int | None = None,
        model: str | None = None,
        images: list[bytes] | None = None,
        preferred: list[str] | None = None,
        extra: dict | None = None,
        stats: dict | None = None,
    ) -> AsyncIterator[str]:
        """SSE satırlarını (`data: {...}` / `data: [DONE]`) sırayla verir.

        `stats` sözlüğü verilirse `model`, `masked_entities`, `endpoint` alanları doldurulur.
        """
        from ..kvkk.mask import Masker, StreamUnmasker, mask_structure

        msgs = attach_images(messages, images)
        last: Exception | None = None
        async with self._client() as client:
            for ep in self.endpoints():
                model_name = await self._model_for(client, ep, model, preferred)
                masker = None
                send = msgs
                if ep.is_server and get_settings().mask_before_server:
                    masker = Masker()
                    send = mask_structure(msgs, masker)
                body: dict[str, Any] = dict(extra or {})
                body.update(
                    {"model": model_name, "messages": send, "temperature": temperature, "stream": True}
                )
                if max_tokens:
                    body["max_tokens"] = max_tokens
                if tools:
                    body["tools"] = tools
                if stats is not None:
                    stats.update(
                        {
                            "model": model_name,
                            "masked_entities": masker.count if masker else 0,
                            "endpoint": ep.name,
                        }
                    )
                try:
                    req = client.build_request("POST", f"{ep.base}/chat/completions", json=body)
                    resp = await client.send(req, stream=True)
                except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                    last = e
                    continue
                try:
                    if resp.status_code >= 400:
                        await resp.aread()
                        self._raise_for_status(resp)
                    unmaskers: dict[int, StreamUnmasker] = {}
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if masker is None or not masker.placeholders or not line.startswith("data:"):
                            yield line
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            for idx, um in unmaskers.items():
                                rest = um.flush()
                                if rest:
                                    yield "data: " + json.dumps(
                                        {
                                            "object": "chat.completion.chunk",
                                            "model": model_name,
                                            "choices": [
                                                {
                                                    "index": idx,
                                                    "delta": {"content": rest},
                                                    "finish_reason": None,
                                                }
                                            ],
                                        },
                                        ensure_ascii=False,
                                    )
                            yield line
                            continue
                        try:
                            chunk = json.loads(payload)
                        except json.JSONDecodeError:
                            yield line
                            continue
                        for ch in chunk.get("choices") or []:
                            delta = ch.get("delta") or {}
                            if isinstance(delta.get("content"), str):
                                um = unmaskers.setdefault(
                                    ch.get("index", 0), StreamUnmasker(masker.placeholders)
                                )
                                delta["content"] = um.feed(delta["content"])
                        yield "data: " + json.dumps(chunk, ensure_ascii=False)
                    return
                finally:
                    await resp.aclose()
        raise ModuleNotReady(f"LLM sunucusuna ulaşılamadı ({last}). {NO_LLM_MESSAGE}")

    # -- gömme (kolaylık)
    async def embed(self, texts: list[str], model_id: str | None = None) -> list[list[float]]:
        from .embeddings import embed as _embed

        return (await _embed(texts, model_id)).tolist()


__all__ = [
    "NO_LLM_MESSAGE",
    "LLMClient",
    "LLMResult",
    "attach_images",
    "extract_json",
    "installed_llm_ids",
    "select_model",
    "served_name",
]
