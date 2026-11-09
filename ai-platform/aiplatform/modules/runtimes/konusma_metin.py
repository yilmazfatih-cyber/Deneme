"""N15 Konuşmadan Metne — faster-whisper (CTranslate2). Sunucuda large-v3-turbo, istemcide small."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import (
    BaseRuntime,
    ModuleNotReady,
    RunContext,
    get_file,
    get_settings,
    has_package,
    not_ready,
    note,
)

SERVER_MODEL, CLIENT_MODEL = "whisper-large-v3-turbo", "whisper-small"
_MODELS = LazyRegistry()


def pick_model() -> str:
    order = [SERVER_MODEL, CLIENT_MODEL] if get_settings().role == "server" else [CLIENT_MODEL, SERVER_MODEL]
    for m in order:
        if model_dir(m) is not None:
            return m
    raise ModuleNotReady("Whisper modeli kurulu değil — modül mağazasından 'konusma-metin' kurun")


def transcribe(
    data: bytes, model_id: str, language: str | None
) -> dict:  # pragma: no cover - faster_whisper yok
    from faster_whisper import WhisperModel

    path = model_dir(model_id)
    model = _MODELS.get(str(path), lambda: WhisperModel(str(path), device="auto", compute_type="default"))
    with tempfile.TemporaryDirectory(prefix="aip_asr_") as tmp:
        src = Path(tmp) / "ses"
        src.write_bytes(data)
        segments, info = model.transcribe(str(src), language=language or None, vad_filter=True, beam_size=5)
        segs = [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments
        ]
    return {
        "text": " ".join(s["text"] for s in segs).strip(),
        "segments": segs,
        "duration_s": round(float(getattr(info, "duration", 0.0) or 0.0), 2),
        "language": getattr(info, "language", language),
    }


@register("konusma-metin")
class KonusmaMetin(BaseRuntime):
    requires = ("faster_whisper",)

    async def do_transcribe(self, payload: dict, ctx: RunContext) -> dict:
        data = get_file(payload, ctx, "file")
        if not has_package("faster_whisper"):
            raise not_ready("faster-whisper", "konusma-metin")
        model_id = pick_model()
        res = await asyncio.to_thread(transcribe, data, model_id, payload.get("language") or "tr")
        note(ctx, model=model_id)
        if payload.get("diarize"):
            note(ctx, diarize="konuşmacı ayrımı bu sürümde desteklenmiyor")
        return res
