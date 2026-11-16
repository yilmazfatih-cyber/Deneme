"""Öğretmen model istemcisi: OpenAI uyumlu `/chat/completions` uç noktasına istek atar.

Kim kullanır: `synth/pipeline.py`. Ollama, vLLM, llama.cpp sunucusu ve LM Studio bu biçimi konuşur.

- Yanıt Pydantic ile doğrulanır (sınırda doğrulama); beklenmeyen biçim anlaşılır hata verir.
- 429 ve 5xx yanıtlarında ve bağlantı hatalarında artan beklemeyle yeniden dener.
- `seed` parametresi gönderilir; sunucular bunu destekler ama **bit düzeyinde aynı çıktıyı
  garanti etmez** (donanım ve sürüm farkı). Yeniden üretilebilirlik için tohum + istem sürümü
  her satıra yazılır.
- Testler gerçek ağ yerine `transport` parametresiyle sahte bir uç nokta verir.

Genişletme: akış (stream) gerekirse ayrı bir yöntem ekleyin; bu sınıf tek seferlik yanıt içindir.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from ince_ayar.errors import UserError
from ince_ayar.messages import t

RETRY_STATUS = frozenset({408, 429, 500, 502, 503, 504})


class _Message(BaseModel):
    content: str | None = None


class _Choice(BaseModel):
    message: _Message


class CompletionResponse(BaseModel):
    choices: list[_Choice] = Field(min_length=1)


class TeacherClient:
    def __init__(
        self,
        endpoint: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 120.0,
        retries: int = 3,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.retries = retries
        self._sleep = sleep
        self._client = httpx.Client(timeout=timeout, headers=headers, transport=transport)

    def __enter__(self) -> TeacherClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def payload(
        self, messages: list[dict[str, str]], temperature: float, max_tokens: int, seed: int
    ) -> dict[str, Any]:
        """Gönderilecek istek gövdesi (testler ve kayıt için ayrı tutulur)."""
        return {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "seed": seed,
            "stream": False,
        }

    def complete(
        self, messages: list[dict[str, str]], temperature: float, max_tokens: int, seed: int
    ) -> str:
        """Tek bir yanıt metni döndürür; kalıcı hatada `UserError` yükseltir."""
        body = self.payload(messages, temperature, max_tokens, seed)
        url = f"{self.endpoint}/chat/completions"
        last_problem = ""
        for attempt in range(self.retries + 1):
            if attempt:
                self._sleep(min(2.0**attempt, 30.0))
            try:
                response = self._client.post(url, json=body)
            except httpx.TransportError as exc:
                last_problem = f"{type(exc).__name__}: {exc}"
                continue
            if response.status_code in RETRY_STATUS:
                last_problem = f"HTTP {response.status_code}"
                continue
            if response.status_code >= 400:
                raise UserError(
                    t("uret.istek_reddedildi", kod=response.status_code, govde=response.text[:300])
                )
            try:
                parsed = CompletionResponse.model_validate(response.json())
            except (ValidationError, ValueError) as exc:
                raise UserError(t("uret.yanit_bicimi", ayrinti=str(exc)[:300])) from exc
            return parsed.choices[0].message.content or ""
        raise UserError(
            t("uret.ulasilamadi", adres=url, deneme=self.retries + 1, sorun=last_problem)
        )
