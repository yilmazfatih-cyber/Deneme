"""Risale-i Nur yardımcıları: kelime akışı, arama biçimi ve iki sayfalık açılımı bölme."""

import numpy as np
from PIL import Image, ImageDraw

from osmanlica_htr.risale import acilimi_bol, arama_bicimi, kelime_akisi


def test_kelime_akisi_paragraf_baslari():
    kelimeler, baslar = kelime_akisi(["Bir zaman iki adam,", "bir havuzda yıkandılar."])
    assert kelimeler == ["Bir", "zaman", "iki", "adam,", "bir", "havuzda", "yıkandılar."]
    assert baslar == [0, 4]


def test_arama_bicimi_turkce():
    assert arama_bicimi("İMAN") == "iman"
    assert arama_bicimi("Âlime") == "alime"
    assert arama_bicimi("Kur’an’ın") == "kuranın"


def _acilim(W=3000, H=2000):
    img = Image.new("L", (W, H), 235)
    d = ImageDraw.Draw(img)
    for y in range(200, 1800, 90):
        d.rectangle([1650, y, 2850, y + 30], fill=30)  # sağ sayfa
        d.rectangle([150, y, 1350, y + 30], fill=30)  # sol sayfa
    d.rectangle([2700, 60, 2850, 120], fill=0)  # sağ sayfanın işareti
    d.rectangle([1495, 0, 1505, H], fill=60)  # cilt gölgesi: uzun ince bileşen, bölmeyi şaşırtmamalı
    return img


def test_acilimi_bol_sag_sayfa_once_ve_bosluktan():
    img = _acilim()
    sag, sol = acilimi_bol(img)
    assert sag.width + sol.width == img.width
    assert 1350 < sol.width < 1650  # kesim iki metin bloğu arasındaki boşlukta
    a = np.asarray(sag)
    assert (a[60:120, -300:] < 50).any()  # okuma sırası: önce sağ sayfa


def test_tek_sayfa_bolunmez():
    img = Image.new("L", (1200, 2000), 235)
    assert acilimi_bol(img) == [img]
