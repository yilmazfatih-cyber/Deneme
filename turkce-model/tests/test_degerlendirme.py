"""Değerlendirme: akışın tam kapsanması (BPC), çoktan seçmeli puanlar, ilerleme tablosu, metin üretimi.

Gömme değerleri yalnız testlerin çalışması içindir, bir öneri değildir.
"""

from __future__ import annotations

import math
from types import SimpleNamespace

import numpy as np
import pytest
import torch

from turkce_model import meb
from turkce_model.ayarlar import GommeAyarlari, ModelAyarlari
from turkce_model.degerlendirme import akis_kaybi, bpc, coktan_secmeli, ilerleme_ekle, secenek_puanlari
from turkce_model.model import TurkceGPT
from turkce_model.tokenizer import PAD, SATIR_ID
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


def test_akis_kaybi_yigin_boyundan_bagimsizdir(tmp_path, tok):
    # Tam değerlendirme egitim.tdk.yigin kadar pencereyle yapılır; sonuç yığın boyuna göre değişmemeli.
    torch.manual_seed(0)
    g = GommeAyarlari(
        boyut=32, konum="rope", cikis_baglama=True, faktor_boyutu=0, kategori_gommesi=False,
        bicim_paylasimi=False, olcek=False, norm="yok", baslatma_std=0.02, dropout=0.0,
    )
    model = TurkceGPT.tokenizer_ile(g, ModelAyarlari(katman=1, bas_boyutu=16, baglam=16, dropout=0.0), tok)
    yol = tmp_path / "rastgele.bin"
    np.random.default_rng(0).integers(0, tok.boyut, size=203).astype(np.uint16).tofile(yol)
    akis = AkisVeri(yol, tok.boyut)
    sonuclar = [akis_kaybi(model, akis, "cpu", yigin=b) for b in (16, 4, 2, 1)]
    assert {s["token"] for s in sonuclar} == {202}
    for s in sonuclar[1:]:
        assert s["toplam_nll"] == pytest.approx(sonuclar[0]["toplam_nll"], rel=1e-5)


