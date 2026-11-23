"""Yazıya çevirme sonucunun veri tipleri (Pydantic): Kelime, Bolut, Transkript.

Zamanlar saniyedir ve sesin başına göredir. `Transkript.metin` bölütlerin birleşimidir.
JSON çıktısı bu alan adlarıyla yazılır (`python -m ses yaziya --bicim json`); OpenAI biçimine
dönüşüm sunucu/bicim.py'dedir. Kim kullanır: stt/, olcum/, sunucu/, komutlar.py.
Genişletme: yeni alan → varsayılan değerli olarak ekleyin (eski JSON'lar okunmaya devam etsin).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Kelime(BaseModel):
    """Tek bir sözcük ve zamanı (faster-whisper `word_timestamps`)."""

    baslangic: float = Field(ge=0)
    bitis: float = Field(ge=0)
    metin: str
    olasilik: float | None = None


class Bolut(BaseModel):
    """Modelin bir seferde ürettiği metin parçası (genellikle bir cümle ya da yarım cümle)."""

    kimlik: int = 0
    baslangic: float = Field(ge=0)
    bitis: float = Field(ge=0)
    metin: str
    kelimeler: list[Kelime] = Field(default_factory=list)
    ort_logolasilik: float | None = None
    konusma_yok_olasiligi: float | None = None


class Transkript(BaseModel):
    """Bir sesin yazıya çevrilmiş hâli."""

    dil: str = "tr"
    sure: float = Field(ge=0, description="sesin süresi (saniye)")
    model: str = ""
    bolutler: list[Bolut] = Field(default_factory=list)
    uyarilar: list[str] = Field(default_factory=list)

    @property
    def metin(self) -> str:
        return " ".join(b.metin.strip() for b in self.bolutler if b.metin.strip())

    def kaydir(self, saniye: float) -> Transkript:
        """Bütün zamanları `saniye` kadar ileri kaydırılmış kopya (parçaları birleştirirken)."""
        bolutler = [
            b.model_copy(
                update={
                    "baslangic": b.baslangic + saniye,
                    "bitis": b.bitis + saniye,
                    "kelimeler": [
                        k.model_copy(
                            update={"baslangic": k.baslangic + saniye, "bitis": k.bitis + saniye}
                        )
                        for k in b.kelimeler
                    ],
                }
            )
            for b in self.bolutler
        ]
        return self.model_copy(update={"bolutler": bolutler})
