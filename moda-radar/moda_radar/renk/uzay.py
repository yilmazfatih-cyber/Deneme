"""Renk uzayı dönüşümleri ve ΔE2000.

sRGB (IEC 61966-2-1) → XYZ (D65, 2° gözlemci) → CIELAB. ΔE2000, Sharma, Wu ve Dalal (2005)
"The CIEDE2000 Color-Difference Formula: Implementation Notes..." makalesindeki adımlarla uygulanır.
"""

from __future__ import annotations

import numpy as np

from moda_radar.sema import Lab

# sRGB doğrusal → XYZ (D65)
_M = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)
_M_TERS = np.linalg.inv(_M)
_BEYAZ_D65 = np.array([0.95047, 1.0, 1.08883])
_EPS = 216 / 24389
_KAPPA = 24389 / 27


def hex_to_rgb(hex_: str) -> tuple[int, int, int]:
    """'#DA321C' veya 'DA321C' → (218, 50, 28)."""
    h = hex_.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"geçersiz hex: {hex_!r}")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(int(max(0, min(255, round(c)))) for c in rgb))


def rgb_dizi_to_lab(rgb: np.ndarray) -> np.ndarray:
    """(..., 3) biçiminde 0-255 sRGB dizisi → (..., 3) Lab dizisi (vektörleştirilmiş)."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    dogrusal = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = dogrusal @ _M.T / _BEYAZ_D65
    f = np.where(xyz > _EPS, np.cbrt(xyz), (_KAPPA * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def lab_dizi_to_rgb(lab: np.ndarray) -> np.ndarray:
    """(..., 3) Lab → (..., 3) 0-255 sRGB (kırpılmış, float)."""
    lab = np.asarray(lab, dtype=np.float64)
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f**3 > _EPS, f**3, (116 * f - 16) / _KAPPA) * _BEYAZ_D65
    dogrusal = np.clip(xyz @ _M_TERS.T, 0.0, 1.0)
    c = np.where(dogrusal <= 0.0031308, 12.92 * dogrusal, 1.055 * dogrusal ** (1 / 2.4) - 0.055)
    return np.clip(c * 255.0, 0.0, 255.0)


def lab_olustur(L: float, a: float, b: float) -> Lab:
    """Şema sınırlarına kırparak Lab üretir (sayısal taşmalara karşı)."""
    return Lab(
        L=float(min(100.0, max(0.0, L))), a=float(min(128.0, max(-128.0, a))), b=float(min(128.0, max(-128.0, b)))
    )


def rgb_to_lab(rgb: tuple[int, int, int]) -> Lab:
    L, a, b = rgb_dizi_to_lab(np.array(rgb, dtype=np.float64))
    return lab_olustur(L, a, b)


def hex_to_lab(hex_: str) -> Lab:
    return rgb_to_lab(hex_to_rgb(hex_))


def lab_to_hex(lab: Lab) -> str:
    r, g, b = lab_dizi_to_rgb(np.array([lab.L, lab.a, lab.b]))
    return rgb_to_hex((r, g, b))


def lab_dizi(lab: Lab) -> np.ndarray:
    return np.array([lab.L, lab.a, lab.b], dtype=np.float64)


def _de2000(L1, a1, b1, L2, a2, b2) -> np.ndarray:
    """Yayınlanabilir (broadcast) ΔE2000; kL = kC = kH = 1."""
    C1 = np.hypot(a1, b1)
    C2 = np.hypot(a2, b2)
    C_ort7 = ((C1 + C2) / 2) ** 7
    G = 0.5 * (1 - np.sqrt(C_ort7 / (C_ort7 + 25.0**7)))
    a1p = (1 + G) * a1
    a2p = (1 + G) * a2
    C1p = np.hypot(a1p, b1)
    C2p = np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    h1p = np.where((a1p == 0) & (b1 == 0), 0.0, h1p)
    h2p = np.where((a2p == 0) & (b2 == 0), 0.0, h2p)

    dLp = L2 - L1
    dCp = C2p - C1p
    carpim = C1p * C2p
    fark = h2p - h1p
    dhp = np.where(fark > 180, fark - 360, np.where(fark < -180, fark + 360, fark))
    dhp = np.where(carpim == 0, 0.0, dhp)
    dHp = 2 * np.sqrt(carpim) * np.sin(np.radians(dhp) / 2)

    Lp_ort = (L1 + L2) / 2
    Cp_ort = (C1p + C2p) / 2
    toplam = h1p + h2p
    hp_ort = np.where(
        np.abs(h1p - h2p) <= 180,
        toplam / 2,
        np.where(toplam < 360, (toplam + 360) / 2, (toplam - 360) / 2),
    )
    hp_ort = np.where(carpim == 0, toplam, hp_ort)

    T = (
        1
        - 0.17 * np.cos(np.radians(hp_ort - 30))
        + 0.24 * np.cos(np.radians(2 * hp_ort))
        + 0.32 * np.cos(np.radians(3 * hp_ort + 6))
        - 0.20 * np.cos(np.radians(4 * hp_ort - 63))
    )
    d_teta = 30 * np.exp(-(((hp_ort - 275) / 25) ** 2))
    Cp7 = Cp_ort**7
    RC = 2 * np.sqrt(Cp7 / (Cp7 + 25.0**7))
    SL = 1 + 0.015 * (Lp_ort - 50) ** 2 / np.sqrt(20 + (Lp_ort - 50) ** 2)
    SC = 1 + 0.045 * Cp_ort
    SH = 1 + 0.015 * Cp_ort * T
    RT = -np.sin(np.radians(2 * d_teta)) * RC
    l, c, h = dLp / SL, dCp / SC, dHp / SH
    return np.sqrt(np.maximum(l**2 + c**2 + h**2 + RT * c * h, 0.0))


def delta_e2000(a: Lab, b: Lab) -> float:
    return float(_de2000(a.L, a.a, a.b, b.L, b.a, b.b))


def delta_e2000_dizi(lab: np.ndarray, tablo: np.ndarray) -> np.ndarray:
    """lab (..., 3) ile tablo (N, 3) arasında yayınlanabilir ΔE2000."""
    lab = np.asarray(lab, dtype=np.float64)
    t = np.asarray(tablo, dtype=np.float64)
    return _de2000(lab[..., 0], lab[..., 1], lab[..., 2], t[..., 0], t[..., 1], t[..., 2])


def delta_e2000_toplu(lab: Lab, tablo: np.ndarray) -> np.ndarray:
    """Bir Lab rengi ile (N, 3) Lab tablosunun her satırı arasındaki ΔE2000 → (N,)."""
    return delta_e2000_dizi(lab_dizi(lab), tablo)
