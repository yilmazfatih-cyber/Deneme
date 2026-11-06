"""Tarama adımı: tez + çubuklar → sinyal → risk bekçisi → (sanal) emir.

Aynı kod hem canlı döngüde (her dakika) hem geriye dönük testte çalışır; ikisi arasındaki tek
fark, verinin hangi karar anına kilitlendiği ve emrin hangi fiyattan dolduğudur.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Callable

import pandas as pd

from .arastirma.ajan import gecerli_tezler
from .ayarlar import Piyasa, RiskAyarlari
from .risk.bekci import Karar, RiskBekcisi
from .strateji.kurallar import Sinyal, StratejiAyarlari, Tez, sinyal_uret
from .veri.kaynak import aralik_suresi
from .veri.zaman_kilidi import ZamanKilitliVeri
from .yurutme.sanal_araci import Dolum, Emir, SanalAraci, adet_yuvarla


@dataclass
class AdimSonucu:
    sinyal: Sinyal
    emir: Emir
    karar: Karar
    dolum: Dolum | None


def geriye_bakis(aralik: str, strateji: StratejiAyarlari) -> pd.Timedelta:
    """Uzun ortalama için yeterli çubuğu kapsayan süre (hafta sonu ve seans dışı payıyla)."""
    sure = aralik_suresi(aralik)
    if sure >= pd.Timedelta(days=1):
        return pd.Timedelta(days=int(strateji.uzun_pencere * 1.6) + 10)
    seans_cubugu = pd.Timedelta(hours=8) / sure
    gun = int(strateji.uzun_pencere / max(seans_cubugu, 1) * 1.6) + 5
    return pd.Timedelta(days=gun)


def tara(
    db: sqlite3.Connection,
    piyasa: Piyasa,
    risk: RiskAyarlari,
    veri: ZamanKilitliVeri,
    evren: list[str],
    aralik: str = "1d",
    strateji: StratejiAyarlari = StratejiAyarlari(),
    saat_denetimi: bool = True,
    dolum_fiyati: Callable[[str], float | None] | None = None,
) -> list[AdimSonucu]:
    araci = SanalAraci(db, piyasa)
    bekci = RiskBekcisi(risk, piyasa, saat_denetimi=saat_denetimi)
    an = veri.an
    tezler = gecerli_tezler(db, piyasa.kod, an.isoformat())
    durum = araci.durum()

    # Tezi AL olanlar + elde tutulanlar; tezsiz test modunda tüm evren.
    if strateji.tezsiz_olasilik is not None:
        hisseler = list(dict.fromkeys([*evren, *durum.pozisyonlar]))
    else:
        hisseler = list(dict.fromkeys([*(h for h, t in tezler.items() if t["karar"] == "AL"), *durum.pozisyonlar]))

    baslangic = (an - geriye_bakis(aralik, strateji)).to_pydatetime()
    cubuklar: dict[str, pd.DataFrame] = {}
    fiyatlar: dict[str, float] = {}
    for h in hisseler:
        df = veri.cubuklar(piyasa.sembol(h), baslangic, aralik=aralik)
        if not df.empty:
            cubuklar[h] = df
            fiyatlar[h] = float(df["kapanis"].iloc[-1])

    durum = araci.gun_guncelle(an.to_pydatetime(), fiyatlar, risk.max_dusus_limiti)
    varlik = durum.varlik(fiyatlar)

    sinyaller: list[Sinyal] = []
    for h, df in cubuklar.items():
        adet, maliyet = durum.pozisyonlar.get(h, (0.0, 0.0))
        t = tezler.get(h)
        tez = Tez(t["karar"], t["olasilik"]) if t is not None else None
        s = sinyal_uret(h, df, tez, adet, maliyet, risk, strateji)
        if s is not None:
            sinyaller.append(s)

    sonuclar: list[AdimSonucu] = []
    # Önce satışlar: nakit açar ve riski azaltır.
    for s in sorted(sinyaller, key=lambda x: x.yon != "SAT"):
        fiyat = fiyatlar[s.hisse]
        if s.yon == "SAT":
            adet = durum.pozisyonlar.get(s.hisse, (0.0, 0.0))[0]
        else:
            hedef_deger = s.hedef_oran * varlik - durum.pozisyon_degeri(s.hisse, fiyat)
            adet = adet_yuvarla(hedef_deger / fiyat, piyasa)
        if adet <= 0:
            continue
        emir = Emir(piyasa.kod, s.hisse, s.yon, adet, fiyat, s.neden)
        karar = bekci.denetle(emir, durum, fiyatlar, an.to_pydatetime())
        dolum = None
        if karar.emir is not None:
            dolum_f = dolum_fiyati(s.hisse) if dolum_fiyati else fiyat
            if dolum_f is not None:
                try:
                    dolum = araci.uygula(karar.emir, dolum_f, an.to_pydatetime())
                except ValueError as h:  # ör. açılış boşluğu nakdi yetersiz bıraktı
                    karar = Karar(None, f"Uygulanamadı: {h}")
                durum = araci.durum()
        sonuclar.append(AdimSonucu(s, emir, karar, dolum))
    return sonuclar
