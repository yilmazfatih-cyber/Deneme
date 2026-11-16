"""Gömme (embedding) sağlayıcıları: metni sabit boyutlu vektöre çevirir.

Üç seçenek:
    KarmaGomme            bağımlılıksız yedek: karakter n-gram + kelime kökü, karma (hashing)
                          ile sabit boyuta indirilir, TF-IDF ağırlıklı. Modelsiz çalışır; anlamı
                          değil yazımı yakalar (eş anlamlıları bulmaz). Testler ve hızlı başlangıç.
    SaglayiciGomme        OpenAI uyumlu `/v1/embeddings` ucu (Ollama, llama.cpp, vLLM…).
    CumleDonusturucuGomme yerel `sentence-transformers` modeli (isteğe bağlı ekstra: `yerel`).
Hepsi `gom(metinler) -> np.ndarray` (float32, satırlar L2 normlu) verir.
Kim kullanır: rag/dizin.py, istem/az_ornek.py, degerlendirme (gömme benzerliği puanlayıcısı).
Genişletme: yeni gömme → `Gomme` protokolüne uyan sınıf + `durum()`; diskten geri kurmak için
`gomme_durumdan` içine bir dal (YENİ GÖMME BURAYA).
"""

from __future__ import annotations

import math
import zlib
from collections import Counter
from collections.abc import Sequence
from typing import Any, Protocol

import numpy as np

from yz.hatalar import AyarHatasi, ekstra_gerekli
from yz.metin import karakter_ngramlari, kelimeler


class Gomme(Protocol):
    """Gömme sağlayıcısı arayüzü."""

    tur: str

    def gom(self, metinler: Sequence[str]) -> np.ndarray: ...

    def durum(self) -> dict[str, Any]: ...


def normalle(matris: np.ndarray) -> np.ndarray:
    """Satırları L2 normuna böler (sıfır satırlar sıfır kalır)."""
    matris = np.asarray(matris, dtype=np.float32)
    if matris.ndim == 1:
        matris = matris[None, :]
    normlar = np.linalg.norm(matris, axis=1, keepdims=True)
    normlar[normlar == 0] = 1.0
    sonuc: np.ndarray = (matris / normlar).astype(np.float32)
    return sonuc


class KarmaGomme:
    """Karakter n-gram karma TF-IDF gömmesi (bağımlılıksız, belirlenimci)."""

    tur = "karma"

    def __init__(
        self,
        boyut: int = 1024,
        ngram: tuple[int, int] = (3, 5),
        kelime_agirligi: float = 1.0,
        idf: Sequence[float] | np.ndarray | None = None,
    ) -> None:
        if boyut < 16:
            raise ValueError("boyut en az 16 olmalı.")
        self.boyut = boyut
        self.ngram = ngram
        self.kelime_agirligi = kelime_agirligi
        self.idf: np.ndarray | None = None if idf is None else np.asarray(idf, dtype=np.float32)

    def _ozellikler(self, metin: str) -> Counter[str]:
        sayac: Counter[str] = Counter()
        for n in range(self.ngram[0], self.ngram[1] + 1):
            sayac.update(karakter_ngramlari(metin, n))
        if self.kelime_agirligi > 0:
            sayac.update(f"k:{k}" for k in kelimeler(metin, kok="ek"))
        return sayac

    def _ham(self, metin: str) -> np.ndarray:
        vektor = np.zeros(self.boyut, dtype=np.float32)
        for ozellik, adet in self._ozellikler(metin).items():
            ozet = zlib.crc32(ozellik.encode("utf-8"))
            isaret = 1.0 if ozet & 0x80000000 else -1.0
            agirlik = self.kelime_agirligi if ozellik.startswith("k:") else 1.0
            vektor[ozet % self.boyut] += isaret * agirlik * (1.0 + math.log(adet))
        return vektor

    def idf_ogren(self, metinler: Sequence[str]) -> None:
        """Belge sıklığından kova başına IDF ağırlığı öğrenir (dizin kurulurken çağrılır)."""
        if not metinler:
            return
        belge_sikligi = np.zeros(self.boyut, dtype=np.float64)
        for metin in metinler:
            kovalar = {zlib.crc32(o.encode("utf-8")) % self.boyut for o in self._ozellikler(metin)}
            belge_sikligi[list(kovalar)] += 1
        n = len(metinler)
        self.idf = (np.log((1 + n) / (1 + belge_sikligi)) + 1.0).astype(np.float32)

    def gom(self, metinler: Sequence[str]) -> np.ndarray:
        if not metinler:
            return np.zeros((0, self.boyut), dtype=np.float32)
        matris = np.stack([self._ham(m) for m in metinler])
        if self.idf is not None:
            matris *= self.idf
        return normalle(matris)

    def durum(self) -> dict[str, Any]:
        return {
            "tur": self.tur,
            "boyut": self.boyut,
            "ngram": list(self.ngram),
            "kelime_agirligi": self.kelime_agirligi,
            "idf": None if self.idf is None else [round(float(x), 6) for x in self.idf],
        }


