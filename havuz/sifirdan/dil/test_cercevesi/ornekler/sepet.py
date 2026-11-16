"""Örnek testlerin sınadığı küçük modül: alışveriş sepeti (fiyatlar kuruş cinsinden tamsayı).

Genişletme: yeni bir kural (ör. kargo ücreti) ekleyip test_ornek_sepet.py'ye testini yazın.
"""

from __future__ import annotations


class Sepet:
    def __init__(self) -> None:
        self.kalemler: dict[str, tuple[int, int]] = {}  # ad -> (birim fiyat kuruş, adet)

    def ekle(self, ad: str, fiyat_kurus: int, adet: int = 1) -> None:
        if fiyat_kurus < 0 or adet <= 0:
            raise ValueError("fiyat negatif, adet sıfır olamaz")
        eski = self.kalemler.get(ad, (fiyat_kurus, 0))[1]
        self.kalemler[ad] = (fiyat_kurus, eski + adet)

    def toplam(self, indirim_yuzde: int = 0) -> int:
        if not 0 <= indirim_yuzde <= 100:
            raise ValueError("indirim 0 ile 100 arasında olmalı")
        ham = sum(fiyat * adet for fiyat, adet in self.kalemler.values())
        return ham - ham * indirim_yuzde // 100
