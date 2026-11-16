"""Sohbet şablonu ve sohbet verisi: iletiler -> belirteçler (+ yalnız asistana kayıp etiketi).

Şablon (her rol özel bir belirteçtir, içerik sıradan metin olarak kodlanır):
    <|bas|><|sistem|>...<|bitti|><|kullanici|>...<|bitti|><|asistan|>...<|bitti|>
Üretimde istem `<|asistan|>` ile biter; model `<|bitti|>` üretince yanıt tamamdır.
İçerikteki "<|bitti|>" gibi yazılar özel belirtece dönüşmez (enjeksiyon yok). Hugging Face
dışa aktarımı aynı şablonu Jinja olarak yazar (`CHAT_TEMPLATE`, eşlik: tests/test_export_hf.py).

Genişletme: Yeni bir rol (ör. "arac") için `tokenizer.py`deki yedek belirteçlerden birini
adlandırıp `ROLE_TOKENS`a ve `CHAT_TEMPLATE`e ekleyin; tests/test_chat.py'yi genişletin.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from .model import IGNORE_INDEX
from .tokenizer import ASSISTANT, BOS, END_OF_TURN, SYSTEM, USER
from .tokenizer_api import Tokenizer

Role = Literal["system", "user", "assistant"]
ROLE_TOKENS: dict[str, str] = {"system": SYSTEM, "user": USER, "assistant": ASSISTANT}

CHAT_TEMPLATE = (
    "{{ '" + BOS + "' }}"
    "{% for message in messages %}"
    "{% if message['role'] == 'system' %}{{ '" + SYSTEM + "' }}"
    "{% elif message['role'] == 'user' %}{{ '" + USER + "' }}"
    "{% elif message['role'] == 'assistant' %}{{ '" + ASSISTANT + "' }}"
    "{% endif %}"
    "{{ message['content'] }}{{ '" + END_OF_TURN + "' }}"
    "{% endfor %}"
    "{% if add_generation_prompt %}{{ '" + ASSISTANT + "' }}{% endif %}"
)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role
    content: str


class ChatExample(BaseModel):
    """Bir eğitim örneği: `{"messages": [{"role": ..., "content": ...}, ...]}`."""

    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessage] = Field(min_length=1)

    @model_validator(mode="after")
    def _check_roles(self) -> ChatExample:
        if any(m.role == "system" for m in self.messages[1:]):
            raise ValueError("'system' iletisi yalnız ilk sırada olabilir")
        if not any(m.role == "assistant" for m in self.messages):
            raise ValueError("en az bir 'assistant' iletisi olmalı (öğrenilecek yanıt)")
        return self


def encode_chat(
    tokenizer: Tokenizer, messages: Sequence[ChatMessage], *, add_generation_prompt: bool
) -> list[int]:
    """İletileri şablona göre kodlar; `add_generation_prompt` sona `<|asistan|>` ekler."""
    ids = [tokenizer.special_id(BOS)]
    for message in messages:
        ids.append(tokenizer.special_id(ROLE_TOKENS[message.role]))
        ids.extend(tokenizer.encode(message.content))
        ids.append(tokenizer.special_id(END_OF_TURN))
    if add_generation_prompt:
        ids.append(tokenizer.special_id(ASSISTANT))
    return ids


def encode_for_training(
    tokenizer: Tokenizer, messages: Sequence[ChatMessage], max_len: int
) -> tuple[list[int], list[int]] | None:
    """Eğitim çifti (girdi, hedef). Hedef yalnız asistan içeriği ve kapanış `<|bitti|>`te dolu.

    Dizi `max_len`'den uzunsa sondan kırpılır; kırpınca öğrenilecek belirteç kalmazsa None.
    """
    ids = [tokenizer.special_id(BOS)]
    labels = [IGNORE_INDEX]
    for message in messages:
        content = [*tokenizer.encode(message.content), tokenizer.special_id(END_OF_TURN)]
        ids.append(tokenizer.special_id(ROLE_TOKENS[message.role]))
        labels.append(IGNORE_INDEX)
        ids.extend(content)
        labels.extend(content if message.role == "assistant" else [IGNORE_INDEX] * len(content))
    ids, labels = ids[: max_len + 1], labels[: max_len + 1]
    targets = labels[1:]
    if all(label == IGNORE_INDEX for label in targets):
        return None
    return ids[:-1], targets


def load_chat_jsonl(path: str | Path) -> list[ChatExample]:
    """Sohbet verisini okur; hatalı satırı numarasıyla ve nedeniyle bildirir."""
    file = Path(path)
    if not file.is_file():
        raise FileNotFoundError(f"Sohbet verisi bulunamadı: {file}")
    examples: list[ChatExample] = []
    with file.open(encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                examples.append(ChatExample.model_validate(json.loads(line)))
            except json.JSONDecodeError as error:
                raise ValueError(f"{file}:{number} geçerli JSON değil ({error.msg}).") from None
            except ValidationError as error:
                problem = error.errors()[0]
                where = ".".join(str(part) for part in problem["loc"]) or "satır"
                raise ValueError(
                    f"{file}:{number} biçim hatası ({where}: {problem['msg']}). Beklenen: "
                    '{"messages": [{"role": "user", "content": "..."}, '
                    '{"role": "assistant", "content": "..."}]}'
                ) from None
    if not examples:
        raise ValueError(f"{file} içinde hiç sohbet örneği yok.")
    return examples
