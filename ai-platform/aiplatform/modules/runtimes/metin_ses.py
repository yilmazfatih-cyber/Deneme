"""N16 Metinden Sese — Piper TTS (tr_TR dfki medium). Python API (`piper` paketi) veya `piper` komutu; WAV base64."""

from __future__ import annotations

import asyncio
import base64
import io
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import BaseRuntime, ModuleError, ModuleNotReady, RunContext, has_package, note, require

VOICE_MODEL = "piper-tr"
MAX_CHARS = 5000
_VOICES = LazyRegistry()


def voice_file() -> Path:
    d = model_dir(VOICE_MODEL)
    if d is None:
        raise ModuleNotReady("Piper Türkçe ses modeli kurulu değil — modül mağazasından 'metin-ses' kurun")
    onnx = sorted(d.rglob("*.onnx"), key=lambda p: (("tr_TR" not in p.name), p.name))
    if not onnx:
        raise ModuleNotReady(f"Piper .onnx ses dosyası bulunamadı: {d}")
    return onnx[0]


def synth_python(text: str, onnx: Path) -> bytes:  # pragma: no cover - piper yok
    try:
        from piper import PiperVoice
    except ImportError:
        from piper.voice import PiperVoice
    voice = _VOICES.get(str(onnx), lambda: PiperVoice.load(str(onnx)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        if hasattr(voice, "synthesize_wav"):  # piper-tts >= 1.3
            voice.synthesize_wav(text, wf)
        else:  # piper-tts 1.2
            voice.synthesize(text, wf)
    return buf.getvalue()


def synth_cli(text: str, onnx: Path) -> bytes:  # pragma: no cover - piper yok
    exe = shutil.which("piper")
    with tempfile.TemporaryDirectory(prefix="aip_tts_") as tmp:
        out = Path(tmp) / "cikti.wav"
        r = subprocess.run(
            [exe, "--model", str(onnx), "--output_file", str(out)],
            input=text,
            text=True,
            capture_output=True,
            timeout=120,
        )
        if r.returncode != 0 or not out.exists():
            raise ModuleError(f"Piper çalışmadı: {r.stderr[-300:]}")
        return out.read_bytes()


def wav_duration(data: bytes) -> float:
    with wave.open(io.BytesIO(data), "rb") as wf:
        return round(wf.getnframes() / float(wf.getframerate() or 1), 2)


@register("metin-ses")
class MetinSes(BaseRuntime):
    requires = ("piper",)

    async def do_speak(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text")
        text = str(payload["text"]).strip()
        if len(text) > MAX_CHARS:
            raise ModuleError(f"Metin en fazla {MAX_CHARS} karakter olabilir; parçalara bölün")
        if has_package("piper"):
            onnx = voice_file()
            wav = await asyncio.to_thread(synth_python, text, onnx)
            engine = "piper-python"
        elif shutil.which("piper"):
            onnx = voice_file()
            wav = await asyncio.to_thread(synth_cli, text, onnx)
            engine = "piper-cli"
        else:
            raise ModuleNotReady("'piper-tts' kurulu değil — modül mağazasından 'metin-ses' kurun")
        note(ctx, model=VOICE_MODEL, engine=engine)
        return {"audio_wav_base64": base64.b64encode(wav).decode("ascii"), "duration_s": wav_duration(wav)}
