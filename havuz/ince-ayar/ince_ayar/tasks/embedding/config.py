"""Gömme (embedding) görevinin yapılandırma şeması (`yapilandirma/gomme/*.toml`).

Kim kullanır: `tasks/embedding/*`.

Önekler: bazı modeller sorgu ve belgeyi farklı önekle ister (ör. e5: "query: " / "passage: ").
Model kartında ne yazıyorsa onu girin; eğitim, değerlendirme, ONNX ve tahmin aynı öneki kullanır.
`havuz/yz` gibi önek eklemeyen bir uygulamada kullanacaksanız önekleri boş bırakarak eğitin.

Genişletme: yeni alan için buraya ekleyin, üç hazır ayar dosyasına yazın.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ince_ayar.config import DataSection, ModelSection, Section, TrainSection


class EmbModelSection(ModelSection):
    sorgu_oneki: str = Field("", description="Sorgunun önüne eklenen metin (ör. 'query: ')")
    belge_oneki: str = Field("", description="Belgenin önüne eklenen metin (ör. 'passage: ')")


class EmbDataSection(DataSection):
    azami_uzunluk: int = Field(256, ge=8)
    ek_belgeler: str = Field(
        "", description="Değerlendirmede aranacak ek belgeler (.txt ya da .jsonl)"
    )


class EmbTrainSection(TrainSection):
    ogrenme_orani: float = Field(2e-5, gt=0.0)
    yigin: int = Field(32, ge=2, description="Karşıtsal eğitimde büyük yığın = daha çok olumsuz")
    donem: float = Field(1.0, gt=0.0)
    kayip: Literal["mnrl", "onbellekli-mnrl"] = "mnrl"
    mini_yigin: int = Field(
        16, ge=1, description="onbellekli-mnrl: bellekte aynı anda tutulan yığın"
    )
    zor_olumsuz_kaz: int = Field(0, ge=0, description=">0: taban modelle bu kadar zor olumsuz kaz")
    kaz_marj: float = Field(
        0.05, ge=0.0, lt=1.0, description="Kazılan olumsuz, olumludan bu oranda az benzer olmalı"
    )


class EmbEvalSection(Section):
    k_degerleri: list[int] = Field(default_factory=lambda: [1, 5, 10])


class EmbExportSection(Section):
    int8: bool = True


class EmbeddingConfig(Section):
    gorev: Literal["gomme"]
    model: EmbModelSection
    veri: EmbDataSection
    egitim: EmbTrainSection
    degerlendirme: EmbEvalSection = Field(default_factory=EmbEvalSection)
    disa_aktarim: EmbExportSection = Field(default_factory=EmbExportSection)
