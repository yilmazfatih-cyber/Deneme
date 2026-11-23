"""Yazıya çevirme sonucunu OpenAI `/v1/audio/transcriptions` yanıt biçimlerine çevirir.

Biçimler: json → {"text"}; text → düz metin; srt / vtt → altyazı; verbose_json → {"task", "language",
"duration", "text", "segments", ["words"]} (OpenAI'de dil adı İngilizce tam addır: "turkish").
Kim kullanır: sunucu/uygulama.py. Genişletme: yeni biçim → `BICIMLER` + `yanit_govdesi` dalı + testi.
"""

from __future__ import annotations

import json
from typing import Any

from ses.stt.altyazi import ipuclarina_bol, srt_uret, vtt_uret
from ses.stt.tipler import Transkript

BICIMLER = ("json", "text", "srt", "vtt", "verbose_json")
_DIL_ADLARI = {"tr": "turkish", "en": "english", "de": "german", "ar": "arabic", "ku": "kurdish"}


def verbose_json(transkript: Transkript, *, kelimeler: bool) -> dict[str, Any]:
    govde: dict[str, Any] = {
        "task": "transcribe",
        "language": _DIL_ADLARI.get(transkript.dil, transkript.dil),
        "duration": round(transkript.sure, 3),
        "text": transkript.metin,
        "segments": [
            {"id": b.kimlik, "seek": 0, "start": round(b.baslangic, 3), "end": round(b.bitis, 3),
             "text": b.metin, "tokens": [], "temperature": 0.0, "avg_logprob": b.ort_logolasilik or 0.0,
             "compression_ratio": 0.0, "no_speech_prob": b.konusma_yok_olasiligi or 0.0}
            for b in transkript.bolutler
        ],
    }  # fmt: skip
    if kelimeler:
        govde["words"] = [
            {"word": k.metin.strip(), "start": round(k.baslangic, 3), "end": round(k.bitis, 3)}
            for b in transkript.bolutler
            for k in b.kelimeler
        ]
    return govde


def yanit_govdesi(transkript: Transkript, bicim: str, *, kelimeler: bool = False) -> tuple[str, str]:
    """(gövde, medya türü)."""
    if bicim == "text":
        return transkript.metin + "\n", "text/plain; charset=utf-8"
    if bicim == "srt":
        return srt_uret(ipuclarina_bol(transkript.bolutler)), "text/plain; charset=utf-8"
    if bicim == "vtt":
        return vtt_uret(ipuclarina_bol(transkript.bolutler)), "text/vtt; charset=utf-8"
    if bicim == "verbose_json":
        return json.dumps(verbose_json(transkript, kelimeler=kelimeler), ensure_ascii=False), "application/json"
    return json.dumps({"text": transkript.metin}, ensure_ascii=False), "application/json"
