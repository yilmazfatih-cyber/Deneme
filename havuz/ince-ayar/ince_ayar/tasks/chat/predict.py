"""Sohbet modeliyle yanıt üretir: tek ileti ya da JSONL dosyası.

Kim kullanır: `python -m ince_ayar sohbet tahmin`.
- `--mesaj "…"`: tek kullanıcı iletisine yanıt (isteğe bağlı `--sistem`).
- `--girdi dosya.jsonl --cikti yanitlar.jsonl`: her satırdaki `messages` için yanıt üretir; son
  ileti asistansa o yanıt "beklenen" olarak saklanır ve yerine model yanıtı üretilir.

Genişletme: örnekleme (sıcaklık, top-p) gerekirse `generate_reply` işlevine parametre ekleyin;
varsayılan açgözlü çözümleme sonuçları yeniden üretilebilir kılar.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ince_ayar import console
from ince_ayar.errors import UserError
from ince_ayar.hardware import detect_hardware, limit_threads
from ince_ayar.io_utils import read_rows, write_jsonl
from ince_ayar.messages import t
from ince_ayar.tasks.chat.modeling import generate_reply, load_for_inference, stop_token_ids


def _conversation(message: str, system: str | None) -> list[dict[str, str]]:
    history = [{"role": "system", "content": system}] if system else []
    return [*history, {"role": "user", "content": message}]


def predict_chat(
    model_path: str,
    message: str | None,
    input_path: str | None,
    output_path: str | None,
    system: str | None,
    max_new_tokens: int,
) -> list[dict[str, Any]]:
    """Yanıtları üretir, ekrana (ya da dosyaya) yazar ve satırları döndürür."""
    if not message and not input_path:
        raise UserError(t("tahmin.girdi_yok"))
    limit_threads()
    device = "cuda" if detect_hardware().device == "cuda" else "cpu"
    model, tokenizer = load_for_inference(model_path, device)
    stops = stop_token_ids(tokenizer, model)
    rows: list[dict[str, Any]] = []
    if message:
        reply = generate_reply(
            model, tokenizer, _conversation(message, system), max_new_tokens, stops
        )
        rows.append({"girdi": message, "uretilen": reply})
        console.result(reply)
    if input_path:
        for raw in read_rows(Path(input_path)):
            if raw.data is None or not isinstance(raw.data.get("messages"), list):
                console.warn(t("tahmin.satir_atlandi", satir=raw.line))
                continue
            messages = raw.data["messages"]
            expected = messages[-1]["content"] if messages[-1].get("role") == "assistant" else None
            history = messages[:-1] if expected is not None else messages
            reply = generate_reply(model, tokenizer, history, max_new_tokens, stops)
            rows.append({"satir": raw.line, "beklenen": expected, "uretilen": reply})
        if output_path:
            write_jsonl(Path(output_path), rows)
            console.info(t("tahmin.yazildi", yol=output_path, sayi=len(rows)))
        else:
            for row in rows:
                console.result(f"{row.get('satir', '-')}: {row['uretilen']}")
    return rows
