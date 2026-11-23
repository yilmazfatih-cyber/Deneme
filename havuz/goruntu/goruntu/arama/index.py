"""Görüntü dizini: normalize vektörlerle numpy kaba kuvvet arama + diske kaydetme.

Kim kullanır: `indeksle`, `ara`, `benzer` komutları ve sunucu.
Kaynak: `havuz/yz/yz/rag/vektor_deposu.py` (kopyalanıp görüntü öğeleriyle uyarlandı).

Diskte iki dosya (klasör = dizin): `vektorler.npy` (float32, satır başına bir görüntü, L2-normlu) ve
`dizin.json` (model adı, boyut, öğeler: kimlik = dosyanın SHA-256'sı, yol, genişlik, yükseklik).
Yazma atomiktir (geçici dosya + yer değiştirme). Kimlik içerikten geldiği için aynı dosya iki kez
eklenmez; dosya taşınsa da kimlik değişmez.
Neden kaba kuvvet: ~100 bin görüntüye kadar tek matris çarpımı yeterince hızlıdır (512 boyutta 100 bin
satır ≈ 200 MB); yaklaşık arama (HNSW/FAISS) bağımlılığı gerekmez. Ötesi README Sınırlar'da.
Bir dizin TEK modelle kurulur: başka modelle sorgu boyut/uzay uyuşmazlığıdır, açık hata verir.

Genişletme: başka bir arka uç (FAISS…) için aynı `add` / `search` / `save` / `load` arayüzüyle yeni
sınıf yazın; `tests/test_search.py` içindeki kaydet-yükle testini onunla da koşun.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from goruntu.arama.embedders import normalize
from goruntu.errors import UserError, explain_validation_error
from goruntu.io_utils import read_json, write_json
from goruntu.messages import t

VECTORS_FILE, META_FILE = "vektorler.npy", "dizin.json"
FORMAT_VERSION = 1


class IndexItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kimlik: str = Field(min_length=8)
    yol: str
    genislik: int = 0
    yukseklik: int = 0


class IndexMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bicim: int = FORMAT_VERSION
    model: str
    boyut: int = Field(ge=1)
    guncelleme: str = ""
    ogeler: list[IndexItem] = Field(default_factory=list)


class ImageIndex:
    def __init__(self, model: str, dim: int) -> None:
        self.meta = IndexMeta(model=model, boyut=dim)
        self.vectors = np.zeros((0, dim), dtype=np.float32)
        self._ids: set[str] = set()

    def __len__(self) -> int:
        return len(self.meta.ogeler)

    @property
    def items(self) -> list[IndexItem]:
        return self.meta.ogeler

    def contains(self, item_id: str) -> bool:
        return item_id in self._ids

    def add(self, items: list[IndexItem], vectors: np.ndarray) -> int:
        """Yeni öğeleri ekler (aynı kimlik ikinci kez eklenmez); eklenen sayısını döndürür."""
        matrix = normalize(vectors) if len(items) else np.zeros((0, self.meta.boyut), np.float32)
        if matrix.shape[1] != self.meta.boyut:
            raise UserError(
                t("arama.boyut_uyusmuyor", dizin=self.meta.boyut, gelen=matrix.shape[1])
            )
        keep = []
        for row, item in enumerate(items):
            if item.kimlik not in self._ids:
                self._ids.add(item.kimlik)
                keep.append(row)
                self.meta.ogeler.append(item)
        self.vectors = np.concatenate([self.vectors, matrix[keep]])
        return len(keep)

    def search(
        self, query: np.ndarray, k: int = 10, exclude: set[str] | None = None
    ) -> list[tuple[IndexItem, float]]:
        """En benzer `k` öğe: [(öğe, kosinüs benzerliği)], benzerliği azalan; eşitlikte ekleme sırası."""
        if len(self) == 0 or k <= 0:
            return []
        vector = normalize(query)[0]
        if vector.shape[0] != self.meta.boyut:
            raise UserError(
                t("arama.boyut_uyusmuyor", dizin=self.meta.boyut, gelen=vector.shape[0])
            )
        scores = self.vectors @ vector
        if exclude:
            for row, item in enumerate(self.items):
                if item.kimlik in exclude:
                    scores[row] = -np.inf
        count = min(k, int(np.isfinite(scores).sum()))
        if count == 0:
            return []
        candidates = np.argpartition(-scores, count - 1)[:count]
        ordered = candidates[np.lexsort((candidates, -scores[candidates]))]
        return [(self.items[int(i)], float(scores[int(i)])) for i in ordered]

    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / f".{VECTORS_FILE}.gecici.npy"
        np.save(temporary, self.vectors, allow_pickle=False)
        temporary.replace(directory / VECTORS_FILE)  # aynı klasörde yeniden adlandırma: atomik
        self.meta.guncelleme = datetime.now(UTC).isoformat(timespec="seconds")
        write_json(directory / META_FILE, self.meta.model_dump(mode="json"))

    @classmethod
    def load(cls, directory: Path) -> ImageIndex:
        if not (directory / META_FILE).is_file() or not (directory / VECTORS_FILE).is_file():
            raise UserError(t("arama.dizin_yok", yol=directory))
        try:
            meta = IndexMeta.model_validate(read_json(directory / META_FILE))
        except ValidationError as exc:
            detail = "; ".join(explain_validation_error(exc))
            raise UserError(t("arama.dizin_bozuk", yol=directory, ayrinti=detail)) from exc
        vectors = np.load(directory / VECTORS_FILE, allow_pickle=False).astype(np.float32)
        if vectors.shape != (len(meta.ogeler), meta.boyut):
            raise UserError(
                t("arama.dizin_bozuk", yol=directory, ayrinti=f"vektör şekli {vectors.shape}")
            )
        index = cls(meta.model, meta.boyut)
        index.meta, index.vectors = meta, vectors
        index._ids = {item.kimlik for item in meta.ogeler}
        return index
