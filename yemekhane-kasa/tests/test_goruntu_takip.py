import io
from datetime import datetime

import numpy as np
from PIL import Image

from tests.conftest import DAMA, imza
from yemekhane_kasa.ayarlar import EsikAyari
from yemekhane_kasa.fiyat import Kalem, fiyatlandir
from yemekhane_kasa.goruntu import bolge_kirp, fark_orani, imza_cikar, jpeg
from yemekhane_kasa.takip import BosTezgahDedektoru, Karar, TepsiTakipci


def test_bolge_kirp_ve_sinirlar():
    goruntu = Image.new("RGB", (1000, 500))
    assert bolge_kirp(goruntu, None) is goruntu
    assert bolge_kirp(goruntu, (0.1, 0.2, 0.5, 0.4)).size == (500, 200)
    assert bolge_kirp(goruntu, (0.6, 0.6, 0.4, 0.4)).size == (400, 200)


def test_fark_orani_parlaklik_degil_icerik_degisimini_olcer():
    esik = EsikAyari()
    a = imza("A")
    assert fark_orani(a, a) == 0.0
    assert fark_orani(a, imza("A_isik")) < esik.ayni_tepsi  # yalnız ışık değişti
    assert esik.ayni_tepsi * 1.5 < fark_orani(a, imza("A_tatli")) < esik.yeni_tepsi  # bir kâse eklendi
    assert fark_orani(a, imza("bos")) > esik.yeni_tepsi  # tepsi gitti
    assert fark_orani(a, DAMA) > esik.yeni_tepsi
    assert fark_orani(a, np.zeros((2, 2), dtype=np.float32)) == 1.0  # boyut uyuşmazlığı


def test_jpeg_kucultur_buyutmez():
    with Image.open(io.BytesIO(jpeg(Image.new("RGB", (3000, 1500)), 1024))) as g:
        assert g.size == (1024, 512)
    with Image.open(io.BytesIO(jpeg(Image.new("RGBA", (300, 200)), 1024))) as g:
        assert g.size == (300, 200) and g.mode == "RGB"


def test_dedektor_ogren_uyarla_kaydet_yukle(tmp_path):
    esik = EsikAyari()
    dedektor = BosTezgahDedektoru(esik)
    bos, tepsi = imza("bos"), imza("A")
    assert not dedektor.hazir and not dedektor.bos_mu(bos)  # henüz öğrenilmedi
    dedektor.ogren(bos)
    assert dedektor.bos_mu(bos) and not dedektor.bos_mu(tepsi)
    dedektor.uyarla(bos + 4)  # ışık biraz arttı
    assert dedektor.bos_mu(bos)

    bolge = (0.1, 0.1, 0.8, 0.8)
    yol = tmp_path / "kalibrasyon" / "arka_plan.json"
    dedektor.kaydet(yol, bolge, gurultu=0.001)
    yeni = BosTezgahDedektoru(esik)
    assert yeni.yukle(yol, bolge) and yeni.bos_mu(bos)
    assert not BosTezgahDedektoru(esik).yukle(yol, (0.2, 0.1, 0.7, 0.8))  # bölge değişti: geçersiz
    assert not BosTezgahDedektoru(esik).yukle(tmp_path / "yok.json", bolge)
    (tmp_path / "bozuk.json").write_text("{", encoding="utf-8")
    assert not BosTezgahDedektoru(esik).yukle(tmp_path / "bozuk.json", bolge)


def _adisyon(menu, *kimlikler):
    return fiyatlandir(menu, [Kalem(k) for k in kimlikler])


T = datetime(2026, 11, 12, 12, 30, 0).astimezone()


def test_takipci_yeni_ayni_guncelle(menu):
    takipci = TepsiTakipci(EsikAyari())
    a, tatli = imza("A"), imza("A_tatli")
    assert takipci.karar(a) is Karar.TANI

    siparis, kapanan = takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye", "ayran"), a, T)
    assert siparis is not None and kapanan is None
    assert (siparis.islem, siparis.revizyon, siparis.no) == ("yeni", 1, "20261112-123000-001")

    assert takipci.karar(imza("A_isik")) is Karar.AYNI
    assert takipci.karar(tatli) is Karar.TANI
    # Görüntü değişti ama yemekler aynı (ör. el geçti): gönderilecek bir şey yok
    assert takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye", "ayran"), tatli, T) == (None, None)
    # Tatlı eklendi: aynı sipariş, revizyon 2
    guncel, kapanan = takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye", "ayran", "sutlac"), tatli, T)
    assert (guncel.no, guncel.revizyon, guncel.islem, kapanan) == (siparis.no, 2, "guncelle", None)


def test_takipci_bosluktan_sonra_ayni_icerik_yeni_siparis(menu):
    takipci = TepsiTakipci(EsikAyari())
    ilk, _ = takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye"), imza("A"), T)
    assert takipci.bos_goruldu() is ilk
    assert takipci.bos_goruldu() is None
    ikinci, kapanan = takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye"), imza("B"), T)
    assert ikinci.no != ilk.no and ikinci.islem == "yeni" and kapanan is None


def test_takipci_bosluk_gorulmeden_tepsi_degisimi(menu):
    takipci = TepsiTakipci(EsikAyari())
    ilk, _ = takipci.sonuc_isle(_adisyon(menu, "kuru_fasulye"), imza("A"), T)
    # Görüntünün tamamı değişti ve yemekler farklı: önceki müşteri gitmiş, yeni sipariş
    ikinci, kapanan = takipci.sonuc_isle(_adisyon(menu, "izmir_kofte"), DAMA, T)
    assert kapanan is ilk and ikinci.islem == "yeni" and ikinci.no != ilk.no
    # Görüntünün tamamı değişti ama yemekler aynı: çift ücretlendirme yok
    assert takipci.sonuc_isle(_adisyon(menu, "izmir_kofte"), imza("C"), T) == (None, None)


def test_takipci_bos_tepsi_ve_yalniz_taninmayan(menu):
    takipci = TepsiTakipci(EsikAyari())
    a = imza("A")
    assert takipci.sonuc_isle(_adisyon(menu), a, T) == (None, None)  # satılacak bir şey yok
    assert takipci.karar(a) is Karar.AYNI  # yeniden sorulmaz
    taninmayan = fiyatlandir(menu, [], taninmayanlar=["makarna"])
    siparis, _ = takipci.sonuc_isle(taninmayan, imza("C"), T)
    assert siparis is not None and siparis.adisyon.kontrol_gerekli and siparis.adisyon.bos


def test_imza_boyutu():
    assert imza_cikar(Image.new("RGB", (640, 480))).shape == (36, 48)
    assert imza_cikar(Image.new("RGB", (640, 480))).dtype == np.float32
