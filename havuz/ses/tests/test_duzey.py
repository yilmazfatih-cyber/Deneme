"""Ses düzeyi: BS.1770 katsayıları, kalibrasyon, IIR ile karşılaştırma, geçitler, normalizasyon."""

import math

import numpy as np
import pytest

from ses.ses_isleme.duzey import (
    k_agirlikli,
    k_suzgec_katsayilari,
    lufs,
    lufs_normallestir,
    rms_dbfs,
    rms_normallestir,
    tepe_dbfs,
)
from tests.yardimci import birlestir, gurultu, sessizlik, sinus


def _iir(b, a, x):
    """Başvuru: ikinci derece fark denklemi, düz Python döngüsü."""
    y = np.zeros(len(x))
    x1 = x2 = y1 = y2 = 0.0
    for i, x0 in enumerate(np.asarray(x, np.float64)):
        y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        y[i] = y0
        x2, x1, y2, y1 = x1, x0, y1, y0
    return y


def test_48_khz_katsayilari_standarttaki_gibi():
    (b1, a1), (b2, a2) = k_suzgec_katsayilari(48000)
    assert np.allclose(b1, [1.53512485958697, -2.69169618940638, 1.19839281085285], atol=1e-10)
    assert np.allclose(a1, [1.0, -1.69065929318241, 0.73248077421585], atol=1e-10)
    assert b2 == [1.0, -2.0, 1.0]
    assert np.allclose(a2, [1.0, -1.99004745483398, 0.99007225036621], atol=1e-10)


@pytest.mark.parametrize(("ornekleme", "pay"), [(48000, 0.01), (44100, 0.02), (22050, 0.05),
                                                (16000, 0.05), (8000, 0.05)])  # fmt: skip
def test_kalibrasyon_tam_olcek_997_hz(ornekleme, pay):
    """BS.1770: 0 dBFS 997 Hz sinüs tek kanalda −3,01 LKFS verir."""
    assert abs(lufs(sinus(997, 3.0, ornekleme, genlik=1.0), ornekleme) + 3.01) < pay


@pytest.mark.parametrize("ornekleme", [16000, 48000])
def test_fft_suzgec_dogrudan_iir_ile_ayni(ornekleme):
    x = gurultu(0.5, ornekleme, dbfs=-20, tohum=4)
    raf, yuksek = k_suzgec_katsayilari(ornekleme)
    basvuru = _iir(*yuksek, _iir(*raf, x))
    assert np.max(np.abs(k_agirlikli(x, ornekleme) - basvuru)) < 1e-7


def test_mutlak_gecit_sessizligi_disarida_birakir():
    """Sessiz bloklar (−70 LUFS altı) girmez; tonla sessizliğin sınırındaki 3 kısmi blok (%75, %50,
    %25 ton) ise geçitleri aşar ve standarda göre ortalamaya girer: 47 tam + 1,5 → 50 blok."""
    ton = sinus(997, 5.0, 48000, genlik=0.1)
    tek = lufs(ton, 48000)
    ile = lufs(birlestir(ton, sessizlik(5.0, 48000), gurultu(5.0, 48000, dbfs=-90)), 48000)
    assert abs(ile - (tek + 10 * math.log10(48.5 / 50))) < 0.01


def _basvuru_lufs(dizi, ornekleme):
    """Başvuru geçitleme: blokları tek tek dolaşan düz Python (BS.1770-4 metnindeki adımlar)."""
    kare = np.square(k_agirlikli(dizi, ornekleme))
    blok, adim = int(0.4 * ornekleme), int(0.1 * ornekleme)
    z = [float(np.mean(kare[b : b + blok])) for b in range(0, len(kare) - blok + 1, adim)]
    seviye = [-0.691 + 10 * math.log10(max(v, 1e-30)) for v in z]
    mutlak = [v for v, s in zip(z, seviye, strict=True) if s > -70]
    goreli = -0.691 + 10 * math.log10(sum(mutlak) / len(mutlak)) - 10
    secilen = [v for v, s in zip(z, seviye, strict=True) if s > -70 and s > goreli]
    return -0.691 + 10 * math.log10(sum(secilen) / len(secilen))


@pytest.mark.parametrize("kisiklik_db", [-20.0, -6.0, -9.0, -11.0])
def test_goreli_gecit_basvuruyla_ayni(kisiklik_db):
    """−10 LU'dan kısık bölüm ortalamaya girmez, içindeki girer; sınır blokları standarttaki gibi."""
    yuksek = sinus(997, 4.0, 48000, genlik=0.5)
    kisik = sinus(997, 4.0, 48000, genlik=0.5 * 10 ** (kisiklik_db / 20))
    sinyal = birlestir(yuksek, kisik, gurultu(1.0, 48000, dbfs=-95))
    assert abs(lufs(sinyal, 48000) - _basvuru_lufs(sinyal, 48000)) < 1e-6
    if kisiklik_db <= -20:  # göreli geçit TÜM blokların ortalamasına göredir; −11 dB hâlâ içeride
        assert lufs(sinyal, 48000) - lufs(yuksek, 48000) > -0.2  # kısık bölüm dışarıda


def test_lufs_normallestir_hedefe_getirir():
    girdi = birlestir(sinus(300, 2.0, 22050, 0.05), sinus(1200, 2.0, 22050, 0.02))
    cikti, bilgi = lufs_normallestir(girdi, 22050, hedef_lufs=-18.0)
    assert bilgi.hedefe_ulasildi and abs(lufs(cikti, 22050) + 18.0) < 0.01


def test_tepe_tavani_kazanci_kisar():
    girdi = sinus(1000, 3.0, 16000, 0.02)
    girdi[8000] = 0.9  # tek bir tık: ses yüksekliğini değiştirmez ama tepeyi belirler
    cikti, bilgi = lufs_normallestir(girdi, 16000, hedef_lufs=-14.0, tepe_siniri_dbfs=-1.0)
    assert not bilgi.hedefe_ulasildi
    assert tepe_dbfs(cikti) <= -1.0 + 1e-3 and abs(bilgi.tepe_dbfs + 1.0) < 1e-6


def test_sessizlik_ve_bos():
    sifir = np.zeros(16000, np.float32)
    assert lufs(sifir, 16000) == -120.0 and rms_dbfs(np.zeros(0, np.float32)) == -120.0
    cikti, bilgi = lufs_normallestir(sifir, 16000)
    assert np.array_equal(cikti, sifir) and bilgi.kazanc_db == 0.0


def test_rms():
    assert abs(rms_dbfs(sinus(1000, 1.0, 16000, genlik=1.0)) + 3.0103) < 1e-3
    cikti, bilgi = rms_normallestir(sinus(500, 1.0, 16000, 0.01), hedef_dbfs=-20.0)
    assert bilgi.hedefe_ulasildi and abs(rms_dbfs(cikti) + 20.0) < 1e-3


def test_kisa_ses_tek_blok():
    assert abs(lufs(sinus(997, 0.2, 48000, genlik=1.0), 48000) + 3.01) < 0.05
