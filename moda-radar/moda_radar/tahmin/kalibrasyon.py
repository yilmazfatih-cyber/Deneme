"""Kalibrasyon ve isabet ölçütleri (docs/PLAN.md bölüm 9)."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence


def _dogrula(olasiliklar: Sequence[float], sonuclar: Sequence) -> None:
    if len(olasiliklar) != len(sonuclar):
        raise ValueError("olasılık ve sonuç listeleri aynı uzunlukta olmalı")
    if not olasiliklar:
        raise ValueError("boş liste için ölçüt hesaplanamaz")
    if any(not 0 <= p <= 1 for p in olasiliklar):
        raise ValueError("olasılıklar [0, 1] aralığında olmalı")


def brier(olasiliklar: Sequence[float], sonuclar: Sequence[bool | int]) -> float:
    """Brier skoru: ortalama (p − y)²; düşük iyidir. Hep 0,5 diyen model 0,25 alır."""
    _dogrula(olasiliklar, sonuclar)
    return sum((p - float(bool(y))) ** 2 for p, y in zip(olasiliklar, sonuclar)) / len(olasiliklar)


def kalibrasyon_kovalari(olasiliklar: Sequence[float], sonuclar: Sequence[bool | int], k: int = 5) -> list[dict]:
    """[0, 1] eşit genişlikte ``k`` kova; her kovada ortalama olasılık ve gerçekleşme oranı.

    Boş kova da listelenir (``n = 0``, oranlar ``None``) ki kalibrasyon eğrisi kovaları kaymasın.
    """
    _dogrula(olasiliklar, sonuclar)
    if k < 1:
        raise ValueError("k en az 1 olmalı")
    kovalar = [[] for _ in range(k)]
    for p, y in zip(olasiliklar, sonuclar):
        kovalar[min(int(p * k), k - 1)].append((p, float(bool(y))))
    sonuc = []
    for i, kova in enumerate(kovalar):
        n = len(kova)
        sonuc.append(
            {
                "alt": round(i / k, 4),
                "ust": round((i + 1) / k, 4),
                "n": n,
                "ort_olasilik": round(sum(p for p, _ in kova) / n, 4) if n else None,
                "gercek_oran": round(sum(y for _, y in kova) / n, 4) if n else None,
            }
        )
    return sonuc


def ilk_n_isabet(
    tahmin_siralama: Sequence,
    gercek_kume: Iterable,
    n: int = 10,
    esit: Callable[[object, object], bool] = lambda a, b: a == b,
) -> float:
    """Sıralamanın ilk ``n`` öğesinden gerçek kümede eşi olanların oranı.

    ``esit`` enjekte edilebilir: renkte kod eşitliği yerine ΔE2000 < 6 eşlemesi (renk modülü) verilebilir.
    Payda ``min(n, len(tahmin_siralama))``; boş sıralama 0 döner.
    """
    gercek = list(gercek_kume)
    ilk = list(tahmin_siralama)[:n]
    if not ilk:
        return 0.0
    return sum(1 for t in ilk if any(esit(t, g) for g in gercek)) / len(ilk)
