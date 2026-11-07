"""Çevrimdışı pekiştirmeli öğrenme, ilk sürüm: bağlamsal bandit.

Her saat başı iki eylem var: AL (sonraki çubuğu tut) ve BEKLE. Ödül:
    AL   → masraf sonrası net getiri (gidiş-dönüş maliyet düşülmüş)
    BEKLE→ 0
Model, AL eyleminin beklenen ödülünü Q(x) = w·x + b olarak öğrenir (ridge regresyon, kapalı form,
numpy). Politika: Q(x) ≥ eşik ise AL. Eşik modelin DIŞINDADIR: `risk.min_net_getiri` ayarıdır;
model onu "öğrenip" gevşetemez.

Neden tam RL (PPO vb.) değil? Birkaç yıllık saatlik veri hisse başına ~4.000 karar demek; derin
politika ezberler. Bandit, aynı ödül tanımıyla ölçülebilir bir başlangıçtır. Ödül günlüğü
büyüdükçe FinRL/PPO'ya geçiş aynı özellik ve ödülle yapılır (`FINRL_NOTU`).

Dürüstlük kuralları:
* Eğitim yalnız "train" etiketli günlerde; ölçüm yalnız "test" günlerinde.
* Kayma (00/15/30/45) ve ridge katsayısı seçimi yalnız train günlerinde (zaman sıralı iç
  doğrulama); test günleri seçime karışmaz.
* Ölçüm maliyet SONRASIdır ve aynı test günlerindeki al-tut ile kıyaslanır.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .ozellikler import OZELLIK_ADLARI

FINRL_NOTU = (
    "FinRL'ye geçiş: durum = OZELLIK_ADLARI + pozisyon, eylem = {AL, BEKLE, SAT}, "
    "ödül = ogrenme.ozellikler ile aynı maliyet sonrası getiri; env adımı bir saat çubuğu."
)


@dataclass
class BanditModel:
    agirlik: list[float]
    sabit: float
    ort: list[float]
    std: list[float]
    ridge: float
    surum: str = "bandit-v1"

    def q(self, X: np.ndarray) -> np.ndarray:
        Z = (X - np.asarray(self.ort)) / np.asarray(self.std)
        return Z @ np.asarray(self.agirlik) + self.sabit

    def kaydet(self, yol: str | Path) -> None:
        Path(yol).parent.mkdir(parents=True, exist_ok=True)
        Path(yol).write_text(json.dumps(asdict(self)), encoding="utf-8")

    @classmethod
    def yukle(cls, yol: str | Path) -> "BanditModel":
        return cls(**json.loads(Path(yol).read_text(encoding="utf-8")))


def _ridge(X: np.ndarray, y: np.ndarray, ridge: float) -> BanditModel:
    ort = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    Z = (X - ort) / std
    n, d = Z.shape
    A = Z.T @ Z + ridge * n * np.eye(d)
    w = np.linalg.solve(A, Z.T @ (y - y.mean()))
    return BanditModel(w.tolist(), float(y.mean()), ort.tolist(), std.tolist(), ridge)


def egit(X: np.ndarray, odul: np.ndarray, ridge_adaylari: tuple[float, ...] = (0.01, 0.1, 1.0, 10.0)) -> tuple[BanditModel, float]:
    """Zaman sıralı iç doğrulama ile ridge seçer (son %25 doğrulama), sonra tümüyle eğitir."""
    kes = int(len(X) * 0.75)
    en_iyi, en_iyi_skor = ridge_adaylari[0], -np.inf
    for r in ridge_adaylari:
        m = _ridge(X[:kes], odul[:kes], r)
        q = m.q(X[kes:])
        skor = float(np.corrcoef(q, odul[kes:])[0, 1]) if q.std() > 0 else -np.inf
        if skor > en_iyi_skor:
            en_iyi, en_iyi_skor = r, skor
    return _ridge(X, odul, en_iyi), en_iyi_skor


@dataclass
class Olcum:
    etiket: str
    karar_sayisi: int
    islem_sayisi: int
    isabet: float | None  # AL kararlarının kaçı pozitif net getiri verdi
    ort_net_getiri: float | None  # AL başına
    toplam_net_getiri: float  # sırayla birikik (her AL tam pozisyon varsayımı)
    sharpe: float | None
    al_tut_getiri: float  # aynı saatlerde hep pozisyonda olsaydık (maliyetsiz)
    korelasyon: float | None  # Q tahmini ile gerçekleşen ödül
    detay: dict[str, float] = field(default_factory=dict)

    def metin(self) -> str:
        f = lambda v, p="{:+.2%}": "-" if v is None else p.format(v)  # noqa: E731
        return (
            f"[{self.etiket}] karar {self.karar_sayisi}, AL {self.islem_sayisi} "
            f"({self.islem_sayisi / max(self.karar_sayisi, 1):.1%}) | isabet {f(self.isabet, '{:.1%}')} | "
            f"AL başına net {f(self.ort_net_getiri, '{:+.3%}')} | toplam net {self.toplam_net_getiri:+.2%} | "
            f"Sharpe {f(self.sharpe, '{:.2f}')} | al-tut {self.al_tut_getiri:+.2%} | tahmin-gerçek kor. {f(self.korelasyon, '{:.3f}')}"
        )


def olc(model: BanditModel, X: np.ndarray, odul: np.ndarray, ham_getiri: np.ndarray, esik: float, etiket: str) -> Olcum:
    q = model.q(X)
    al = q >= esik
    n_al = int(al.sum())
    kazanc = odul[al]
    seri = np.where(al, odul, 0.0)
    yillik = np.sqrt(252 * 8)
    sharpe = float(seri.mean() / seri.std() * yillik) if n_al > 1 and seri.std() > 0 else None
    kor = float(np.corrcoef(q, odul)[0, 1]) if len(q) > 2 and q.std() > 0 else None
    return Olcum(
        etiket=etiket,
        karar_sayisi=len(X),
        islem_sayisi=n_al,
        isabet=float((kazanc > 0).mean()) if n_al else None,
        ort_net_getiri=float(kazanc.mean()) if n_al else None,
        toplam_net_getiri=float(np.prod(1 + seri) - 1),
        sharpe=sharpe,
        al_tut_getiri=float(np.prod(1 + ham_getiri) - 1),
        korelasyon=kor,
    )


def esik_taramasi(model: BanditModel, X: np.ndarray, odul: np.ndarray, esikler: tuple[float, ...]) -> pd.DataFrame:
    """Yalnız TRAIN verisinde çağrılmalı; test eşiğe göre seçilmez."""
    q = model.q(X)
    satirlar = []
    for e in esikler:
        al = q >= e
        satirlar.append({"esik": e, "islem": int(al.sum()), "ort_net": float(odul[al].mean()) if al.any() else np.nan,
                         "toplam_net": float(np.prod(1 + np.where(al, odul, 0)) - 1)})
    return pd.DataFrame(satirlar)
