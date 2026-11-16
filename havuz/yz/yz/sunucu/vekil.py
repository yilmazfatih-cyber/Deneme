"""OpenAI uyumlu vekil: `/v1/chat/completions` ve `/v1/models`.

Başka bir uygulama (ya da OpenAI istemcisi) bu sunucuya OpenAI'ya konuşur gibi bağlanır; vekil
isteği yapılandırılmış sağlayıcıya iletir ve araya şunları ekler: disk önbelleği, maskeli
günlük, kişisel veri maskeleme (modele giden metinde; yanıtta geri açılır), kullanım sayacı.
`model` alanı: yz.yaml profil adı, "profil/model" ya da doğrudan model adı (varsayılan profilde).
Kim kullanır: sunucu/uygulama.py.
Genişletme: yeni bir OpenAI alanını desteklemek için `_istek_cevir`'e ekleyin.
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict

from yz.guvenlik.maske import AkisMaskeAcici, MaskeOturumu, maskele, maskeyi_ac
from yz.hatalar import SaglayiciHatasi
from yz.saglayici.openai_bicim import arguman_coz, icerik_metni
from yz.saglayici.sse import sse_bicimle
from yz.saglayici.taban import Saglayici, SohbetSecenekleri
from yz.saglayici.tipler import AracCagrisi, AracTanimi, Mesaj, Yanit
from yz.sunucu.durum import SunucuDurumu

yonlendirici = APIRouter()
_BITIS = {"bitti": "stop", "uzunluk": "length", "arac": "tool_calls", "ret": "content_filter",
          "suzgec": "content_filter", "diger": "stop"}  # fmt: skip


class OpenAIIstegi(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str = ""
    messages: list[dict[str, Any]]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None
    max_completion_tokens: int | None = None
    stop: str | list[str] | None = None
    tools: list[dict[str, Any]] | None = None
    tool_choice: Any = None
    response_format: dict[str, Any] | None = None
    seed: int | None = None


def mesaj_telden(tel: dict[str, Any]) -> Mesaj:
    """OpenAI tel biçimindeki mesajı ortak `Mesaj`a çevirir."""
    rol = str(tel.get("role") or "user")
    rol = "system" if rol == "developer" else rol
    icerik = icerik_metni(tel.get("content"))
    if rol == "tool":
        return Mesaj.arac(str(tel.get("tool_call_id") or ""), icerik, tel.get("name"))
    cagrilar = []
    for ham in tel.get("tool_calls") or []:
        islev = ham.get("function") or {}
        argumanlar, ham_metin = arguman_coz(islev.get("arguments"))
        cagrilar.append(AracCagrisi(kimlik=str(ham.get("id") or ""), ad=str(islev.get("name") or ""),
                                    argumanlar=argumanlar, ham_argumanlar=ham_metin))  # fmt: skip
    return Mesaj(rol=rol if rol in ("system", "user", "assistant") else "user", icerik=icerik,  # type: ignore[arg-type]
                 arac_cagrilari=cagrilar)  # fmt: skip


def _istek_cevir(
    istek: OpenAIIstegi,
) -> tuple[list[Mesaj], list[AracTanimi], Any, SohbetSecenekleri]:
    mesajlar = [mesaj_telden(m) for m in istek.messages]
    araclar = [
        AracTanimi(
            ad=f["name"], aciklama=f.get("description", ""), parametreler=f.get("parameters") or {}
        )
        for t in istek.tools or []
        if isinstance(f := t.get("function"), dict) and f.get("name")
    ]
    bicim: Any = None
    if istek.response_format:
        tur = istek.response_format.get("type")
        sema = (istek.response_format.get("json_schema") or {}).get("schema")
        bicim = (
            sema
            if tur == "json_schema" and isinstance(sema, dict)
            else ("json" if tur != "text" else None)
        )
    secenek: SohbetSecenekleri = {
        "sicaklik": istek.temperature if istek.temperature is not None else 0.0
    }
    azami = istek.max_completion_tokens or istek.max_tokens
    if azami:
        secenek["azami_belirtec"] = azami
    if istek.stop:
        secenek["dur"] = [istek.stop] if isinstance(istek.stop, str) else list(istek.stop)
    if istek.seed is not None:
        secenek["tohum"] = istek.seed
    if istek.tool_choice in ("none", "required"):
        secenek["arac_secimi"] = "yok" if istek.tool_choice == "none" else "zorunlu"
    elif isinstance(istek.tool_choice, dict):
        secenek["arac_secimi"] = str((istek.tool_choice.get("function") or {}).get("name") or "oto")
    return mesajlar, araclar, bicim, secenek


def _deger_maskele(deger: Any, oturum: MaskeOturumu) -> Any:
    """Araç argümanındaki her metni (ve kişisel veri olabilecek sayıyı: TCKN, telefon) maskeler."""
    if isinstance(deger, str):
        return maskele(deger, oturum)[0]
    if isinstance(deger, int | float) and not isinstance(deger, bool):
        metin = maskele(str(deger), oturum)[0]
        return deger if metin == str(deger) else metin
    if isinstance(deger, list):
        return [_deger_maskele(o, oturum) for o in deger]
    if isinstance(deger, dict):
        return {_deger_maskele(k, oturum): _deger_maskele(v, oturum) for k, v in deger.items()}
    return deger


def _maskele(mesajlar: list[Mesaj], oturum: MaskeOturumu) -> list[Mesaj]:
    """Modele gidecek her metni maskeler: içerik VE geçmişteki araç çağrılarının argümanları.

    İstemci, vekilin açarak verdiği araç çağrısını (gerçek e-posta, TCKN…) sonraki istekte geri yollar;
    yalnız içerik maskelenseydi bu değerler modele düz giderdi.
    """
    return [
        m.model_copy(
            update={
                "icerik": maskele(m.icerik, oturum)[0],
                "arac_cagrilari": [
                    c.model_copy(
                        update={
                            "argumanlar": _deger_maskele(c.argumanlar, oturum),
                            "ham_argumanlar": None,
                        }
                    )
                    for c in m.arac_cagrilari
                ],
            }
        )
        for m in mesajlar
    ]


def _cagri_tele(c: AracCagrisi, oturum: MaskeOturumu) -> dict[str, Any]:
    argumanlar = maskeyi_ac(c.json_argumanlar(), oturum)
    return {"id": c.kimlik, "type": "function", "function": {"name": c.ad, "arguments": argumanlar}}


def _kullanim(yanit: Yanit) -> dict[str, int]:
    k = yanit.kullanim
    return {
        "prompt_tokens": k.girdi_belirteci,
        "completion_tokens": k.cikti_belirteci,
        "total_tokens": k.toplam,
    }


def _akis(saglayici: Saglayici, mesajlar: list[Mesaj], araclar: list[AracTanimi], bicim: Any,
          secenek: SohbetSecenekleri, oturum: MaskeOturumu) -> Iterator[str]:  # fmt: skip
    kimlik, zaman = f"yz-{uuid.uuid4().hex[:12]}", int(time.time())

    def parca(delta: dict[str, Any], bitis: str | None = None, **ek: Any) -> str:
        govde = {"id": kimlik, "object": "chat.completion.chunk", "created": zaman, "model": saglayici.model,
                 "choices": [{"index": 0, "delta": delta, "finish_reason": bitis}], **ek}  # fmt: skip
        return sse_bicimle(json.dumps(govde, ensure_ascii=False))

    yield parca({"role": "assistant", "content": ""})
    acici = AkisMaskeAcici(oturum)
    try:
        for p in saglayici.sohbet(mesajlar, araclar, bicim, akis=True, **secenek):
            if p.son is not None:
                kalan = acici.bitir()
                if kalan:
                    yield parca({"content": kalan})
                if p.son.arac_cagrilari:
                    cagrilar = [
                        {"index": i, **_cagri_tele(c, oturum)}
                        for i, c in enumerate(p.son.arac_cagrilari)
                    ]
                    yield parca({"tool_calls": cagrilar})
                yield parca({}, _BITIS[p.son.bitis_nedeni])
                yield sse_bicimle(json.dumps({"id": kimlik, "object": "chat.completion.chunk", "created": zaman,
                                              "model": saglayici.model, "choices": [], "usage": _kullanim(p.son)}))  # fmt: skip
            elif p.metin:
                acik = acici.besle(p.metin)
                if acik:
                    yield parca({"content": acik})
    except SaglayiciHatasi as hata:
        yield sse_bicimle(
            json.dumps(
                {"error": {"message": str(hata), "type": "saglayici_hatasi"}}, ensure_ascii=False
            )
        )
    yield sse_bicimle("[DONE]")


@yonlendirici.post("/v1/chat/completions")
def sohbet_tamamla(govde: OpenAIIstegi, istek: Request) -> Any:
    durum: SunucuDurumu = istek.app.state.durum
    saglayici = durum.saglayici(*durum.profil_ve_model(govde.model))
    mesajlar, araclar, bicim, secenek = _istek_cevir(govde)
    oturum = MaskeOturumu()
    if durum.ayarlar.sunucu.maskele:
        mesajlar = _maskele(mesajlar, oturum)
    if govde.stream:
        return StreamingResponse(_akis(saglayici, mesajlar, araclar, bicim, secenek, oturum),
                                 media_type="text/event-stream")  # fmt: skip
    try:
        yanit = saglayici.sohbet(mesajlar, araclar, bicim, **secenek)
    except SaglayiciHatasi as hata:
        return JSONResponse(
            {"error": {"message": str(hata), "type": "saglayici_hatasi"}}, status_code=502
        )
    mesaj: dict[str, Any] = {"role": "assistant", "content": maskeyi_ac(yanit.metin, oturum)}
    if yanit.arac_cagrilari:
        mesaj["tool_calls"] = [_cagri_tele(c, oturum) for c in yanit.arac_cagrilari]
    return {
        "id": f"yz-{uuid.uuid4().hex[:12]}", "object": "chat.completion", "created": int(time.time()),
        "model": yanit.model or saglayici.model,
        "choices": [{"index": 0, "message": mesaj, "finish_reason": _BITIS[yanit.bitis_nedeni]}],
        "usage": _kullanim(yanit),
    }  # fmt: skip


@yonlendirici.get("/v1/models")
def modeller(istek: Request) -> dict[str, Any]:
    durum: SunucuDurumu = istek.app.state.durum
    adlar = list(durum.ayarlar.saglayicilar) or ["sahte"]
    return {
        "object": "list",
        "data": [{"id": ad, "object": "model", "owned_by": "yz"} for ad in adlar],
    }
