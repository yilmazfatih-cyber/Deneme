"""Sunucunun istek şemaları (OpenAI API alt kümesi) ve yanıt yardımcıları.

Bilinmeyen alanlar yok sayılır (OpenAI istemcileri çok alan gönderir); desteklenmeyen ama
anlamı değiştiren seçenekler (n > 1, araç çağrısı) açık bir 400 hatasıyla reddedilir.
`top_k` ve `repetition_penalty` OpenAI'de yoktur; vLLM gibi sunucularla aynı adla eklendi.

Genişletme: Yeni bir istek alanı için buraya varsayılanıyla ekleyin ve `sampling()` içinde
`SamplingConfig`e taşıyın; tests/test_serve.py'ye bir istek örneği ekleyin.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .chat import ChatMessage
from .sampling import SamplingConfig


class SamplingFields(BaseModel):
    model_config = ConfigDict(extra="ignore")

    model: str | None = None
    max_tokens: int | None = Field(default=None, ge=1)
    max_completion_tokens: int | None = Field(default=None, ge=1)
    temperature: float = Field(default=0.8, ge=0.0, le=5.0)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    top_k: int = Field(default=0, ge=0)
    repetition_penalty: float = Field(default=1.0, gt=0.0, le=10.0)
    stop: str | list[str] | None = None
    stream: bool = False
    stream_options: dict[str, Any] | None = None
    seed: int | None = None
    n: int = Field(default=1, ge=1, le=1, description="yalnız 1 desteklenir")

    @field_validator("stop")
    @classmethod
    def _stop_list(cls, value: str | list[str] | None) -> str | list[str] | None:
        items = [value] if isinstance(value, str) else value or []
        if len(items) > 4 or any(not item for item in items):
            raise ValueError("stop en çok 4 boş olmayan yazı olabilir")
        return value

    def sampling(self, default_tokens: int, limit: int) -> SamplingConfig:
        """İstekten üretim ayarı; belirteç sayısı sunucu sınırına kırpılır."""
        wanted = self.max_completion_tokens or self.max_tokens or default_tokens
        stops = [self.stop] if isinstance(self.stop, str) else list(self.stop or [])
        return SamplingConfig(
            max_new_tokens=min(wanted, limit),
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            repetition_penalty=self.repetition_penalty,
            stop=tuple(stops),
            seed=self.seed,
        )

    @property
    def include_usage(self) -> bool:
        return bool(self.stream_options and self.stream_options.get("include_usage"))


class CompletionRequest(SamplingFields):
    prompt: str | list[str]

    @field_validator("prompt")
    @classmethod
    def _prompt_list(cls, value: str | list[str]) -> str | list[str]:
        if isinstance(value, list) and not 1 <= len(value) <= 8:
            raise ValueError("prompt listesi 1 ile 8 öğe arasında olmalı")
        return value

    @property
    def prompts(self) -> list[str]:
        return [self.prompt] if isinstance(self.prompt, str) else list(self.prompt)


class ContentPart(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: Literal["text"]
    text: str


class IncomingMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["system", "developer", "user", "assistant"]
    content: str | list[ContentPart] | None = ""

    def to_chat(self) -> ChatMessage:
        text = (
            self.content
            if isinstance(self.content, str)
            else "".join(p.text for p in self.content or [])
        )
        role = "system" if self.role == "developer" else self.role
        return ChatMessage(role=role, content=text)


class ChatRequest(SamplingFields):
    messages: list[IncomingMessage] = Field(min_length=1)
    tools: list[Any] | None = None

    @field_validator("tools")
    @classmethod
    def _no_tools(cls, value: list[Any] | None) -> list[Any] | None:
        if value:
            raise ValueError("araç çağrısı (tools) desteklenmiyor")
        return value

    def chat_messages(self) -> list[ChatMessage]:
        messages = [m.to_chat() for m in self.messages]
        system = [m for m in messages if m.role == "system"]
        rest = [m for m in messages if m.role != "system"]
        if len(system) > 1:  # birden çok sistem iletisi tek iletide birleşir
            system = [ChatMessage(role="system", content="\n\n".join(m.content for m in system))]
        return system + rest


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:24]}"


def now() -> int:
    return int(time.time())


def error_body(message: str, kind: str = "invalid_request_error") -> dict[str, Any]:
    """OpenAI hata biçimi."""
    return {"error": {"message": message, "type": kind, "param": None, "code": None}}
