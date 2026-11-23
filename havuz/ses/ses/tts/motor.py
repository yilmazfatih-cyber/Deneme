"""Seslendirici arayüzü (`TtsMotoru`), seslendirme ayarları (`SesAyari`) ve sahte motor (`SahteTts`).

Motor yalnız "cümle cümle ham ses" üretir; hız/perde/sessizlik/düzey işini seslendirici.py yapar.
`uzunluk_olcegi` > 1 yavaşlatır (Piper'ın length_scale'i). Motor iş parçacığı güvenli olmalıdır.
`SahteTts` her sözcük için sabit frekanslı kısa bir ton üretir: modelsiz deneme ve testler içindir
(perde kaydırmasını frekans ölçerek, hız ayarını süre ölçerek sınamaya yarar).
Kim kullanır: seslendirici.py, sunucu/, komutlar.py.
Genişletme: başka bir seslendirici (ör. kendi ses kayıtlarınızdan bir sözlük) → `TtsMotoru`'na uyan
bir sınıf; `SahteTts`'yi örnek alın; komutlar.py `tts_motoru_kur`'a dal ekleyin.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Protocol

import numpy as np
from pydantic import BaseModel, Field

from ses.ses_isleme.ses import Dizi


class SesAyari(BaseModel):
    """Seslendirme ayarları (sunucu ve komut satırı aynı modeli kullanır)."""

    hiz: float = Field(
        1.0, ge=0.5, le=2.0, description="konuşma hızı çarpanı (1 = sesin kendi hızı)"
    )
    perde: float = Field(
        0.0, ge=-6, le=6, description="perde kaydırma, yarım ton (±3 dışı doğal değil)"
    )
    cumle_arasi_ms: int = Field(300, ge=0, le=3000, description="cümleler arası sessizlik")
    bas_son_ms: int = Field(100, ge=0, le=2000, description="baştaki ve sondaki sessizlik")
    hedef_lufs: float | None = Field(
        -16.0, ge=-40, le=-5, description="ses yüksekliği; None: dokunma"
    )
    ornekleme: int | None = Field(
        None, ge=8000, le=48000, description="çıktı hızı; None: sesin kendi hızı"
    )
    normallestir: bool = Field(True, description="sayı, tarih, kısaltma… okunuşa çevrilsin mi")
    konusmaci: int | None = Field(
        None, ge=0, description="çok konuşmacılı seste konuşmacı numarası"
    )


class TtsMotoru(Protocol):
    """Metni cümle cümle ham sese çeviren motor."""

    @property
    def ad(self) -> str: ...

    @property
    def ornekleme(self) -> int: ...

    def cumleler(
        self, metin: str, *, uzunluk_olcegi: float = 1.0, konusmaci: int | None = None
    ) -> Iterator[Dizi]: ...


class SahteTts:
    """Modelsiz seslendirici: her sözcük `frekans` Hz'lik bir ton, sözcükler arası 40 ms sessizlik."""

    def __init__(self, frekans: float = 200.0, ornekleme: int = 22050) -> None:
        self.frekans = frekans
        self._ornekleme = ornekleme
        self.metinler: list[str] = []

    @property
    def ad(self) -> str:
        return "sahte"

    @property
    def ornekleme(self) -> int:
        return self._ornekleme

    def cumleler(
        self, metin: str, *, uzunluk_olcegi: float = 1.0, konusmaci: int | None = None
    ) -> Iterator[Dizi]:
        self.metinler.append(metin)
        for cumle in re.split(r"(?<=[.!?])\s+", metin.strip()):
            parcalar: list[Dizi] = []
            for sozcuk in cumle.split():
                sure = 0.04 * max(2, len(sozcuk)) * uzunluk_olcegi
                t = np.arange(round(sure * self.ornekleme)) / self.ornekleme
                parcalar.append((0.3 * np.sin(2 * np.pi * self.frekans * t)).astype(np.float32))
                parcalar.append(np.zeros(round(0.04 * uzunluk_olcegi * self.ornekleme), np.float32))
            if parcalar:
                yield np.concatenate(parcalar)
