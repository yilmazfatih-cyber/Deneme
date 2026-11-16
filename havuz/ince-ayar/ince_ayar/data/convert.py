"""Başka sohbet veri biçimlerini bu temelin biçimine (`{"messages": [...]}`) çevirir.

Kim kullanır: `python -m ince_ayar veri donustur`.

Desteklenen biçimler:
- `alpaca`           : {"instruction", "input"?, "output", "system"?}
- `sharegpt`         : {"conversations": [{"from": "human"|"gpt"|"system", "value": "…"}]}
- `istem-tamamlama`  : {"prompt": "…", "completion": "…"} ya da TRL'nin ileti listeli biçimi

Çeviri satırı doğrulamaz; çıktı her zaman `sohbet dogrula` ile denetlenmelidir.

Genişletme: yeni biçim için `row -> messages` işlevi yazıp `CONVERTERS` sözlüğüne ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ince_ayar.errors import UserError
from ince_ayar.messages import t

Messages = list[dict[str, str]]
SHAREGPT_ROLES = {
    "human": "user",
    "user": "user",
    "gpt": "assistant",
    "assistant": "assistant",
    "system": "system",
}


def from_alpaca(row: dict[str, Any]) -> Messages:
    instruction = str(row.get("instruction", "")).strip()
    extra = str(row.get("input", "") or "").strip()
    messages: Messages = []
    if str(row.get("system", "") or "").strip():
        messages.append({"role": "system", "content": str(row["system"]).strip()})
    user = f"{instruction}\n\n{extra}" if extra else instruction
    messages.append({"role": "user", "content": user})
    messages.append({"role": "assistant", "content": str(row.get("output", "")).strip()})
    return messages


def from_sharegpt(row: dict[str, Any]) -> Messages:
    turns = row.get("conversations")
    if not isinstance(turns, list):
        raise UserError(t("donustur.alan_yok", alan="conversations"))
    messages: Messages = []
    for turn in turns:
        role = SHAREGPT_ROLES.get(str(turn.get("from", "")))
        if role is None:
            raise UserError(t("donustur.rol_bilinmiyor", rol=turn.get("from")))
        messages.append({"role": role, "content": str(turn.get("value", "")).strip()})
    return messages


def from_prompt_completion(row: dict[str, Any]) -> Messages:
    prompt, completion = row.get("prompt"), row.get("completion")
    if isinstance(prompt, list) and isinstance(completion, list):
        return [{"role": m["role"], "content": m["content"]} for m in [*prompt, *completion]]
    if isinstance(prompt, str) and isinstance(completion, str):
        return [
            {"role": "user", "content": prompt.strip()},
            {"role": "assistant", "content": completion.strip()},
        ]
    raise UserError(t("donustur.alan_yok", alan="prompt/completion"))


CONVERTERS: dict[str, Callable[[dict[str, Any]], Messages]] = {
    "alpaca": from_alpaca,
    "sharegpt": from_sharegpt,
    "istem-tamamlama": from_prompt_completion,
    # YENİ BİÇİM BURAYA
}