def test_ilerleme_her_kumeyi_kendi_tabaniyla_yazar(tmp_path):
    kayit = {
        "olcum": 2,
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
    # Sayılar boşlukla ayrılır: nokta, yanındaki ondalık sayılarla ("2.500") karışırdı.
    assert "32000 (abcdef)" in satir and "| 8 090 |" in satir and "2.500" in satir and "8.090" not in satir
    assert "(400 000)" in satir and "1.50 M" in satir
    assert satir.rstrip(" |").endswith("durduruldu, +12 ek paragraf")


def test_ilerleme_eski_olcumu_ve_bes_sikli_meb_egitimini_not_eder(tmp_path):
    def satir(**kayit) -> str:
        md = ilerleme_ekle(tmp_path, {"deney": "d", "adim": 1, **kayit}).read_text(encoding="utf-8")
        return [s for s in md.splitlines() if s.startswith("| ") and "| d |" in s][-1]

    assert "eski ölçüm: yeniden değerlendir" in satir(asama="tdk")  # ölçüm sürümü olmayan (eski) satır
    assert "eski ölçüm: yeniden değerlendir" in satir(asama="tdk", olcum=1, sozluk={"boyut": 700, "imza": "ab"})
    assert "eski ölçüm" not in satir(asama="tdk", olcum=2)
    # MEB ince ayarı 5 şıklı sorular da gördüyse satırda yazar; TDK satırında ya da yalnız 4 şıkta yazmaz.
    assert "MEB eğitimi: 34 soru 5 şıklı" in satir(asama="meb", olcum=2, meb_secenek={"4": 66, "5": 34})
    assert "MEB eğitimi" not in satir(asama="tdk", olcum=2, meb_secenek={"4": 66, "5": 34})
    assert "MEB eğitimi" not in satir(asama="meb", olcum=2, meb_secenek={"4": 100})
    md = (tmp_path / "ilerleme.md").read_text(encoding="utf-8")
    assert "A–D şıklı" not in md  # "MEB ince ayarı yalnız A–D şıklı sorularla yapılır" artık koşulsuz yazılmaz
    assert md.count("eski ölçüm: yeniden değerlendir") == 2  # eski satırlar her yeniden yazımda işaretli kalır


class _SabitModel(torch.nn.Module):
    """Bağlamdan bağımsız taklit model: her konumda aynı logit vektörü, yani her token'ın log-olasılığı bilinir."""

    def __init__(self, logit: torch.Tensor, baglam: int = 512) -> None:
        super().__init__()
        self.m = SimpleNamespace(baglam=baglam)
        self.logit = logit

    def forward(self, x, hedef=None):
        assert x.shape[1] <= self.m.baglam
        return self.logit.expand(x.shape[0], x.shape[1], -1).clone(), None


def _devam(tok, soru, metin: str) -> list[int]:
    """İstemden sonra ``metin``'in eklediği token'lar."""
    on = tok.encode(meb.istem(soru), bos=True)
    tam = tok.encode(meb.istem(soru) + metin, bos=True)
    assert tam[: len(on)] == on
    return tam[len(on) :]


def _soru(secenekler: list[str], cevap: int) -> meb.Soru:
    return meb.Soru(kimlik="t:1", kaynak="meb-pdf", ders="Tarih", soru="Hangisi doğrudur?", secenekler=secenekler, cevap=cevap)


def test_metin_puani_sik_metnidir_harf_puani_harf_tokenlari(tok):
    s = _soru(["kitap", "ev", "okul", "masa", "deniz"], 4)
    torch.manual_seed(0)
    olasilik = torch.softmax(torch.randn(tok.boyut), -1)
    lp = olasilik.log()
    harfler = [_devam(tok, s, f" {meb.HARFLER[i]})") for i in range(5)]
    metinler = [_devam(tok, s, meb.cevap_metni(s, i))[len(harfler[i]) :] for i in range(5)]
    puan = secenek_puanlari(_SabitModel(lp), tok, s, "cpu")
    for i in range(5):
        assert _devam(tok, s, meb.cevap_metni(s, i))[: len(harfler[i])] == harfler[i] and metinler[i]
        assert puan["harf"][i] == pytest.approx(float(lp[harfler[i]].sum()), abs=1e-4)  # " C)" token'larının toplamı
        assert puan["metin"][i] == pytest.approx(float(lp[metinler[i]].mean()), abs=1e-4)  # yalnız şık metni, ortalama

    # Yalnız A–D ile eğitilmiş bir model gibi E harfini bastır (olasılığı hiç puanlanmayan dolgu token'ına aktar):
    # "metin" puanları kıpırdamamalı; harf token'ları metne katılsaydı E'nin metin puanı düşerdi.
    e_ozgu = [t for t in harfler[4] if t not in harfler[0]]
    assert e_ozgu and not any(t in e_ozgu for metin in metinler for t in metin)
    bastirilmis = olasilik.clone()
    for t in e_ozgu:
        bastirilmis[PAD] += olasilik[t] * (1 - math.exp(-8))
        bastirilmis[t] *= math.exp(-8)
    puan2 = secenek_puanlari(_SabitModel(bastirilmis.log()), tok, s, "cpu")
    assert puan2["metin"] == pytest.approx(puan["metin"], abs=1e-4)
    assert puan2["harf"][:4] == pytest.approx(puan["harf"][:4], abs=1e-4)
    assert puan2["harf"][4] == pytest.approx(puan["harf"][4] - 8 * len(e_ozgu), abs=1e-3)


def test_coktan_secmeli_iki_yontemi_ayri_sayar(tok):
    s = _soru(["kitap", "ev", "okul", "masa", "deniz"], 2)
    logit = torch.zeros(tok.boyut)
    logit[_devam(tok, s, " C) okul")[-1]] = 5.0  # "okul" metni olası: metin yöntemi C der
    b_ozgu = [t for t in _devam(tok, s, " B)") if t not in _devam(tok, s, " A)")]
    logit[b_ozgu] = 5.0  # B harfi olası: harf yöntemi B der
    model = _SabitModel(logit)
    dogru_c = coktan_secmeli(model, tok, [s], "cpu")
    assert (dogru_c["n"], dogru_c["dogruluk_metin"], dogru_c["dogruluk_harf"], dogru_c["rastgele"]) == (1, 1.0, 0.0, 0.2)
    dogru_b = coktan_secmeli(model, tok, [_soru(s.secenekler, 1), s], "cpu")
    assert (dogru_b["dogruluk_metin"], dogru_b["dogruluk_harf"]) == (0.5, 0.5)
    assert dogru_b["dersler"]["Tarih"] == {"n": 2, "dogruluk_metin": 0.5, "dogruluk_harf": 0.5, "rastgele": 0.2}


def test_baglamdan_uzun_secenekte_yalniz_pencerede_kalan_harf_sayilir(tok):
    uzun = " ".join(["kitap ev okul masa deniz kalem yol su gün iş"] * 3)
    s = _soru(["ev", uzun, "okul", "masa"], 1)
    torch.manual_seed(1)
    lp = torch.log_softmax(torch.randn(tok.boyut), -1)
    a_harf, harf, tam = _devam(tok, s, " A)"), _devam(tok, s, " B)"), _devam(tok, s, meb.cevap_metni(s, 1))
    k = len(harf)
    assert tam[:k] == harf and k >= 2 and len(tam) >= 30
    for kesilen in range(k + 2):  # 0: hepsi pencerede … k: bütün harf token'ları kesik … k+1: metnin ilk token'ı da
        puan = secenek_puanlari(_SabitModel(lp, baglam=len(tam) - kesilen), tok, s, "cpu")
        gorunen_harf, gorunen_metin = harf[kesilen:], tam[max(k, kesilen) :]
        assert puan["metin"][1] == pytest.approx(float(lp[gorunen_metin].mean()), abs=1e-4), kesilen
        if gorunen_harf:
            assert puan["harf"][1] == pytest.approx(float(lp[gorunen_harf].sum()), abs=1e-4), kesilen
        else:  # şık metninin ilk token'ları harf yerine geçmez
            assert puan["harf"][1] == float("-inf"), kesilen
        assert puan["harf"][0] == pytest.approx(float(lp[a_harf].sum()), abs=1e-4)  # kısa şıklar etkilenmez


def test_hicbir_harf_gorunmuyorsa_harf_cevabi_yanlis_sayilir(tok):
    s = _soru([" ".join([kelime] * 12) for kelime in ("kitap", "ev", "okul", "masa")], 0)
    logit = torch.zeros(tok.boyut)
    logit[_devam(tok, s, " A) kitap")[-1]] = 5.0  # A'nın metni olası
    model = _SabitModel(logit, baglam=8)  # hiçbir şıkkın harfi pencereye sığmaz
    puan = secenek_puanlari(model, tok, s, "cpu")
    assert all(p == float("-inf") for p in puan["harf"]) and all(math.isfinite(p) for p in puan["metin"])
    cs = coktan_secmeli(model, tok, [s], "cpu")
    assert cs["dogruluk_metin"] == 1.0
    assert cs["dogruluk_harf"] == 0.0  # eşit -inf puanlar A'ya yazılmaz: cevap A olsa da doğru sayılmaz


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
