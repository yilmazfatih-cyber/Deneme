from __future__ import annotations

import json
from datetime import date

import pytest

from ithalat_ajani import kur as kur_modulu
from ithalat_ajani.kur import KurHatasi, kur_getir, tcmb_ayristir
from ithalat_ajani.tarife import TarifeHatasi, tarife_oku, varsayilan_tarife

TCMB_ORNEK = """<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="09.11.2026" Date="11/09/2026" Bulten_No="2026/210">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><ForexBuying>50.0878</ForexBuying><ForexSelling>50.1780</ForexSelling>
  </Currency>
  <Currency CrossOrder="9" Kod="JPY" CurrencyCode="JPY">
    <Unit>100</Unit><ForexBuying>32.1</ForexBuying><ForexSelling>32.3</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit><ForexBuying>56.0128</ForexBuying><ForexSelling>56.1137</ForexSelling>
  </Currency>
</Tarih_Date>"""


def test_varsayilan_tarife_gecerli():
    t = varsayilan_tarife()
    assert len(t.kategoriler) >= 20 and t.surum
    for k in t.kategoriler.values():
        assert 0 <= k.gv < 1 and 0 <= k.igv < 1 and k.kdv in (0.10, 0.20)
        assert k.kaynak and k.gtip
    assert {k.grup for k in t.kategoriler.values()} == {"hazir-giyim", "aksesuar", "ayakkabi"}


def test_gtip_en_uzun_onekle_bulunur():
    t = varsayilan_tarife()
    assert t.gtip_ile_bul("6214.30.00.00.00").anahtar == "esarp-sal"
    assert t.gtip_ile_bul("4202.22.10.00").anahtar == "canta-suni-deri"
    assert t.gtip_ile_bul("4202.22.90").anahtar == "canta-kumas"
    assert t.gtip_ile_bul("8471") is None


def test_bilinmeyen_kategori_gecerlileri_listeler():
    with pytest.raises(TarifeHatasi, match="esarp-sal"):
        varsayilan_tarife().bul("yok")


def test_bozuk_tarife_reddedilir(tmp_path):
    yol = tmp_path / "t.toml"
    yol.write_text(
        '[kategori.x]\nad="X"\ngrup="oyuncak"\ngtip=["1"]\ngv=0.1\nigv=0.1\nkdv=0.2\n'
        'ornek_agirlik_kg=0.1\nguven="kaynakli"\nkaynak="t"\n',
        encoding="utf-8",
    )
    with pytest.raises(TarifeHatasi, match="grup"):
        tarife_oku(yol)
    yol.write_text('[kategori.x]\nad="X"\n', encoding="utf-8")
    with pytest.raises(TarifeHatasi, match="eksik"):
        tarife_oku(yol)


def test_tcmb_ayristirma():
    k = tcmb_ayristir(TCMB_ORNEK)
    assert k.usd_tl == pytest.approx(50.178) and k.eur_tl == pytest.approx(56.1137)
    assert k.bulten_tarihi == "09.11.2026" and k.kaynak == "tcmb"
    with pytest.raises(KurHatasi):
        tcmb_ayristir("<Tarih_Date></Tarih_Date>")
    with pytest.raises(KurHatasi):
        tcmb_ayristir("bozuk")


def test_kur_getir_onbellek_ve_yedek(tmp_path, monkeypatch):
    onbellek = tmp_path / "kur.json"
    cagri = {"sayi": 0}

    def basarili():
        cagri["sayi"] += 1
        return tcmb_ayristir(TCMB_ORNEK)

    def basarisiz():
        raise KurHatasi("ağ yok")

    monkeypatch.setattr(kur_modulu, "tcmb_cek", basarili)
    bugun = date.fromisoformat(tcmb_ayristir(TCMB_ORNEK).alinma)
    assert kur_getir(onbellek, 45.0, bugun=bugun).kaynak == "tcmb"
    assert kur_getir(onbellek, 45.0, bugun=bugun).kaynak == "onbellek"  # aynı gün yeniden çekmez
    assert cagri["sayi"] == 1

    monkeypatch.setattr(kur_modulu, "tcmb_cek", basarisiz)
    ham = json.loads(onbellek.read_text(encoding="utf-8"))
    ham["alinma"] = "2026-11-05"
    onbellek.write_text(json.dumps(ham), encoding="utf-8")
    eski = kur_getir(onbellek, 45.0, bugun=date(2026, 11, 9))
    assert eski.kaynak == "onbellek" and eski.usd_tl == pytest.approx(50.178)
    yedek = kur_getir(onbellek, 45.0, bugun=date(2026, 12, 1))  # önbellek 7 günden eski
    assert yedek.kaynak == "yedek" and yedek.usd_tl == 45.0
