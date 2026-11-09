import math
import random
from datetime import date

import pytest

from moda_radar.gorsel import uyum
from moda_radar.sema import Kaynak, KaynakTuru, NitelikKaydi


def _kayit(url, parca_id, **eksen):
    k = Kaynak(tur=KaynakTuru.PODYUM, url=url, tarama_tarihi=date(2026, 10, 2), sezon="SS27")
    return NitelikKaydi(kaynak=k, parca_id=parca_id, kategori="kadin-ust", parca_konumu="ust",
                        etiketleyen_model="m", **eksen)  # fmt: skip


def test_tam_uyum_bir():
    a = ["duz", "cizgili", "ekose", "duz"]
    assert uyum.cohen_kappa(a, list(a)) == pytest.approx(1.0)


def test_tek_deger_tam_uyum_bir():
    assert uyum.cohen_kappa(["duz"] * 5, ["duz"] * 5) == 1.0


def test_rastgele_sifira_yakin():
    r = random.Random(1)
    degerler = ["duz", "cizgili", "ekose", "puantiye"]
    a = [r.choice(degerler) for _ in range(4000)]
    b = [r.choice(degerler) for _ in range(4000)]
    assert abs(uyum.cohen_kappa(a, b)) < 0.05


def test_bilinen_deger():
    # po = 0,7; pe = 0,5 → κ = 0,4
    a = ["e"] * 20 + ["e"] * 5 + ["h"] * 10 + ["h"] * 15
    b = ["e"] * 20 + ["h"] * 5 + ["e"] * 10 + ["h"] * 15
    assert uyum.cohen_kappa(a, b) == pytest.approx(0.4)


def test_bos_ve_uzunluk_hatasi():
    assert math.isnan(uyum.cohen_kappa([], []))
    with pytest.raises(ValueError):
        uyum.cohen_kappa(["a"], [])


def test_eksen_uyumu_ayni_parca_ciftleri():
    a = [_kayit("u1", "g1-ust", desen="duz"), _kayit("u2", "g2-ust", desen="cizgili"), _kayit("u3", "g3-ust")]
    b = [_kayit("u2", "g2-ust", desen="cizgili"), _kayit("u1", "g1-ust", desen="duz"), _kayit("u9", "g9-ust")]
    k = uyum.eksen_uyumu(a, b)
    assert len(uyum.ciftler(a, b)) == 2
    assert k["desen"] == pytest.approx(1.0) and k["siluet"] == 1.0
    assert set(k) == set(a[0].eksen_degerleri())
    assert uyum.eksen_uyumu(a, []) == {}


def test_eksen_uyumu_anlasmazlik():
    a = [_kayit("u1", "p", desen="duz"), _kayit("u2", "p", desen="cizgili")]
    b = [_kayit("u1", "p", desen="cizgili"), _kayit("u2", "p", desen="duz")]
    assert uyum.eksen_uyumu(a, b)["desen"] < 0


def test_denetim_ornekle_tekrarlanabilir_ve_yuzde_bes():
    ogeler = list(range(200))
    s1, s2 = uyum.denetim_ornekle(ogeler), uyum.denetim_ornekle(ogeler)
    assert s1 == s2 and len(s1) == 10 and s1 == sorted(s1)
    assert uyum.denetim_ornekle(ogeler, tohum=8) != s1
    assert len(uyum.denetim_ornekle(list(range(3)))) == 1
    assert uyum.denetim_ornekle([]) == []
