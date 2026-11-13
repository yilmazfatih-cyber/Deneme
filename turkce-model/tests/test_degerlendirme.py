"""Değerlendirme: akışın tam kapsanması (BPC), çoktan seçmeli puanlar, ilerleme tablosu, metin üretimi."""

from __future__ import annotations

import math
from types import SimpleNamespace

import numpy as np
import pytest
import torch

from turkce_model.degerlendirme import akis_kaybi, bpc, ilerleme_ekle
from turkce_model.tokenizer import SATIR_ID
from turkce_model.uretim import metin_uret, tanimla
from turkce_model.veri import AkisVeri


def _akis(tmp_path, n: int) -> AkisVeri:
    yol = tmp_path / f"akis{n}.bin"
    np.arange(n, dtype=np.uint16).tofile(yol)  # her token kendi konumu: hangi hedefin puanlandığı görülür
    return AkisVeri(yol, 1000)


@pytest.mark.parametrize("n", [2, 5, 16, 17, 33, 100])
@pytest.mark.parametrize("t", [1, 4, 16, 64])
def test_pencereler_her_hedefi_tam_bir_kez_puanlar(tmp_path, n, t):
    hedefler = []
    for x, y in _akis(tmp_path, n).pencereler(t, b=3):
        for xr, yr in zip(x.tolist(), y.tolist()):
            for j, hedef in enumerate(yr):
                if hedef != -100:
                    assert hedef == xr[j] + 1  # x/y kayması doğru
                    hedefler.append(hedef)
    assert sorted(hedefler) == list(range(1, n))


class _DuzModel(torch.nn.Module):
    """Her konumda tekdüze dağılım: her hedefin kaybı ln(V)."""

    def __init__(self, baglam: int, v: int = 2048) -> None:
        super().__init__()
        self.m = SimpleNamespace(baglam=baglam)
        self.v = v

    def forward(self, x, hedef=None):
        return torch.zeros(*x.shape, self.v), None


def test_akis_kaybi_tum_hedefleri_sayar_ve_bpc_baglamdan_bagimsizdir(tmp_path):
    akis = _akis(tmp_path, 1027)
    sonuclar = [akis_kaybi(_DuzModel(t), akis, "cpu") for t in (16, 96, 128, 384, 512)]
    for s in sonuclar:
        assert s["token"] == len(akis) - 1
        assert s["toplam_nll"] == pytest.approx((len(akis) - 1) * math.log(2048), rel=1e-5)
    degerler = {round(bpc(s["toplam_nll"], 3055), 6) for s in sonuclar}
    assert len(degerler) == 1


def test_ilerleme_her_kumeyi_kendi_tabaniyla_yazar(tmp_path):
    kayit = {
        "deney": "deneme",
        "asama": "meb",
        "adim": 82,
        "parametre": 1_500_000,
        "parametre_gomme_disi": 400_000,
        "gorulen_token": 8090,
        "sozluk": {"boyut": 32000, "imza": "abcdef0123456789"},
        "bpc": 2.1,
        "bpc_ek": 2.5,
        "meb_test": {"n": 33, "dogruluk_metin": 0.182, "dogruluk_harf": 0.212, "rastgele": 0.25},
        "mmlu": {"n": 944, "dogruluk_metin": 0.19, "dogruluk_harf": 0.21, "rastgele": 0.2},
        "durduruldu": True,
        "ek_paragraf": 12,
    }
    md = ilerleme_ekle(tmp_path, kayit).read_text(encoding="utf-8")
    satir = next(s for s in md.splitlines() if "| deneme |" in s)
    assert "%18.2 / %21.2 (taban %25.0, n=33)" in satir  # 4 şıklı MEB: %25
    assert "%19.0 / %21.0 (taban %20.0, n=944)" in satir  # 5 şıklı TurkishMMLU: %20
    assert "32000 (abcdef)" in satir and "8.090" in satir and "2.500" in satir
    assert "durduruldu" in satir and "+12 ek paragraf" in satir


class _SabitUretici(torch.nn.Module):
    """``uret`` istemin sonuna hep aynı token'ları ekler; istemi kaydeder."""

    def __init__(self, devam: list[int]) -> None:
        super().__init__()
        self.devam = devam
        self.istem: list[int] = []

    def uret(self, idx, yeni, **_kw):
        self.istem = idx[0].tolist()
        return torch.cat([idx, torch.tensor([self.devam])], dim=1)


def test_uretilen_ilk_kelimenin_boslugu_kaybolmaz(tok):
    devam = tok.encode("ve kitap")  # [▁ve, ▁kitap]: ilk token boşlukla başlayan bir kelime
    model = _SabitUretici(devam)
    sonuc = metin_uret(model, tok, "Türk dili")
    assert sonuc == " ve kitap"
    assert "Türk dili" + sonuc == "Türk dili ve kitap"


def test_tanimla_istemi_satir_sonuyla_biter(tok):
    model = _SabitUretici(tok.encode("bir eser"))
    tanim = tanimla(model, tok, "kitap")
    assert model.istem[-1] == SATIR_ID  # derlemdeki gibi: madde başı satırı bitti, tanım başlıyor
    assert tanim == "bir eser" and not tanim.startswith("\n")
