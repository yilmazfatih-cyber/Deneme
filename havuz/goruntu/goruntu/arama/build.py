"""Klasörden dizin kurma/güncelleme: dosyaları güvenle açar, yeni olanları gömer, dizine ekler.

Kim kullanır: `indeksle` komutu, `arama-olc`, testler.

Artımlı: dizinde kimliği (dosyanın SHA-256'sı) olan dosya yeniden gömülmez; yalnız yeniler işlenir.
Açılamayan dosyalar (bozuk, çok büyük, desteklenmeyen) atlanır ve nedenleriyle döndürülür.
Bellek: görüntüler `yigin` kadarlık parçalarla açılıp gömülür; hepsi birden belleğe alınmaz.

Genişletme: dizine yeni bir öğe alanı (ör. ürün kodu) eklenecekse `IndexItem`'a alan, burada değeri
ekleyin; eski dizinler için alanı isteğe bağlı yapın.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from goruntu import console
from goruntu.arama.embedders import Embedder
from goruntu.arama.index import ImageIndex, IndexItem
from goruntu.errors import ImageRejectedError
from goruntu.hazirlik.loader import DEFAULT_LIMITS, LoadLimits, load_rgb
from goruntu.io_utils import sha256_file
from goruntu.messages import t


def index_files(
    index: ImageIndex,
    paths: list[Path],
    embedder: Embedder,
    limits: LoadLimits = DEFAULT_LIMITS,
    batch: int = 16,
) -> tuple[int, list[tuple[Path, str]]]:
    """Dosyaları dizine ekler: (eklenen sayısı, [(atlanan yol, neden)])."""
    added = 0
    rejected: list[tuple[Path, str]] = []
    pending: list[tuple[IndexItem, Image.Image]] = []
    progress = console.Progress(t("arama.dizinleniyor"), len(paths))

    def flush() -> int:
        if not pending:
            return 0
        vectors = embedder.embed_images([image for _, image in pending])
        count = index.add([item for item, _ in pending], vectors)
        pending.clear()
        return count

    for number, path in enumerate(paths, start=1):
        try:
            item_id = sha256_file(path)
            if not index.contains(item_id) and all(i.kimlik != item_id for i, _ in pending):
                image = load_rgb(path, limits)
                pending.append(
                    (
                        IndexItem(
                            kimlik=item_id,
                            yol=str(path),
                            genislik=image.width,
                            yukseklik=image.height,
                        ),
                        image,
                    )
                )
        except (ImageRejectedError, OSError) as exc:
            rejected.append((path, str(exc)))
        if len(pending) >= batch:
            added += flush()
        progress.step(number)
    added += flush()
    return added, rejected


def embed_query_image(embedder: Embedder, source: Path | bytes, limits: LoadLimits) -> np.ndarray:
    """Tek sorgu görüntüsünün gömmesi (1, boyut)."""
    return embedder.embed_images([load_rgb(source, limits)])
