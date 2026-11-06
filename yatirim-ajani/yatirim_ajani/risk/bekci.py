"""Risk bekçisi: her emir buradan geçer. Dil modeli DEĞİL, sabit kuraldır.

İlke: riski azaltan işlem (satış) her zaman serbesttir; riski artıran işlem (alım) ancak tüm
sınırlar elverirse ve gerekirse küçültülerek geçer. Bekçi bir emri büyütmez, yalnız küçültür
ya da reddeder.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime

import pandas as pd

from ..ayarlar import Piyasa, RiskAyarlari
from ..yurutme.sanal_araci import Emir, HesapDurumu, adet_yuvarla


@dataclass
class Karar:
    emir: Emir | None
    gerekce: str

    @property
    def onaylandi(self) -> bool:
        return self.emir is not None


def piyasa_acik_mi(an: datetime, piyasa: Piyasa) -> bool:
    yerel = pd.Timestamp(an).tz_convert(piyasa.saat_dilimi)
    return yerel.weekday() < 5 and piyasa.acilis <= yerel.time() < piyasa.kapanis


class RiskBekcisi:
    def __init__(self, risk: RiskAyarlari, piyasa: Piyasa, saat_denetimi: bool = True) -> None:
        self.risk = risk
        self.piyasa = piyasa
        self.saat_denetimi = saat_denetimi

    def denetle(
        self, emir: Emir, hesap: HesapDurumu, fiyatlar: dict[str, float], an: datetime
    ) -> Karar:
        r = self.risk
        fiyat = fiyatlar.get(emir.hisse, emir.referans_fiyat)
        if fiyat <= 0 or emir.adet <= 0:
            return Karar(None, "Geçersiz fiyat ya da adet")
        if self.saat_denetimi and not piyasa_acik_mi(an, self.piyasa):
            return Karar(None, "Piyasa kapalı")
        if hesap.gun_islem_sayisi >= r.max_gunluk_islem:
            return Karar(None, f"Günlük işlem sınırı ({r.max_gunluk_islem}) doldu")

        if emir.yon == "SAT":
            elde = hesap.pozisyonlar.get(emir.hisse, (0.0, 0.0))[0]
            adet = min(emir.adet, elde)
            if adet <= 0:
                return Karar(None, "Elde hisse yok (açığa satış kapalı)")
            return Karar(replace(emir, adet=adet), "Satış: risk azaltır")

        if emir.yon != "AL":
            return Karar(None, f"Bilinmeyen yön: {emir.yon}")
        if hesap.durduruldu:
            return Karar(None, f"Hesap durduruldu: {hesap.durdurma_nedeni}")
        varlik = hesap.varlik(fiyatlar)
        if hesap.gun_basi_varlik and varlik < hesap.gun_basi_varlik * (1 - r.gunluk_zarar_limiti):
            return Karar(None, f"Günlük zarar sınırı (%{r.gunluk_zarar_limiti:.0%}) aşıldı; yeni alım yok")

        # Dolum maliyeti dahil birim fiyat (bekçi iyimser olmasın)
        kayip = (self.piyasa.spread_bps + self.piyasa.kayma_bps) / 10_000
        birim = fiyat * (1 + kayip) * (1 + self.piyasa.komisyon_orani)

        pozisyon_alani = r.max_pozisyon_orani * varlik - hesap.pozisyon_degeri(emir.hisse, fiyat)
        hisse_toplam = sum(hesap.pozisyon_degeri(h, fiyatlar.get(h, m)) for h, (_, m) in hesap.pozisyonlar.items())
        toplam_alan = r.max_hisse_orani * varlik - hisse_toplam
        nakit_alani = hesap.nakit - self.piyasa.sabit_komisyon
        tavan = min(pozisyon_alani, toplam_alan, nakit_alani)
        adet = adet_yuvarla(min(emir.adet, tavan / birim if tavan > 0 else 0.0), self.piyasa)
        if adet * fiyat < r.min_islem_tutari:
            return Karar(None, "Sınırlar sonrası tutar asgari işlem tutarının altında")
        notlar = []
        if adet < emir.adet:
            notlar.append(f"adet {emir.adet:g} → {adet:g} (pozisyon/nakit sınırı)")
        return Karar(replace(emir, adet=adet), "Alım onaylandı" + (f"; {', '.join(notlar)}" if notlar else ""))
