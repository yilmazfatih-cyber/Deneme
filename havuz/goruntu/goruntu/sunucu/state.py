"""Sunucu durumu: yüklü bileşenler (sınıflandırıcı, dizin, gömme modeli), sınırlar ve API anahtarı.

Kim kullanır: `sunucu/app.py`, `sun` komutu, testler (sahte bileşenlerle).

Bileşenlerin hepsi isteğe bağlıdır: yalnız `--model` verilirse /siniflandir, yalnız `--dizin` verilirse
/ara ve /benzer çalışır; eksik bileşenin ucu 503 ve yol gösteren ileti döner.
Testlerde gerçek model yerine aynı yöntemleri sağlayan sahte nesneler verilir (`Classifier`,
`Embedder` arayüzleri).

Genişletme: yeni bir bileşen (ör. nesne algılayıcı) için `ServerState`'e alan, `load_components`'e
yükleme ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from goruntu.hazirlik.loader import DEFAULT_LIMITS, LoadLimits


@dataclass
class ServerState:
    classifier: Any | None = None  # `predict(görüntüler, top)` → list[Prediction]
    index: Any | None = None  # arama.index.ImageIndex
    embedder: Any | None = None  # arama.embedders.Embedder
    api_key: str | None = None
    limits: LoadLimits = DEFAULT_LIMITS
    allowed_origins: tuple[str, ...] = field(default_factory=tuple)


def load_components(model: str | None, index_dir: str | None) -> tuple[Any, Any, Any]:
    """Komut satırı seçeneklerinden bileşenleri yükler: (sınıflandırıcı, dizin, gömme modeli)."""
    classifier = index = embedder = None
    if model:
        from goruntu.disa_aktar.runtime import OnnxClassifier

        classifier = OnnxClassifier(Path(model))
    if index_dir:
        from goruntu.arama.embedders import embedder_for_index
        from goruntu.arama.index import ImageIndex

        index = ImageIndex.load(Path(index_dir))
        embedder = embedder_for_index(index.meta.model)
    return classifier, index, embedder
