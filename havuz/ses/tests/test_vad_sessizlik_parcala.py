"""VAD, sessizlik kırpma ve parçalama: sentetik sinyallerle (patlama = konuşmaya benzer ses)."""

import numpy as np
import pytest

from ses.hatalar import BicimHatasi
from ses.ses_isleme.parcala import Parca, konusma_parcalari, sabit_parcalar
from ses.ses_isleme.sessizlik import kirpma_araligi, sessizligi_kirp, sessizlikle_cevrele
from ses.ses_isleme.vad import Bolge, cerceve_enerjisi, konusma_bolgeleri
from tests.yardimci import birlestir, gurultu, patlama, sessizlik, sinus

HIZ = 16000


def _yakin(bolge: Bolge, bas: float, son: float, pay: float = 0.05) -> bool:
    return abs(bolge.baslangic - bas) <= pay and abs(bolge.bitis - son) <= pay


def test_cerceve_enerjisi():
    enerji = cerceve_enerjisi(sinus(1000, 1.0, HIZ, genlik=1.0), HIZ)
    assert len(enerji) == 100 and np.allclose(enerji[:95], -3.01, atol=0.05)


def test_sessizlik_ve_kisik_gurultu_konusma_degil():
    assert konusma_bolgeleri(sessizlik(2.0, HIZ), HIZ) == []
    assert konusma_bolgeleri(gurultu(2.0, HIZ, dbfs=-62), HIZ) == []
    assert konusma_bolgeleri(np.zeros(0, np.float32), HIZ) == []


def test_iki_patlama_payla_bulunur():
    sinyal = birlestir(
        gurultu(0.5, HIZ, -60, 1), patlama(1.0, HIZ), gurultu(1.0, HIZ, -60, 2),
        patlama(0.5, HIZ, tohum=3), gurultu(1.0, HIZ, -60, 4),
    )  # fmt: skip
    bolgeler = konusma_bolgeleri(sinyal, HIZ)
    assert len(bolgeler) == 2
    assert _yakin(bolgeler[0], 0.4, 1.6) and _yakin(bolgeler[1], 2.4, 3.1)


def test_kisa_bosluk_birlesir_tikirti_atilir():
    sinyal = birlestir(
        sessizlik(0.5, HIZ), patlama(0.6, HIZ), sessizlik(0.2, HIZ), patlama(0.6, HIZ),
        sessizlik(1.0, HIZ), sinus(1000, 0.03, HIZ), sessizlik(1.0, HIZ),
    )  # fmt: skip
    bolgeler = konusma_bolgeleri(sinyal, HIZ)
    assert len(bolgeler) == 1 and _yakin(bolgeler[0], 0.4, 2.0)


def test_sessizlik_kirpma():
    sinyal = birlestir(sessizlik(0.7, HIZ), sinus(440, 1.0, HIZ), gurultu(0.5, HIZ, -80))
    bas, son = kirpma_araligi(sinyal, HIZ, pay_ms=50)
    assert abs(bas / HIZ - 0.65) < 0.015 and abs(son / HIZ - 1.75) < 0.025
    assert len(sessizligi_kirp(sessizlik(1.0, HIZ), HIZ)) == 0
    assert len(sessizlikle_cevrele(np.ones(10, np.float32), HIZ, 100, 50)) == 10 + 1600 + 800


def test_konusma_parcalari_sinirlara_uyar_ve_sessizligi_atlar():
    # 3 patlama: 0–2 sn sessiz, 2–8 konuşma, 8–10 sessiz, 10–16 konuşma, 16–20 sessiz, 20–26 konuşma
    parcalar_sinyal = [sessizlik(2, HIZ)]
    for _ in range(3):
        parcalar_sinyal += [patlama(6, HIZ), sessizlik(2, HIZ)]
    sinyal = birlestir(*parcalar_sinyal)
    parcalar = konusma_parcalari(sinyal, HIZ, azami_sn=15)
    assert all((p.son - p.bas) / HIZ <= 15 for p in parcalar)
    assert len(parcalar) == 2  # ilk ikisi bir parçaya sığar (arada 2 sn sessizlik), üçüncüsü ayrı
    assert abs(parcalar[0].bas / HIZ - 1.9) < 0.05 and abs(parcalar[1].bas / HIZ - 17.9) < 0.05


def test_uzun_konusma_en_sessiz_yerden_bolunur():
    yukseklik = 0.3 * np.ones(HIZ * 12, np.float32)
    yukseklik[int(HIZ * 6.95) : int(HIZ * 7.05)] = 0.001  # 7. saniyede kısa bir iniş
    sinyal = birlestir(sessizlik(0.5, HIZ), patlama(12, HIZ) * yukseklik / 0.3, sessizlik(0.5, HIZ))
    parcalar = konusma_parcalari(sinyal, HIZ, azami_sn=10)
    assert len(parcalar) == 2 and abs(parcalar[0].son / HIZ - 7.45) < 0.1
    assert parcalar[0].son == parcalar[1].bas  # arada örnek kaybı yok


def test_sabit_parcalar():
    assert sabit_parcalar(10 * HIZ, HIZ, parca_sn=4, ortusme_sn=1) == [
        Parca(0, 4 * HIZ), Parca(3 * HIZ, 7 * HIZ), Parca(6 * HIZ, 10 * HIZ),
    ]  # fmt: skip
    assert sabit_parcalar(0, HIZ, parca_sn=4) == []
    with pytest.raises(BicimHatasi):
        sabit_parcalar(100, HIZ, parca_sn=1, ortusme_sn=1)
    with pytest.raises(BicimHatasi):
        konusma_parcalari(sessizlik(1, HIZ), HIZ, azami_sn=0.5)
