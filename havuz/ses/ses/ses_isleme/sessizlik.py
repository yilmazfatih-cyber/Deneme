"""Baştaki ve sondaki sessizliği kırpma, istenen uzunlukta sessizlik ekleme.

Eşik: en yüksek çerçeve enerjisinin `goreli_esik_db` altı ile `mutlak_esik_dbfs`'in büyüğü; ilk ve
son eşik üstü çerçeve bulunur, iki yana `pay_ms` bırakılır (sözcüğün nefesi kesilmesin).
Kim kullanır: tts/ (Piper çıktısının başı/sonu), komutlar.py.
Genişletme: kırpma ölçütü değişecekse `kirpma_araligi`'nı değiştirin; tests/test_sessizlik.py.
"""

from __future__ import annotations

import numpy as np

from ses.ses_isleme.ses import Dizi
from ses.ses_isleme.vad import ADIM_MS, cerceve_enerjisi


def kirpma_araligi(
    dizi: Dizi,
    ornekleme: int,
    *,
    goreli_esik_db: float = 40.0,
    mutlak_esik_dbfs: float = -60.0,
    pay_ms: int = 50,
) -> tuple[int, int]:
    """Korunacak örnek aralığı [baş, son). Tamamen sessizse (0, 0)."""
    pencere_ms = 20
    enerji = cerceve_enerjisi(dizi, ornekleme, pencere_ms=pencere_ms)
    if len(enerji) == 0:
        return 0, 0
    esik = max(float(enerji.max()) - goreli_esik_db, mutlak_esik_dbfs)
    ustunde = np.flatnonzero(enerji > esik)
    if len(ustunde) == 0:
        return 0, 0
    adim = ornekleme * ADIM_MS // 1000
    pay = ornekleme * pay_ms // 1000
    bas = max(0, int(ustunde[0]) * adim - pay)
    son = min(len(dizi), int(ustunde[-1]) * adim + ornekleme * pencere_ms // 1000 + pay)
    return bas, son


def sessizligi_kirp(
    dizi: Dizi,
    ornekleme: int,
    *,
    goreli_esik_db: float = 40.0,
    mutlak_esik_dbfs: float = -60.0,
    pay_ms: int = 50,
) -> Dizi:
    """Baştaki/sondaki sessizliği atar (ortadakine dokunmaz). Tamamen sessizse boş dizi."""
    bas, son = kirpma_araligi(
        dizi,
        ornekleme,
        goreli_esik_db=goreli_esik_db,
        mutlak_esik_dbfs=mutlak_esik_dbfs,
        pay_ms=pay_ms,
    )
    return dizi[bas:son].copy()


def sessizlik(sure_ms: float, ornekleme: int) -> Dizi:
    """Verilen uzunlukta sıfır dizi."""
    return np.zeros(round(ornekleme * sure_ms / 1000), dtype=np.float32)


def sessizlikle_cevrele(dizi: Dizi, ornekleme: int, bas_ms: float, son_ms: float) -> Dizi:
    """Başa ve sona sessizlik ekler (oynatıcı ilk heceyi yutmasın)."""
    return np.concatenate([sessizlik(bas_ms, ornekleme), dizi, sessizlik(son_ms, ornekleme)])