class GomebilirSaglayici(Protocol):
    def gom(self, metinler: Sequence[str]) -> list[list[float]]: ...


class SaglayiciGomme:
    """Bir sağlayıcının (ör. `OpenAIUyumlu`) `/v1/embeddings` ucunu kullanır."""

    tur = "saglayici"

    def __init__(self, saglayici: GomebilirSaglayici, ad: str = "") -> None:
        self.saglayici = saglayici
        self.ad = ad

    def gom(self, metinler: Sequence[str]) -> np.ndarray:
        if not metinler:
            return np.zeros((0, 0), dtype=np.float32)
        return normalle(np.asarray(self.saglayici.gom(list(metinler)), dtype=np.float32))

    def durum(self) -> dict[str, Any]:
        return {"tur": self.tur, "ad": self.ad}


class CumleDonusturucuGomme:
    """Yerel `sentence-transformers` modeli (ilk kullanımda model indirilir)."""

    tur = "cumle_donusturucu"

    def __init__(self, model_adi: str, cihaz: str = "cpu") -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as hata:
            raise ekstra_gerekli("sentence-transformers", "yerel") from hata
        self.model_adi = model_adi
        self._model = SentenceTransformer(model_adi, device=cihaz)

    def gom(self, metinler: Sequence[str]) -> np.ndarray:
        vektorler = self._model.encode(list(metinler), normalize_embeddings=True)
        return normalle(np.asarray(vektorler, dtype=np.float32))

    def durum(self) -> dict[str, Any]:
        return {"tur": self.tur, "model_adi": self.model_adi}


def gomme_durumdan(durum: dict[str, Any], saglayici: GomebilirSaglayici | None = None) -> Gomme:
    """`durum()` çıktısından gömmeyi yeniden kurar (dizin diskten yüklenirken)."""
    tur = durum.get("tur")
    if tur == "karma":
        return KarmaGomme(
            boyut=int(durum["boyut"]),
            ngram=(int(durum["ngram"][0]), int(durum["ngram"][1])),
            kelime_agirligi=float(durum.get("kelime_agirligi", 1.0)),
            idf=durum.get("idf"),
        )
    if tur == "saglayici":
        if saglayici is None:
            raise AyarHatasi(
                "Bu dizin bir model sunucusunun gömmeleriyle kurulmuş; yüklerken aynı sağlayıcıyı "
                "verin (komut satırında --saglayici)."
            )
        return SaglayiciGomme(saglayici, str(durum.get("ad", "")))
    if tur == "cumle_donusturucu":
        return CumleDonusturucuGomme(str(durum["model_adi"]))
    # YENİ GÖMME BURAYA: if tur == "...": return ...
    raise AyarHatasi(f"Bilinmeyen gömme türü: {tur!r}")
