"""Testler için sentetik sinyaller (sinüs, sessizlik, gürültü, konuşmaya benzer patlamalar).

Gerçek konuşma kaydı yerine bunlar kullanılır: belirlenimci (tohumlu), küçük ve lisans sorunu yok.
Genişletme: yeni bir sinyal türü → buraya bir işlev; testlerde `from tests.yardimci import ...`.
"""

from __future__ import annotations

import numpy as np

from ses.ses_isleme.ses import Dizi


def sinus(frekans: float, sure: float, ornekleme: int, genlik: float = 0.5, faz: float = 0.0) -> Dizi:
    t = np.arange(round(sure * ornekleme)) / ornekleme
    return (genlik * np.sin(2 * np.pi * frekans * t + faz)).astype(np.float32)


def sessizlik(sure: float, ornekleme: int) -> Dizi:
    return np.zeros(round(sure * ornekleme), dtype=np.float32)


def gurultu(sure: float, ornekleme: int, dbfs: float = -60.0, tohum: int = 0) -> Dizi:
    """Beyaz gürültü; RMS düzeyi `dbfs`."""
    uretec = np.random.default_rng(tohum)
    return (uretec.standard_normal(round(sure * ornekleme)) * 10 ** (dbfs / 20)).astype(np.float32)


def patlama(sure: float, ornekleme: int, genlik: float = 0.3, tohum: int = 0) -> Dizi:
    """Konuşmaya benzer: 140 Hz temel + harmonikler, 4 Hz hece zarfıyla."""
    t = np.arange(round(sure * ornekleme)) / ornekleme
    temel = sum(np.sin(2 * np.pi * 140 * k * t) / k for k in range(1, 8))
    zarf = 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t) ** 2
    uretec = np.random.default_rng(tohum)
    return (genlik * zarf * temel / 2 + uretec.standard_normal(len(t)) * 0.01).astype(np.float32)


def birlestir(*parcalar: Dizi) -> Dizi:
    return np.concatenate(parcalar).astype(np.float32)


def snr_db(olcum: np.ndarray, beklenen: np.ndarray) -> float:
    fark = np.asarray(olcum, np.float64) - np.asarray(beklenen, np.float64)
    return float(10 * np.log10(np.sum(np.square(beklenen)) / max(np.sum(np.square(fark)), 1e-30)))
