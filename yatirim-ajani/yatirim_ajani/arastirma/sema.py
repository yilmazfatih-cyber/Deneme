"""Araştırma ajanının yapılandırılmış çıktısı (tez)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TEZ_SEMASI = {
    "type": "object",
    "properties": {
        "hisse": {"type": "string"},
        "karar": {"type": "string", "enum": ["AL", "TUT", "SAT", "IZLE"]},
        "olasilik": {
            "type": "number",
            "description": "Hissenin ufuk_gun içinde en az esik_getiri getiri sağlama olasılığı (0-1)",
        },
        "ufuk_gun": {"type": "integer", "description": "Tahmin ufku, takvim günü"},
        "esik_getiri": {"type": "number", "description": "Ör. 0.05 = %5"},
        "adil_deger_alt": {"anyOf": [{"type": "number"}, {"type": "null"}]},
        "adil_deger_ust": {"anyOf": [{"type": "number"}, {"type": "null"}]},
        "ozet": {"type": "string", "description": "En fazla iki cümlelik özet"},
        "gerekce": {"type": "string"},
        "riskler": {"type": "array", "items": {"type": "string"}},
        "kaynaklar": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "hisse", "karar", "olasilik", "ufuk_gun", "esik_getiri", "adil_deger_alt",
        "adil_deger_ust", "ozet", "gerekce", "riskler", "kaynaklar",
    ],  # fmt: skip
    "additionalProperties": False,
}


class TezCiktisi(BaseModel):
    hisse: str
    karar: Literal["AL", "TUT", "SAT", "IZLE"]
    olasilik: float = Field(ge=0.0, le=1.0)
    ufuk_gun: int = Field(ge=1, le=730)
    esik_getiri: float = Field(ge=-0.9, le=5.0)
    adil_deger_alt: float | None = None
    adil_deger_ust: float | None = None
    ozet: str
    gerekce: str
    riskler: list[str]
    kaynaklar: list[str]

    @field_validator("hisse")
    @classmethod
    def _buyuk_harf(cls, v: str) -> str:
        return v.strip().upper()
