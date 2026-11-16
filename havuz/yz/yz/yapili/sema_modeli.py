"""JSON şeması dosyasından Pydantic modeli kurar (Python yazmadan şema vermek için).

Desteklenen alt küme: object (properties, required, description), string (enum, format: date),
integer, number, boolean, null, array (items), iç içe object, `X | null` (anyOf / tip listesi).
Desteklenmeyen bir yapı açık bir hata iletisiyle reddedilir; o durumda şemayı Python'da
Pydantic sınıfı olarak yazın (yz/yapili/semalar.py örnekleri).
Kim kullanır: cli.py (`cikar --sema sema.json`), degerlendirme/tanim.py.
Genişletme: yeni JSON şeması özelliği → `_tip` içine dal ekleyip testine örnek yazın.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, create_model

from yz.hatalar import VeriHatasi
from yz.yapili.sema_araclari import coz

_TEMEL: dict[str, Any] = {"string": str, "integer": int, "number": float, "boolean": bool}


def _tip(sema: dict[str, Any], kok: dict[str, Any], ad: str) -> Any:
    sema = coz(sema, kok)
    if "enum" in sema:
        return Literal[tuple(sema["enum"])]
    secenekler = sema.get("anyOf") or sema.get("oneOf")
    tip_degeri = sema.get("type")
    if isinstance(tip_degeri, list):
        secenekler = [{**sema, "type": t} for t in tip_degeri]
    if isinstance(secenekler, list):
        dolu = [s for s in secenekler if coz(s, kok).get("type") != "null"]
        if len(dolu) == 1:
            ic = _tip(dolu[0], kok, ad)
            return Optional[ic] if len(dolu) < len(secenekler) else ic  # noqa: UP045
        raise VeriHatasi(f"`{ad}`: birden çok tip seçeneği desteklenmiyor; Python şeması yazın.")
    if tip_degeri == "string" and sema.get("format") == "date":
        return date
    if tip_degeri in _TEMEL:
        return _TEMEL[tip_degeri]
    if tip_degeri == "null":
        return type(None)
    if tip_degeri == "array":
        ogeler = sema.get("items")
        return list[_tip(ogeler, kok, ad) if isinstance(ogeler, dict) else Any]  # type: ignore[misc]
    if tip_degeri == "object":
        return json_semadan_model(sema, kok, ad=sema.get("title") or ad.title().replace("_", ""))
    raise VeriHatasi(f"`{ad}`: desteklenmeyen şema: {sema}")


def json_semadan_model(
    sema: dict[str, Any], kok: dict[str, Any] | None = None, ad: str | None = None
) -> type[BaseModel]:
    """JSON şemasını (object) Pydantic modeline çevirir."""
    kok = kok if kok is not None else sema
    sema = coz(sema, kok)
    if sema.get("type") != "object" or not isinstance(sema.get("properties"), dict):
        raise VeriHatasi('Şemanın en üstü {"type": "object", "properties": {...}} olmalı.')
    zorunlu = set(sema.get("required") or [])
    alanlar: dict[str, Any] = {}
    for alan_adi, alt in sema["properties"].items():
        if not isinstance(alt, dict):
            raise VeriHatasi(f"`{alan_adi}` alanının şeması bir nesne olmalı.")
        tip = _tip(alt, kok, alan_adi)
        aciklama = alt.get("description")
        if alan_adi in zorunlu:
            alanlar[alan_adi] = (tip, Field(..., description=aciklama))
        else:
            alanlar[alan_adi] = (Optional[tip], Field(None, description=aciklama))  # noqa: UP045
    model_adi = ad or str(sema.get("title") or "Sema")
    return create_model(model_adi, **alanlar)
