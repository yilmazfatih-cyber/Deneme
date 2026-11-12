import itertools

import pytest
import torch

from turkce_model.ayarlar import AyarHatasi, GommeAyarlari, ModelAyarlari
from turkce_model.model import TurkceGPT, alibi_egimleri

M = ModelAyarlari(katman=2, bas_boyutu=16, baglam=24, dropout=0.0)


def gomme(**k):
    temel = dict(
        boyut=32, konum="rope", cikis_baglama=True, faktor_boyutu=0, kategori_gommesi=False,
        bicim_paylasimi=False, olcek=False, norm="yok", baslatma_std=0.02, dropout=0.0,
    )
    temel.update(k)
    return GommeAyarlari(**temel)


@pytest.mark.parametrize(
    "konum,bag,faktor,kat,bicim,olcek,norm",
    [
        c
        for c in itertools.product(["rope", "ogrenilen", "sinus", "alibi", "yok"], [True, False], [0, 16], [True, False], [True, False], [False], ["yok", "rmsnorm"])
        if not (c[4] and c[1])
    ],
)
def test_tum_gomme_secenekleri_calisir_ve_nedenseldir(tok, konum, bag, faktor, kat, bicim, olcek, norm):
    torch.manual_seed(0)
    g = gomme(konum=konum, cikis_baglama=bag, faktor_boyutu=faktor, kategori_gommesi=kat, bicim_paylasimi=bicim, olcek=olcek, norm=norm)
    model = TurkceGPT.tokenizer_ile(g, M, tok).eval()
    x = torch.randint(0, tok.boyut, (2, 12))
    logit, kayip = model(x, x)
    assert logit.shape == (2, 12, tok.boyut)
    kayip.backward()
    x2 = x.clone()
    x2[:, -1] = (x2[:, -1] + 1) % tok.boyut
    with torch.no_grad():
        a, _ = model(x)
        b, _ = model(x2)
    assert torch.allclose(a[:, :-1], b[:, :-1], atol=1e-5), "gelecekteki token geçmişi etkilememeli"


def test_bicim_paylasimi_ile_baglama_birlikte_olmaz(tok):
    with pytest.raises(AyarHatasi, match="birlikte açık olamaz"):
        TurkceGPT.tokenizer_ile(gomme(bicim_paylasimi=True, cikis_baglama=True), M, tok)


def test_bicim_paylasimi_lar_ler_ayni_satir(tok):
    model = TurkceGPT.tokenizer_ile(gomme(bicim_paylasimi=True, cikis_baglama=False), M, tok)
    lar, ler = tok.kimlik["lar"], tok.kimlik["ler"]
    assert model.gomme.satir_ids[lar] == model.gomme.satir_ids[ler]
    assert model.gomme.tablo.weight.shape[0] < model.gomme.V


def test_baglama_ayri_cikis_katmani_olusturmaz(tok):
    bagli = TurkceGPT.tokenizer_ile(gomme(cikis_baglama=True), M, tok)
    ayri = TurkceGPT.tokenizer_ile(gomme(cikis_baglama=False), M, tok)
    assert bagli.cikis is None and ayri.cikis is not None
    fark = ayri.parametre_dokumu()["toplam"] - bagli.parametre_dokumu()["toplam"]
    assert fark == ayri.gomme.V * 32


def test_ayristirilmis_gomme_parametre_tasarrufu(tok):
    tam = TurkceGPT.tokenizer_ile(gomme(boyut=64, faktor_boyutu=0), M, tok).parametre_dokumu()
    fak = TurkceGPT.tokenizer_ile(gomme(boyut=64, faktor_boyutu=16), M, tok).parametre_dokumu()
    assert fak["gömme tablosu"] * 4 == tam["gömme tablosu"]
    assert fak["izdüşüm (ayrıştırma)"] == 16 * 64


def test_dogrulama_hatalari():
    with pytest.raises(AyarHatasi, match="KARAR_VER|kararları"):
        TurkceGPT(GommeAyarlari(), M, 100)
    with pytest.raises(AyarHatasi, match="katı olmalı"):
        TurkceGPT(gomme(boyut=40), M, 100)
    with pytest.raises(AyarHatasi, match="küçük olmalı"):
        TurkceGPT(gomme(faktor_boyutu=32), M, 100)
    with pytest.raises(AyarHatasi, match="konum"):
        TurkceGPT(gomme(konum="mutlak"), M, 100)


def test_meta_cihazda_parametre_sayimi():
    with torch.device("meta"):
        model = TurkceGPT(gomme(boyut=512), ModelAyarlari(katman=8), 32000)
    dokum = model.parametre_dokumu()
    assert dokum["gömme tablosu"] == 32000 * 512
    assert dokum["toplam"] == dokum["gömme tablosu"] + dokum["transformer katmanları"]


def test_alibi_egimleri():
    assert alibi_egimleri(8) == [2 ** -(i + 1) for i in range(8)]
    assert len(alibi_egimleri(6)) == 6


def test_uretim_bos_tokeninda_durur(tok):
    torch.manual_seed(0)
    model = TurkceGPT.tokenizer_ile(gomme(), M, tok).eval()
    x = torch.tensor([[2, 5]])
    y = model.uret(x, 30, sicaklik=0.0)
    assert y.shape[1] <= 32 and torch.equal(y[:, :2], x)
