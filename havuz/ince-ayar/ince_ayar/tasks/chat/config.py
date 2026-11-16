"""Sohbet görevinin yapılandırma şeması (`yapilandirma/sohbet/*.toml` dosyalarının biçimi).

Kim kullanır: `tasks/chat/*` eylemleri `load_config(yol, ChatConfig, ...)` ile yükler.
Ortak alanlar (`taban`, `egitim`, `yigin`…) `ince_ayar/config.py` içindedir; burada yalnız sohbete
özgü olanlar vardır. Başlangıç değerlerinin gerekçesi: `docs/HIPERPARAMETRE.md`.

Genişletme: yeni alanı buraya ekleyin, üç hazır ayar dosyasına yazın, `docs/HIPERPARAMETRE.md`
tablosuna bir satır ekleyin.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from ince_ayar.config import DataSection, ModelSection, Section, TrainSection


class ChatModelSection(ModelSection):
    dort_bit: bool = Field(False, description="4-bit (QLoRA) yükleme; yalnız CUDA + bitsandbytes")
    sohbet_sablonu: str = Field("", description="Taban modelde şablon yoksa .jinja dosyası")


class ChatDataSection(DataSection):
    azami_uzunluk: int = Field(1024, ge=16)
    uzun_ornek: Literal["at", "hata"] = Field(
        "at", description="Azami uzunluğu aşan örnek: at (uyarıyla çıkar) ya da hata (dur)"
    )


class LoraSection(Section):
    etkin: bool = Field(True, description="false: tam ince ayar (bütün ağırlıklar eğitilir)")
    r: int = Field(16, ge=1)
    alpha: int = Field(32, ge=1)
    dropout: float = Field(0.05, ge=0.0, lt=1.0)
    hedef_moduller: str | list[str] = Field(
        "all-linear",
        description="'all-linear' ya da modül adları listesi (ör. ['q_proj','v_proj'])",
    )
    rslora: bool = False


class ChatTrainSection(TrainSection):
    ogrenme_orani: float = Field(2e-4, gt=0.0)
    yigin: int = Field(4, ge=1)
    biriktirme: int = Field(4, ge=1)
    agirlik_curumesi: float = Field(0.0, ge=0.0)
    zamanlayici: Literal["linear", "cosine", "constant"] = "cosine"
    gradyan_denetimi: bool = Field(True, description="Belleği azaltır, eğitimi ~%20 yavaşlatır")
    degerlendirme_adimi: int = Field(0, ge=0, description="0: her dönem sonunda değerlendir")
    ornek_uretim: int = Field(2, ge=0, description="Her değerlendirmede kaydedilecek örnek üretim")


class ChatEvalSection(Section):
    azami_yeni_belirtec: int = Field(128, ge=1)
    ornek_sayisi: int = Field(50, ge=1, description="Üretimle ölçülecek en çok örnek")


class ChatConfig(Section):
    gorev: Literal["sohbet"]
    model: ChatModelSection
    veri: ChatDataSection
    lora: LoraSection = Field(default_factory=LoraSection)
    egitim: ChatTrainSection
    degerlendirme: ChatEvalSection = Field(default_factory=ChatEvalSection)
