"""Varlık tanıma (belirteç sınıflandırma) görevinin yapılandırma şeması (`yapilandirma/varlik/*.toml`).

Kim kullanır: `tasks/ner/*`. Veri biçimi: `{"sozcukler": [...], "etiketler": ["B-KISI", "O", ...]}`.

Genişletme: yeni alan için buraya ekleyin, üç hazır ayar dosyasına yazın.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ince_ayar.config import DataSection, ModelSection, Section, TrainSection


class NerDataSection(DataSection):
    azami_uzunluk: int = Field(128, ge=8)


class NerTrainSection(TrainSection):
    ogrenme_orani: float = Field(5e-5, gt=0.0)
    yigin: int = Field(16, ge=1)


class NerConfig(Section):
    gorev: Literal["varlik"]
    model: ModelSection
    veri: NerDataSection
    egitim: NerTrainSection
