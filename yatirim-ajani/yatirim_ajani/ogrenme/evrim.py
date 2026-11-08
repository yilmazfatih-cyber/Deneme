"""Hücre evrimi: kazanmayan hücreye su yok, kazanan hücre sulanır ve dallanır.

Hücre = (parametre kümesi, net eşik). Her hücre, kapanışta ertesi günün getirisini ridge ile tahmin
eder ve eşiği geçen hisseleri (en fazla N) eşit ağırlıkla tutar. Hücreler ayda bir, YALNIZ o güne
kadarki veriyle yeniden eğitilir (bireysel iyileştirme).

Su = sermaye payı. Her gün çarpımsal ağırlık (Hedge) kuralıyla güncellenir:
    pay_i ← pay_i · exp(η · getiri_i(t))   (normalize)
Yalnız GERÇEKLEŞMİŞ getiriler kullanılır; bu yüzden süreç tanımı gereği geleceğe bakmaz.
Payı `kuruma_esigi`nin altına düşen ya da iki evrim döngüsü üst üste negatif ödül veren hücre
kurur (su kesilir, parası diğerlerine dağılır). Her `dongu` günde bir en iyi hücreler dallanır:
çocuk = ebeveyn parametreleri ± bir parametre ya da eşik değişimi; ebeveyn suyunun bir kısmını alır.

Kümülatif iyileştirme = bahçenin toplam portföyü. Al-tut hücresi her zaman bahçededir ama
dallanmaz; bahçe onu geçemiyorsa cevap bellidir.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .rl import _ridge
from .simulasyon import Panel, _esit


@dataclass
class Hucre:
    id: int
    ebeveyn: int | None
    parametreler: list[str]
    esik: float
    dogum: int  # gün indeksi
    olum: int | None = None
    tur: str = "model"  # model | al_tut
    pay_gecmisi: list[float] = field(default_factory=list)
    getiri_gecmisi: list[float] = field(default_factory=list)
    neg_dongu: int = 0
    cocuklar: list[int] = field(default_factory=list)

    @property
    def kumulatif(self) -> float:
        return float(np.prod(1 + np.array(self.getiri_gecmisi))) - 1 if self.getiri_gecmisi else 0.0


@dataclass
class BahceSonucu:
    egri: pd.Series
    al_tut_egri: pd.Series
    hucreler: dict[int, Hucre]
    olaylar: list[dict]
    gunler: list[str]
    maliyet_toplam: float

    def kaydet(self, yol: str | Path) -> None:
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
        veri = {
            "gunler": self.gunler,
            "egri": [float(x) for x in self.egri.to_numpy()],
            "al_tut": [float(x) for x in self.al_tut_egri.to_numpy()],
            "maliyet_toplam": self.maliyet_toplam,
            "olaylar": self.olaylar,
            "hucreler": {str(k): asdict(v) for k, v in self.hucreler.items()},
        }
        Path(yol).write_text(json.dumps(veri, ensure_ascii=False), encoding="utf-8")


class Bahce:
    def __init__(
        self,
        panel: Panel,
        ozellikler: dict[str, pd.DataFrame],
        maliyet: float,
        nakit: float,
        havuz: list[str],
        tohum: int = 2024,
        eta: float = 8.0,
        dongu: int = 21,
        egitim_penceresi: int = 250,
        kuruma_esigi: float = 0.02,
        max_hucre: int = 14,
        dal_sayisi: int = 2,
        en_fazla_hisse: int = 10,
        isinma: int = 120,
    ) -> None:
        self.panel = panel
        self.oz = ozellikler
        self.maliyet = maliyet
        self.nakit = nakit
        self.havuz = havuz
        self.rng = np.random.default_rng(tohum)
        self.eta = eta
        self.dongu = dongu
        self.egitim_penceresi = egitim_penceresi
        self.kuruma_esigi = kuruma_esigi
        self.max_hucre = max_hucre
        self.dal_sayisi = dal_sayisi
        self.en_fazla = en_fazla_hisse
        self.isinma = isinma
        self.hedef = panel.kapanis.shift(-1) / panel.kapanis - 1  # kapanış→kapanış, model hedefi
        self.n = len(panel.gunler)
        self.H = panel.hisseler
        # Özellik tensörü: gün × hisse × özellik (hızlı dilimleme için)
        self.X = {ad: self.oz[ad].reindex(columns=self.H).to_numpy(dtype=float) for ad in havuz}
        self.Y = self.hedef.reindex(columns=self.H).to_numpy(dtype=float)
        self.hucreler: dict[int, Hucre] = {}
        self.modeller: dict[int, object] = {}
        self.olaylar: list[dict] = []
        self._sayac = 0

    # --- hücre yaşam döngüsü ---------------------------------------------------------------
    def _yeni(self, params: list[str], esik: float, ebeveyn: int | None, t: int, tur: str = "model") -> Hucre:
        h = Hucre(self._sayac, ebeveyn, sorted(set(params)), esik, t, tur=tur)
        self.hucreler[h.id] = h
        if ebeveyn is not None:
            self.hucreler[ebeveyn].cocuklar.append(h.id)
        self._sayac += 1
        return h

    def _egit(self, h: Hucre, t: int) -> None:
        if h.tur != "model":
            return
        bas = max(0, t - self.egitim_penceresi)
        satirlar = []
        for ad in h.parametreler:
            satirlar.append(self.X[ad][bas:t].reshape(-1))
        Xm = np.column_stack(satirlar) if satirlar else np.zeros((0, 0))
        y = self.Y[bas:t].reshape(-1)
        m = np.isfinite(y) & np.all(np.isfinite(Xm), axis=1)
        if m.sum() < 60:
            self.modeller[h.id] = None
            return
        self.modeller[h.id] = _ridge(np.clip(Xm[m], -5, 5), y[m], 1.0)

    def _agirlik(self, h: Hucre, t: int) -> np.ndarray:
        if h.tur == "al_tut":
            return np.full(len(self.H), 1.0 / len(self.H))
        m = self.modeller.get(h.id)
        if m is None:
            return np.zeros(len(self.H))
        x = np.column_stack([self.X[ad][t] for ad in h.parametreler])
        ok = np.all(np.isfinite(x), axis=1)
        q = np.full(len(self.H), -np.inf)
        q[ok] = m.q(np.clip(x[ok], -5, 5))
        net = q - 2 * self.maliyet
        secim = net >= h.esik
        if secim.sum() > self.en_fazla:
            esik_deger = np.sort(net[secim])[-self.en_fazla]
            secim &= net >= esik_deger
        w = np.zeros(len(self.H))
        if secim.any():
            w[secim] = 1.0 / secim.sum()
        return w

    def _mutasyon(self, h: Hucre) -> tuple[list[str], float]:
        params = list(h.parametreler)
        zar = self.rng.random()
        if zar < 0.5 or len(params) <= 1:
            aday = [p for p in self.havuz if p not in params]
            if aday:
                params.append(str(self.rng.choice(aday)))
        elif zar < 0.8:
            params.remove(str(self.rng.choice(params)))
        esik = float(np.clip(h.esik + self.rng.choice([-0.0025, 0.0, 0.0025]), -0.005, 0.01))
        return params, esik

    # --- ana döngü -------------------------------------------------------------------------
    def calistir(self) -> BahceSonucu:
        t0 = self.isinma
        al_tut = self._yeni([], 0.0, None, t0, tur="al_tut")
        for p in self.havuz:
            self._yeni([p], 0.0, None, t0)
        canli = [h.id for h in self.hucreler.values()]
        pay = {i: 1.0 / len(canli) for i in canli}
        for i in canli:
            self._egit(self.hucreler[i], t0)
        W = self.nakit
        W_altut = self.nakit
        onceki_w = np.zeros(len(self.H))
        onceki_altut = np.zeros(len(self.H))
        maliyet_toplam = 0.0
        egri, egri_altut, gunler = [], [], []
        getiri_gun = np.nan_to_num(self.Y, nan=0.0)
        for t in range(t0, self.n - 1):
            # 1) Her canlı hücrenin bugünkü ağırlığı (t kapanışındaki bilgiyle), getirisi t→t+1
            agirliklar = {i: self._agirlik(self.hucreler[i], t) for i in canli}
            r = getiri_gun[t]
            hucre_getiri = {i: float(agirliklar[i] @ r) for i in canli}
            # 2) Bahçe portföyü = su payıyla ağırlıklı toplam; maliyet toplam ağırlık değişiminden
            toplam_w = sum(pay[i] * agirliklar[i] for i in canli)
            maliyet = float(np.abs(toplam_w - onceki_w).sum()) * self.maliyet * W
            W -= maliyet
            maliyet_toplam += maliyet
            W *= 1.0 + float(toplam_w @ r)
            onceki_w = toplam_w
            # al-tut kıyası (ayrı)
            w_at = np.full(len(self.H), 1.0 / len(self.H))
            W_altut -= float(np.abs(w_at - onceki_altut).sum()) * self.maliyet * W_altut
            W_altut *= 1.0 + float(w_at @ r)
            onceki_altut = w_at
            # 3) Su güncellemesi: gerçekleşen getiriyle çarpımsal ağırlık
            for i in canli:
                h = self.hucreler[i]
                h.getiri_gecmisi.append(hucre_getiri[i])
                pay[i] *= float(np.exp(self.eta * hucre_getiri[i]))
            toplam = sum(pay.values())
            for i in canli:
                pay[i] /= toplam
                self.hucreler[i].pay_gecmisi.append(pay[i])
            egri.append(W)
            egri_altut.append(W_altut)
            gunler.append(str(self.panel.gunler[t + 1].date()))
            # 4) Evrim döngüsü
            if (t - t0) % self.dongu == self.dongu - 1:
                self._evrim(t, canli, pay)
        return BahceSonucu(
            pd.Series(egri, index=pd.to_datetime(gunler)), pd.Series(egri_altut, index=pd.to_datetime(gunler)),
            self.hucreler, self.olaylar, gunler, maliyet_toplam,
        )  # fmt: skip

    def _evrim(self, t: int, canli: list[int], pay: dict[int, float]) -> None:
        pencere = self.dongu
        odul = {}
        for i in canli:
            h = self.hucreler[i]
            g = np.array(h.getiri_gecmisi[-pencere:])
            odul[i] = float(np.sum(np.log1p(g))) if len(g) else 0.0
            h.neg_dongu = h.neg_dongu + 1 if odul[i] < 0 else 0
        # Kuruma: su payı eşik altı ya da iki döngü negatif (al-tut hücresi kurumaz, kıyastır)
        kuruyan = [i for i in canli if self.hucreler[i].tur == "model" and (pay[i] < self.kuruma_esigi or self.hucreler[i].neg_dongu >= 2)]
        for i in kuruyan:
            self.hucreler[i].olum = t
            canli.remove(i)
            serbest = pay.pop(i)
            self.olaylar.append({"gun": str(self.panel.gunler[t].date()), "tur": "kurudu", "hucre": i, "pay": round(serbest, 4),
                                 "parametreler": self.hucreler[i].parametreler})  # fmt: skip
        toplam = sum(pay.values()) or 1.0
        for i in canli:
            pay[i] /= toplam
        # Dallanma: en yüksek ödüllü model hücreleri çocuk üretir, suyunun yarısını paylaşır
        adaylar = sorted((i for i in canli if self.hucreler[i].tur == "model"), key=lambda i: odul[i], reverse=True)
        for i in adaylar[: self.dal_sayisi]:
            if len(canli) >= self.max_hucre or odul[i] <= 0:
                break
            params, esik = self._mutasyon(self.hucreler[i])
            if not params:
                continue
            c = self._yeni(params, esik, i, t)
            self._egit(c, t)
            pay[c.id] = pay[i] / 2
            pay[i] /= 2
            canli.append(c.id)
            self.olaylar.append({"gun": str(self.panel.gunler[t].date()), "tur": "dallandi", "hucre": c.id, "ebeveyn": i,
                                 "parametreler": c.parametreler, "esik": esik})  # fmt: skip
        # Bireysel iyileştirme: tüm canlı model hücreleri güncel veriyle yeniden eğitilir
        for i in canli:
            self._egit(self.hucreler[i], t)
