"""Kullanım (belirteç) sayacı ve maliyet hesabı.

Fiyatlar KULLANICI AYARIDIR: kodda hiçbir fiyat yoktur. Fiyat tablosu yz.yaml dosyasındaki
`fiyatlar` bölümünden okunur (1 milyon belirteç başına; para birimi sizin seçiminizdir).
Tabloda olmayan modelin maliyeti None ("bilinmiyor") döner, sıfır değil.
Kim kullanır: saglayici/taban.py (her çağrı), degerlendirme (koşu ve karşılaştırma tabloları).
Genişletme: önbellek okuma indirimi gibi yeni bir fiyat kalemi → `ModelFiyati`'na alan ekleyin.
"""

from __future__ import annotations

import fnmatch
import threading
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from yz.ayar import ModelFiyati
from yz.saglayici.tipler import Kullanim

__all__ = ["FiyatTablosu", "KullanimSayaci", "ModelFiyati"]


class FiyatTablosu(BaseModel):
    """Model adı (ya da `qwen*` gibi kalıp) → fiyat. Tam ad eşleşmesi kalıptan önce gelir."""

    fiyatlar: dict[str, ModelFiyati] = Field(default_factory=dict)
    para_birimi: str = ""

    def fiyat(self, model: str) -> ModelFiyati | None:
        if model in self.fiyatlar:
            return self.fiyatlar[model]
        for kalip in sorted(self.fiyatlar, key=len, reverse=True):
            if fnmatch.fnmatchcase(model, kalip):
                return self.fiyatlar[kalip]
        return None

    def maliyet(self, model: str, kullanim: Kullanim) -> float | None:
        """Çağrının maliyeti; model tabloda yoksa None. Önbellekten gelen yanıt 0'dır."""
        if kullanim.onbellekten:
            return 0.0
        fiyat = self.fiyat(model)
        if fiyat is None:
            return None
        return (
            kullanim.girdi_belirteci * fiyat.girdi + kullanim.cikti_belirteci * fiyat.cikti
        ) / 1_000_000


@dataclass
class KullanimSayaci:
    """Çağrılar boyunca toplam kullanımı ve maliyeti biriktirir (iş parçacığı güvenli)."""

    cagri: int = 0
    onbellek_isabeti: int = 0
    girdi_belirteci: int = 0
    cikti_belirteci: int = 0
    maliyet: float = 0.0
    maliyeti_bilinmeyen_cagri: int = 0
    _kilit: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def ekle(self, kullanim: Kullanim, maliyet: float | None) -> None:
        with self._kilit:
            self.cagri += 1
            if kullanim.onbellekten:
                self.onbellek_isabeti += 1
                return
            self.girdi_belirteci += kullanim.girdi_belirteci
            self.cikti_belirteci += kullanim.cikti_belirteci
            if maliyet is None:
                self.maliyeti_bilinmeyen_cagri += 1
            else:
                self.maliyet += maliyet

    @property
    def toplam_belirtec(self) -> int:
        return self.girdi_belirteci + self.cikti_belirteci

    def ozet(self) -> str:
        """İnsan için tek satırlık özet."""
        maliyet = (
            "maliyet bilinmiyor (yz.yaml'a fiyat ekleyin)"
            if self.maliyeti_bilinmeyen_cagri
            else f"maliyet {self.maliyet:.6f}"
        )
        return (
            f"{self.cagri} çağrı ({self.onbellek_isabeti} önbellekten), "
            f"{self.girdi_belirteci} girdi + {self.cikti_belirteci} çıktı belirteci, {maliyet}"
        )
