"""Küçük bir Hugging Face modelini CPU'da OpenAI uyumlu uçla sunan GELİŞTİRME sunucusu.

Amaç: gerçek bir küçük modelle bu temeli denemek (docs/GERCEK_MODEL_DENEMESI.md). Üretim için
değildir: tek istek tek seferde işlenir (kilit), toplu işleme ve kısıtlı çözümleme yoktur.
Bilerek bıraktıklarımız (gerçek sunucuların bir kısmı gibi davranır, böylece geri çekilme yolları
sınanır):
    - `response_format` (JSON şeması) DESTEKLENMEZ → 400 döner; yapili/ "sema" katmanı atlanır.
    - Araç çağrısı: modelin sohbet şablonu araçları destekliyorsa istemde verilir; model çıktısındaki
      <tool_call>{...}</tool_call> blokları `tool_calls` olarak döner (llama.cpp --jinja / vLLM gibi).
    - `/v1/embeddings` yoktur (404).
Kurulum (ayrı, geçici sanal ortam; torch ağırdır):
    uv venv /tmp/hf-venv && uv pip install --python /tmp/hf-venv/bin/python torch transformers fastapi uvicorn
Çalıştırma:
    /tmp/hf-venv/bin/python araclar/hf_sunucu.py --model Qwen/Qwen2.5-0.5B-Instruct --kapi 8422
Genişletme: kısıtlı çözümleme (ör. outlines/xgrammar) eklenirse `response_format` dalı açılabilir.
"""

from __future__ import annotations

import argparse
import json
import re
import threading
import time
import uuid
from collections.abc import Iterator
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

_ARAC_CAGRISI = re.compile(r"<tool_call>\s*(.*?)\s*(?:</tool_call>|$)", re.DOTALL)


def _hata(ileti: str, durum: int = 400) -> JSONResponse:
    return JSONResponse(
        {"error": {"message": ileti, "type": "invalid_request_error"}}, status_code=durum
    )


def _icerik(mesaj: dict[str, Any]) -> str:
    icerik = mesaj.get("content")
    if isinstance(icerik, list):
        return "".join(p.get("text", "") for p in icerik if isinstance(p, dict))
    return str(icerik or "")


