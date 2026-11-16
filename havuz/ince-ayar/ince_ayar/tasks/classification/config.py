"""Sınıflandırma görevinin yapılandırma şeması (`yapilandirma/siniflandirma/*.toml`).

Kim kullanır: `tasks/classification/*`. Ortak alanlar `ince_ayar/config.py` içindedir.

Sınıf dengesizliği seçenekleri (`[egitim] dengesizlik`):
- `yok`              : düz çapraz entropi.
- `agirlikli-kayip`  : her sınıfın kaybı örnek sayısıyla ters orantılı ağırlıklanır (N / (K·nₖ)).
- `asiri-ornekleme`  : eğitim kümesinde az olan sınıfların örnekleri tohumlu olarak çoğaltılır.
Doğrulama ve test kümelerine hiçbir zaman dokunulmaz.

Genişletme: yeni alan için buraya ekleyin, üç hazır ayar dosyasına yazın.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ince_ayar.config import DataSection, ModelSection, Section, TrainSection


class ClsDataSection(DataSection):
    azami_uzunluk: int = Field(128, ge=8)
    test: str = Field("", description="Ayrı test dosyası; boşsa eğitimden ayrılır")
    test_orani: float = Field(0.1, ge=0.0, lt=0.5)


class ClsTrainSection(TrainSection):
    ogrenme_orani: float = Field(3e-5, gt=0.0)
    yigin: int = Field(16, ge=1)
    dengesizlik: Literal["yok", "agirlikli-kayip", "asiri-ornekleme"] = "yok"
    erken_durdurma: int = Field(0, ge=0, description="Sabır (değerlendirme sayısı); 0: kapalı")


class ThresholdSection(Section):
    ikili_esik_ayari: bool = Field(
        True, description="İkili görevde eşiği doğrulamada makro F1'e göre seç"
    )
    hedef_dogruluk: float = Field(
        0.0, ge=0.0, le=1.0, description=">0 ise 'emin değilim' güven eşiğini bu doğruluğa göre seç"
    )


class ClsExportSection(Section):
    int8: bool = Field(True, description="ONNX'in yanında int8 nicemlenmiş sürüm de üret")


class ClassificationConfig(Section):
    gorev: Literal["siniflandirma"]
    model: ModelSection
    veri: ClsDataSection
    egitim: ClsTrainSection
    esik: ThresholdSection = Field(default_factory=ThresholdSection)
    disa_aktarim: ClsExportSection = Field(default_factory=ClsExportSection)
