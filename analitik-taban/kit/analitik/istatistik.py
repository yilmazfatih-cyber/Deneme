"""Karar için yeterli, bağımlılıksız istatistik: oran testi, güven aralığı, SRM, MDE, sayım farkı z'si."""

from __future__ import annotations

import math
from statistics import NormalDist
from typing import Dict, List, Optional, Sequence

_N = NormalDist()


def iki_yonlu_p(z: float) -> float:
    return 2.0 * (1.0 - _N.cdf(abs(z)))


def z_kritik(alfa: float = 0.05) -> float:
    return _N.inv_cdf(1.0 - alfa / 2.0)


def iki_oran_testi(x_a: int, n_a: int, x_b: int, n_b: int, alfa: float = 0.05) -> Dict[str, Optional[float]]:
    """A (kontrol) ile B (deneme) dönüşüm oranlarını karşılaştırır.

    Dönen alanlar: p_a, p_b, fark (p_b - p_a), goreli (p_b / p_a - 1), z, p_degeri,
    ga_alt / ga_ust (farkın 1 - alfa güven aralığı, havuzlanmamış standart hata).
    """
    sonuc: Dict[str, Optional[float]] = dict.fromkeys(
        ["p_a", "p_b", "fark", "goreli", "z", "p_degeri", "ga_alt", "ga_ust"]
    )
    if n_a <= 0 or n_b <= 0:
        return sonuc
    p_a, p_b = x_a / n_a, x_b / n_b
    sonuc.update(p_a=p_a, p_b=p_b, fark=p_b - p_a, goreli=(p_b / p_a - 1.0) if p_a > 0 else None)
    havuz = (x_a + x_b) / (n_a + n_b)
    se_havuz = math.sqrt(havuz * (1.0 - havuz) * (1.0 / n_a + 1.0 / n_b))
    if se_havuz > 0:
        z = (p_b - p_a) / se_havuz
        sonuc.update(z=z, p_degeri=iki_yonlu_p(z))
    se = math.sqrt(p_a * (1.0 - p_a) / n_a + p_b * (1.0 - p_b) / n_b)
    zk = z_kritik(alfa)
    sonuc.update(ga_alt=(p_b - p_a) - zk * se, ga_ust=(p_b - p_a) + zk * se)
    return sonuc


def wilson(x: int, n: int, alfa: float = 0.05):
    """Oran için Wilson güven aralığı (alt, üst). n = 0 ise (None, None)."""
    if n <= 0:
        return None, None
    z = z_kritik(alfa)
    p = x / n
    payda = 1.0 + z * z / n
    merkez = (p + z * z / (2 * n)) / payda
    yari = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / payda
    return max(0.0, merkez - yari), min(1.0, merkez + yari)


def mde(n_grup: int, p_taban: float, alfa: float = 0.05, guc: float = 0.8) -> Optional[float]:
    """Grup başına n kullanıcıyla %80 güçte saptanabilecek en küçük mutlak fark (oran puanı, 0-1)."""
    if n_grup <= 0 or not 0 < p_taban < 1:
        return None
    return (z_kritik(alfa) + _N.inv_cdf(guc)) * math.sqrt(2.0 * p_taban * (1.0 - p_taban) / n_grup)


def sayim_z(a: float, b: float) -> float:
    """İki dönem sayımı farkının kaba z'si (Poisson): (a - b) / sqrt(a + b)."""
    toplam = a + b
    return 0.0 if toplam <= 0 else (a - b) / math.sqrt(toplam)


def sapma_z(a_segment: float, b_segment: float, a_toplam: float, b_toplam: float) -> float:
    """Segment, genelle aynı oranda değişseydi beklenen değerden ne kadar saptı?

    Beklenen = b_segment * (a_toplam / b_toplam). Varyans: a_segment + b_segment * r^2 (iki Poisson).
    Büyük |z| = bu segment genelden farklı davranıyor (sorunun yeri olabilir).
    """
    if b_toplam <= 0:
        return 0.0
    r = a_toplam / b_toplam
    varyans = a_segment + b_segment * r * r
    return 0.0 if varyans <= 0 else (a_segment - b_segment * r) / math.sqrt(varyans)


# --- ki-kare (SRM) -----------------------------------------------------------------------------

_KUCUK = 1e-300


def _ust_gamma_q(a: float, x: float) -> float:
    """Düzenlenmiş üst eksik gama Q(a, x) (Numerical Recipes yöntemi)."""
    if x <= 0:
        return 1.0
    log_on = -x + a * math.log(x) - math.lgamma(a)
    if x < a + 1.0:
        ap, toplam = a, 1.0 / a
        d = toplam
        for _ in range(1000):
            ap += 1.0
            d *= x / ap
            toplam += d
            if abs(d) < abs(toplam) * 1e-15:
                break
        return max(0.0, 1.0 - toplam * math.exp(log_on))
    b = x + 1.0 - a
    c = 1.0 / _KUCUK
    d = 1.0 / b
    h = d
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        d = _KUCUK if abs(d) < _KUCUK else d
        c = b + an / c
        c = _KUCUK if abs(c) < _KUCUK else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-15:
            break
    return min(1.0, math.exp(log_on) * h)


def ki_kare_p(istatistik: float, sd: int) -> float:
    """Ki-kare dağılımında P(X >= istatistik), sd serbestlik derecesi."""
    if sd <= 0:
        return 1.0
    return _ust_gamma_q(sd / 2.0, istatistik / 2.0)


def srm_testi(gozlenen: Sequence[float], beklenen_pay: Optional[Sequence[float]] = None) -> Dict[str, float]:
    """Örneklem oranı uyumsuzluğu (SRM). beklenen_pay verilmezse eşit bölünme varsayılır.

    p < 0,001 ise atama/izleme sorunu vardır; deney sonucu güvenilmez.
    """
    k = len(gozlenen)
    toplam = float(sum(gozlenen))
    if k < 2 or toplam <= 0:
        return {"ki_kare": 0.0, "p_degeri": 1.0}
    paylar: List[float] = list(beklenen_pay) if beklenen_pay else [1.0 / k] * k
    olcek = sum(paylar)
    ki = 0.0
    for g, pay in zip(gozlenen, paylar):
        e = toplam * pay / olcek
        if e > 0:
            ki += (g - e) ** 2 / e
    return {"ki_kare": ki, "p_degeri": ki_kare_p(ki, k - 1)}
