"""Açgözlü parametre ağacı: en etkili parametreden başla, en çok iyileştiren parametreyi ekleyerek dallan.

Parametre adayları iki türdür:
* Sayısal: fiyat/hacim/endeks türevleri (ogrenme.simulasyon.GUNLUK_OZELLIKLER + ek sütunlar).
* LLM/bilgi: bilgi veritabanındaki TARİHLİ, METİN kaynaklı olaylardan türetilen sinyaller
  (son N günde olumlu/olumsuz olay, sektör olayı, makro şok). Dikkat: bu olaylar sonradan
  anlamlandırıldı; tarihleri doğru ama yönleri geriye bakışla etiketlendi. Rapor bunu işaretler.

Skor: seçim penceresinde zaman sıralı iç doğrulama (ilk %75 eğit, son %25 doğrula) ile
ridge-kapılı stratejinin ödülü (log getiri − maks düşüş). İkinci yıl (ileriye yürüyen) sonucu her
düğümde yalnız BİLGİ için yazılır; seçimde kullanılmaz.

Ağaç JSON olarak kaydedilir; budama için etkileşimli sayfaya verilir; budanmış parametre listesi
`agac_degerlendir` ile son teste girer.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .rl import _ridge
from .simulasyon import (
    GUNLUK_OZELLIKLER, ModelKapili, Panel, gunluk_ozellikler, hedef_ertesi_gun, simule,
)  # fmt: skip

EK_SAYISAL = ["hacim_z20", "aralik_gun", "zirve52_uzaklik", "haftanin_gunu", "ay_sonu", "sektor_mom20"]
BILGI_SINYALLERI = ["olumlu_olay_20g", "olumsuz_olay_20g", "sektor_olay_20g", "makro_sok_10g", "olay_guven_20g"]


def ek_ozellikler(panel: Panel, hacim: pd.DataFrame | None, sektorler: dict[str, str]) -> dict[str, pd.DataFrame]:
    k = panel.kapanis
    oz: dict[str, pd.DataFrame] = {}
    if hacim is not None:
        h = hacim.reindex(k.index)
        oz["hacim_z20"] = (h - h.rolling(20).mean()) / h.rolling(20).std().replace(0, np.nan)
    else:
        oz["hacim_z20"] = pd.DataFrame(0.0, index=k.index, columns=k.columns)
    oz["aralik_gun"] = (panel.gunduz.abs()).rolling(5).mean()
    oz["zirve52_uzaklik"] = k / k.rolling(250, min_periods=60).max() - 1
    hg = pd.DataFrame({c: k.index.weekday for c in k.columns}, index=k.index) / 4.0
    oz["haftanin_gunu"] = hg
    ay = pd.Series(k.index.month, index=k.index)
    oz["ay_sonu"] = pd.DataFrame({c: (ay != ay.shift(-1)).astype(float) for c in k.columns}, index=k.index)
    mom = k / k.shift(20) - 1
    sek_mom = pd.DataFrame(index=k.index, columns=k.columns, dtype=float)
    for c in k.columns:
        s = sektorler.get(c)
        es = [d for d in k.columns if sektorler.get(d) == s and d != c]
        sek_mom[c] = mom[es].mean(axis=1) if es else 0.0
    oz["sektor_mom20"] = sek_mom
    return oz


def bilgi_sinyalleri(panel: Panel, olaylar: pd.DataFrame, sektorler: dict[str, str]) -> dict[str, pd.DataFrame]:
    """Metin kaynaklı, tarihli olaylardan gün×hisse sinyalleri. Yalnız bitis <= gün olanlar sayılır."""
    k = panel.kapanis
    sifir = lambda: pd.DataFrame(0.0, index=k.index, columns=k.columns)  # noqa: E731
    oz = {ad: sifir() for ad in BILGI_SINYALLERI}
    if olaylar is None or olaylar.empty:
        return oz
    # Yalnız saf metin olayları: sayısal tespitli (ve onlara anlam eklenmiş "birlesik") olayların
    # varlığı tüm örneklemden bulunur, geleceğe bakar; sinyal olarak kullanılamaz.
    ol = olaylar[olaylar["kaynak_tipi"] == "metin"].copy()
    if ol.empty:
        return oz
    ol["bitis"] = pd.to_datetime(ol["bitis"])
    for gun_i, gun in enumerate(k.index):
        son20 = ol[(ol["bitis"] <= gun) & (ol["bitis"] > gun - pd.Timedelta(days=28))]
        son10 = ol[(ol["bitis"] <= gun) & (ol["bitis"] > gun - pd.Timedelta(days=14))]
        if son20.empty and son10.empty:
            continue
        makro = float(((son10["kapsam"].isin(["yerel_makro", "kuresel"])) & (son10["tur"].isin(["sok", "siyasi", "jeopolitik", "dusus"]))).sum())
        for c in k.columns:
            s = sektorler.get(c)
            kendi = son20[son20["hisse"] == c]
            sek = son20[(son20["kapsam"] == "sektor") & (son20["sektor"] == s)]
            oz["olumlu_olay_20g"].iat[gun_i, k.columns.get_loc(c)] = float((kendi["yon"] == "olumlu").sum())
            oz["olumsuz_olay_20g"].iat[gun_i, k.columns.get_loc(c)] = float((kendi["yon"] == "olumsuz").sum())
            oz["sektor_olay_20g"].iat[gun_i, k.columns.get_loc(c)] = float(len(sek))
            oz["makro_sok_10g"].iat[gun_i, k.columns.get_loc(c)] = makro
            oz["olay_guven_20g"].iat[gun_i, k.columns.get_loc(c)] = float(kendi["guven"].mean()) if len(kendi) else 0.0
    return oz


@dataclass
class Dugum:
    id: int
    ebeveyn: int | None
    eklenen: str | None
    parametreler: list[str]
    tur: str  # "sayisal" | "llm" | "kok"
    dogrulama_odul: float
    dogrulama_korelasyon: float
    dogrulama_islem: int
    ileri_getiri: float | None  # yalnız bilgi
    ileri_bitis: float | None
    ileri_islem: int
    kazanim: float  # ebeveyne göre doğrulama ödülü artışı
    cocuklar: list[int] = field(default_factory=list)
    secili: bool = True  # budama için


@dataclass
class Agac:
    kok: int
    dugumler: dict[int, Dugum]
    esik: float
    secim_penceresi: str
    ileri_penceresi: str
    not_: str

    def kaydet(self, yol: str | Path) -> None:
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
        veri = {"kok": self.kok, "esik": self.esik, "secim_penceresi": self.secim_penceresi,
                "ileri_penceresi": self.ileri_penceresi, "not": self.not_,
                "dugumler": {str(k): asdict(v) for k, v in self.dugumler.items()}}  # fmt: skip
        Path(yol).write_text(json.dumps(veri, ensure_ascii=False, indent=1), encoding="utf-8")

    @classmethod
    def yukle(cls, yol: str | Path) -> "Agac":
        v = json.loads(Path(yol).read_text(encoding="utf-8"))
        return cls(v["kok"], {int(k): Dugum(**d) for k, d in v["dugumler"].items()}, v["esik"], v["secim_penceresi"], v["ileri_penceresi"], v["not"])


class AgacKurucu:
    def __init__(
        self,
        panel: Panel,
        ozellikler: dict[str, pd.DataFrame],
        turler: dict[str, str],
        kes: int,
        maliyet: float,
        nakit: float,
        esik: float,
        ridge: float = 1.0,
        db: sqlite3.Connection | None = None,
    ) -> None:
        self.panel = panel
        self.oz = ozellikler
        self.turler = turler
        self.kes = kes
        self.maliyet = maliyet
        self.nakit = nakit
        self.esik = esik
        self.ridge = ridge
        self.db = db
        self.hedef = hedef_ertesi_gun(panel)
        # Uzun tablo bir kez
        parcalar = []
        for h in panel.hisseler:
            df = pd.DataFrame({ad: self.oz[ad][h] for ad in self.oz})
            df["hedef"] = self.hedef[h]
            df["hisse"] = h
            df["gun"] = panel.gunler
            parcalar.append(df)
        t = pd.concat(parcalar)
        t[list(self.oz)] = t[list(self.oz)].replace([np.inf, -np.inf], np.nan)
        self.tablo = t.dropna(subset=["hedef"]).reset_index(drop=True)
        self.tablo[list(self.oz)] = self.tablo[list(self.oz)].fillna(0.0).clip(-5, 5)
        gun = self.tablo["gun"]
        secim_bitis = panel.gunler[kes]
        ic_kes = panel.gunler[int(kes * 0.75)]
        self.egit_m = (gun < ic_kes).to_numpy()
        self.dogru_m = ((gun >= ic_kes) & (gun < secim_bitis)).to_numpy()
        self.ileri_m = (gun >= secim_bitis).to_numpy()
        self.ic_kes_idx = int(kes * 0.75)
        self.onbellek: dict[tuple[str, ...], tuple[float, float, int, float | None, float | None, int]] = {}

    def _skor(self, params: list[str]) -> tuple[float, float, int, float | None, float | None, int]:
        anahtar = tuple(sorted(params))
        if anahtar in self.onbellek:
            return self.onbellek[anahtar]
        X = self.tablo[list(anahtar)].to_numpy(dtype=float)
        y = self.tablo["hedef"].to_numpy(dtype=float)
        m = _ridge(X[self.egit_m], y[self.egit_m], self.ridge)
        th = m.q(X)
        tah = pd.Series(th, index=pd.MultiIndex.from_arrays([self.tablo["gun"], self.tablo["hisse"]])).unstack()
        st = ModelKapili(tah, self.esik, 2 * self.maliyet)
        dogru = simule(self.panel, st, "dogrulama", self.nakit, self.maliyet, bas=self.ic_kes_idx, bit=self.kes)
        kor = float(np.corrcoef(th[self.dogru_m], y[self.dogru_m])[0, 1]) if th[self.dogru_m].std() > 0 else 0.0
        islem = int((th[self.dogru_m] - 2 * self.maliyet >= self.esik).sum())
        # İleri pencere: yalnız bilgi (model seçim penceresinin tamamında yeniden eğitilir)
        egit_tum = self.egit_m | self.dogru_m
        m2 = _ridge(X[egit_tum], y[egit_tum], self.ridge)
        th2 = m2.q(X)
        tah2 = pd.Series(th2, index=pd.MultiIndex.from_arrays([self.tablo["gun"], self.tablo["hisse"]])).unstack()
        ileri = simule(self.panel, ModelKapili(tah2, self.esik, 2 * self.maliyet), "ileri", self.nakit, self.maliyet, bas=self.kes)
        ileri_islem = int((th2[self.ileri_m] - 2 * self.maliyet >= self.esik).sum())
        sonuc = (dogru.odul, kor, islem, ileri.getiri, ileri.bitis, ileri_islem)
        self.onbellek[anahtar] = sonuc
        if self.db is not None:
            from .saglamlik import deneme_kaydet

            deneme_kaydet(self.db, "agac", ileri, {"parametreler": list(anahtar), "esik": self.esik}, "agac_ileri",
                          not_=f"dogrulama_odul={dogru.odul:.4f}")  # fmt: skip
        return sonuc

    def kur(self, derinlik: int = 6, isin: int = 2, adaylar: list[str] | None = None) -> Agac:
        adaylar = adaylar or list(self.oz)
        dugumler: dict[int, Dugum] = {}
        sayac = [0]

        def yeni(ebeveyn: int | None, eklenen: str | None, params: list[str], ebeveyn_odul: float) -> Dugum:
            odul, kor, islem, ileri_g, ileri_b, ileri_i = self._skor(params)
            d = Dugum(sayac[0], ebeveyn, eklenen, params, self.turler.get(eklenen or "", "kok"), odul, kor, islem,
                      ileri_g, ileri_b, ileri_i, odul - ebeveyn_odul)  # fmt: skip
            dugumler[d.id] = d
            sayac[0] += 1
            return d

        # Kök: tek başına en iyi parametre (ışın kadar alternatif kök de dallanır)
        tekli = sorted(((self._skor([p])[0], p) for p in adaylar), reverse=True)
        sanal_kok = Dugum(-1, None, None, [], "kok", -np.inf, 0.0, 0, None, None, 0, 0.0)
        kokler = [yeni(None, p, [p], 0.0) for _, p in tekli[:isin]]
        sanal_kok.cocuklar = [k.id for k in kokler]
        dugumler[-1] = sanal_kok
        katman = kokler
        for _ in range(derinlik - 1):
            sonraki: list[Dugum] = []
            for d in katman:
                kalan = [p for p in adaylar if p not in d.parametreler]
                skorlar = sorted(((self._skor(d.parametreler + [p])[0], p) for p in kalan), reverse=True)
                for odul, p in skorlar[:isin]:
                    if odul <= d.dogrulama_odul:  # iyileştirmeyen dal yine kaydedilir ama büyütülmez
                        c = yeni(d.id, p, d.parametreler + [p], d.dogrulama_odul)
                        d.cocuklar.append(c.id)
                        continue
                    c = yeni(d.id, p, d.parametreler + [p], d.dogrulama_odul)
                    d.cocuklar.append(c.id)
                    sonraki.append(c)
            # Her katmanda en iyi `isin*2` dal büyümeye devam eder (patlamayı sınırlar)
            katman = sorted(sonraki, key=lambda x: x.dogrulama_odul, reverse=True)[: isin * 2]
            if not katman:
                break
        g = self.panel.gunler
        return Agac(-1, dugumler, self.esik, f"{g[0].date()}→{g[self.kes].date()} (iç doğrulama son %25)",
                    f"{g[self.kes].date()}→{g[-1].date()}", "Ödül = log(W/W0) − maks düşüş, doğrulama penceresinde. İleri sütunu bilgi içindir.")  # fmt: skip


def ozellik_havuzu(panel: Panel, gosterge: pd.Series | None, hacim: pd.DataFrame | None, olaylar: pd.DataFrame | None, sektorler: dict[str, str]):
    oz = gunluk_ozellikler(panel, gosterge)
    oz.update(ek_ozellikler(panel, hacim, sektorler))
    oz.update(bilgi_sinyalleri(panel, olaylar, sektorler))
    turler = {ad: "sayisal" for ad in GUNLUK_OZELLIKLER + EK_SAYISAL}
    turler.update({ad: "llm" for ad in BILGI_SINYALLERI})
    return oz, turler


def agac_degerlendir(kurucu: AgacKurucu, parametreler: list[str]) -> dict[str, float | int | None]:
    odul, kor, islem, ileri_g, ileri_b, ileri_i = kurucu._skor(parametreler)
    return {"dogrulama_odul": odul, "dogrulama_korelasyon": kor, "dogrulama_islem": islem,
            "ileri_getiri": ileri_g, "ileri_bitis": ileri_b, "ileri_islem": ileri_i, "parametre_sayisi": len(parametreler)}  # fmt: skip
