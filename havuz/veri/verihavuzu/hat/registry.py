"""Hat kaydı: komut satırındaki ``hat calistir <ad>`` adlarını hat tanımlarına bağlayan TEK yer.

Genişletme: yeni hattı ``examples/`` altına yazın, aşağıya "YENİ HAT BURAYA" satırının üstüne
ekleyin ve kayıtlı yanıtlarla çevrimdışı testini yazın (``tests/test_hat.py``yi örnek alın).
"""

from __future__ import annotations

from verihavuzu.hat.examples import tcmb
from verihavuzu.hat.pipeline import PipelineSpec

PIPELINES: dict[str, PipelineSpec] = {
    tcmb.SPEC.ad: tcmb.SPEC,
    # YENİ HAT BURAYA
}


def get_pipeline(name: str) -> PipelineSpec:
    try:
        return PIPELINES[name]
    except KeyError:
        raise KeyError(f"Bilinmeyen hat: {name}. Seçenekler: {', '.join(PIPELINES)}") from None
