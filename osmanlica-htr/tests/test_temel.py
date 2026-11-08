import json
import random
from pathlib import Path

import numpy as np
import torch

from osmanlica_htr.alfabe import Alfabe, normallestir
from osmanlica_htr.bolut import kelimeleri_bul, sayfa_bolutle
from osmanlica_htr.kodcoz import acgozlu, isin_arama, secenekler
from osmanlica_htr.model import CRNN
from osmanlica_htr.sentez import kelimeleri_yukle, metin_ciz, ornek_uret
from osmanlica_htr.veri import kec_cer, on_isle


def test_normallestir_esdegerler():
    assert normallestir("كتاب") == "كتاب"
    assert normallestir("کتابی") == "كتابی"  # Farsça kef → Arapça kef, ye korunur
    assert normallestir("علي") == normallestir("على") == "علی"
    assert normallestir("مَكْتُوب") == "مكتوب"  # harekeler atılır
    assert normallestir("ﻻ") == "لا"  # sunum biçimi çözülür
    assert normallestir("۱۲۳") == "١٢٣"


def test_alfabe_kodla_coz():
    a = Alfabe()
    m = "دولت علیه"
    assert a.coz(a.kodla(m)) == m
    assert a.blank == 0 and a.karakterler[0] == "<b>"


def test_model_sekli_ve_boyutu():
    a = Alfabe()
    m = CRNN(len(a))
    y = m(torch.zeros(2, 1, 64, 128))
    assert y.shape == (32, 2, len(a))
    assert m.parametre_sayisi() < 2_500_000


def test_acgozlu_ve_isin():
    a = Alfabe()
    T, C = 12, len(a)
    logp = np.full((T, C), -10.0, dtype=np.float32)
    idx = a.kodla("دولت")
    yol = [0, idx[0], idx[0], 0, idx[1], 0, idx[2], idx[2], 0, idx[3], 0, 0]
    for t, s in enumerate(yol):
        logp[t, s] = 0.0
    assert a.coz(acgozlu(logp)) == "دولت"
    en_iyi = isin_arama(logp, isin=4)[0][0]
    assert a.coz(en_iyi) == "دولت"
    sec = secenekler(logp, a, adet=3)
    assert sec[0][0] == "دولت" and abs(sum(p for _, p in sec) - 1) < 1e-6


def test_cer():
    assert kec_cer("دولت", "دولت") == (0, 4)
    assert kec_cer("دوت", "دولت")[0] == 1


def test_sentez_ve_on_isleme():
    rng = random.Random(0)
    kel = kelimeleri_yukle()
    assert len(kel) > 1000
    o = ornek_uret(kel, rng)
    arr = on_isle(o.goruntu)
    assert arr.shape[0] == 64 and 0 <= arr.min() and arr.max() <= 1


def test_bolutleme_satir_sayisi():
    from PIL import Image

    rng = random.Random(1)
    kel = kelimeleri_yukle()
    sayfa = Image.new("L", (900, 700), 240)
    y = 40
    for _ in range(5):
        im = metin_ciz(" ".join(rng.choice(kel) for _ in range(4)), "Amiri", 40, rng)
        sayfa.paste(im, (900 - 40 - im.width, y))
        y += im.height + 10
    _, satirlar, _ = sayfa_bolutle(sayfa)
    assert len(satirlar) == 5
    assert all(len(s.kelimeler) >= 1 for s in satirlar)


def test_kelimeleri_bul_bos():
    assert kelimeleri_bul(np.zeros((20, 50), dtype=bool)) == []
