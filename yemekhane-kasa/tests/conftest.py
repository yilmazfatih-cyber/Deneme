from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from PIL import Image

from yemekhane_kasa.ayarlar import Ayarlar
from yemekhane_kasa.demo import DEMO_BOLGE, sahne_ciz
from yemekhane_kasa.fiyat import Kalem
from yemekhane_kasa.goruntu import bolge_kirp, imza_cikar
from yemekhane_kasa.kamera import Kare
from yemekhane_kasa.menu import Menu, menu_yukle
from yemekhane_kasa.pos import PosSonucu
from yemekhane_kasa.tanima import TanimaSonucu

PROJE = Path(__file__).resolve().parent.parent
ORNEK_MENU = PROJE / "menuler" / "ornek-menu.yaml"
TEPSI_A = ["mercimek_corbasi", "kuru_fasulye", "pirinc_pilavi", "ayran"]


@pytest.fixture
def menu() -> Menu:
    return menu_yukle(ORNEK_MENU)


def _birlestir(hedef: dict[str, Any], ek: dict[str, Any]) -> dict[str, Any]:
    for anahtar, deger in ek.items():
        if isinstance(deger, dict) and isinstance(hedef.get(anahtar), dict):
            _birlestir(hedef[anahtar], deger)
        else:
            hedef[anahtar] = deger
    return hedef


def ayarlar_olustur(temel: Path, **ek: Any) -> Ayarlar:
    veri: dict[str, Any] = {
        "menu": str(ORNEK_MENU),
        "kamera": {"kaynak": "kareler", "cekim_araligi_sn": 3.5, "yoklama_sn": 0.3, "bolge": list(DEMO_BOLGE)},
        "tanima": {"tur": "sahte"},
        "pos": {"tur": "konsol"},
    }
    ayarlar = Ayarlar.model_validate(_birlestir(veri, copy.deepcopy(ek)))
    ayarlar._temel = temel
    return ayarlar


def sonuc(*menu_idler: str, guven: float = 0.95) -> TanimaSonucu:
    return TanimaSonucu(tepsi_var=True, kalemler=[Kalem(m, 1, "tam", guven) for m in menu_idler], model="test")


BOS = TanimaSonucu(tepsi_var=False, model="test")


class EtiketliTaniyici:
    """Karenin `kaynak` etiketine göre önceden belirlenmiş sonucu döner; çağrıları sayar."""

    def __init__(self, sonuclar: dict[str, TanimaSonucu]) -> None:
        self.sonuclar = sonuclar
        self.cagrilar: list[str] = []

    def tani(self, kare: Kare, menu: Menu) -> TanimaSonucu:
        assert kare.kaynak is not None
        self.cagrilar.append(kare.kaynak)
        return copy.deepcopy(self.sonuclar[kare.kaynak])


class KayitliPos:
    """Mesajları biriktirir; ilk `basarisiz` gönderim başarısız olur."""

    def __init__(self, basarisiz: int = 0) -> None:
        self.basarisiz = basarisiz
        self.mesajlar: list[dict[str, Any]] = []
        self.denemeler = 0

    def gonder(self, mesaj: dict[str, Any]) -> PosSonucu:
        self.denemeler += 1
        if self.basarisiz > 0:
            self.basarisiz -= 1
            return PosSonucu(False, "POS kapalı")
        self.mesajlar.append(copy.deepcopy(mesaj))
        return PosSonucu(True, "tamam")


class BosKaynak:
    """Servis testlerinde kaynak kullanılmaz (kareler doğrudan `adim`a verilir)."""

    bitti = False

    def ac(self) -> None: ...

    def son_kare(self) -> Kare | None:
        return None

    def kapat(self) -> None: ...


def sahne(etiket: str) -> Image.Image:
    """Sabit sahne görüntüleri: bos, A (tepsi), A_isik (aynı tepsi, ışık değişik), A_tatli (tatlı eklendi),
    B (aynı yemekler başka tepside), C (bambaşka tepsi)."""
    tanimlar = {
        "bos": (0, None, [], 0),
        "A": (1, (320, 240), TEPSI_A, 0),
        "A_isik": (2, (320, 240), TEPSI_A, 8),
        "A_tatli": (3, (320, 240), [*TEPSI_A, "sutlac"], 0),
        "B": (4, (310, 250), TEPSI_A, 0),
        "C": (5, (330, 230), ["kuru_fasulye", "sutlac"], 0),
    }
    tohum, tepsi, yemekler, parlaklik = tanimlar[etiket]
    return sahne_ciz(tohum, tepsi, yemekler, parlaklik)


def imza(etiket: str) -> np.ndarray:
    """Sahnenin, servisin gördüğü gibi (tepsi bölgesi kırpılmış) imzası."""
    return imza_cikar(bolge_kirp(sahne(etiket), DEMO_BOLGE))


# Her hücresi farklı bir imza: "görüntünün tamamı değişti"
DAMA = np.tile(np.array([[0, 200], [200, 0]], dtype=np.float32), (18, 24))


def oynat(servis: Any, sahneler: list[tuple[str, float]], adim_sn: float = 0.3, baslangic: float = 0.0) -> float:
    """Her sahneyi `sure` saniye boyunca `adim_sn` aralıkla servise verir; bitiş anını döner."""
    an = baslangic
    goruntuler: dict[str, Image.Image] = {}
    for etiket, sure in sahneler:
        temel = etiket.split("#")[0]
        if temel not in goruntuler:
            goruntuler[temel] = sahne(temel)
        bitis = an + sure
        while an < bitis - 1e-9:
            servis.adim(Kare(goruntuler[temel], an, temel))
            an += adim_sn
    return an
