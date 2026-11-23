"""Yeniden örnekleme kalitesi: SNR, durdurma bandı, düzlük, uzunluk ve kaba kuvvet karşılaştırması."""

import numpy as np
import pytest

from ses.hatalar import BicimHatasi
from ses.ses_isleme.yeniden_ornekle import (
    cikti_uzunlugu,
    oran,
    suzgec_tasarla,
    yeniden_ornekle,
)
from tests.yardimci import sinus, snr_db


def _kenarsiz(dizi, ornekleme):
    kenar = ornekleme // 10
    return dizi[kenar:-kenar]


@pytest.mark.parametrize(
    ("kaynak", "hedef", "frekans"),
    [(22050, 16000, 1000), (44100, 16000, 3000), (48000, 16000, 6500), (16000, 48000, 5000),
     (16000, 22050, 7000), (8000, 16000, 3000), (44100, 48000, 15000)],
)  # fmt: skip
def test_gecirme_bandinda_sinus_korunur(kaynak, hedef, frekans):
    cikti = yeniden_ornekle(sinus(frekans, 1.0, kaynak), kaynak, hedef)
    beklenen = sinus(frekans, len(cikti) / hedef, hedef)[: len(cikti)]
    assert snr_db(_kenarsiz(cikti, hedef), _kenarsiz(beklenen, hedef)) > 75


@pytest.mark.parametrize(
    ("kaynak", "hedef", "frekans"),
    [(22050, 16000, 8200), (48000, 16000, 9000), (44100, 16000, 15000), (44100, 22050, 11500)],
)
def test_durdurma_bandi_80_db(kaynak, hedef, frekans):
    girdi = sinus(frekans, 1.0, kaynak)
    cikti = _kenarsiz(yeniden_ornekle(girdi, kaynak, hedef), hedef)
    zayiflama = 20 * np.log10(np.sqrt(np.mean(cikti**2)) / np.sqrt(np.mean(girdi**2)))
    assert zayiflama < -78


def test_buyutmede_yansima_yok():
    cikti = yeniden_ornekle(sinus(3000, 1.0, 16000), 16000, 48000)
    tayf = np.abs(np.fft.rfft(_kenarsiz(cikti, 48000) * np.hanning(len(cikti) - 9600)))
    frekanslar = np.fft.rfftfreq(len(cikti) - 9600, 1 / 48000)
    yansima = tayf[frekanslar > 8500].max() / tayf.max()
    assert 20 * np.log10(yansima) < -78  # 13 kHz, 19 kHz… yansımaları bastırılmış


def test_gecirme_bandi_duz():
    for frekans in (100, 1000, 4000, 6800):
        cikti = _kenarsiz(yeniden_ornekle(sinus(frekans, 1.0, 22050, 0.5), 22050, 16000), 16000)
        genlik = np.sqrt(2 * np.mean(cikti.astype(np.float64) ** 2))
        assert abs(20 * np.log10(genlik / 0.5)) < 0.01


def test_kaba_kuvvetle_ayni():
    """Çok fazlı hesap, süzgecin tanımından doğrudan hesaplanan toplamla aynı olmalı."""
    kaynak, hedef = 22050, 16000
    yukari, asagi = oran(kaynak, hedef)
    h = suzgec_tasarla(yukari, asagi)
    gecikme = (len(h) - 1) // 2
    girdi = np.random.default_rng(3).uniform(-1, 1, 600).astype(np.float32)
    cikti = yeniden_ornekle(girdi, kaynak, hedef)
    for n in (0, 1, 57, 200, len(cikti) - 1):
        k = np.arange(len(girdi))
        j = n * asagi + gecikme - k * yukari  # büyütülmüş sinyalde k'inci örneğin süzgeç konumu
        gecerli = (j >= 0) & (j < len(h))
        beklenen = float(np.sum(girdi[gecerli].astype(np.float64) * h[j[gecerli]]))
        assert abs(cikti[n] - beklenen) < 1e-5


def test_uzunluk_dc_ve_ozdeslik():
    assert len(yeniden_ornekle(np.zeros(22050, np.float32), 22050, 16000)) == 16000
    assert cikti_uzunlugu(1001, 48000, 16000) == 334
    sabit = yeniden_ornekle(np.full(48000, 0.25, np.float32), 48000, 16000)
    assert np.allclose(sabit[2000:-2000], 0.25, atol=1e-4)
    girdi = sinus(440, 0.1, 16000)
    assert np.array_equal(yeniden_ornekle(girdi, 16000, 16000), girdi)
    assert len(yeniden_ornekle(np.zeros(0, np.float32), 8000, 16000)) == 0


def test_zamanda_hizali():
    """Bir dürtü, girdideki anına karşılık gelen çıktı örneğinde tepe yapmalı (gecikme yok)."""
    girdi = np.zeros(22050, np.float32)
    girdi[11025] = 1.0  # 0,5. saniye
    cikti = yeniden_ornekle(girdi, 22050, 16000)
    assert int(np.argmax(cikti)) == 8000


def test_hatalar():
    with pytest.raises(BicimHatasi, match="tek kanallı"):
        yeniden_ornekle(np.zeros((10, 2), np.float32), 16000, 8000)
    with pytest.raises(BicimHatasi, match="pozitif"):
        yeniden_ornekle(np.zeros(10, np.float32), 0, 8000)
