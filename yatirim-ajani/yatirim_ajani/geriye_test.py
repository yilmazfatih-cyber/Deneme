"""Geriye dönük test: kurallı katmanı geçmişte, zaman kilidiyle ve gerçekçi maliyetle çalıştırır.

Her adımda karar, o çubuk KAPANDIKTAN sonra verilir ve emir bir SONRAKİ çubuğun açılışından
dolar. Sonuç iki ölçütle kıyaslanır: piyasa göstergesini al-tut ve evreni eşit ağırlıkla al-tut.

Uyarı: Bu test dil modelini çalıştırmaz (tezsiz mod). Dil modelini geçmiş tarihlerde test etmek
hem pahalıdır hem de modelin eğitim verisi o dönemi "biliyor" olabilir; ajanın gerçek tahmin
becerisini ancak canlı tahmin günlüğü ölçer.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

from .ayarlar import Piyasa, RiskAyarlari
from .depo import baglan
from .motor import geriye_bakis, tara
from .strateji.kurallar import StratejiAyarlari
from .veri.kaynak import OnbellekliKaynak, VeriKaynagi, aralik_suresi
from .veri.zaman_kilidi import ZamanKilitliVeri
from .yurutme.sanal_araci import SanalAraci


@dataclass
class Olcumler:
    toplam_getiri: float
    yillik_getiri: float
    yillik_oynaklik: float
    sharpe: float | None
    max_dusus: float


@dataclass
class GeriyeTestSonucu:
    egri: pd.Series  # varlık değeri
    strateji: Olcumler
    gosterge: Olcumler | None
    esit_agirlik: Olcumler | None
    islem_sayisi: int
    toplam_maliyet: float
    durduruldu: str | None

    def metin(self, para_birimi: str) -> str:
        def satir(ad: str, o: Olcumler | None) -> str:
            if o is None:
                return f"{ad:<22} veri yok"
            sharpe = "-" if o.sharpe is None else f"{o.sharpe:5.2f}"
            return (
                f"{ad:<22} toplam {o.toplam_getiri:+8.2%}  yıllık {o.yillik_getiri:+8.2%}  "
                f"oynaklık {o.yillik_oynaklik:6.2%}  Sharpe {sharpe}  max düşüş {o.max_dusus:7.2%}"
            )

        satirlar = [
            satir("Strateji", self.strateji),
            satir("Gösterge al-tut", self.gosterge),
            satir("Evren eşit al-tut", self.esit_agirlik),
            f"İşlem sayısı: {self.islem_sayisi}   Toplam işlem maliyeti: {self.toplam_maliyet:,.2f} {para_birimi}",
        ]
        if self.durduruldu:
            satirlar.append(f"Hesap durduruldu: {self.durduruldu}")
        if self.gosterge and self.strateji.toplam_getiri <= self.gosterge.toplam_getiri:
            satirlar.append("Sonuç: Strateji göstergeyi masraflar sonrası GEÇEMEDİ. Gerçek parayla kullanmayın.")
        return "\n".join(satirlar)


def olc(egri: pd.Series, yillik_adim: float, risksiz_oran: float = 0.0) -> Olcumler:
    egri = egri.dropna()
    getiriler = egri.pct_change().dropna()
    toplam = float(egri.iloc[-1] / egri.iloc[0] - 1)
    yil = max(len(getiriler) / yillik_adim, 1e-9)
    yillik = float((1 + toplam) ** (1 / yil) - 1) if toplam > -1 else -1.0
    oynaklik = float(getiriler.std() * np.sqrt(yillik_adim)) if len(getiriler) > 1 else 0.0
    fazla = getiriler - risksiz_oran / yillik_adim
    sharpe = float(fazla.mean() / fazla.std() * np.sqrt(yillik_adim)) if fazla.std() > 0 else None
    dusus = float((egri / egri.cummax() - 1).min())
    return Olcumler(toplam, yillik, oynaklik, sharpe, dusus)


def geriye_test(
    kaynak: VeriKaynagi,
    piyasa: Piyasa,
    hisseler: list[str],
    baslangic: datetime,
    bitis: datetime,
    nakit: float,
    risk: RiskAyarlari = RiskAyarlari(),
    strateji: StratejiAyarlari = StratejiAyarlari(tezsiz_olasilik=0.7),
    aralik: str = "1d",
    risksiz_oran: float = 0.0,
) -> GeriyeTestSonucu:
    bas = pd.Timestamp(baslangic)
    bit = pd.Timestamp(bitis)
    if bas.tzinfo is None:
        bas, bit = bas.tz_localize(piyasa.saat_dilimi), bit.tz_localize(piyasa.saat_dilimi)
    on_bellek = OnbellekliKaynak(
        kaynak, (bas - geriye_bakis(aralik, strateji)).to_pydatetime(), (bit + pd.Timedelta(days=5)).to_pydatetime()
    )
    semboller = {h: piyasa.sembol(h) for h in hisseler}
    tum = {h: on_bellek.tum(s, aralik) for h, s in semboller.items()}
    tum = {h: df for h, df in tum.items() if not df.empty}
    if not tum:
        raise ValueError("Hiçbir hisse için veri bulunamadı")

    zamanlar = sorted(set().union(*(df.index[(df.index >= bas) & (df.index < bit)] for df in tum.values())))
    if len(zamanlar) < 2:
        raise ValueError("Test aralığında yeterli çubuk yok")
    sure = aralik_suresi(aralik)

    db = baglan(":memory:")
    araci = SanalAraci(db, piyasa)
    araci.hesap_ac(nakit)
    egri: dict[pd.Timestamp, float] = {}

    for i, z in enumerate(zamanlar[:-1]):
        sonraki = zamanlar[i + 1]
        an = z + sure
        veri = ZamanKilitliVeri(on_bellek, an.to_pydatetime())

        def dolum(h: str, _s: pd.Timestamp = sonraki) -> float | None:
            df = tum.get(h)
            if df is None or _s not in df.index:
                return None
            return float(df.at[_s, "acilis"])

        tara(db, piyasa, risk, veri, list(tum), aralik, strateji, saat_denetimi=False, dolum_fiyati=dolum)
        fiyatlar = {h: float(df["kapanis"].asof(z)) for h, df in tum.items() if not np.isnan(df["kapanis"].asof(z))}
        egri[an] = araci.durum().varlik(fiyatlar)

    egri_s = pd.Series(egri, name="varlik")
    yillik_adim = 252.0 if sure >= pd.Timedelta(days=1) else 252.0 * (pd.Timedelta(hours=8) / sure)

    gosterge = None
    g = on_bellek.tum(piyasa.gosterge, aralik)
    g = g[(g.index >= bas) & (g.index < bit)]["kapanis"]
    if len(g) > 1:
        gosterge = olc(g, yillik_adim, risksiz_oran)

    kapanislar = pd.DataFrame({h: df["kapanis"] for h, df in tum.items()})
    kapanislar = kapanislar[(kapanislar.index >= bas) & (kapanislar.index < bit)].ffill().dropna()
    esit = olc((kapanislar / kapanislar.iloc[0]).mean(axis=1), yillik_adim, risksiz_oran) if len(kapanislar) > 1 else None

    islem = db.execute("SELECT COUNT(*), COALESCE(SUM(maliyet), 0) FROM islemler").fetchone()
    return GeriyeTestSonucu(
        egri=egri_s,
        strateji=olc(egri_s, yillik_adim, risksiz_oran),
        gosterge=gosterge,
        esit_agirlik=esit,
        islem_sayisi=int(islem[0]),
        toplam_maliyet=float(islem[1]),
        durduruldu=araci.durum().durdurma_nedeni,
    )
