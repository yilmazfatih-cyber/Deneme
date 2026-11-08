"""Zaman kilidi: geriye testte karar tarihi `T`'den sonra taranmış/görülmüş hiçbir kayıt okunmaz (PLAN bölüm 9).

    kilitli = kilitle(depo, date(2024, 9, 30))
    kilitli.sinyaller("SS25")   # yalnız tarama_tarihi ≤ T parçalar ve kaynak_tarihi ≤ T rapor sinyalleri
    kilitli.gozlemler("TR", "orta", "kadin-ust")  # yalnız tarih ≤ T görülmeler

Sarmalayıcı salt okunurdur; yazma yöntemleri ve ham bağlantı erişimi bilerek kapatılmıştır (kilidi delmesin).
"""

from __future__ import annotations

from datetime import date

from moda_radar.sema import GozlemKaydi, SinyalKaydi


class KilitDelinmesi(AttributeError):
    pass


class KilitliDepo:
    def __init__(self, depo, tarih: date) -> None:
        object.__setattr__(self, "_depo", depo)
        object.__setattr__(self, "tarih", tarih)

    def sinyaller(self, sezon: str | None = None) -> list[SinyalKaydi]:
        return [s for s in self._depo.sinyaller(sezon, kadar=self.tarih) if s.kaynak_tarihi <= self.tarih]

    def gozlemler(self, ulke: str = "TR", segment: str | None = None, kategori: str | None = None) -> list[GozlemKaydi]:
        return [
            g for g in self._depo.gozlemler(ulke, segment, kategori, kadar=self.tarih) if g.ilk_gorulme <= self.tarih
        ]

    def __getattr__(self, ad: str):
        raise KilitDelinmesi(f"KilitliDepo yalnız sinyaller() ve gozlemler() sunar; '{ad}' kilidi delebilir")

    def __setattr__(self, ad: str, deger) -> None:
        raise KilitDelinmesi("KilitliDepo değiştirilemez")


def kilitle(depo, tarih: date) -> KilitliDepo:
    return KilitliDepo(depo, tarih)