def _sablon_mesajlari(mesajlar: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """OpenAI mesajlarını transformers sohbet şablonunun beklediği biçime çevirir."""
    sonuc: list[dict[str, Any]] = []
    for m in mesajlar:
        rol = m.get("role", "user")
        oge: dict[str, Any] = {
            "role": "system" if rol == "developer" else rol,
            "content": _icerik(m),
        }
        if rol == "assistant" and m.get("tool_calls"):
            oge["tool_calls"] = [
                {"type": "function", "function": {"name": c["function"]["name"],
                                                  "arguments": json.loads(c["function"].get("arguments") or "{}")}}
                for c in m["tool_calls"]
            ]  # fmt: skip
        sonuc.append(oge)
    return sonuc


class Model:
    def __init__(self, yol: str, is_parcacigi: int) -> None:
        torch.set_num_threads(is_parcacigi)
        self.ad = yol.rstrip("/").split("/")[-1]
        self.belirtecleyici = AutoTokenizer.from_pretrained(yol)
        self.model = AutoModelForCausalLM.from_pretrained(yol, dtype=torch.float32)
        self.model.eval()
        self.kilit = threading.Lock()

    def istem(self, govde: dict[str, Any]) -> Any:
        araclar = govde.get("tools") or None
        return self.belirtecleyici.apply_chat_template(
            _sablon_mesajlari(govde["messages"]),
            tools=araclar,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )

    def ayarlar(self, govde: dict[str, Any], girdi: Any) -> dict[str, Any]:
        sicaklik = float(govde.get("temperature") or 0.0)
        azami = int(govde.get("max_completion_tokens") or govde.get("max_tokens") or 512)
        ayar: dict[str, Any] = {**girdi, "max_new_tokens": min(azami, 2048),
                                "pad_token_id": self.belirtecleyici.eos_token_id}  # fmt: skip
        if sicaklik > 0:
            ayar.update(
                do_sample=True, temperature=sicaklik, top_p=float(govde.get("top_p") or 1.0)
            )
            if govde.get("seed") is not None:
                torch.manual_seed(int(govde["seed"]))
        else:
            ayar.update(do_sample=False, temperature=None, top_p=None, top_k=None)
        return ayar


def _dur_kirp(metin: str, dur: Any) -> tuple[str, bool]:
    listesi = [dur] if isinstance(dur, str) else list(dur or [])
    konumlar = [metin.find(d) for d in listesi if d and d in metin]
    return (metin[: min(konumlar)], True) if konumlar else (metin, False)


def _arac_cagrilari(metin: str) -> tuple[str, list[dict[str, Any]]]:
    cagrilar = []
    for i, ham in enumerate(_ARAC_CAGRISI.findall(metin)):
        try:
            veri = json.loads(ham)
        except ValueError:
            continue  # bozuk blok: metinde kalır, istemci kendi onarıcısıyla dener
        if isinstance(veri, dict) and veri.get("name"):
            argumanlar = veri.get("arguments", {})
            cagrilar.append({"id": f"call_{uuid.uuid4().hex[:8]}_{i}", "type": "function",
                             "function": {"name": veri["name"], "arguments": json.dumps(argumanlar, ensure_ascii=False)}})  # fmt: skip
    if cagrilar:
        metin = _ARAC_CAGRISI.sub("", metin).strip()
    return metin, cagrilar


def uygulama_kur(model: Model) -> FastAPI:
    uygulama = FastAPI()

    @uygulama.get("/v1/models")
    def modeller() -> dict[str, Any]:
        return {
            "object": "list",
            "data": [{"id": model.ad, "object": "model", "owned_by": "yerel"}],
        }

    @uygulama.post("/v1/chat/completions")
    async def sohbet(istek: Request) -> Any:
        govde = await istek.json()
        bicim = (govde.get("response_format") or {}).get("type")
        if bicim in ("json_schema", "json_object"):
            return _hata(
                "response_format (json_schema/json_object) is not supported by this development server"
            )
        girdi = model.istem(govde)
        ayar = model.ayarlar(govde, girdi)
        girdi_sayisi = int(girdi["input_ids"].shape[1])
        if govde.get("stream"):
            return StreamingResponse(
                _akis(model, govde, ayar, girdi_sayisi), media_type="text/event-stream"
            )
        with model.kilit, torch.inference_mode():
            cikti = model.model.generate(**ayar)
        yeni = cikti[0][girdi_sayisi:]
        metin = model.belirtecleyici.decode(yeni, skip_special_tokens=True)
        metin, durdu = _dur_kirp(metin, govde.get("stop"))
        metin, cagrilar = _arac_cagrilari(metin) if govde.get("tools") else (metin, [])
        bitis = (
            "tool_calls"
            if cagrilar
            else ("length" if len(yeni) >= ayar["max_new_tokens"] and not durdu else "stop")
        )
        mesaj: dict[str, Any] = {"role": "assistant", "content": metin}
        if cagrilar:
            mesaj["tool_calls"] = cagrilar
        return {"id": f"hf-{uuid.uuid4().hex[:10]}", "object": "chat.completion", "created": int(time.time()),
                "model": model.ad, "choices": [{"index": 0, "message": mesaj, "finish_reason": bitis}],
                "usage": {"prompt_tokens": girdi_sayisi, "completion_tokens": len(yeni),
                          "total_tokens": girdi_sayisi + len(yeni)}}  # fmt: skip

    return uygulama


def _akis(
    model: Model, govde: dict[str, Any], ayar: dict[str, Any], girdi_sayisi: int
) -> Iterator[str]:
    akis = TextIteratorStreamer(model.belirtecleyici, skip_prompt=True, skip_special_tokens=True)
    kimlik = f"hf-{uuid.uuid4().hex[:10]}"

    def uret() -> None:
        with model.kilit, torch.inference_mode():
            model.model.generate(**ayar, streamer=akis)

    threading.Thread(target=uret, daemon=True).start()
    birikmis = ""
    for parca in akis:
        onceki = len(birikmis)
        birikmis += parca
        kirpik, durdu = _dur_kirp(birikmis, govde.get("stop"))
        yeni = kirpik[onceki:]
        if yeni:
            veri = {"id": kimlik, "object": "chat.completion.chunk", "model": model.ad,
                    "choices": [{"index": 0, "delta": {"content": yeni}, "finish_reason": None}]}  # fmt: skip
            yield f"data: {json.dumps(veri, ensure_ascii=False)}\n\n"
        if durdu:
            break
    son = {"id": kimlik, "object": "chat.completion.chunk", "model": model.ad,
           "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
           "usage": {"prompt_tokens": girdi_sayisi, "completion_tokens": len(model.belirtecleyici.encode(birikmis))}}  # fmt: skip
    yield f"data: {json.dumps(son)}\n\ndata: [DONE]\n\n"


def main() -> None:
    ayristirici = argparse.ArgumentParser(
        description="Küçük HF modelini OpenAI uyumlu uçla sunar (geliştirme)."
    )
    ayristirici.add_argument(
        "--model", required=True, help="Hugging Face kimliği ya da yerel klasör"
    )
    ayristirici.add_argument("--kapi", type=int, default=8422)
    ayristirici.add_argument(
        "--is-parcacigi", type=int, default=2, help="torch iş parçacığı sayısı"
    )
    args = ayristirici.parse_args()
    model = Model(args.model, args.is_parcacigi)
    print(f"Hazır: http://127.0.0.1:{args.kapi}/v1  (model: {model.ad})", flush=True)
    uvicorn.run(uygulama_kur(model), host="127.0.0.1", port=args.kapi, log_level="warning")


if __name__ == "__main__":
    main()
