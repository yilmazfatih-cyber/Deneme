"""Sınıflandırma yapılandırma şeması (`yapilandirma/siniflandirma/*.toml`).

Kim kullanır: `egit`, `degerlendir` komutları; `train.py`, `plan.py`, `split.py`.

Önemli seçenekler:
- `[model] kip`: "bas" = gövde (önceden eğitilmiş kısım) donuk, yalnız sınıflandırma başı eğitilir
  (az veri / CPU için); "tam" = bütün ağırlıklar eğitilir. "tam" kipte `bas_isinma_donemi` kadar dönem
  önce yalnız baş eğitilir (rastgele baş, iyi gövdeyi bozmasın) ve gövdenin öğrenme oranı
  `govde_oran_carpani` ile küçültülür.
- `[veri] kopya_esigi`: algısal özet (pHash) uzaklığı bu değer ve altındaki görüntüler AYNI tarafa
  (eğitim/doğrulama/test) düşer; -1 kapatır. `grup_deseni`: sınıf klasörüne göre yoldan grup anahtarı
  çıkaran düzenli ifade; aynı ürünün fotoğrafları aynı tarafa gider. Örnek: "^([^_]+)_" (dosya adı
  önekine göre), "^([^/]+)/" (alt klasöre göre).
- `[egitim] dengesizlik`: "agirlikli-kayip" (az olan sınıfın hatası daha pahalı), "dengeli-ornekleme"
  (az olan sınıftan daha sık örnek çekilir) ya da "yok".
- `[esik]`: sıcaklık ölçekleme (kalibrasyon) ve "emin değilim" eşiği.

Genişletme: yeni alan için buraya ekleyin, üç hazır ayar dosyasına yazın (kural testi şemayı denetler).
"""

from __future__ import annotations

import re
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from goruntu.config import TINY_MODEL, Section
from goruntu.hazirlik.loader import DEFAULT_MAX_BYTES, DEFAULT_MAX_PIXELS


class ModelSection(Section):
    taban: str = Field(description="timm/<mimari>.<etiket>, timm mimari adı ya da 'minik-rastgele'")
    onceden_egitilmis: bool = True
    girdi_boyutu: int = Field(0, ge=0, le=1024, description="0: modelin kendi boyutu")
    kip: Literal["bas", "tam"] = "bas"
    bas_isinma_donemi: int = Field(0, ge=0)
    govde_oran_carpani: float = Field(0.1, gt=0.0, le=1.0)
    birakma: float = Field(0.0, ge=0.0, lt=1.0, description="Baştan önce dropout oranı")

    @model_validator(mode="after")
    def _random_needs_full(self) -> Self:
        random_weights = not self.onceden_egitilmis or self.taban == TINY_MODEL
        if random_weights and self.kip == "bas":
            raise ValueError(
                "önceden eğitilmemiş (rastgele) gövdeyle yalnız baş eğitimi anlamsızdır; "
                '`model.kip = "tam"` yapın'
            )
        return self


class DataSection(Section):
    klasor: str = Field(description="Sınıf başına bir klasör içeren kök klasör")
    dogrulama_orani: float = Field(0.15, ge=0.0, lt=0.5)
    test_orani: float = Field(0.15, ge=0.0, lt=0.5)
    kopya_yontemi: Literal["phash", "dhash", "ahash"] = "phash"
    kopya_esigi: int = Field(8, ge=-1, le=32)
    grup_deseni: str = ""
    azami_piksel: int = Field(DEFAULT_MAX_PIXELS, ge=10_000)
    azami_bayt: int = Field(DEFAULT_MAX_BYTES, ge=10_000)
    tohum: int = 42

    @field_validator("grup_deseni")
    @classmethod
    def _pattern(cls, value: str) -> str:
        if not value:
            return value
        try:
            compiled = re.compile(value)
        except re.error as exc:
            raise ValueError(f"geçerli bir düzenli ifade değil ({exc})") from exc
        if compiled.groups < 1:
            raise ValueError('en az bir yakalama grubu içermeli, ör. "^([^_]+)_"')
        return value


class AugmentSection(Section):
    etkin: bool = True
    olcek_alt: float = Field(
        0.6, gt=0.0, le=1.0, description="Rastgele kırpmada en küçük alan oranı"
    )
    yatay_cevir: bool = True
    dikey_cevir: bool = False
    renk: float = Field(0.2, ge=0.0, le=1.0, description="Parlaklık/karşıtlık/doygunluk oynaması")
    dondurme_derece: float = Field(0.0, ge=0.0, le=180.0)


class TrainSection(Section):
    cikti: str = Field(description="Çıktı klasörü")
    donem: int = Field(10, ge=1)
    yigin: int = Field(32, ge=1)
    ogrenme_orani: float = Field(1e-3, gt=0.0)
    agirlik_curumesi: float = Field(0.05, ge=0.0)
    isinma_orani: float = Field(0.05, ge=0.0, lt=1.0)
    dengesizlik: Literal["yok", "agirlikli-kayip", "dengeli-ornekleme"] = "agirlikli-kayip"
    etiket_yumusatma: float = Field(0.0, ge=0.0, lt=0.5)
    erken_durdurma: int = Field(3, ge=0, description="Sabır (dönem); 0: kapalı")
    izlenen: Literal["makro_f1", "kayip"] = "makro_f1"
    duyarlik: Literal["oto", "fp32", "fp16", "bf16"] = "oto"
    is_parcacigi: int = Field(0, ge=0, description="CPU iş parçacığı; 0: otomatik (en çok 4)")
    isci: int = Field(0, ge=0, description="Veri yükleme işçisi (DataLoader num_workers)")
    tohum: int = 42
    hedef_bellek_gb: float = Field(
        0.0, ge=0.0, description="Kuru çalıştırmada kıyas: hedef GPU belleği"
    )
    hedef_tflops: float = Field(0.0, ge=0.0, description="Kuru çalıştırmada kıyas: hedef GPU hızı")


class ThresholdSection(Section):
    kalibrasyon: bool = Field(True, description="Doğrulamada sıcaklık ölçekleme")
    hedef_dogruluk: float = Field(
        0.0, ge=0.0, le=1.0, description=">0: eşik bu doğruluğa göre seçilir"
    )
    sabit_esik: float = Field(
        0.0, ge=0.0, le=1.0, description=">0: güven bunun altındaysa 'emin değilim'"
    )


class ExportSection(Section):
    int8: bool = Field(True, description="ONNX'in yanında int8 dinamik nicemlenmiş sürüm de üret")


class ClassifierConfig(Section):
    model: ModelSection
    veri: DataSection
    artirma: AugmentSection = Field(default_factory=AugmentSection)
    egitim: TrainSection
    esik: ThresholdSection = Field(default_factory=ThresholdSection)
    disa_aktarim: ExportSection = Field(default_factory=ExportSection)
