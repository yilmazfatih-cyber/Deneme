"""Hızlı katman: dakika ya da gün çubukları üzerinde çalışan, açık ve test edilebilir kurallar.

Dil modeli burada YOKTUR. Araştırma ajanı hangi hisselerin "işlem yapılabilir" olduğunu ve ne
kadar emin olduğunu söyler (tez); bu katman yalnızca zamanlamayı yapar:

* Giriş: tez "AL" ve olasılık eşiği aşıyor, kısa ortalama uzun ortalamanın üstünde, fiyat
  uzun ortalamanın üstünde → hedef ağırlığa kadar al.
* Çıkış: tez "SAT", zarar kes seviyesi, ya da kısa ortalama uzun ortalamanın altına indi → tümünü sat.

Bu, kanıtlanmış bir üstünlük değil; ölçülebilir bir BAŞLANGIÇ noktasıdır. Geriye dönük test ve
sanal işlem sonuçları al-tut ölçütünü masraflar sonrası geçmiyorsa kullanmayın.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ..ayarlar import RiskAyarlari


@dataclass(frozen=True)
class StratejiAyarlari:
    kisa_pencere: int = 20  # çubuk sayısı (1d'de 20 gün, 5m'de 100 dakika)
    uzun_pencere: int = 50
    tezsiz_olasilik: float | None = None  # tez yoksa bu olasılıkla "AL" varsay (yalnız test için)


@dataclass(frozen=True)
class Tez:
    karar: str  # AL | TUT | SAT | IZLE
    olasilik: float


@dataclass(frozen=True)
class Sinyal:
    hisse: str
    yon: str  # AL | SAT
    hedef_oran: float  # AL için portföydeki hedef ağırlık; SAT için 0
    neden: str


def hedef_oran(olasilik: float, risk: RiskAyarlari) -> float:
    """Olasılık 0,5'ten uzaklaştıkça pozisyon büyür; %70 ve üstünde tam ağırlık."""
    if olasilik < risk.min_tez_olasiligi:
        return 0.0
    return risk.max_pozisyon_orani * min(1.0, round((olasilik - 0.5) / 0.2, 9))


def sinyal_uret(
    hisse: str,
    cubuklar: pd.DataFrame,
    tez: Tez | None,
    elde_adet: float,
    ort_maliyet: float,
    risk: RiskAyarlari,
    ayar: StratejiAyarlari = StratejiAyarlari(),
) -> Sinyal | None:
    if len(cubuklar) < ayar.uzun_pencere:
        return None
    kapanis = cubuklar["kapanis"]
    fiyat = float(kapanis.iloc[-1])
    kisa = float(kapanis.iloc[-ayar.kisa_pencere :].mean())
    uzun = float(kapanis.iloc[-ayar.uzun_pencere :].mean())
    if tez is None and ayar.tezsiz_olasilik is not None:
        tez = Tez("AL", ayar.tezsiz_olasilik)

    if elde_adet > 0:
        if tez is not None and tez.karar == "SAT":
            return Sinyal(hisse, "SAT", 0.0, "Araştırma tezi SAT'a döndü")
        if fiyat <= ort_maliyet * (1 - risk.zarar_kes_orani):
            return Sinyal(hisse, "SAT", 0.0, f"Zarar kes: maliyetin %{risk.zarar_kes_orani:.0%} altı")
        if kisa < uzun:
            return Sinyal(hisse, "SAT", 0.0, "Eğilim döndü: kısa ortalama uzun ortalamanın altında")
        return None

    if tez is None or tez.karar != "AL":
        return None
    oran = hedef_oran(tez.olasilik, risk)
    if oran <= 0:
        return None
    if kisa > uzun and fiyat > uzun:
        return Sinyal(hisse, "AL", oran, f"Tez AL (p={tez.olasilik:.0%}) ve yukarı eğilim")
    return None
